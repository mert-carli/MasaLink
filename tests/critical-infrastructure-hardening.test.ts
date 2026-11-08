import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { OrderService, OrderDomainError } from '../src/server/services/orderService';
import { PaymentService, PaymentDomainError } from '../src/server/payment/paymentService';
import { verifyManagerPin, verifyManagerPinAsync } from '../src/utils/managerAuth';
import { TableTransferService, TableTransferError } from '../src/server/services/tableTransferService';
import { POST as tablePaymentPost } from '../src/app/api/tables/payment/route';
import { GET as healthGet } from '../src/app/api/health/route';
import { POST as tableTransferPost } from '../src/app/api/tables/transfer/route';
import { createSignedSessionToken } from '../src/utils/tenantAuth';

const TEST_SECRET = 'a_very_secure_test_secret_32_characters_long_min!';

test('MasaLink Kritik Altyapı, Güvenlik ve Eşzamanlılık Sertleştirme Denetimi', async (t) => {
  const originalEnv = process.env.NODE_ENV;
  const originalDbUrl = process.env.DATABASE_URL;
  const originalJwtSecret = process.env.MASALINK_JWT_SECRET;

  process.env.MASALINK_JWT_SECRET = TEST_SECRET;

  // ==========================================================================
  // BÖLÜM 1: ÜRETİM ORTAMINDA VERİTABANI ZORUNLULUĞU (FAIL-CLOSED)
  // ==========================================================================
  await t.test('1.1 OrderService: Üretim ortamında DB yokken siparişi RAM\'e yazmamalı, fail-closed fırlatmalı', async () => {
    try {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.DATABASE_URL;

      await assert.rejects(
        async () => {
          await OrderService.submitOrder({
            tenantId: 'artisan-burger',
            tableId: 'tbl-1',
            source: 'QR',
            items: [{ productCode: 'b1', name: 'Artisan Burger', quantity: 1 }],
          });
        },
        (err: any) => {
          assert.equal(err instanceof OrderDomainError, true);
          assert.equal(err.code, 'DATABASE_REQUIRED');
          assert.match(err.message, /üretim ortamında veritabanı bağlantısı zorunludur/i);
          return true;
        }
      );
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
      if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
    }
  });

  await t.test('1.2 PaymentService: Üretim ortamında DB yokken ödemeyi RAM\'e yazmamalı, fail-closed fırlatmalı', async () => {
    try {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.DATABASE_URL;

      await assert.rejects(
        async () => {
          await PaymentService.finalizeSettlement({
            merchantOrderId: 'ord_test_123',
            providerTransactionId: 'paytr_123',
            provider: 'PAYTR',
            paidAmount: 150,
          });
        },
        (err: any) => {
          assert.equal(err instanceof PaymentDomainError, true);
          assert.equal(err.code, 'DATABASE_REQUIRED');
          assert.match(err.message, /üretim ortamında veritabanı bağlantısı zorunludur/i);
          return true;
        }
      );
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
      if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
    }
  });

  await t.test('1.3 POST /api/tables/payment: Üretim ortamında DB yokken 503 Service Unavailable dönmeli', async () => {
    try {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.DATABASE_URL;

      const token = createSignedSessionToken({
        tenantId: 'artisan-burger',
        userId: 'usr_cashier_1',
        name: 'Kasa Personeli',
        role: 'cashier',
      });

      const req = new NextRequest('http://localhost:3000/api/tables/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tableId: 'tbl-1',
          totalAmount: 100,
          paymentAmount: 100,
          paymentMethod: 'Nakit',
        }),
      });

      const res = await tablePaymentPost(req);
      assert.equal(res.status, 503);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.match(json.error, /üretim ortamında veritabanı bağlantısı zorunludur/i);
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
      if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
    }
  });

  await t.test('1.4 GET /api/health: Üretim ortamında DB bağlantısı yoksa degraded (503) dönmeli', async () => {
    try {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.DATABASE_URL;

      const req = new NextRequest('http://localhost:3000/api/health', { method: 'GET' });
      const res = await healthGet(req);
      assert.equal(res.status, 503);
      const json = await res.json();
      assert.equal(json.status, 'degraded');
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
      if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
    }
  });

  // ==========================================================================
  // BÖLÜM 2: YÖNETİCİ & PERSONEL KİMLİK DOĞRULAMA SERTLEŞTİRMESİ
  // ==========================================================================
  await t.test('2.1 verifyManagerPin: Üretim ortamında hardcoded demo PIN\'ler (9999, 8765, 1122) kesinlikle reddedilmeli', () => {
    try {
      (process.env as any).NODE_ENV = 'production';

      assert.equal(verifyManagerPin('9999').valid, false, "Production'da 9999 kabul edilemez");
      assert.equal(verifyManagerPin('8765').valid, false, "Production'da 8765 kabul edilemez");
      assert.equal(verifyManagerPin('1122').valid, false, "Production'da 1122 kabul edilemez");
      assert.equal(verifyManagerPin('0000').valid, false, "Production'da 0000 kabul edilemez");
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
    }
  });

  await t.test('2.2 verifyManagerPinAsync: Üretim ortamında veritabanı kaydı olmadan demo PIN onaylanamaz', async () => {
    try {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.DATABASE_URL;

      const result = await verifyManagerPinAsync('9999', 'artisan-burger');
      assert.equal(result.valid, false, 'Production ortamında DB yokken manager PIN asla doğrulanmamalı');
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
      if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
    }
  });

  // ==========================================================================
  // BÖLÜM 3: MASA TAŞIMA, BİRLEŞTİRME VE EŞZAMANLILIK KORUMASI
  // ==========================================================================
  await t.test('3.1 TableTransferService: Bir masa kendisine aktarılamaz veya birleştirilemez', async () => {
    await assert.rejects(
      async () => {
        await TableTransferService.executeTransfer({
          tenantId: 'artisan-burger',
          sourceTableId: 'tbl-1',
          targetTableId: 'tbl-1',
          mode: 'transfer',
        });
      },
      (err: any) => {
        assert.equal(err instanceof TableTransferError, true);
        assert.equal(err.code, 'SAME_TABLE_ERROR');
        return true;
      }
    );
  });

  await t.test('3.2 TableTransferService: Üretim ortamında DB yokken masa transferi fail-closed olmalı', async () => {
    try {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.DATABASE_URL;

      await assert.rejects(
        async () => {
          await TableTransferService.executeTransfer({
            tenantId: 'artisan-burger',
            sourceTableId: 'tbl-1',
            targetTableId: 'tbl-2',
            mode: 'transfer',
          });
        },
        (err: any) => {
          assert.equal(err instanceof TableTransferError, true);
          assert.equal(err.code, 'DATABASE_REQUIRED');
          return true;
        }
      );
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
      if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
    }
  });

  await t.test('3.3 POST /api/tables/transfer: Yetkisiz istekler (401) ve yetersiz roller (403) engellenmeli', async () => {
    // 1. Token yok -> 401
    const unauthReq = new NextRequest('http://localhost:3000/api/tables/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceTableId: 'tbl-1',
        targetTableId: 'tbl-2',
        mode: 'transfer',
      }),
    });
    const unauthRes = await tableTransferPost(unauthReq);
    assert.equal(unauthRes.status, 401);

    // 2. Misafir rolü (guest) -> 403
    const guestToken = createSignedSessionToken({
      tenantId: 'artisan-burger',
      userId: 'usr_guest_9',
      name: 'Misafir',
      role: 'guest',
    });
    const forbiddenReq = new NextRequest('http://localhost:3000/api/tables/transfer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${guestToken}`,
      },
      body: JSON.stringify({
        sourceTableId: 'tbl-1',
        targetTableId: 'tbl-2',
        mode: 'transfer',
      }),
    });
    const forbiddenRes = await tableTransferPost(forbiddenReq);
    assert.equal(forbiddenRes.status, 403);
  });

  await t.test('3.4 POST /api/tables/transfer: Geçerli garson yetkisiyle aktarım başarıyla çalışmalı', async () => {
    const waiterToken = createSignedSessionToken({
      tenantId: 'artisan-burger',
      userId: 'usr_waiter_1',
      name: 'Ahmet Garson',
      role: 'waiter',
    });

    const validReq = new NextRequest('http://localhost:3000/api/tables/transfer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${waiterToken}`,
      },
      body: JSON.stringify({
        sourceTableId: 'tbl-1',
        targetTableId: 'tbl-2',
        mode: 'transfer',
        waiterName: 'Ahmet Garson',
      }),
    });

    const res = await tableTransferPost(validReq);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.mode, 'transfer');
  });

  // Restore env
  process.env.MASALINK_JWT_SECRET = originalJwtSecret;
});
