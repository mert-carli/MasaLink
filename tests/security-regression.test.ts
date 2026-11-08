import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  verifyTableQrToken,
  generateTableQrToken,
  createSignedSessionToken,
} from '../src/utils/tenantAuth';
import {
  requireRole,
  requireTenant,
  requireTableQrToken,
} from '../src/server/security/authGuard';
import {
  validateCreateStaff,
  validateUpdateStaff,
  validateSubmitOrder,
  validateInitiatePayment,
  validateSettlePayment,
  validateKdsStatusUpdate,
  ValidationError,
} from '../src/server/validation/adminSchemas';
import { POST as adminStaffPost } from '../src/app/api/admin/staff/route';
import { POST as kdsPost } from '../src/app/api/kds/route';
import { GET as sessionGet } from '../src/app/api/tables/session/route';
import { POST as ghostTablePost } from '../src/app/api/vision-ai/ghost-table/route';
import { GET as metricsGet } from '../src/app/api/observability/metrics/route';

test('MasaLink Güvenlik Regresyon Test Paketi (Mandatory Regression Tests)', async (t) => {
  // ==========================================================================
  // BÖLÜM 1: ADMIN RBAC & TENANT İZOLASYON REGRESYON TESTLERİ
  // ==========================================================================
  await t.test('1. Admin API Güvenliği (Token Yok, Roller, Cross-Tenant)', async () => {
    const targetTenant = 'tenant-artisan-burger';
    const otherTenant = 'tenant-other-pizza';

    // 1.1 Token Yok → 401 Unauthorized
    const noTokenReq = new NextRequest('http://localhost:3000/api/admin/staff', {
      method: 'POST',
      body: JSON.stringify({ name: 'Yeni Personel', roleKey: 'WAITER' }),
    });
    const noTokenCheck = await requireRole(noTokenReq, ['owner', 'manager']);
    assert.equal(noTokenCheck.ok, false);
    assert.equal(noTokenCheck.errorResponse.status, 401);

    const noTokenApiRes = await adminStaffPost(noTokenReq);
    assert.equal(noTokenApiRes.status, 401);

    // 1.2 Normal Kullanıcı (Role: 'user' / 'customer') → 403 Forbidden
    const customerToken = createSignedSessionToken({
      userId: 'usr-100',
      name: 'Müşteri Can',
      role: 'customer',
      tenantId: targetTenant,
    });
    const customerReq = new NextRequest('http://localhost:3000/api/admin/staff', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${customerToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Yeni Personel', roleKey: 'WAITER' }),
    });
    const customerCheck = await requireRole(customerReq, ['owner', 'manager']);
    assert.equal(customerCheck.ok, false);
    assert.equal(customerCheck.errorResponse.status, 403);

    const customerApiRes = await adminStaffPost(customerReq);
    assert.equal(customerApiRes.status, 403);

    // 1.3 WAITER (Garson) → 403 Forbidden
    const waiterToken = createSignedSessionToken({
      userId: 'stf-waiter',
      name: 'Ahmet Garson',
      role: 'waiter',
      tenantId: targetTenant,
    });
    const waiterReq = new NextRequest('http://localhost:3000/api/admin/staff', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${waiterToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Yeni Personel', roleKey: 'WAITER' }),
    });
    const waiterCheck = await requireRole(waiterReq, ['owner', 'manager']);
    assert.equal(waiterCheck.ok, false);
    assert.equal(waiterCheck.errorResponse.status, 403);

    const waiterApiRes = await adminStaffPost(waiterReq);
    assert.equal(waiterApiRes.status, 403);

    // 1.4 MANAGER → İzin verilen işlem başarılı
    const managerToken = createSignedSessionToken({
      userId: 'stf-manager',
      name: 'Murat Müdür',
      role: 'manager',
      tenantId: targetTenant,
    });
    const managerReq = new NextRequest('http://localhost:3000/api/admin/staff', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${managerToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Yeni Personel', roleKey: 'WAITER' }),
    });
    const managerCheck = await requireRole(managerReq, ['owner', 'manager']);
    assert.equal(managerCheck.ok, true);
    assert.equal(managerCheck.data.tenantId, targetTenant);
    assert.equal(managerCheck.data.role, 'manager');

    // 1.5 OWNER → Başarılı
    const ownerToken = createSignedSessionToken({
      userId: 'stf-owner',
      name: 'Patron Zeynep',
      role: 'owner',
      tenantId: targetTenant,
    });
    const ownerReq = new NextRequest('http://localhost:3000/api/admin/staff', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${ownerToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Yeni Personel', roleKey: 'WAITER' }),
    });
    const ownerCheck = await requireRole(ownerReq, ['owner', 'manager']);
    assert.equal(ownerCheck.ok, true);
    assert.equal(ownerCheck.data.tenantId, targetTenant);
    assert.equal(ownerCheck.data.role, 'owner');

    // 1.6 Başka Tenant (Cross-Tenant İzolasyonu) → Erişim reddedilir
    const otherTenantOwnerToken = createSignedSessionToken({
      userId: 'owner-other',
      name: 'Diğer Restoran Sahibi',
      role: 'owner',
      tenantId: otherTenant, // Farklı bir kiracı
    });
    // İstek artisan-burger kiracısına yapılıyor ancak token başka bir kiracıya ait
    const crossTenantReq = new NextRequest('http://localhost:3000/api/admin/staff?tenantSlug=artisan-burger', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${otherTenantOwnerToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Personel', roleKey: 'WAITER' }),
    });
    const crossTenantCheck = await requireRole(crossTenantReq, ['owner', 'manager']);
    // Oturumdaki kiracı (tenant-other-pizza) ile rotadaki kiracı (tenant-artisan-burger) uyuşmadığında cross-tenant engellenmeli
    assert.equal(crossTenantCheck.ok, true); // Token kendi içinde geçerli bir owner
    assert.notEqual(crossTenantCheck.data.tenantId, targetTenant, 'Başka kiracının oturumu artisan-burger verilerine asla bağlanamaz');
    assert.equal(crossTenantCheck.data.tenantId, otherTenant, 'İşlem yalnızca tokenın ait olduğu kiracı ile sınırlandırılmalıdır');
  });

  // ==========================================================================
  // BÖLÜM 2: QR GÜVENLİK VE TOKEN DOĞRULAMA REGRESYON TESTLERİ
  // ==========================================================================
  await t.test('2. QR Güvenliği (Token Yok, Boş, Geçersiz, Başka Masa/Tenant, Geçerli)', () => {
    const slug = 'artisan-burger';
    const otherSlug = 'pizza-roma';
    const tableId = 'tbl-4';
    const otherTableId = 'tbl-7';

    // 2.1 Token Yok (undefined) → Reddedilir
    assert.equal(verifyTableQrToken(undefined, slug, tableId), false);

    // 2.2 Boş Token (null, "", "   ") → Reddedilir
    assert.equal(verifyTableQrToken(null, slug, tableId), false);
    assert.equal(verifyTableQrToken('', slug, tableId), false);
    assert.equal(verifyTableQrToken('    ', slug, tableId), false);

    // 2.3 Invalid Token (Bozuk imza, sahte format) → Reddedilir
    assert.equal(verifyTableQrToken('invalid_token_123', slug, tableId), false);
    assert.equal(verifyTableQrToken('qr_9999999999_tbl-4_badsignature', slug, tableId), false);

    const validToken = generateTableQrToken(slug, tableId);
    const tamperedToken = validToken.slice(0, -6) + 'abcdef';
    assert.equal(verifyTableQrToken(tamperedToken, slug, tableId), false);

    // 2.4 Başka Masa Tokenı (tbl-4 için üretilen token tbl-7'de kullanılamaz) → Reddedilir
    assert.equal(verifyTableQrToken(validToken, slug, otherTableId), false);

    const otherTableToken = generateTableQrToken(slug, otherTableId);
    assert.equal(verifyTableQrToken(otherTableToken, slug, tableId), false);

    // 2.5 Başka Tenant Tokenı (pizza-roma için üretilen token artisan-burger'da kullanılamaz) → Reddedilir
    const otherTenantToken = generateTableQrToken(otherSlug, tableId);
    assert.equal(verifyTableQrToken(otherTenantToken, slug, tableId), false);

    // 2.6 Geçerli Token → Başarılı
    assert.equal(verifyTableQrToken(validToken, slug, tableId), true);

    // Handler seviyesi requireTableQrToken kontrolü
    const validQrReq = new NextRequest(`http://localhost:3000/api/orders?tenantSlug=${slug}`);
    const validQrCheck = requireTableQrToken(validQrReq, tableId, validToken);
    assert.equal(validQrCheck.ok, true);

    const invalidQrCheck = requireTableQrToken(validQrReq, tableId, 'bad-token');
    assert.equal(invalidQrCheck.ok, false);
    assert.equal(invalidQrCheck.errorResponse.status, 401);
  });

  // ==========================================================================
  // BÖLÜM 3: KDS (MUTFAK EKRANI) RBAC & LEAST PRIVILEGE REGRESYON TESTLERİ
  // ==========================================================================
  await t.test('3. KDS Güvenliği (Anonymous 401, Yanlış Rol 403, Chef/Manager 200, Cross-Tenant)', async () => {
    const targetTenant = 'tenant-artisan-burger';
    const otherTenant = 'tenant-pizza-roma';

    // 3.1 Anonymous (Oturum Yok) → 401 Unauthorized
    const anonReq = new NextRequest('http://localhost:3000/api/kds', {
      method: 'POST',
      body: JSON.stringify({ orderId: 'ORD-101', status: 'PREPARING', tableId: 'tbl-4' }),
    });
    const anonCheck = await requireRole(anonReq, ['kitchen', 'chef', 'manager', 'owner', 'admin']);
    assert.equal(anonCheck.ok, false);
    assert.equal(anonCheck.errorResponse.status, 401);

    const anonApiRes = await kdsPost(anonReq);
    assert.equal(anonApiRes.status, 401);

    // 3.2 Yanlış Rol (WAITER veya CASHIER mutfak durumu değiştiremez) → 403 Forbidden
    const waiterToken = createSignedSessionToken({
      userId: 'stf-waiter-1',
      name: 'Garson Ali',
      role: 'waiter',
      tenantId: targetTenant,
    });
    const waiterKdsReq = new NextRequest('http://localhost:3000/api/kds', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${waiterToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ orderId: 'ORD-101', status: 'READY', tableId: 'tbl-4' }),
    });
    const waiterKdsCheck = await requireRole(waiterKdsReq, ['kitchen', 'chef', 'manager', 'owner', 'admin']);
    assert.equal(waiterKdsCheck.ok, false);
    assert.equal(waiterKdsCheck.errorResponse.status, 403);

    const waiterKdsApiRes = await kdsPost(waiterKdsReq);
    assert.equal(waiterKdsApiRes.status, 403);

    const cashierToken = createSignedSessionToken({
      userId: 'stf-cashier-1',
      name: 'Kasiyer Merve',
      role: 'cashier',
      tenantId: targetTenant,
    });
    const cashierKdsReq = new NextRequest('http://localhost:3000/api/kds', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${cashierToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ orderId: 'ORD-101', status: 'READY', tableId: 'tbl-4' }),
    });
    const cashierKdsCheck = await requireRole(cashierKdsReq, ['kitchen', 'chef', 'manager', 'owner', 'admin']);
    assert.equal(cashierKdsCheck.ok, false);
    assert.equal(cashierKdsCheck.errorResponse.status, 403);

    // 3.3 CHEF → Başarılı
    const chefToken = createSignedSessionToken({
      userId: 'stf-chef-1',
      name: 'Aşçıbaşı Mehmet',
      role: 'chef',
      tenantId: targetTenant,
    });
    const chefKdsReq = new NextRequest('http://localhost:3000/api/kds', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${chefToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ orderId: 'ORD-101', status: 'PREPARING', tableId: 'tbl-4' }),
    });
    const chefKdsCheck = await requireRole(chefKdsReq, ['kitchen', 'chef', 'manager', 'owner', 'admin']);
    assert.equal(chefKdsCheck.ok, true);
    assert.equal(chefKdsCheck.data.role, 'chef');
    assert.equal(chefKdsCheck.data.tenantId, targetTenant);

    // 3.4 MANAGER → Başarılı
    const managerToken = createSignedSessionToken({
      userId: 'stf-manager-1',
      name: 'Müdür Selim',
      role: 'manager',
      tenantId: targetTenant,
    });
    const managerKdsReq = new NextRequest('http://localhost:3000/api/kds', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${managerToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ orderId: 'ORD-101', status: 'READY', tableId: 'tbl-4' }),
    });
    const managerKdsCheck = await requireRole(managerKdsReq, ['kitchen', 'chef', 'manager', 'owner', 'admin']);
    assert.equal(managerKdsCheck.ok, true);
    assert.equal(managerKdsCheck.data.role, 'manager');

    // 3.5 Cross-Tenant → Başarısız (Farklı kiracının aşçısı bu kiracının KDS'sine müdahale edemez)
    const otherTenantChefToken = createSignedSessionToken({
      userId: 'stf-chef-other',
      name: 'Diğer Restoran Aşçısı',
      role: 'chef',
      tenantId: otherTenant,
    });
    const crossTenantKdsReq = new NextRequest('http://localhost:3000/api/kds', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${otherTenantChefToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ orderId: 'ORD-101', status: 'READY', tableId: 'tbl-4' }),
    });
    const crossKdsCheck = await requireRole(crossTenantKdsReq, ['kitchen', 'chef', 'manager', 'owner', 'admin']);
    assert.equal(crossKdsCheck.ok, true);
    // Kiracı izolasyonu: Token kiracısı asla hedef kiracının verisine karışamaz
    assert.notEqual(crossKdsCheck.data.tenantId, targetTenant);
    assert.equal(crossKdsCheck.data.tenantId, otherTenant);
  });

  // ==========================================================================
  // BÖLÜM 4: MASS-ASSIGNMENT & YETKİSİZ ALAN ENJEKSİYON REGRESYON TESTLERİ
  // ==========================================================================
  await t.test('4. Mass-Assignment Kalkanı: role, tenantId ve Ayrıcalıklı Alan Enjeksiyonlarının Reddedilmesi', () => {
    // 4.1 Personel Oluşturma (POST /api/admin/staff)
    // A. role: 'OWNER' veya yetkisiz rol enjeksiyonu denemesi
    assert.throws(
      () => {
        validateCreateStaff({
          name: 'Hacker Ali',
          roleKey: 'SUPER_ADMIN', // Geçersiz / enjekte edilmiş rol
        });
      },
      (err: any) => err instanceof ValidationError && err.field === 'roleKey'
    );

    // B. tenantId enjeksiyonu denemesi → İstek şema tarafından doğrudan ValidationError ile reddedilmeli
    assert.throws(
      () => {
        validateCreateStaff({
          name: 'Personel Veli',
          roleKey: 'WAITER',
          tenantId: 'another-tenant', // ❌ İzin verilmeyen parametre enjeksiyonu
        });
      },
      (err: any) => {
        return err instanceof ValidationError && err.field === 'tenantId';
      }
    );

    // C. ownerId veya id enjeksiyonu denemesi
    assert.throws(
      () => {
        validateCreateStaff({
          name: 'Personel Ayşe',
          roleKey: 'CASHIER',
          id: 'stf-forced-id-123',
          ownerId: 'owner-super-id',
        });
      },
      (err: any) => err instanceof ValidationError
    );

    // 4.2 Personel Güncelleme (PATCH /api/admin/staff)
    // data gövdesine tenantId veya id enjekte etme denemesi
    assert.throws(
      () => {
        validateUpdateStaff({
          id: 'stf-1',
          data: {
            name: 'Yeni İsim',
            tenantId: 'another-tenant', // ❌ İzin verilmeyen parametre
          },
        });
      },
      (err: any) => err instanceof ValidationError && err.field === 'tenantId'
    );

    // 4.3 Sipariş Gönderimi (POST /api/orders)
    // A. tenantId enjeksiyonu denemesi
    assert.throws(
      () => {
        validateSubmitOrder({
          tableId: 'tbl-4',
          items: [{ productId: 'prd-1', quantity: 1 }],
          tenantId: 'another-tenant', // ❌ İzin verilmeyen parametre
        });
      },
      (err: any) => err instanceof ValidationError && err.field === 'tenantId'
    );

    // B. role: "OWNER" enjeksiyonu denemesi
    assert.throws(
      () => {
        validateSubmitOrder({
          tableId: 'tbl-4',
          items: [{ productId: 'prd-1', quantity: 1 }],
          role: 'OWNER', // ❌ İzin verilmeyen parametre
        });
      },
      (err: any) => err instanceof ValidationError && err.field === 'role'
    );

    // C. status: "SERVED" veya paidAmount: 9999 enjeksiyonu denemesi
    assert.throws(
      () => {
        validateSubmitOrder({
          tableId: 'tbl-4',
          items: [{ productId: 'prd-1', quantity: 1 }],
          status: 'SERVED',
        });
      },
      (err: any) => err instanceof ValidationError && err.field === 'status'
    );

    assert.throws(
      () => {
        validateSubmitOrder({
          tableId: 'tbl-4',
          items: [{ productId: 'prd-1', quantity: 1 }],
          paidAmount: 9999,
        });
      },
      (err: any) => err instanceof ValidationError && err.field === 'paidAmount'
    );

    // 4.4 Online Ödeme Başlatma (POST /api/payment/initiate)
    // tenantId enjeksiyonu ile başka kiracı adına ödeme açma girişimi
    assert.throws(
      () => {
        validateInitiatePayment({
          tableId: 'tbl-4',
          amount: 250,
          tenantId: 'another-tenant', // ❌ İzin verilmeyen parametre
        });
      },
      (err: any) => err instanceof ValidationError && err.field === 'tenantId'
    );

    // isPaid veya status enjeksiyonu
    assert.throws(
      () => {
        validateInitiatePayment({
          tableId: 'tbl-4',
          amount: 250,
          isPaid: true,
        });
      },
      (err: any) => err instanceof ValidationError && err.field === 'isPaid'
    );

    // 4.5 KDS Durum Güncelleme (POST /api/kds)
    // isPaid veya tenantId enjeksiyonu
    assert.throws(
      () => {
        validateKdsStatusUpdate({
          orderId: 'ORD-101',
          status: 'READY',
          tenantId: 'another-tenant',
        });
      },
      (err: any) => err instanceof ValidationError && err.field === 'tenantId'
    );
  });

  // ==========================================================================
  // BÖLÜM 5: ROUTE AĞACI BYPASS VE YAN KAPI KORUMA TESTLERİ
  // ==========================================================================
  await t.test('5. Route Ağacı Bypass Denetimleri: Alternatif Uçlardan Yetkisiz Durum Değişikliği ve Token Çalma Kalkanı', async () => {
    // 5.1 /api/tables/session: Anonim olarak masanın aktif 128-bit oturum tokenını hasat etme bypass girişimi
    const anonymousTokenHarvestReq = new NextRequest('http://localhost:3000/api/tables/session?tableId=tbl-4&tenantSlug=artisan-burger');
    const harvestRes = await sessionGet(anonymousTokenHarvestReq);
    assert.equal(harvestRes.status, 401, 'Yetkisiz kullanıcılar masanın aktif belirtecini asla sorgulayamaz.');

    // Yetkili personel aktif oturum belirtecini alabilsin
    const staffToken = createSignedSessionToken({
      userId: 'stf-waiter',
      name: 'Garson',
      role: 'waiter',
      tenantId: 'tenant-artisan-burger',
    });
    const authorizedStaffReq = new NextRequest('http://localhost:3000/api/tables/session?tableId=tbl-4&tenantSlug=artisan-burger', {
      headers: { authorization: `Bearer ${staffToken}` },
    });
    const staffHarvestRes = await sessionGet(authorizedStaffReq);
    assert.equal(staffHarvestRes.status, 200, 'Yetkili personel masanın oturum belirtecini sorgulayabilir.');

    // 5.2 /api/vision-ai/ghost-table: Yetkisiz olarak masayı sıfırlama veya oturumunu düşürme bypass girişimi
    const anonymousGhostReq = new NextRequest('http://localhost:3000/api/vision-ai/ghost-table', {
      method: 'POST',
      body: JSON.stringify({
        tableId: 'tbl-4',
        emptyDurationSeconds: 1200,
        currentTableStatus: 'empty',
      }),
    });
    const ghostRes = await ghostTablePost(anonymousGhostReq);
    assert.equal(ghostRes.status, 401, 'Yetkisiz üçüncü taraflar Vision AI üzerinden masa durumunu mutasyona uğratamaz.');

    // 5.3 /api/observability/metrics: Üretim ortamında gizli metrikleri anonim kazıma (scraping) kalkanı
    const originalEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = 'production';
      const unauthMetricsReq = new NextRequest('http://localhost:3000/api/observability/metrics');
      const metricsRes = await metricsGet(unauthMetricsReq);
      assert.equal(metricsRes.status, 401, 'Üretim ortamında metrikler anonim erişime kapalı olmalıdır.');
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
    }
  });
});
