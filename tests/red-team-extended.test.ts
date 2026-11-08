import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth, requireRole, requireTenant } from '../src/server/security/authGuard';
import { createSignedSessionToken } from '../src/utils/tenantAuth';
import { TokenRevocationService } from '../src/server/security/tokenRevocation';
import { RateLimitEngine } from '../src/server/security/rateLimitEngine';
import { readJsonBodyWithLimit, checkRequestContentLength, PayloadTooLargeError } from '../src/server/security/bodyLimit';
import { PaymentService, PaymentDomainError } from '../src/server/payment/paymentService';
import { validateInitiatePayment, ValidationError } from '../src/server/validation/adminSchemas';
import { createTenantDb } from '../src/server/db/tenantDb';
import { TenantIsolationViolationError } from '../src/server/db/tenantContext';
import { POST as qrOrderPost } from '../src/app/api/qr-order/route';
import { POST as kdsPost } from '../src/app/api/kds/route';
import { POST as paymentInitiatePost } from '../src/app/api/payment/initiate/route';

test('MasaLink Genişletilmiş Red-Team Doğrulama ve Güvenlik Sınır Testleri', async (t) => {
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = process.env.MASALINK_JWT_SECRET;
  const TEST_SECRET = 'a_very_secure_test_secret_32_characters_long_min!';

  // ==========================================================================
  // BÖLÜM 1: TENANT ISOLATION RED-TEAM TESTLERİ
  // ==========================================================================
  await t.test('1. Tenant Isolation: Başka Kiracı Kaynaklarına Müdahale ve IDOR Reddedilmeli', async () => {
    (process.env as any).NODE_ENV = 'production';
    process.env.MASALINK_JWT_SECRET = TEST_SECRET;

    try {
      // 1.1 Başka Tenant tableId: Tenant-A token'ı ile Tenant-B masasına işlem denemesi
      const tenantAToken = createSignedSessionToken({
        userId: 'usr-tenant-a',
        name: 'Garson A',
        role: 'waiter',
        tenantId: 'tenant-artisan-burger',
      });

      const crossTableReq = new NextRequest('http://localhost:3000/api/orders?tenantSlug=pizza-roma', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tenantAToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          tableId: 'tbl-pizza-1',
          items: [{ productId: 'prd-1', quantity: 1 }],
        }),
      });

      const tenantCheck = requireTenant(crossTableReq);
      // Oturumdaki kiracı (artisan-burger) ile rotadaki kiracı (pizza-roma) eşleşmediğinde cross-tenant engellenmeli
      assert.notEqual(tenantCheck.data?.tenantId, 'tenant-pizza-roma', 'Kiracı A asla Kiracı B verilerine bağlanamaz.');

      // 1.2 Başka Tenant KDS Order: Tenant-A mutfak şefi, Tenant-B siparişini güncelleyemez
      const crossKdsReq = new NextRequest('http://localhost:3000/api/kds', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tenantAToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          orderId: 'ORD-PIZZA-999',
          tenantId: 'tenant-pizza-roma',
          status: 'PREPARING',
        }),
      });

      const kdsRes = await kdsPost(crossKdsReq);
      assert.equal(kdsRes.status, 403, 'Cross-tenant KDS müdahalesi 403 Forbidden almalıdır.');

      // 1.3 Tenant DB İzolasyonu: tenantId olmadan veya boş tenantId ile createTenantDb başlatılamaz
      assert.throws(
        () => {
          createTenantDb({ tenantId: '' });
        },
        (err: any) => err instanceof TenantIsolationViolationError
      );
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
    }
  });

  // ==========================================================================
  // BÖLÜM 2: RATE LIMIT BYPASS RED-TEAM TESTLERİ
  // ==========================================================================
  await t.test('2. Rate Limit Bypass: IP/Header Manipülasyonlarının Engellenmesi', async () => {
    (process.env as any).NODE_ENV = 'production';
    process.env.MASALINK_JWT_SECRET = TEST_SECRET;

    try {
      // 2.1 Table Flood Guard: X-Forwarded-For, IP ve Fingerprint değiştirilse bile aynı masaya flood engellenmeli
      const tenantId = 'tenant-artisan-burger';
      const targetTable = 'tbl-flood-test';

      let blockedAfterCount = 0;

      for (let i = 1; i <= 20; i++) {
        // Her istekte sahte X-Forwarded-For, sahte IPv6 ve sahte Fingerprint gönder
        const fakeIp = `2001:db8:85a3::${i}`;
        const req = new NextRequest('http://localhost:3000/api/qr-order', {
          method: 'POST',
          headers: {
            'x-forwarded-for': fakeIp,
            'client-fingerprint': `fingerprint_variant_${i}_${crypto.randomBytes(4).toString('hex')}`,
            'x-tenant-id': tenantId,
          },
        });

        const check = await RateLimitEngine.evaluate(req, {
          tableId: targetTable,
          tenantId,
        });

        if (!check.allowed) {
          blockedAfterCount = i;
          assert.equal(check.dimension, 'TABLE_FLOOD_GUARD', 'Bloklama masa kotasından kaynaklanmalıdır.');
          break;
        }
      }

      assert.ok(
        blockedAfterCount > 0 && blockedAfterCount <= 16,
        `Masa akını kalkanı IP ve parmak izi değişse dahi 16 istek içinde devreye girmelidir. Tetiklendiği istek: ${blockedAfterCount}`
      );
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
    }
  });

  // ==========================================================================
  // BÖLÜM 3: BODY SIZE EDGE CASES
  // ==========================================================================
  await t.test('3. Body Size Edge Cases: Yanıltıcı Başlıklar, Chunked Stream ve DoS Kalkanı', async () => {
    // 3.1 Yanıltıcı / Sahte Content-Length (Header: 50 bayt ama Gövde: 500 KB)
    const maxBytes = 256 * 1024; // 256 KB
    const bigData = Buffer.alloc(300 * 1024, 'a'); // 300 KB

    const fakeLengthStream = new ReadableStream({
      start(controller) {
        controller.enqueue(bigData);
        controller.close();
      },
    });

    const fakeLengthReq = new NextRequest('http://localhost:3000/api/qr-order', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '50', // Yanıltıcı küçük başlık
      },
      body: fakeLengthStream,
      duplex: 'half',
    } as any);

    await assert.rejects(
      async () => {
        await readJsonBodyWithLimit(fakeLengthReq, maxBytes);
      },
      (err: any) => err instanceof PayloadTooLargeError && err.status === 413,
      'Yanıltıcı Content-Length olsa dahi akış okuyucu bayt sınırını aştığında 413 fırlatmalıdır.'
    );

    // 3.2 Content-Length Başlığı Yokken (Chunked Stream) Aşırı Boyut
    const chunkedStream = new ReadableStream({
      start(controller) {
        controller.enqueue(Buffer.alloc(300 * 1024, 'x'));
        controller.close();
      },
    });

    const noLengthReq = new NextRequest('http://localhost:3000/api/qr-order', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Content-length bilinçli olarak yok
      },
      body: chunkedStream,
      duplex: 'half',
    } as any);

    await assert.rejects(
      async () => {
        await readJsonBodyWithLimit(noLengthReq, maxBytes);
      },
      (err: any) => err instanceof PayloadTooLargeError && err.status === 413,
      'Content-length başlığı olmadığında da akış boyutu aşıldığı an 413 ile durdurulmalıdır.'
    );
  });

  // ==========================================================================
  // BÖLÜM 4: AUTH & RBAC RED-TEAM TESTLERİ
  // ==========================================================================
  await t.test('4. Auth & RBAC: Rol Case Hassasiyeti, Bozuk JWT ve Yetkisiz Rota Çağrıları', async () => {
    (process.env as any).NODE_ENV = 'production';
    process.env.MASALINK_JWT_SECRET = TEST_SECRET;

    try {
      // 4.1 Küçük / Büyük Harf Rol Normalizasyonu: "OWNER" veya "Manager" kabul edilmeli
      const uppercaseOwnerToken = createSignedSessionToken({
        userId: 'usr-upper',
        name: 'Büyük Harf Admin',
        role: 'OWNER',
        tenantId: 'tenant-artisan-burger',
      });

      const upperReq = new NextRequest('http://localhost:3000/api/admin/staff', {
        headers: { authorization: `Bearer ${uppercaseOwnerToken}` },
      });

      const roleCheck = await requireRole(upperReq, ['owner', 'admin']);
      assert.equal(roleCheck.ok, true, 'Rol karşılaştırması case-insensitive olmalıdır (OWNER geçerli sayılmalı).');

      // 4.2 Bozuk ve Tahrif Edilmiş JWT
      const tamperedReq = new NextRequest('http://localhost:3000/api/admin/staff', {
        headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.tampered_payload.fake_sig' },
      });
      const tamperedCheck = await requireAuth(tamperedReq);
      assert.equal(tamperedCheck.ok, false);
      assert.equal(tamperedCheck.errorResponse.status, 401, 'Tahrif edilmiş JWT anında 401 dönmelidir.');

      // 4.3 Süresi Geçmiş (Expired) JWT
      const expiredToken = createSignedSessionToken(
        {
          userId: 'usr-exp',
          name: 'Zamanı Dolan',
          role: 'manager',
          tenantId: 'tenant-artisan-burger',
        },
        -100 // Geçmişte oluşturuldu (-100 saniye)
      );

      const expiredReq = new NextRequest('http://localhost:3000/api/admin/staff', {
        headers: { authorization: `Bearer ${expiredToken}` },
      });
      const expiredCheck = await requireAuth(expiredReq);
      assert.equal(expiredCheck.ok, false);
      assert.equal(expiredCheck.errorResponse.status, 401, 'Süresi dolmuş token 401 almalıdır.');

      // 4.4 Garson Rolü ile Admin Endpointine Doğrudan Handler Çağrısı (Defense-in-depth)
      const waiterToken = createSignedSessionToken({
        userId: 'usr-waiter-1',
        name: 'Garson',
        role: 'waiter',
        tenantId: 'tenant-artisan-burger',
      });

      const waiterOnAdminReq = new NextRequest('http://localhost:3000/api/admin/staff', {
        headers: { authorization: `Bearer ${waiterToken}` },
      });
      const adminRoleCheck = await requireRole(waiterOnAdminReq, ['owner', 'manager']);
      assert.equal(adminRoleCheck.ok, false);
      assert.equal(adminRoleCheck.errorResponse.status, 403, 'Garson admin endpointine eriştiğinde 403 almalıdır.');
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
    }
  });

  // ==========================================================================
  // BÖLÜM 5: PAYMENT EDGE CASES
  // ==========================================================================
  await t.test('5. Payment Sınır Değerleri: Negatif, 0, NaN, Infinity ve Replay Koruması', async () => {
    // 5.1 Negatif Tutar Reddedilmeli
    assert.throws(
      () => validateInitiatePayment({ tableId: 'tbl-1', amount: -50 }),
      (err: any) => err instanceof ValidationError && err.field === 'amount',
      'Negatif ödeme tutarı (-50) kesinlikle reddedilmelidir.'
    );

    // 5.2 Sıfır Tutar Reddedilmeli
    assert.throws(
      () => validateInitiatePayment({ tableId: 'tbl-1', amount: 0 }),
      (err: any) => err instanceof ValidationError && err.field === 'amount',
      'Sıfır ödeme tutarı (0) kesinlikle reddedilmelidir.'
    );

    // 5.3 NaN (Not a Number) Reddedilmeli
    assert.throws(
      () => validateInitiatePayment({ tableId: 'tbl-1', amount: NaN }),
      (err: any) => err instanceof ValidationError && err.field === 'amount',
      'NaN tutarı kesinlikle reddedilmelidir.'
    );

    // 5.4 Infinity ve Aşırı Büyük Tutar Reddedilmeli
    assert.throws(
      () => validateInitiatePayment({ tableId: 'tbl-1', amount: Infinity }),
      (err: any) => err instanceof ValidationError && err.field === 'amount',
      'Infinity tutarı kesinlikle reddedilmelidir.'
    );

    assert.throws(
      () => validateInitiatePayment({ tableId: 'tbl-1', amount: 10_000_000 }),
      (err: any) => err instanceof ValidationError && err.field === 'amount',
      '10 milyon TL gibi limit dışı aşırı tutar reddedilmelidir.'
    );

    // 5.5 Floating-Point Kuruş Hassasiyeti (0.1 + 0.2 yuvarlama denetimi)
    const validatedPrecision = validateInitiatePayment({ tableId: 'tbl-1', amount: 0.1 + 0.2 });
    assert.equal(validatedPrecision.amount, 0.3, 'Floating-point kuruş yuvarlaması tam 0.30 olmalıdır.');

    // 5.6 Webhook Replay Koruması (Tamamlanmış Ödemenin Tekrar Gönderilmesi)
    const testOrderId = `ord_tenant-artisan-burger_tbl-1_replay_${Date.now()}`;

    // Tam hesap tahsilatı
    const firstSettlement = await PaymentService.finalizeSettlement({
      merchantOrderId: testOrderId,
      paidAmount: 675,
      provider: 'IYZICO',
      providerTransactionId: 'tx-1',
    });
    assert.equal(firstSettlement.isCompleted, true);

    // Mükerrer / Replay çağrı (Aynı webhook tekrar tetiklenirse bakiye tekrar düşülmemeli, idempotent olmalı)
    const replaySettlement = await PaymentService.finalizeSettlement({
      merchantOrderId: testOrderId,
      paidAmount: 675,
      provider: 'IYZICO',
      providerTransactionId: 'tx-1',
    });

    assert.equal(replaySettlement.isCompleted, true);
    assert.equal(replaySettlement.remainingBalance, 0);
  });
});
