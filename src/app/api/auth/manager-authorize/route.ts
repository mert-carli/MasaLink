import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/server/db/prisma';
import { verifyManagerPin, createManagerApprovalToken } from '@/utils/managerAuth';
import { resolveTenantFromRequest } from '@/utils/tenantAuth';
import { 
  getClientIp, 
  enforcePinRateLimit, 
  recordFailedPinAttempt, 
  recordSuccessfulPinAttempt 
} from '@/utils/pinRateLimiter';

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);

    // Kaba Kuvvet (Brute-Force) Savunması: 10 Dakika Kilit ve Exponential Backoff
    const rateLimitCheck = await enforcePinRateLimit(`mgr_${clientIp}`);
    if (!rateLimitCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'MANAGER_PIN_LOCKED',
          retryAfterSeconds: rateLimitCheck.retryAfterSeconds,
          error: rateLimitCheck.error,
        },
        { 
          status: 429,
          headers: {
            'Retry-After': String(rateLimitCheck.retryAfterSeconds || 600),
          }
        }
      );
    }

    const authContext = resolveTenantFromRequest(req);
    if (!authContext) {
      return NextResponse.json(
        { success: false, error: 'Yetkisiz erişim: Aktif bir personel oturumu gereklidir.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { managerPin, reason, actionType, resourceId, tableId } = body as {
      managerPin?: string;
      reason?: string;
      actionType?: string;
      resourceId?: string;
      tableId?: string;
    };

    if (!managerPin || typeof managerPin !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Yönetici PIN kodu zorunludur.' },
        { status: 400 }
      );
    }

    // 1. PostgreSQL Veritabanı Üzerinden Yönetici Doğrulaması (bcrypt)
    let verifiedManager: { id: string; name: string; role: string; title: string } | null = null;
    if (process.env.DATABASE_URL) {
      try {
        const managers = await prisma.user.findMany({
          where: {
            tenantId: authContext.tenantId,
            isActive: true,
            role: {
              key: { in: ['OWNER', 'ADMIN', 'MANAGER'] },
            },
          },
          include: { role: true },
        });

        for (const m of managers) {
          if (!m.pinHash) continue;
          const matches = await bcrypt.compare(managerPin, m.pinHash);
          if (matches) {
            verifiedManager = {
              id: m.id,
              name: m.name,
              role: m.role.key.toLowerCase(),
              title: m.role.name,
            };
            break;
          }
        }
      } catch (dbErr) {
        console.warn('[Manager Authorize API] DB sorgu uyarısı:', dbErr);
      }
    }

    // 2. Geliştirme Fallback (Production ortamında KESİNLİKLE dev fallback çalıştırılamaz)
    if (!verifiedManager && process.env.NODE_ENV !== 'production') {
      const fallback = verifyManagerPin(managerPin, authContext.tenantId);
      if (fallback.valid && fallback.manager) {
        verifiedManager = {
          id: fallback.manager.id,
          name: fallback.manager.name,
          role: fallback.manager.role,
          title: fallback.manager.title,
        };
      }
    }

    if (!verifiedManager) {
      const failRecord = await recordFailedPinAttempt(`mgr_${clientIp}`, { endpoint: '/api/auth/manager-authorize', ip: clientIp });
      return NextResponse.json(
        { 
          success: false, 
          errorCode: failRecord.isLockedNow ? 'MANAGER_PIN_LOCKED' : 'INVALID_PIN',
          consecutiveFailures: failRecord.failures,
          error: failRecord.isLockedNow
            ? 'Art arda 5 hatalı Yönetici PIN\'i girildiği için yetkilendirme 10 dakika kilitlendi!'
            : `Geçersiz Yönetici PIN kodu! Kalan deneme hakkı: ${Math.max(0, 5 - failRecord.failures)}.` 
        },
        { status: failRecord.isLockedNow ? 429 : 403 }
      );
    }

    // Başarılı yönetici onayı: Hata sayacını sıfırla
    await recordSuccessfulPinAttempt(`mgr_${clientIp}`);

    // Kriptografik tek kullanımlık onay belirteci üret (5 dakika TTL, tenant ve kaynak kısıtlı)
    const effectiveAction = (actionType?.toUpperCase() === 'VOID' || actionType?.toUpperCase() === 'COMP' || actionType?.toUpperCase() === 'TABLE_TRANSFER')
      ? (actionType.toUpperCase() as any)
      : 'DISCOUNT';

    const approvalToken = createManagerApprovalToken({
      managerId: verifiedManager.id,
      managerName: verifiedManager.name,
      role: verifiedManager.role,
      title: verifiedManager.title,
      tenantId: authContext.tenantId,
      action: effectiveAction,
      resourceId: resourceId || tableId,
    });

    return NextResponse.json({
      success: true,
      message: `İşlem ${verifiedManager.name} (${verifiedManager.title}) tarafından onaylandı.`,
      approvalToken,
      managerAuthToken: approvalToken,
      manager: {
        id: verifiedManager.id,
        name: verifiedManager.name,
        role: verifiedManager.role,
        title: verifiedManager.title,
      },
      reason: reason || 'Müşteri Memnuniyeti',
      authorizedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Manager Authorization Error:', error);
    return NextResponse.json(
      { success: false, error: 'Yönetici doğrulama sunucu hatası.' },
      { status: 500 }
    );
  }
}
