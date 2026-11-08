import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  verifyTableQrToken,
  createSignedSessionToken,
} from '../src/utils/tenantAuth';
import { validateTableSessionToken, normalizeKey } from '../src/utils/tableSessionRegistry';
import { getJwtSecret, getInternalSyncKey, getBridgeSecret } from '../src/server/security/secrets';
import { POST as loginPost } from '../src/app/api/auth/login/route';
import { POST as verifyPinPost } from '../src/app/api/auth/verify-pin/route';
import { POST as managerAuthorizePost } from '../src/app/api/auth/manager-authorize/route';
import { PayTRProvider } from '../src/server/payment/providers/paytrProvider';
import { IyzicoProvider } from '../src/server/payment/providers/iyzicoProvider';
import { requireTenant } from '../src/server/security/authGuard';

test('MasaLink Production Bypass & Geliştirici Sabitleri Güvenlik Denetimi', async (t) => {
  const originalEnv = process.env.NODE_ENV;
  const originalJwtSecret = process.env.MASALINK_JWT_SECRET;
  const originalSyncKey = process.env.MASALINK_INTERNAL_SYNC_KEY;
  const originalBridgeSecret = process.env.BRIDGE_SECRET;

  // Güvenli test ortamı için 32+ karakter JWT secret tanımlayalım (böylece secret kontrolü harici testlerde token üretilebilir)
  const TEST_SECURE_SECRET = 'a_very_secure_test_secret_32_characters_long_min!';

  // ==========================================================================
  // BÖLÜM 1: tok_demo TOKEN BYPASS KONTROLÜ
  // ==========================================================================
  await t.test('1. tok_demo Token Bypass: Production Ortamında Asla Kabul Edilmemeli', async () => {
    try {
      (process.env as any).NODE_ENV = 'production';
      process.env.MASALINK_JWT_SECRET = TEST_SECURE_SECRET;

      // 1.1 verifyTableQrToken: tok_demo_ tokenları production'da geçersiz olmalıdır
      const isQrValid = verifyTableQrToken('tok_demo_13', 'artisan-burger', 'tbl-1');
      assert.equal(isQrValid, false, 'Production ortamında tok_demo_ tokenı kabul EDİLEMEZ.');

      // 1.2 validateTableSessionToken: Masa oturum denetleyicisi production'da tok_demo_'yu reddetmelidir
      const sessionResult = validateTableSessionToken('artisan-burger', 'tbl-1', 'tok_demo_99');
      assert.equal(sessionResult.valid, false, 'Production ortamında masa oturumu tok_demo_ ile açılamaz.');

      // 1.3 Rastgele veya sıralı demo varyantları (tok_demo_table_1 vb.) denenmesi
      assert.equal(verifyTableQrToken('tok_tbl-1_demo', 'artisan-burger', 'tbl-1'), false);
      assert.equal(verifyTableQrToken('tok_demo', 'artisan-burger', 'tbl-1'), false);
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
    }
  });

  // ==========================================================================
  // BÖLÜM 2: admin@masalink.com & demo123 ŞİFRE BYPASS KONTROLÜ
  // ==========================================================================
  await t.test('2. admin@masalink.com & demo123: Production Ortamında Dev Fallback Girişi Reddedilmeli', async () => {
    try {
      (process.env as any).NODE_ENV = 'production';
      process.env.MASALINK_JWT_SECRET = TEST_SECURE_SECRET;

      const loginReq = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@masalink.com',
          password: 'demo123',
        }),
      });

      const res = await loginPost(loginReq);
      const data = await res.json();

      // Production'da hardcoded fallback asla çalışmamalı (401 dönmeli, token üretilmemeli)
      assert.equal(res.status, 401, 'Production ortamında demo123 şifresiyle giriş 401 dönmelidir.');
      assert.equal(data.success, false, 'Production ortamında dev fallback login başarısız olmalıdır.');
      assert.equal(data.isDevFallback, undefined, 'isDevFallback bayrağı production yanıtında bulunamaz.');

      // Cookie olarak session verilmediğini doğrula
      const cookie = res.cookies.get('masalink_session');
      assert.equal(cookie, undefined, 'Yetkisiz demo girişi için cookie üretilemez.');
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
    }
  });

  // ==========================================================================
  // BÖLÜM 3: HASHED_STAFF_PINS SABİT TEST PIN'LERİ KONTROLÜ
  // ==========================================================================
  await t.test('3. HASHED_STAFF_PINS: Production Ortamında Sabit Test PIN Kodları (1234, 5678, 4321) Reddedilmeli', async () => {
    try {
      (process.env as any).NODE_ENV = 'production';
      process.env.MASALINK_JWT_SECRET = TEST_SECURE_SECRET;

      const testPins = ['1234', '5678', '9012', '4321', '8765', '1122'];

      for (const pin of testPins) {
        const pinReq = new NextRequest('http://localhost:3000/api/auth/verify-pin', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': `198.51.100.${Math.floor(Math.random() * 200) + 10}`, // rate limiter bypass önlemi
          },
          body: JSON.stringify({
            pin,
            tenantId: 'tenant-artisan-burger',
          }),
        });

        const res = await verifyPinPost(pinReq);
        const data = await res.json();

        assert.equal(
          res.status,
          401,
          `Production ortamında test PIN (${pin}) ile giriş 401 dönmelidir.`
        );
        assert.equal(data.success, false, `Test PIN (${pin}) ile doğrulama başarısız olmalıdır.`);
      }
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
    }
  });

  // ==========================================================================
  // BÖLÜM 4: AUTHORIZED_MANAGERS SABİT YÖNETİCİ PIN'LERİ KONTROLÜ
  // ==========================================================================
  await t.test('4. AUTHORIZED_MANAGERS: Production Ortamında Sabit Yönetici PIN Kodları (8765, 9999) Reddedilmeli', async () => {
    try {
      (process.env as any).NODE_ENV = 'production';
      process.env.MASALINK_JWT_SECRET = TEST_SECURE_SECRET;

      // Geçerli bir personel oturumu taklit edelim
      const cashierToken = createSignedSessionToken({
        userId: 'cashier-test-1',
        name: 'Kasiyer Test',
        role: 'cashier',
        tenantId: 'tenant-artisan-burger',
      });

      const managerPins = ['8765', '9999', '1122'];

      for (const managerPin of managerPins) {
        const mgrReq = new NextRequest('http://localhost:3000/api/auth/manager-authorize', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${cashierToken}`,
            'x-forwarded-for': `198.51.101.${Math.floor(Math.random() * 200) + 10}`,
          },
          body: JSON.stringify({
            managerPin,
            reason: 'İkram onayı',
            actionType: 'COMP',
          }),
        });

        const res = await managerAuthorizePost(mgrReq);
        const data = await res.json();

        assert.equal(
          res.status,
          403,
          `Production ortamında sabit yönetici PIN (${managerPin}) 403 dönmelidir.`
        );
        assert.equal(data.success, false, `Sabit yönetici PIN (${managerPin}) reddedilmelidir.`);
      }
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
    }
  });

  // ==========================================================================
  // BÖLÜM 5: FALLBACK SECRET & SUNUCU BAŞLAMA FAIL-CLOSED KONTROLÜ
  // ==========================================================================
  await t.test('5. Fallback Secrets: Production Ortamında Eksik Secret Durumunda Fail-Closed İstisna Fırlatılmalı', () => {
    try {
      (process.env as any).NODE_ENV = 'production';

      // 5.1 MASALINK_JWT_SECRET Eksikse Fail-Closed
      delete process.env.MASALINK_JWT_SECRET;
      assert.throws(
        () => getJwtSecret(),
        (err: any) => err.message.includes('Production ortamında MASALINK_JWT_SECRET tanımlanmalıdır')
      );

      // 5.2 MASALINK_INTERNAL_SYNC_KEY Eksikse Fail-Closed
      delete process.env.MASALINK_INTERNAL_SYNC_KEY;
      assert.throws(
        () => getInternalSyncKey(),
        (err: any) => err.message.includes('Production ortamında MASALINK_INTERNAL_SYNC_KEY tanımlanmalıdır')
      );

      // 5.3 BRIDGE_SECRET Eksikse Fail-Closed
      delete process.env.BRIDGE_SECRET;
      assert.throws(
        () => getBridgeSecret(),
        (err: any) => err.message.includes('Production ortamında BRIDGE_SECRET tanımlanmalıdır')
      );
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
      process.env.MASALINK_JWT_SECRET = originalJwtSecret;
      process.env.MASALINK_INTERNAL_SYNC_KEY = originalSyncKey;
      process.env.BRIDGE_SECRET = originalBridgeSecret;
    }
  });

  // ==========================================================================
  // BÖLÜM 6: ÖDEME SAĞLAYICILARI SİMÜLASYON MODU FAIL-CLOSED KONTROLÜ
  // ==========================================================================
  await t.test('6. Payment Gateway Simulation: Production Ortamında Sahte Başarı Callbacki Kesinlikle Engellenmeli', async () => {
    try {
      (process.env as any).NODE_ENV = 'production';

      const dummyParams = {
        amount: 250,
        currency: 'TRY',
        tableId: 'tbl-1',
        tableCode: 'Masa 1',
        tenantId: 'tenant-artisan-burger',
        callbackUrl: 'http://localhost:3000/api/payment/callback',
        customer: { name: 'Test Müşteri', email: 'test@example.com', ip: '127.0.0.1' },
        items: [],
      };

      // 6.1 PayTR Provider: Production'da simülasyon moduna geçemez, hata fırlatmalıdır
      const paytr = new PayTRProvider();
      await assert.rejects(
        async () => {
          await paytr.initiatePayment(dummyParams);
        },
        (err: any) => err.message.includes('Production ortamında PayTR sağlayıcısı simülasyon moduna geçemez')
      );

      // 6.2 Iyzico Provider: Production'da simülasyon moduna geçemez, hata fırlatmalıdır
      const iyzico = new IyzicoProvider();
      await assert.rejects(
        async () => {
          await iyzico.initiatePayment(dummyParams);
        },
        (err: any) => err.message.includes('Production ortamında Iyzico sağlayıcısı simülasyon moduna geçemez')
      );
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
    }
  });

  // ==========================================================================
  // BÖLÜM 7: DEFAULT TENANT ATAMA ENGELLENMESİ
  // ==========================================================================
  await t.test('7. Default Tenant: Oturum veya URL Parametresi Olmadan Asla artisan-burger Atanmamalı', async () => {
    try {
      (process.env as any).NODE_ENV = 'production';
      process.env.MASALINK_JWT_SECRET = TEST_SECURE_SECRET;

      // 7.1 İstekte hiçbir tenant bilgisi yokken requireTenant 400 dönmeli
      const emptyReq = new NextRequest('http://localhost:3000/api/menu');

      const tenantCheck = requireTenant(emptyReq);

      // Fail-closed gereği tenant bulunamadığında reddedilmeli, default bir tenanta gizlice yönlendirilmemelidir
      assert.equal(tenantCheck.ok, false, 'Tenant bilgisi eksik istek kesinlikle reddedilmelidir.');
      assert.equal(tenantCheck.errorResponse.status, 401, 'Eksik tenant 401 Unauthorized dönmelidir.');
      assert.ok(!(tenantCheck as any).data, 'Default tenant verisi atanmamalıdır.');

      // 7.2 normalizeKey production ortamında boş tenantSlug verildiğinde hata fırlatmalı
      assert.throws(
        () => normalizeKey('', 'tbl-1'),
        (err: any) => err.message.includes('tenantSlug boş olamaz')
      );
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
    }
  });
});
