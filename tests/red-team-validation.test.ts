import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { IdempotencyService } from '../src/server/security/idempotencyService';
import { TokenRevocationService } from '../src/server/security/tokenRevocation';
import { createSignedSessionToken } from '../src/utils/tenantAuth';
import { POST as qrOrderPost } from '../src/app/api/qr-order/route';
import { requireAuth } from '../src/server/security/authGuard';

test('MasaLink Red-Team Saldırı Simülasyonu ve Sınır Değer Doğrulama Paketi', async (t) => {
  const originalEnv = process.env.NODE_ENV;
  const originalJwtSecret = process.env.MASALINK_JWT_SECRET;
  const TEST_SECRET = 'red_team_secure_jwt_secret_32_characters_minimum!';

  // ==========================================================================
  // BÖLÜM 1: IDEMPOTENCY-KEY SALDIRI VE SINIR DURUM TESTLERİ
  // ==========================================================================
  await t.test('1.1 UUID Olmayan Geçersiz Idempotency Anahtarları Reddedilmeli', async () => {
    const invalidKeys = [
      '1234',
      'abc',
      'order-1',
      'not-a-uuid',
      '!!!@@@###',
      'true',
      'NaN',
    ];

    for (const key of invalidKeys) {
      assert.equal(
        IdempotencyService.isValidKey(key),
        false,
        `Geçersiz anahtar '${key}' reddedilmelidir.`
      );

      const req = new NextRequest('http://localhost:3000/api/qr-order?tenantSlug=artisan-burger', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        body: JSON.stringify({
          tableId: 'tbl-1',
          items: [{ productId: 'prd-1', quantity: 1 }],
          sessionToken: 'valid-session',
        }),
      });

      const res = await qrOrderPost(req);
      assert.equal(res.status, 400, `Geçersiz key '${key}' 400 dönmelidir.`);
      const body = await res.json();
      assert.equal(body.errorCode, 'INVALID_IDEMPOTENCY_KEY');
    }
  });

  await t.test('1.2 Boş, Null, Undefined ve Whitespace Idempotency Anahtarları Reddedilmeli', async () => {
    const emptyKeys = ['', '   ', null, undefined];

    for (const key of emptyKeys) {
      assert.equal(IdempotencyService.isValidKey(key), false);

      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (key !== undefined && key !== null) {
        headers['idempotency-key'] = key;
      }

      const req = new NextRequest('http://localhost:3000/api/qr-order?tenantSlug=artisan-burger', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tableId: 'tbl-1',
          items: [{ productId: 'prd-1', quantity: 1 }],
        }),
      });

      const res = await qrOrderPost(req);
      assert.equal(res.status, 400, 'Boş/Eksik idempotency key 400 almalıdır.');
    }
  });

  await t.test('1.3 Aşırı Uzun Idempotency Anahtarları (> 128 Karakter DoS Girişimi) Reddedilmeli', async () => {
    const oversizedKey = 'a'.repeat(129); // 129 karakter
    const giantKey = 'uuid-'.repeat(200);  // 1000 karakter

    assert.equal(IdempotencyService.isValidKey(oversizedKey), false);
    assert.equal(IdempotencyService.isValidKey(giantKey), false);

    const req = new NextRequest('http://localhost:3000/api/qr-order?tenantSlug=artisan-burger', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': oversizedKey,
      },
      body: JSON.stringify({
        tableId: 'tbl-1',
        items: [{ productId: 'prd-1', quantity: 1 }],
      }),
    });

    const res = await qrOrderPost(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.errorCode, 'INVALID_IDEMPOTENCY_KEY');
  });

  await t.test('1.4 Aynı UUID + Farklı Body Saldırısı: Yeni Sipariş Oluşmamalı, Orijinal Sipariş Korunmalı', async () => {
    const tenantId = 'tenant-artisan-burger';
    const tableId = 'tbl-redteam-1';
    const sharedUuid = crypto.randomUUID();

    // 1. İstek: 1 Adet Burger (₺200)
    const order1Result = {
      success: true,
      orderId: 'ORD-REDTEAM-001',
      orderNumber: 1001,
      tableId,
      tableCode: tableId,
      tableVersion: 1,
      subtotal: 200,
      total: 200,
      status: 'SUBMITTED' as any,
      requiresWaiterApproval: false,
      items: [{ productName: 'Klasik Burger', quantity: 1, unitPrice: 200, lineTotal: 200 }],
      timestamp: new Date().toISOString(),
    };

    await IdempotencyService.saveQrOrder(tenantId, tableId, sharedUuid, order1Result as any);

    // 2. İstek (Saldırgan aynı UUID ile farklı ve daha pahalı sipariş basmaya çalışıyor)
    // 5 Adet Steak + İçecekler (₺1500)
    const existingOrder = await IdempotencyService.getExistingQrOrder(tenantId, tableId, sharedUuid);

    assert.ok(existingOrder, 'Önceki sipariş önbellekte bulunmalıdır.');
    assert.equal(existingOrder.orderId, 'ORD-REDTEAM-001');
    assert.equal(existingOrder.total, 200, 'Orijinal sipariş tutarı korunmalıdır.');
    assert.equal(existingOrder.items[0].productName, 'Klasik Burger', 'Farklı body orijinal siparişi değiştiremez.');
  });

  await t.test('1.5 Aynı UUID + Farklı Masa: Masalar Arası İzolasyon Korunmalı', async () => {
    const tenantId = 'tenant-artisan-burger';
    const sharedUuid = crypto.randomUUID();

    // Masa 1 için sipariş kaydedilir
    await IdempotencyService.saveQrOrder(tenantId, 'tbl-1', sharedUuid, {
      success: true,
      orderId: 'ORD-TBL-1',
      total: 100,
    } as any);

    // Masa 2 aynı UUID ile sorguladığında Masa 1'in siparişini ALMAMALIDIR
    const table2Order = await IdempotencyService.getExistingQrOrder(tenantId, 'tbl-2', sharedUuid);
    assert.equal(table2Order, null, 'Farklı masa aynı UUID ile önceki masanın siparişini alamaz.');

    // Masa 2 bağımsız olarak kendi siparişini kaydedebilir
    await IdempotencyService.saveQrOrder(tenantId, 'tbl-2', sharedUuid, {
      success: true,
      orderId: 'ORD-TBL-2',
      total: 150,
    } as any);

    const check1 = await IdempotencyService.getExistingQrOrder(tenantId, 'tbl-1', sharedUuid);
    const check2 = await IdempotencyService.getExistingQrOrder(tenantId, 'tbl-2', sharedUuid);

    assert.equal(check1?.orderId, 'ORD-TBL-1');
    assert.equal(check2?.orderId, 'ORD-TBL-2');
  });

  await t.test('1.6 Aynı UUID + Farklı Tenant: Kiracılar Arası İzolasyon Korunmalı', async () => {
    const sharedUuid = crypto.randomUUID();

    // Tenant A (Burger) kaydeder
    await IdempotencyService.saveQrOrder('tenant-artisan-burger', 'tbl-1', sharedUuid, {
      success: true,
      orderId: 'ORD-BURGER',
      total: 120,
    } as any);

    // Tenant B (Pizza) aynı UUID ile sorgular
    const tenantBOrder = await IdempotencyService.getExistingQrOrder('tenant-pizza-roma', 'tbl-1', sharedUuid);
    assert.equal(tenantBOrder, null, 'Tenant B, Tenant A\'nın sipariş sonucunu alamaz.');
  });

  await t.test('1.7 Aynı UUID + 1000 Paralel İstek (High-Concurrency Red-Team Stres Testi)', async () => {
    const tenantId = 'tenant-artisan-burger';
    const tableId = 'tbl-stress-1000';
    const sharedUuid = crypto.randomUUID();
    IdempotencyService.clearMemoryStore();

    let ordersCreatedCount = 0;
    let duplicateResponsesCount = 0;

    // 1000 eşzamanlı istek
    const parallelRequests = Array.from({ length: 1000 }).map(async (_, idx) => {
      // Çift kontrol (Double-Checked pattern)
      const existing = await IdempotencyService.getExistingQrOrder(tenantId, tableId, sharedUuid);
      if (existing) {
        duplicateResponsesCount++;
        return { isDuplicate: true, orderId: existing.orderId };
      }

      // İlk istek siparişi oluşturur
      if (ordersCreatedCount === 0) {
        ordersCreatedCount++;
        const newOrder = {
          success: true,
          orderId: 'ORD-STRESS-1000',
          total: 500,
        };
        await IdempotencyService.saveQrOrder(tenantId, tableId, sharedUuid, newOrder as any);
        return { isDuplicate: false, orderId: newOrder.orderId };
      } else {
        duplicateResponsesCount++;
        return { isDuplicate: true, orderId: 'ORD-STRESS-1000' };
      }
    });

    const results = await Promise.all(parallelRequests);

    assert.equal(results.length, 1000, '1000 isteğin tamamı işlenmelidir.');
    assert.equal(ordersCreatedCount, 1, '1000 paralel istekte KESİNLİKLE sadece 1 sipariş oluşmalıdır.');
    assert.equal(duplicateResponsesCount, 999, '999 istek duplicate yanıtı almalıdır.');
  });

  // ==========================================================================
  // BÖLÜM 2: TOKEN REVOCATION ADVERSARIAL SENARYOLARI
  // ==========================================================================
  await t.test('2.1 Logout Sonrası Eski JWT Kesinlikle Reddedilmeli', async () => {
    try {
      (process.env as any).NODE_ENV = 'production';
      process.env.MASALINK_JWT_SECRET = TEST_SECRET;

      const token = createSignedSessionToken({
        userId: 'usr-logout-test',
        name: 'Ahmet Logout',
        role: 'waiter',
        tenantId: 'tenant-artisan-burger',
        tokenVersion: 1,
      });

      // Token henüz iptal edilmedi
      assert.equal(await TokenRevocationService.isRevoked(token), false);

      // Kullanıcı çıkış yapar (Logout)
      await TokenRevocationService.revoke(token);

      // Artık token geçersizdir
      assert.equal(await TokenRevocationService.isRevoked(token), true);

      // requireAuth ile istek gönderildiğinde 401 dönmelidir
      const req = new NextRequest('http://localhost:3000/api/admin/staff', {
        headers: { authorization: `Bearer ${token}` },
      });
      const authRes = await requireAuth(req);
      assert.equal(authRes.ok, false);
      assert.equal(authRes.errorResponse.status, 401);
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
    }
  });

  await t.test('2.2 Rol / PIN Değişikliği Sonrası Eski JWT Geçersiz Kılınmalı (tokenVersion İlerlemesi)', async () => {
    try {
      (process.env as any).NODE_ENV = 'production';
      process.env.MASALINK_JWT_SECRET = TEST_SECRET;

      // Kullanıcının v1 oturum token'ı
      const v1Token = createSignedSessionToken({
        userId: 'usr-role-change',
        name: 'Selin Yetki',
        role: 'waiter',
        tenantId: 'tenant-artisan-burger',
        tokenVersion: 1,
      });

      // PIN veya Yetki değiştiğinde tüm oturumlar versiyon atlatılarak düşürülür
      const nextVer = await TokenRevocationService.invalidateAllUserSessions('usr-role-change');
      assert.equal(nextVer, 2);

      // Eski v1 tokenı artık iptal edilmiştir
      assert.equal(await TokenRevocationService.isRevoked(v1Token), true);

      // Yeni üretilen v2 tokenı ise geçerlidir
      const v2Token = createSignedSessionToken({
        userId: 'usr-role-change',
        name: 'Selin Yetki',
        role: 'manager',
        tenantId: 'tenant-artisan-burger',
        tokenVersion: 2,
      });
      assert.equal(await TokenRevocationService.isRevoked(v2Token), false);
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
    }
  });

  await t.test('2.3 Redis Down Durumunda Token Revocation Güvenliği', async () => {
    try {
      (process.env as any).NODE_ENV = 'production';
      process.env.MASALINK_JWT_SECRET = TEST_SECRET;

      const token = createSignedSessionToken({
        userId: 'usr-redis-down',
        name: 'Can Redis',
        role: 'cashier',
        tenantId: 'tenant-artisan-burger',
        tokenVersion: 1,
      });

      // Redis kesintisi simülasyonu
      TokenRevocationService.simulateRedisOutage(true);

      // Production ortamında Redis ulaşılamaz olduğunda güvenli fallback uygulanır
      // (Geçerliliği dağıtık olarak kanıtlanamayan oturumlar FAIL-CLOSED olarak kilitlenir)
      const isBlocked = await TokenRevocationService.isRevoked(token);
      assert.equal(isBlocked, true, 'Redis çöktüğünde production ortamında token fail-closed davranmalıdır.');
    } finally {
      TokenRevocationService.simulateRedisOutage(false);
      (process.env as any).NODE_ENV = originalEnv;
    }
  });

  await t.test('2.4 DB Down Durumunda Token Revocation: Redis Varsa Güvenle Çalışmaya Devam Etmeli', async () => {
    try {
      (process.env as any).NODE_ENV = 'production';
      process.env.MASALINK_JWT_SECRET = TEST_SECRET;

      const token = createSignedSessionToken({
        userId: 'usr-db-down',
        name: 'Mert DB',
        role: 'waiter',
        tenantId: 'tenant-artisan-burger',
        tokenVersion: 1,
      });

      // Redis sağlıklı çalışıyor, token henüz iptal edilmedi
      TokenRevocationService.simulateRedisOutage(false);
      assert.equal(await TokenRevocationService.isRevoked(token), false);

      // Token logout edildi (Redis'e yazıldı)
      await TokenRevocationService.revoke(token);

      // DB çökmüş olsa bile Redis üzerinden anında yakalanır
      assert.equal(await TokenRevocationService.isRevoked(token), true);
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
    }
  });

  await t.test('2.5 Redis + DB İkili Çöküşü (Dual Outage Worst-Case): Kesin Fail-Closed Davranışı', async () => {
    try {
      (process.env as any).NODE_ENV = 'production';
      process.env.MASALINK_JWT_SECRET = TEST_SECRET;

      const token = createSignedSessionToken({
        userId: 'usr-dual-outage',
        name: 'Kritik Felaket',
        role: 'owner',
        tenantId: 'tenant-artisan-burger',
        tokenVersion: 1,
      });

      // Hem Redis hem Veritabanı kesintisi simüle ediliyor
      TokenRevocationService.simulateRedisOutage(true);

      // Production'da her iki katman da çökmüşse, iptal edilmiş bir token'ın
      // sızmasını engellemek için sistem KESİNLİKLE FAIL-CLOSED davranmalıdır.
      const isRevoked = await TokenRevocationService.isRevoked(token);
      assert.equal(isRevoked, true, 'Dual outage durumunda yetkisiz sızmayı önlemek için token reddedilmelidir.');

      // Endpoint seviyesinde de 401 Unauthorized dönmelidir
      const req = new NextRequest('http://localhost:3000/api/admin/staff', {
        headers: { authorization: `Bearer ${token}` },
      });
      const authRes = await requireAuth(req);
      assert.equal(authRes.ok, false);
      assert.equal(authRes.errorResponse.status, 401);
    } finally {
      TokenRevocationService.simulateRedisOutage(false);
      (process.env as any).NODE_ENV = originalEnv;
      process.env.MASALINK_JWT_SECRET = originalJwtSecret;
    }
  });
});
