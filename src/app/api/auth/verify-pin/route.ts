import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/server/db/prisma';
import { createSignedSessionToken } from '@/utils/tenantAuth';
import { TokenRevocationService } from '@/server/security/tokenRevocation';
import { 
  getClientIp, 
  enforcePinRateLimit, 
  recordFailedPinAttempt, 
  recordSuccessfulPinAttempt 
} from '@/utils/pinRateLimiter';

// Server-side hashed staff PIN records (SHA-256)
// Gerçek prodüksiyonda veritabanında pgcrypto / argon2 / bcrypt ile tutulur
const HASHED_STAFF_PINS = [
  // Garsonlar
  {
    id: 'w-1',
    name: 'Ahmet Yılmaz',
    role: 'waiter',
    section: 'İç Salon',
    avatar: '👨‍🍳',
    tenantId: 'tenant-artisan-burger',
    pinHash: crypto.createHash('sha256').update('1234').digest('hex'),
  },
  {
    id: 'w-2',
    name: 'Mehmet Demir',
    role: 'waiter',
    section: 'Bahçe',
    avatar: '🧑‍🌾',
    tenantId: 'tenant-artisan-burger',
    pinHash: crypto.createHash('sha256').update('5678').digest('hex'),
  },
  {
    id: 'w-3',
    name: 'Ayşe Kaya',
    role: 'waiter',
    section: 'Teras',
    avatar: '👩‍🍳',
    tenantId: 'tenant-artisan-burger',
    pinHash: crypto.createHash('sha256').update('9012').digest('hex'),
  },

  // Kasiyerler
  {
    id: 'c1',
    name: 'Zeynep Kaya',
    role: 'cashier',
    subRole: 'Baş Kasiyer',
    avatar: 'ZK',
    tenantId: 'tenant-artisan-burger',
    pinHash: crypto.createHash('sha256').update('4321').digest('hex'),
  },
  {
    id: 'c2',
    name: 'Caner Öztürk',
    role: 'cashier',
    subRole: 'Kasiyer',
    avatar: 'CÖ',
    tenantId: 'tenant-artisan-burger',
    pinHash: crypto.createHash('sha256').update('8765').digest('hex'),
  },
  {
    id: 'c3',
    name: 'Emre Şahin',
    role: 'cashier',
    subRole: 'Kasa Şefi',
    avatar: 'EŞ',
    tenantId: 'tenant-artisan-burger',
    pinHash: crypto.createHash('sha256').update('1122').digest('hex'),
  },
];

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);

    // Kaba Kuvvet (Brute-Force) Savunması & 10 Dakika Kilit Denetimi
    const rateLimitCheck = await enforcePinRateLimit(clientIp);
    if (!rateLimitCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'ACCOUNT_LOCKED',
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

    const body = await req.json();
    const { pin, expectedRole, tenantId: bodyTenantId, tenantSlug: bodyTenantSlug } = body as {
      pin?: string;
      expectedRole?: 'waiter' | 'cashier';
      tenantId?: string;
      tenantSlug?: string;
    };

    const requestedTenantId =
      bodyTenantId ||
      bodyTenantSlug ||
      req.nextUrl.searchParams.get('tenantId') ||
      req.nextUrl.searchParams.get('tenantSlug') ||
      req.headers.get('x-tenant-id');

    if (!pin || typeof pin !== 'string') {
      return NextResponse.json(
        { success: false, error: 'PIN kodu zorunludur.' },
        { status: 400 }
      );
    }

    // 1. PostgreSQL Veritabanı Üzerinden Personel PIN Doğrulaması (bcrypt & Tenant-Scoped)
    if (process.env.DATABASE_URL) {
      try {
        const whereClause: any = { isActive: true };
        if (requestedTenantId) {
          whereClause.OR = [
            { tenantId: requestedTenantId },
            { tenant: { slug: requestedTenantId } },
          ];
        }

        const users = await prisma.user.findMany({
          where: whereClause,
          include: { role: true, branch: true, tenant: true },
        });

        for (const user of users) {
          if (!user.pinHash) continue;
          const pinMatches = await bcrypt.compare(pin, user.pinHash);
          if (pinMatches) {
            const userRoleKey = user.role.key.toLowerCase();
            
            // 🛡️ Privileged Role Kalkanı: Admin veya Owner asla 4 haneli PIN ile oturum açamaz!
            if (userRoleKey === 'admin' || userRoleKey === 'owner') {
              return NextResponse.json(
                {
                  success: false,
                  errorCode: 'FORBIDDEN_PIN_LOGIN',
                  error: 'Yönetici ve işletme sahibi hesapları PIN ile giriş yapamaz. Lütfen e-posta ve şifrenizle giriş yapınız.',
                },
                { status: 403 }
              );
            }

            if (expectedRole && userRoleKey !== expectedRole.toLowerCase()) {
              continue;
            }

            recordSuccessfulPinAttempt(clientIp);

            const tokenVersion = await TokenRevocationService.getUserTokenVersion(user.id);
            const sessionToken = createSignedSessionToken({
              userId: user.id,
              name: user.name,
              role: userRoleKey,
              tenantId: user.tenantId,
              tokenVersion,
            });

            const response = NextResponse.json({
              success: true,
              tenantId: user.tenantId,
              user: {
                id: user.id,
                name: user.name,
                role: userRoleKey,
                tenantId: user.tenantId,
                section: user.section?.toLowerCase(),
                avatar: user.avatar,
                branchName: user.branch?.name,
              },
              message: 'PIN veritabanı üzerinden başarıyla doğrulandı.',
            });

            response.cookies.set('masalink_session', sessionToken, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'strict',
              path: '/',
              maxAge: 60 * 60 * 12,
            });

            return response;
          }
        }
      } catch (dbErr) {
        console.warn('[Verify PIN API] DB doğrulama uyarısı:', dbErr);
      }
    }

    // 2. Geliştirme Ortamı Fallback (Yalnızca DB bağlı değilse ve production olmayan ortamlarda)
    if (process.env.NODE_ENV === 'production') {
      const failRecord = await recordFailedPinAttempt(clientIp, { endpoint: '/api/auth/verify-pin', ip: clientIp });
      return NextResponse.json(
        { 
          success: false, 
          errorCode: failRecord.isLockedNow ? 'ACCOUNT_LOCKED' : 'INVALID_PIN',
          consecutiveFailures: failRecord.failures,
          error: failRecord.isLockedNow 
            ? 'Art arda 5 hatalı PIN girildiği için erişim 10 dakika süreyle kilitlendi.' 
            : `Hatalı PIN kodu veya personel bulunamadı! Kalan deneme hakkı: ${Math.max(0, 5 - failRecord.failures)}.` 
        },
        { status: failRecord.isLockedNow ? 429 : 401 }
      );
    }

    // SHA-256 Hash hesapla (Geliştirme / Test Ortamı)
    const inputHash = crypto.createHash('sha256').update(pin).digest('hex');

    // Personeli eşleştir (Tenant İzolasyonlu)
    const staff = HASHED_STAFF_PINS.find((s) => {
      const pinMatches = s.pinHash === inputHash;
      if (!pinMatches) return false;
      if (requestedTenantId && s.tenantId !== requestedTenantId) return false;
      if (expectedRole && s.role !== expectedRole) return false;
      return true;
    });

    if (!staff) {
      const failRecord = await recordFailedPinAttempt(clientIp, { endpoint: '/api/auth/verify-pin', ip: clientIp });
      return NextResponse.json(
        { 
          success: false, 
          errorCode: failRecord.isLockedNow ? 'ACCOUNT_LOCKED' : 'INVALID_PIN',
          consecutiveFailures: failRecord.failures,
          error: failRecord.isLockedNow 
            ? 'Art arda 5 hatalı PIN girildiği için erişim 10 dakika süreyle kilitlendi.' 
            : `Hatalı PIN kodu! Kalan deneme hakkı: ${Math.max(0, 5 - failRecord.failures)}.` 
        },
        { status: failRecord.isLockedNow ? 429 : 401 }
      );
    }

    // Başarılı giriş: Hatalı giriş sayacını sıfırla
    await recordSuccessfulPinAttempt(clientIp);

    // Kiracı kimliğini (tenant_id) içine mühürleyen imzalı kriptografik oturum token'ı üret
    const staffTenantId = (staff as any).tenantId;
    if (!staffTenantId) {
      return NextResponse.json(
        { success: false, error: 'Fail-Closed: Personel kiracı kaydı (tenantId) bulunamadı.' },
        { status: 403 }
      );
    }

    if (!staff.role) {
      return NextResponse.json(
        { success: false, error: 'Fail-Closed: Personel yetki rolü bulunamadı.' },
        { status: 403 }
      );
    }

    const tokenVersion = await TokenRevocationService.getUserTokenVersion(staff.id);
    const sessionToken = createSignedSessionToken({
      userId: staff.id,
      name: staff.name,
      role: staff.role,
      tenantId: staffTenantId,
      tokenVersion,
    });

    const response = NextResponse.json({
      success: true,
      tenantId: staffTenantId,
      user: {
        id: staff.id,
        name: staff.name,
        role: staff.role,
        tenantId: staffTenantId,
        section: (staff as any).section,
        subRole: (staff as any).subRole,
        avatar: (staff as any).avatar,
      },
      message: 'PIN doğrulandı, kiracı imzalı oturum çerezi basıldı.',
    });

    // XSS saldırılarına karşı JavaScript'in (document.cookie) ASLA okuyamayacağı HttpOnly çerez
    response.cookies.set('masalink_session', sessionToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 12, // 12 saatlik vardiya
    });

    return response;
  } catch (error: any) {
    console.error('PIN Verify API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Sunucu hatası: PIN doğrulanamadı.' },
      { status: 500 }
    );
  }
}
