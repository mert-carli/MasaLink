import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { RateLimitEngine, RATE_LIMIT_POLICIES } from '../src/server/security/rateLimitEngine';
import { createSignedSessionToken } from '../src/utils/tenantAuth';

test('MasaLink Çok Boyutlu Hız Sınırı (Multi-Dimensional Rate Limiting) Test Paketi', async (t) => {
  // ==========================================================================
  // 1. /api/auth/login: IP BAZLI SIKI BRUTE-FORCE KOTASI
  // ==========================================================================
  await t.test('1. /api/auth/login: IP Başına Sıkı Limit (Maksimum 10 İstek / Dakika)', async () => {
    const testIp = `198.51.100.${Math.floor(Math.random() * 200) + 10}`;
    const policy = RATE_LIMIT_POLICIES.AUTH_LOGIN;

    // İlk 10 istek kabul edilmeli
    for (let i = 0; i < policy.maxRequests; i++) {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'x-forwarded-for': testIp },
      });
      const check = await RateLimitEngine.evaluate(req);
      assert.equal(check.allowed, true, `${i + 1}. login isteği kabul edilmeli`);
    }

    // 11. istek kesinlikle HTTP 429 ile engellenmeli
    const reqBlocked = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'x-forwarded-for': testIp },
    });
    const checkBlocked = await RateLimitEngine.evaluate(reqBlocked);
    assert.equal(checkBlocked.allowed, false, '11. istek 429 almalıdır');
    assert.equal(checkBlocked.dimension, 'IP');
    assert.equal(checkBlocked.response?.status, 429);
    assert.equal(checkBlocked.response?.headers.get('ratelimit-limit'), String(policy.maxRequests));
  });

  // ==========================================================================
  // 2. /api/auth/verify-pin: IP + TENANT BAZLI KOTASI
  // ==========================================================================
  await t.test('2. /api/auth/verify-pin: IP + Tenant Kombinasyon Kalkanı', async () => {
    const testIp = `203.0.113.${Math.floor(Math.random() * 200) + 10}`;
    const tenantId = `tenant-test-${Date.now()}`;
    const policy = RATE_LIMIT_POLICIES.AUTH_PIN;

    for (let i = 0; i < policy.maxRequests; i++) {
      const req = new NextRequest('http://localhost:3000/api/auth/verify-pin', {
        method: 'POST',
        headers: {
          'x-forwarded-for': testIp,
          'x-tenant-id': tenantId,
        },
      });
      const check = await RateLimitEngine.evaluate(req);
      assert.equal(check.allowed, true);
    }

    const reqBlocked = new NextRequest('http://localhost:3000/api/auth/verify-pin', {
      method: 'POST',
      headers: {
        'x-forwarded-for': testIp,
        'x-tenant-id': tenantId,
      },
    });
    const checkBlocked = await RateLimitEngine.evaluate(reqBlocked);
    assert.equal(checkBlocked.allowed, false);
    assert.equal(checkBlocked.dimension, 'IP_TENANT');
  });

  // ==========================================================================
  // 3. /api/qr-order: MASA FLOOD KALKANI (FINGERPRINT SPOOFING BYPASS ENGELİ)
  // ==========================================================================
  await t.test('3. /api/qr-order: Parmak İzi Değiştirilse Bile Masa Bazlı Kota 429 Üretmeli', async () => {
    const tableId = `tbl-flood-${Date.now()}`;
    const tenantId = 'tenant-artisan-burger';
    const policy = RATE_LIMIT_POLICIES.QR_ORDER_TABLE; // 15 İstek / dk

    // Saldırgan her istekte farklı bir clientFingerprint ve IP simüle ediyor
    for (let i = 0; i < policy.maxRequests; i++) {
      const fakeIp = `192.0.2.${i + 1}`;
      const req = new NextRequest('http://localhost:3000/api/qr-order', {
        method: 'POST',
        headers: {
          'x-forwarded-for': fakeIp,
          'x-tenant-id': tenantId,
        },
      });
      const check = await RateLimitEngine.evaluate(req, { tableId, tenantId });
      assert.equal(check.allowed, true, `Masa için ${i + 1}. istek onaylanmalı`);
    }

    // 16. istekte saldırgan yine yepyeni bir IP ve fingerprint kullansa bile masa kotası aşılmıştır!
    const attackerReq = new NextRequest('http://localhost:3000/api/qr-order', {
      method: 'POST',
      headers: {
        'x-forwarded-for': '198.18.0.99',
        'x-tenant-id': tenantId,
      },
    });
    const checkBlocked = await RateLimitEngine.evaluate(attackerReq, { tableId, tenantId });
    assert.equal(checkBlocked.allowed, false, 'Parmak izi değiştirilse dahi masa kotası kilitlenmelidir');
    assert.equal(checkBlocked.dimension, 'TABLE_FLOOD_GUARD');
    assert.equal(checkBlocked.response?.status, 429);
  });

  // ==========================================================================
  // 4. /api/orders (POS / WAITER): YOĞUN RESTORAN OPERASYONU İÇİN ESNEK LİMİT
  // ==========================================================================
  await t.test('4. /api/orders: Garson / Kasa Operasyonu Yüksek Kotaya Sahip Olmalı (120 req/dk)', async () => {
    const waiterToken = createSignedSessionToken({
      userId: `usr-waiter-rush-${Date.now()}`,
      name: 'Garson Ahmet',
      role: 'waiter',
      tenantId: 'tenant-artisan-burger',
    });

    const req = new NextRequest('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${waiterToken}`,
        'x-tenant-id': 'tenant-artisan-burger',
      },
    });

    // Garson yoğun saatte arka arkaya 50 sipariş girse bile takılmamalı
    for (let i = 0; i < 50; i++) {
      const check = await RateLimitEngine.evaluate(req);
      assert.equal(check.allowed, true, `Garson siparişi ${i + 1} hız sınırına takılmamalı`);
    }
  });

  // ==========================================================================
  // 5. /api/kds: MUTFAK OPERASYONU LİMİTİ (180 req/dk)
  // ==========================================================================
  await t.test('5. /api/kds: Mutfak Terminali Yüksek Akışlı İstasyon Kotası (180 req/dk)', async () => {
    const chefToken = createSignedSessionToken({
      userId: `usr-chef-rush-${Date.now()}`,
      name: 'Şef Sinan',
      role: 'chef',
      tenantId: 'tenant-artisan-burger',
    });

    const req = new NextRequest('http://localhost:3000/api/kds', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${chefToken}`,
        'x-tenant-id': 'tenant-artisan-burger',
      },
    });

    // Şef istasyonda 60 siparişi seri biçimde 'HAZIR' yapsa bile operasyon aksamamalı
    for (let i = 0; i < 60; i++) {
      const check = await RateLimitEngine.evaluate(req);
      assert.equal(check.allowed, true, `KDS mutasyonu ${i + 1} hız sınırına takılmamalı`);
    }
  });

  // ==========================================================================
  // 6. /api/payment/initiate: MASA VE IP BAZLI BURST KORUMASI (15 req/dk)
  // ==========================================================================
  await t.test('6. /api/payment/initiate: Masadan Seri Ödeme Başlatma Koruması', async () => {
    const tableId = `tbl-pay-${Date.now()}`;
    const tenantId = 'tenant-artisan-burger';
    const policy = RATE_LIMIT_POLICIES.PAYMENT_INITIATE;

    for (let i = 0; i < policy.maxRequests; i++) {
      const req = new NextRequest('http://localhost:3000/api/payment/initiate', {
        method: 'POST',
        headers: { 'x-tenant-id': tenantId },
      });
      const check = await RateLimitEngine.evaluate(req, { tableId, tenantId });
      assert.equal(check.allowed, true);
    }

    const reqBlocked = new NextRequest('http://localhost:3000/api/payment/initiate', {
      method: 'POST',
      headers: { 'x-tenant-id': tenantId },
    });
    const checkBlocked = await RateLimitEngine.evaluate(reqBlocked, { tableId, tenantId });
    assert.equal(checkBlocked.allowed, false);
    assert.equal(checkBlocked.dimension, 'PAYMENT_BURST_GUARD');
    assert.equal(checkBlocked.response?.status, 429);
  });

  // ==========================================================================
  // 7. /api/admin/*: YÖNETİM PANELİ KULLANICI KOTASI (60 req/dk)
  // ==========================================================================
  await t.test('7. /api/admin/*: Yönetici Kullanıcı Bazlı Kota (60 req/dk)', async () => {
    const adminToken = createSignedSessionToken({
      userId: `usr-admin-burst-${Date.now()}`,
      name: 'Yönetici Zeynep',
      role: 'owner',
      tenantId: 'tenant-artisan-burger',
    });

    const req = new NextRequest('http://localhost:3000/api/admin/menu', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'x-tenant-id': 'tenant-artisan-burger',
      },
    });

    // 60 istek izinli
    for (let i = 0; i < 60; i++) {
      const check = await RateLimitEngine.evaluate(req);
      assert.equal(check.allowed, true);
    }

    // 61. istek kilitlenir
    const checkBlocked = await RateLimitEngine.evaluate(req);
    assert.equal(checkBlocked.allowed, false);
    assert.equal(checkBlocked.dimension, 'ADMIN_RATE_LIMIT');
    assert.equal(checkBlocked.response?.status, 429);
  });
});
