import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as verifyPinPost } from '../src/app/api/auth/verify-pin/route';
import { POST as managerAuthorizePost } from '../src/app/api/auth/manager-authorize/route';
import { POST as logoutPost } from '../src/app/api/auth/logout/route';
import { POST as ordersPost } from '../src/app/api/orders/route';
import { POST as tablePaymentPost } from '../src/app/api/tables/payment/route';
import { GET as adminStaffGet } from '../src/app/api/admin/staff/route';
import {
  createSignedSessionToken,
  verifySignedSessionToken,
} from '../src/utils/tenantAuth';
import {
  createManagerApprovalToken,
  verifyManagerApprovalToken,
  consumeManagerApprovalToken,
  validateDiscountSecurityAsync,
  verifyManagerPin,
} from '../src/utils/managerAuth';
import { TokenRevocationService } from '../src/server/security/tokenRevocation';
import { getStoredWaiterSession, setStoredWaiterSession, clearStoredWaiterSession } from '../src/utils/waiterAuth';
import { getPosShiftSession, savePosShiftSession, clearPosShiftSession } from '../src/utils/posAuth';
import { enforcePinRateLimit, recordFailedPinAttempt, recordSuccessfulPinAttempt } from '../src/utils/pinRateLimiter';

const TEST_SECRET = 'a_very_secure_test_secret_32_characters_long_min!';

test('MasaLink Aşama 2: Kimlik Doğrulama, Yetkilendirme ve Oturum Güvenliği Test Paketi', async (t) => {
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = process.env.MASALINK_JWT_SECRET;
  process.env.MASALINK_JWT_SECRET = TEST_SECRET;

  // --------------------------------------------------------------------------
  // SENARYO 1: Doğru PIN ile Giriş
  // --------------------------------------------------------------------------
  await t.test('1. Doğru PIN ile giriş: 200 OK ve HttpOnly session cookie dönmeli', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pin: '1234',
        expectedRole: 'waiter',
        tenantId: 'tenant-artisan-burger',
      }),
    });

    const res = await verifyPinPost(req);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.user.role, 'waiter');
    assert.equal(Boolean(res.cookies.get('masalink_session')), true);
  });

  // --------------------------------------------------------------------------
  // SENARYO 2: Yanlış PIN ile Giriş
  // --------------------------------------------------------------------------
  await t.test('2. Yanlış PIN ile giriş: 401 Unauthorized dönmeli', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pin: '0000',
        expectedRole: 'waiter',
        tenantId: 'tenant-artisan-burger',
      }),
    });

    const res = await verifyPinPost(req);
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.errorCode, 'INVALID_PIN');
  });

  // --------------------------------------------------------------------------
  // SENARYO 3: Varsayılan PIN ile Üretim Girişinin Reddedilmesi
  // --------------------------------------------------------------------------
  await t.test('3. Varsayılan/hardcoded PIN ile üretim girişinin kesin reddi', async () => {
    try {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.DATABASE_URL;

      const req = new NextRequest('http://localhost:3000/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: '1234',
          expectedRole: 'waiter',
          tenantId: 'tenant-artisan-burger',
        }),
      });

      const res = await verifyPinPost(req);
      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.success, false);
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
    }
  });

  // --------------------------------------------------------------------------
  // SENARYO 4 & 15: Rol/PIN Değişikliğinde Eski Oturumun Engellenmesi
  // --------------------------------------------------------------------------
  await t.test('4 & 15. Personel rolü veya PIN değiştiğinde eski oturumun geçersiz kılınması (tokenVersion)', async () => {
    const userId = 'usr_waiter_revocation_test';
    const initialVersion = await TokenRevocationService.getUserTokenVersion(userId);

    const oldToken = createSignedSessionToken({
      userId,
      name: 'Test Garson',
      role: 'waiter',
      tenantId: 'tenant-artisan-burger',
      tokenVersion: initialVersion,
    });

    // Oturum başlangıçta geçerlidir
    const parsed = verifySignedSessionToken(oldToken);
    assert.notEqual(parsed, null);
    const isRevokedBefore = await TokenRevocationService.isRevoked(oldToken, {
      userId,
      tokenVersion: parsed?.tokenVersion,
      issuedAt: parsed?.issuedAt,
    });
    assert.equal(isRevokedBefore, false);

    // Yönetici personelin rolünü veya PIN'ini günceller -> tüm oturumlar geçersiz kılınır
    await TokenRevocationService.invalidateAllUserSessions(userId);

    // Eski token artık iptal edilmiştir (revoked)
    const isRevokedAfter = await TokenRevocationService.isRevoked(oldToken, {
      userId,
      tokenVersion: parsed?.tokenVersion,
      issuedAt: parsed?.issuedAt,
    });
    assert.equal(isRevokedAfter, true, 'Rol/PIN güncellendikten sonra eski oturum reddedilmelidir');
  });

  // --------------------------------------------------------------------------
  // SENARYO 5 & 6: Oturum Kapatıldıktan Sonra Korumalı API'ye Erişimin Engellenmesi
  // --------------------------------------------------------------------------
  await t.test('5 & 6. Logout sonrası token kara listeye alınmalı ve korumalı API erişimi kesilmeli', async () => {
    const token = createSignedSessionToken({
      userId: 'usr_logout_test',
      name: 'Müdür',
      role: 'manager',
      tenantId: 'tenant-artisan-burger',
    });

    // Logout isteği
    const logoutReq = new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const logoutRes = await logoutPost(logoutReq);
    assert.equal(logoutRes.status, 200);

    // Korumalı Admin Staff API'sine erişim denenir
    const staffReq = new NextRequest('http://localhost:3000/api/admin/staff', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const staffRes = await adminStaffGet(staffReq);
    assert.equal(staffRes.status, 401);
    const json = await staffRes.json();
    assert.equal(json.errorCode, 'TOKEN_REVOKED');
  });

  // --------------------------------------------------------------------------
  // SENARYO 7: Garsonun Yönetici API'sini Kullanamaması (RBAC)
  // --------------------------------------------------------------------------
  await t.test('7. Garsonun yönetici API uçlarına (/api/admin/*) erişimi 403 Forbidden ile engellenmeli', async () => {
    const waiterToken = createSignedSessionToken({
      userId: 'usr_waiter_99',
      name: 'Garson Ali',
      role: 'waiter',
      tenantId: 'tenant-artisan-burger',
    });

    const req = new NextRequest('http://localhost:3000/api/admin/staff', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${waiterToken}`,
      },
    });

    const res = await adminStaffGet(req);
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.errorCode, 'FORBIDDEN');
  });

  // --------------------------------------------------------------------------
  // SENARYO 8: İstemciden managerAuth: true Gönderilerek Yetki Kazanılamaması
  // --------------------------------------------------------------------------
  await t.test('8. İstemcinin sahte managerAuth/isAdmin bayrakları sunucu yetkilendirmesini atlatamamalı', async () => {
    const cashierToken = createSignedSessionToken({
      userId: 'usr_cashier_1',
      name: 'Kasiyer',
      role: 'cashier',
      tenantId: 'tenant-artisan-burger',
    });

    // 1. Ayrıcalıklı bayrak enjeksiyonu denemesi (Mass-assignment kalkanı) -> 400
    const reqInject = new NextRequest('http://localhost:3000/api/tables/payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierToken}`,
      },
      body: JSON.stringify({
        tableId: 'tbl-1',
        totalAmount: 200,
        paymentAmount: 100,
        discountType: 'percent',
        discountValue: 50,
        managerAuth: true, // Sahte bypass bayrağı
        isAdmin: true,
      }),
    });

    const resInject = await tablePaymentPost(reqInject);
    assert.equal(resInject.status, 400);

    // 2. Yönetici onayı olmaksızın %50 indirim istemi -> 403 Forbidden
    const reqNoPin = new NextRequest('http://localhost:3000/api/tables/payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierToken}`,
      },
      body: JSON.stringify({
        tableId: 'tbl-1',
        totalAmount: 200,
        paymentAmount: 100,
        discountType: 'percent',
        discountValue: 50,
      }),
    });

    const resNoPin = await tablePaymentPost(reqNoPin);
    assert.equal(resNoPin.status, 403);
    const jsonNoPin = await resNoPin.json();
    assert.equal(jsonNoPin.errorCode, 'MANAGER_PIN_REQUIRED');
  });

  // --------------------------------------------------------------------------
  // SENARYO 9: Yönetici Onayının Farklı Bir İşleme veya Masaya Aktarılmasının Engellenmesi
  // --------------------------------------------------------------------------
  await t.test('9. Yönetici onay tokenı başka masaya veya farklı bir işleme aktarılamaz', async () => {
    // Masa 1 için üretilmiş indirim onay tokenı
    const approvalTokenForTable1 = createManagerApprovalToken({
      managerId: 'mgr-1',
      managerName: 'Ali Demir',
      role: 'manager',
      title: 'Restoran Müdürü',
      tenantId: 'tenant-artisan-burger',
      action: 'DISCOUNT',
      resourceId: 'tbl-1',
    });

    // 1. Doğru masada doğrulama: Başarılı
    const validVerify = verifyManagerApprovalToken(approvalTokenForTable1, {
      expectedTenantId: 'tenant-artisan-burger',
      expectedResourceId: 'tbl-1',
    });
    assert.equal(validVerify.valid, true);

    // 2. Başka masa (tbl-2) için kullanılmaya çalışılması: Reddedilmeli
    const invalidTableVerify = verifyManagerApprovalToken(approvalTokenForTable1, {
      expectedTenantId: 'tenant-artisan-burger',
      expectedResourceId: 'tbl-2',
    });
    assert.equal(invalidTableVerify.valid, false);
    assert.match(invalidTableVerify.error!, /başka bir masa veya kaynak/i);

    // 3. Başka kiracı (tenant-b) için kullanılmaya çalışılması: Reddedilmeli
    const crossTenantVerify = verifyManagerApprovalToken(approvalTokenForTable1, {
      expectedTenantId: 'tenant-b',
    });
    assert.equal(crossTenantVerify.valid, false);
    assert.match(crossTenantVerify.error!, /Cross-Tenant/i);

    // 4. Tek kullanım denetimi (Replay koruması): Tüketildikten sonra tekrar kullanılamaz
    consumeManagerApprovalToken(approvalTokenForTable1);
    const replayedVerify = verifyManagerApprovalToken(approvalTokenForTable1, {
      expectedTenantId: 'tenant-artisan-burger',
      expectedResourceId: 'tbl-1',
    });
    assert.equal(replayedVerify.valid, false);
    assert.match(replayedVerify.error!, /daha önce kullanılmıştır/i);
  });

  // --------------------------------------------------------------------------
  // SENARYO 10 & 17: Rate Limit ve Brute-Force Kalkanı
  // --------------------------------------------------------------------------
  await t.test('10 & 17. 5 hatalı PIN denemesi sonrası sistem 429 ile kilitlemeli', async () => {
    const testIp = '198.51.100.77';

    // 5 hatalı deneme kaydı
    for (let i = 0; i < 5; i++) {
      await recordFailedPinAttempt(testIp);
    }

    const check = await enforcePinRateLimit(testIp);
    assert.equal(check.allowed, false);
    assert.equal(check.isLocked, true);
    assert.equal(Boolean(check.retryAfterSeconds && check.retryAfterSeconds > 0), true);

    // Başarılı giriş ile sıfırlanma
    recordSuccessfulPinAttempt(testIp);
    const resetCheck = await enforcePinRateLimit(testIp);
    assert.equal(resetCheck.allowed, true);
  });

  // --------------------------------------------------------------------------
  // SENARYO 11: Cross-Tenant Erişim Engeli
  // --------------------------------------------------------------------------
  await t.test('11. Tenant A personeli Tenant B sipariş veya kaynaklarına erişememeli', async () => {
    const tenantAToken = createSignedSessionToken({
      userId: 'usr_tenant_a',
      name: 'Personel A',
      role: 'waiter',
      tenantId: 'tenant-artisan-burger',
    });

    const crossReq = new NextRequest('http://localhost:3000/api/orders?tenantSlug=pizza-palace', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantAToken}`,
        'x-tenant-slug': 'pizza-palace',
      },
      body: JSON.stringify({
        tableId: 'tbl-1',
        source: 'WAITER',
        items: [{ productCode: 'b1', name: 'Artisan Burger', quantity: 1 }],
      }),
    });

    const res = await ordersPost(crossReq);
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.errorCode, 'CROSS_TENANT_FORBIDDEN');
  });

  // --------------------------------------------------------------------------
  // SENARYO 12 & 13: Yetkisiz İndirim ve İkram Engeli
  // --------------------------------------------------------------------------
  await t.test('12 & 13. %10 üzeri indirim veya ₺0 ikram yapma yönetici onayı olmaksızın reddedilmeli', async () => {
    // 1. %10 indirim (kasiyer inisiyatifi): Serbest
    const lowDiscount = await validateDiscountSecurityAsync({
      subtotal: 100,
      discountType: 'percent',
      discountValue: 10,
      currentUserRole: 'cashier',
    });
    assert.equal(lowDiscount.allowed, true);

    // 2. %20 indirim (yönetici PIN veya token yok): Red
    const highDiscountNoPin = await validateDiscountSecurityAsync({
      subtotal: 100,
      discountType: 'percent',
      discountValue: 20,
      currentUserRole: 'cashier',
    });
    assert.equal(highDiscountNoPin.allowed, false);
    assert.equal(highDiscountNoPin.errorCode, 'MANAGER_PIN_REQUIRED');

    // 3. İkram (₺0 yapma): Yönetici onayı yoksa Red
    const compNoPin = await validateDiscountSecurityAsync({
      subtotal: 100,
      compedItems: [{ name: 'Burger', price: 100, quantity: 1 }],
      currentUserRole: 'cashier',
    });
    assert.equal(compNoPin.allowed, false);
    assert.equal(compNoPin.errorCode, 'MANAGER_PIN_REQUIRED');
  });

  // --------------------------------------------------------------------------
  // SENARYO 14: Yetkisiz Personelin Sipariş/Kasa İşlemi Yapamaması
  // --------------------------------------------------------------------------
  await t.test('14. Mutfak personelinin (kitchen) POS siparişi oluşturması 403 ile engellenmeli', async () => {
    const kitchenToken = createSignedSessionToken({
      userId: 'usr_chef_1',
      name: 'Aşçıbaşı',
      role: 'kitchen',
      tenantId: 'tenant-artisan-burger',
    });

    const req = new NextRequest('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${kitchenToken}`,
      },
      body: JSON.stringify({
        tableId: 'tbl-1',
        source: 'POS',
        items: [{ productCode: 'b1', name: 'Burger', quantity: 1 }],
      }),
    });

    const res = await ordersPost(req);
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.errorCode, 'FORBIDDEN_ORDER_SOURCE');
  });

  // --------------------------------------------------------------------------
  // SENARYO 16: PIN ve Token Değerlerinin Client Depolamasına Sızmaması
  // --------------------------------------------------------------------------
  await t.test('16. setStoredWaiterSession ve savePosShiftSession PIN alanını asla saklamamalı', () => {
    const memoryStorage = new Map<string, string>();
    const mockStorage = {
      getItem: (k: string) => memoryStorage.get(k) || null,
      setItem: (k: string, v: string) => memoryStorage.set(k, v),
      removeItem: (k: string) => memoryStorage.delete(k),
    };

    (globalThis as any).window = {};
    (globalThis as any).sessionStorage = mockStorage;
    (globalThis as any).localStorage = mockStorage;

    try {
      // Garson oturumuna PIN gönderilse dahi temizlenmeli
      setStoredWaiterSession({
        id: 'w-1',
        name: 'Ahmet',
        pin: '1234', // Sızma girişimi
        role: 'Garson',
        section: 'Salon',
        avatar: '👨‍🍳',
      });

      const storedWaiter = getStoredWaiterSession();
      assert.equal(storedWaiter?.name, 'Ahmet');
      assert.equal((storedWaiter as any)?.pin, undefined, 'Garson PIN kodu storage verisinden temizlenmelidir');
      clearStoredWaiterSession();

      // Kasa oturumu
      savePosShiftSession({
        cashierId: 'c-1',
        cashierName: 'Zeynep',
        role: 'Kasiyer',
        shiftStartTime: '09:00',
        floatCash: 500,
      });
      const storedCashier = getPosShiftSession();
      assert.equal(storedCashier?.cashierName, 'Zeynep');
      assert.equal((storedCashier as any)?.pin, undefined, 'Kasiyer PIN kodu storage verisinden temizlenmelidir');
      clearPosShiftSession();
    } finally {
      delete (globalThis as any).window;
      delete (globalThis as any).sessionStorage;
      delete (globalThis as any).localStorage;
    }
  });

  // --------------------------------------------------------------------------
  // SENARYO 18: Kimlik Doğrulama Kesintisinde Güvenli Hata Davranışı (Fail-Closed)
  // --------------------------------------------------------------------------
  await t.test('18. verifyManagerPinAsync: Veritabanı ve parametre yokken fail-closed (false) dönmeli', async () => {
    const resultEmpty = await validateDiscountSecurityAsync({
      subtotal: 100,
      discountType: 'percent',
      discountValue: 30,
      currentUserRole: 'cashier',
      managerPin: '', // Boş PIN
    });
    assert.equal(resultEmpty.allowed, false);
    assert.equal(resultEmpty.errorCode, 'MANAGER_PIN_REQUIRED');
  });

  // Restore env
  process.env.MASALINK_JWT_SECRET = originalSecret;
});
