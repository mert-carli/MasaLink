import { NextRequest, NextResponse } from 'next/server';
import { evaluateQrOrderSecurity } from '@/utils/qrSecurityEngine';
import { INITIAL_TABLES } from '@/utils/tableData';
import { validateTableSessionToken } from '@/utils/tableSessionRegistry';
import { withTableLock } from '@/utils/concurrencyLock';
import { requireTenant } from '@/server/security/authGuard';
import { OrderService, SubmitOrderItemInput, OrderDomainError } from '@/server/services/orderService';
import { TableVersionConflictError } from '@/server/db/tableRepository';
import { validateQrOrder, ValidationError } from '@/server/validation/adminSchemas';
import { IdempotencyService } from '@/server/security/idempotencyService';
import { readJsonBodyWithLimit } from '@/server/security/bodyLimit';
import { RateLimitEngine } from '@/server/security/rateLimitEngine';
import { safeErrorResponse } from '@/server/security/errorHandler';

export async function POST(req: NextRequest) {
  let tableIdForLogging: string | undefined = undefined;
  let tenantIdForLogging: string | undefined = undefined;
  try {
    const tenantCheck = requireTenant(req);
    if (!tenantCheck.ok) return tenantCheck.errorResponse;
    const tenantCtx = tenantCheck.data;
    const tenantSlug = tenantCtx.tenantSlug || tenantCtx.tenantId;
    tenantIdForLogging = tenantCtx.tenantId;

    const rawBody = await readJsonBodyWithLimit(req);
    const validated = validateQrOrder(rawBody);
    const { 
      tableId, 
      items, 
      clientFingerprint = 'anon_device', 
      sessionToken,
      customerNote,
      guestName,
      visionAiDetected,
      manualOverride,
      expectedVersion,
      idempotencyKey: bodyIdempotencyKey,
    } = validated;
    tableIdForLogging = tableId;

    // 1. ZORUNLU IDEMPOTENCY KEY DENETİMİ (UUID veya min. 16 karakterlik anahtar)
    const idempotencyKey =
      req.headers.get('idempotency-key') ||
      req.headers.get('x-idempotency-key') ||
      bodyIdempotencyKey;

    if (!IdempotencyService.isValidKey(idempotencyKey)) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'INVALID_IDEMPOTENCY_KEY',
          error:
            'QR siparişleri için geçerli bir Idempotency-Key (UUID veya min. 16 karakterlik benzersiz anahtar) zorunludur.',
        },
        { status: 400 }
      );
    }

    const validKey = (idempotencyKey as string).trim();
    const orderPayload = { tableId, items, customerNote, guestName };

    // 2. Erken Idempotency Kontrolü: Payload hash denetimi ile çift istek / farklı veri manipülasyonu kalkanı
    const idempotencyCheck = await IdempotencyService.checkOrAcquire({
      tenantId: tenantCtx.tenantId,
      scope: tableId,
      idempotencyKey: validKey,
      payload: orderPayload,
    });

    if (idempotencyCheck.state === 'MISMATCH') {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
          error: 'Aynı Idempotency-Key farklı bir sipariş içeriği ile tekrar kullanılamaz.',
        },
        { status: 409 }
      );
    }

    if (idempotencyCheck.state === 'REPLAY') {
      return NextResponse.json(
        {
          ...idempotencyCheck.cachedResponse,
          isIdempotentReplay: true,
          message: 'Bu sipariş daha önce başarıyla oluşturulmuştur (Mükerrer gönderim engellendi).',
        },
        { status: 200 }
      );
    }

    // 3. Multi-Tenant Masa Token ve Entropi Denetimi (Token Enumeration & IDOR Kalkanı)
    const tokenValidation = validateTableSessionToken(tenantSlug, tableId, sessionToken);
    if (!tokenValidation.valid) {
      return NextResponse.json(
        { 
          success: false, 
          errorCode: 'INVALID_TOKEN',
          error: tokenValidation.reason || 'Geçersiz veya tahrif edilmiş masa tokenı (Token Enumeration Engellendi).' 
        },
        { status: 403 }
      );
    }

    // 4. Masa Bilgisini Getir & Güvenlik Motorunu Çalıştır (Vision AI & Anti-DoS)
    const table = INITIAL_TABLES.find((t) => t.id === tableId) || null;

    const securityResult = evaluateQrOrderSecurity({
      tenantSlug,
      tableId,
      clientFingerprint,
      sessionToken,
      table,
      visionAiDetected,
      manualOverride,
    });

    if (!securityResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          errorCode: securityResult.errorCode,
          message: securityResult.userMessage,
          retryAfterSeconds: securityResult.retryAfterSeconds,
          securityChecks: securityResult.securityChecks,
        },
        { status: 429 }
      );
    }

    // 5. Çok Boyutlu Hız Sınırı (Masa + IP Flood Kalkanı — Parmak İzi Manipülasyonu Koruması)
    const rateCheck = await RateLimitEngine.evaluate(req, {
      tableId,
      tenantId: tenantCtx.tenantId,
    });
    if (!rateCheck.allowed && rateCheck.response) {
      return rateCheck.response;
    }

    // 6. Dağıtık Masa Kilidi Altında Atomik Çift Kontrol (Double-Checked Locking) ve Sipariş Oluşturma
    return await withTableLock(tableId, async () => {
      try {
        // Kilit içinde tekrar denetle (Yarış durumlarında 100 paralel istekten sadece ilk giren oluşturur)
        const lockedCheck = await IdempotencyService.checkOrAcquire({
          tenantId: tenantCtx.tenantId,
          scope: tableId,
          idempotencyKey: validKey,
          payload: orderPayload,
        });

        if (lockedCheck.state === 'MISMATCH') {
          return NextResponse.json(
            {
              success: false,
              errorCode: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
              error: 'Aynı Idempotency-Key farklı bir sipariş içeriği ile tekrar kullanılamaz.',
            },
            { status: 409 }
          );
        }

        if (lockedCheck.state === 'REPLAY') {
          return NextResponse.json(
            {
              ...lockedCheck.cachedResponse,
              isIdempotentReplay: true,
              message: 'Bu sipariş daha önce başarıyla oluşturulmuştur (Mükerrer gönderim engellendi).',
            },
            { status: 200 }
          );
        }

        const orderResult = await OrderService.submitOrder({
          tenantId: tenantCtx.tenantId,
          branchId: tenantCtx.branchId,
          tableId,
          source: 'QR',
          items,
          clientVersion: typeof expectedVersion === 'number' ? expectedVersion : undefined,
          customerNote,
          guestName,
          requiresApproval: securityResult.requiresWaiterApproval,
          idempotencyKey: `qr:${tableId}:${validKey}`,
        });

        // Siparişi Redis ve Belleğe mühürle
        await IdempotencyService.saveQrOrder(
          tenantCtx.tenantId,
          tableId,
          validKey,
          orderResult,
          orderPayload
        );

        return NextResponse.json({
          ...orderResult,
          message: securityResult.userMessage,
          securityChecks: securityResult.securityChecks,
        });
      } catch (err: any) {
        // Hata durumunda in-progress kilidini temizle ki istemci güvenle tekrar deneyebilsin
        await IdempotencyService.releaseKey(tenantCtx.tenantId, tableId, validKey);
        return safeErrorResponse(err, req, {
          fallbackMessage: 'QR sipariş işlenirken bir sunucu hatası oluştu.',
          tenantId: tenantIdForLogging,
          tableId: tableIdForLogging,
        });
      }
    });

  } catch (error: any) {
    return safeErrorResponse(error, req, {
      fallbackMessage: 'Sunucu hatası: Sipariş işlenemedi.',
      tenantId: tenantIdForLogging,
      tableId: tableIdForLogging,
    });
  }
}
