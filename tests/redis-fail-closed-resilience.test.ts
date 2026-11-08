import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenRevocationService } from '../src/server/security/tokenRevocation';
import { createSignedSessionToken } from '../src/utils/tenantAuth';
import {
  recordAtomicPartialPayment,
  clearTableLedger,
  withTableLock,
} from '../src/utils/concurrencyLock';
import {
  enforcePinRateLimit,
  recordFailedPinAttempt,
  simulateRateLimiterRedisOutage,
  clearPinRateLimitStore,
} from '../src/utils/pinRateLimiter';

test('MasaLink Redis Fail-Closed & Altyapı Dayanıklılığı Test Paketi', async (t) => {
  // ==========================================================================
  // BÖLÜM 1: TOKEN REVOCATION FAIL-CLOSED TESTLERİ
  // ==========================================================================
  await t.test('1.1 Token Revocation: Redis Kesintisinde Production Fail-Closed Davranışı', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.MASALINK_JWT_SECRET;
    (process.env as any).NODE_ENV = 'production';
    process.env.MASALINK_JWT_SECRET = 'a_very_secure_test_secret_32_characters_long_min!';

    try {
      const token = createSignedSessionToken({
        userId: 'usr-redis-fail-prod',
        name: 'Müdür Test',
        role: 'manager',
        tenantId: 'tenant-artisan-burger',
        tokenVersion: 1,
      });

      // Normal durumda geçerli
      TokenRevocationService.simulateRedisOutage(false);
      assert.equal(await TokenRevocationService.isRevoked(token), false);

      // Redis kesintisi simülasyonu aktif ediliyor (Cluster bağlantısı koptu)
      TokenRevocationService.simulateRedisOutage(true);

      // ⚠️ Production + Multi-pod: Redis kesintisinde oturumun iptal edilip edilmediği
      // dağıtık olarak doğrulanamıyorsa güvenlik nedeniyle FAIL-CLOSED davranmalıdır.
      const isRevokedDuringOutage = await TokenRevocationService.isRevoked(token, {
        userId: 'usr-redis-fail-prod',
        tokenVersion: 1,
      });

      assert.equal(
        isRevokedDuringOutage,
        true,
        'Production ortamında Redis kesintisi varken doğrulanamayan oturum Fail-Closed reddedilmelidir.'
      );
    } finally {
      TokenRevocationService.simulateRedisOutage(false);
      (process.env as any).NODE_ENV = originalEnv;
      process.env.MASALINK_JWT_SECRET = originalSecret;
    }
  });

  await t.test('1.2 Token Revocation: Yerel Kara Liste Başka Podda veya Bellekte Yakalanır', async () => {
    const token = createSignedSessionToken({
      userId: 'usr-logout-outage',
      name: 'Garson Test',
      role: 'waiter',
      tenantId: 'tenant-artisan-burger',
    });

    // Logout çağrısı yapılır
    await TokenRevocationService.revoke(token);

    // Redis kapalı olsa bile bu token artık kalıcı kara listede olmalıdır
    TokenRevocationService.simulateRedisOutage(true);
    const checkRevoked = await TokenRevocationService.isRevoked(token);
    assert.equal(checkRevoked, true, 'Logout edilmiş token Redis kapalıyken de iptal kabul edilmelidir.');
    TokenRevocationService.simulateRedisOutage(false);
  });

  // ==========================================================================
  // BÖLÜM 2: PAYMENT LOCK: REDIS OLMADAN 50 VE 100 PARALEL İSTEK TESTİ
  // ==========================================================================
  await t.test('2.1 Payment Lock: 50 Paralel Ödeme İsteğinde Bakiye Aşımı ve Çift Çekim Engeli', async () => {
    const tableId = 'tbl-stress-50';
    const totalBill = 1000;
    clearTableLedger(tableId);

    // 50 paralel müşteri her biri ₺500 çekmeye çalışıyor (Toplam talep: ₺25,000!)
    const paymentPromises: Promise<{ success: boolean; error?: string }>[] = [];

    for (let i = 0; i < 50; i++) {
      paymentPromises.push(
        withTableLock(tableId, async () => {
          return recordAtomicPartialPayment(tableId, totalBill, 500);
        })
      );
    }

    const results = await Promise.all(paymentPromises);
    const successPayments = results.filter((r) => r.success);
    const rejectedPayments = results.filter((r) => !r.success);

    console.log(
      `[Stres 50 Paralel] Toplam Masa Hesabı: ₺${totalBill} | Başarılı Ödeme: ${successPayments.length} (₺${successPayments.length * 500}) | Reddedilen: ${rejectedPayments.length}`
    );

    // ₺1000'lik hesapta ₺500'lik ödemeden tam 2 adet onaylanmalı, kalan 48'i reddedilmelidir!
    assert.equal(successPayments.length, 2, '₺1000 hesapta ₺500 tutarlı yalnızca 2 ödeme kabul edilmelidir.');
    assert.equal(rejectedPayments.length, 48, 'Bakiye aşımı nedeniyle kalan 48 ödeme engellenmelidir.');
    clearTableLedger(tableId);
  });

  await t.test('2.2 Payment Lock: 100 Paralel Ödeme İsteğinde Bakiye Aşımı ve Kuruş Hassasiyeti Engeli', async () => {
    const tableId = 'tbl-stress-100';
    const totalBill = 500;
    clearTableLedger(tableId);

    // 100 paralel müşteri her biri ₺100 ödemeye çalışıyor (Toplam talep: ₺10,000!)
    const paymentPromises: Promise<{ success: boolean; paidSoFar?: number; error?: string }>[] = [];

    for (let i = 0; i < 100; i++) {
      paymentPromises.push(
        withTableLock(tableId, async () => {
          return recordAtomicPartialPayment(tableId, totalBill, 100);
        })
      );
    }

    const results = await Promise.all(paymentPromises);
    const successPayments = results.filter((r) => r.success);
    const rejectedPayments = results.filter((r) => !r.success);

    console.log(
      `[Stres 100 Paralel] Toplam Masa Hesabı: ₺${totalBill} | Başarılı Ödeme: ${successPayments.length} (₺${successPayments.length * 100}) | Reddedilen: ${rejectedPayments.length}`
    );

    // ₺500'lik hesapta ₺100'lik ödemeden tam 5 adet onaylanmalı, kalan 95'i reddedilmelidir!
    assert.equal(successPayments.length, 5, '₺500 hesapta ₺100 tutarlı tam 5 ödeme kabul edilmelidir.');
    assert.equal(rejectedPayments.length, 95, 'Kalan 95 istek bakiye aşımı ile engellenmelidir.');
    clearTableLedger(tableId);
  });

  // ==========================================================================
  // BÖLÜM 3: RATE LIMIT: REDIS KAPALIYKEN MULTI-POD / CONSERVATIVE THROTTLE
  // ==========================================================================
  await t.test('3.1 Rate Limit: Redis Kapalıyken Hatalı Giriş Sayacı ve Kilit Kalkanı', async () => {
    const clientKey = 'ip_stress_test_worker';
    clearPinRateLimitStore();

    // Redis kesintisi simüle ediliyor
    simulateRateLimiterRedisOutage(true);

    try {
      // 1. İlk 4 hatalı deneme
      for (let i = 1; i <= 4; i++) {
        const attempt = await recordFailedPinAttempt(clientKey);
        assert.equal(attempt.isLockedNow, false, `${i}. denemede henüz kilitlenmemeli`);
      }

      // 2. 5. hatalı deneme -> Anında kilitlenmeli
      const finalAttempt = await recordFailedPinAttempt(clientKey);
      assert.equal(finalAttempt.isLockedNow, true, '5. hatalı denemede kilit aktif olmalıdır.');

      // 3. Sonraki istekler enforcePinRateLimit tarafından kesin olarak 429 kilitli dönmeli
      const limitCheck = await enforcePinRateLimit(clientKey);
      assert.equal(limitCheck.allowed, false, 'Kilitli istemci reddedilmelidir.');
      assert.equal(limitCheck.isLocked, true);
    } finally {
      simulateRateLimiterRedisOutage(false);
      clearPinRateLimitStore();
    }
  });

  await t.test('3.2 Rate Limit: Production Ortamında Redis Kesintisinde Konservatif Savunma', async () => {
    const clientKey = 'ip_prod_conservative';
    clearPinRateLimitStore();
    const originalEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = 'production';
    simulateRateLimiterRedisOutage(true);

    try {
      // 1. deneme
      await recordFailedPinAttempt(clientKey);
      const check1 = await enforcePinRateLimit(clientKey);
      assert.equal(check1.allowed, true);

      // 2. deneme (Production modunda Redis yoksa kaba kuvvet saldırılarını önlemek için eşik 2'ye indirilir)
      await recordFailedPinAttempt(clientKey);
      const check2 = await enforcePinRateLimit(clientKey);
      assert.equal(
        check2.allowed,
        false,
        'Production modunda Redis kesintisi varken konservatif eşik (2 deneme) devreye girmelidir.'
      );
    } finally {
      simulateRateLimiterRedisOutage(false);
      clearPinRateLimitStore();
      (process.env as any).NODE_ENV = originalEnv;
    }
  });
});
