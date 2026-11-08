import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { POST as qrOrderPost } from '../src/app/api/qr-order/route';
import { getActiveTableToken } from '../src/utils/tableSessionRegistry';
import { IdempotencyService } from '../src/server/security/idempotencyService';

function createQrRequest(params: {
  tenantSlug: string;
  tableId: string;
  idempotencyKey?: string;
  fingerprint?: string;
  items?: any[];
}) {
  const token = getActiveTableToken(params.tenantSlug, params.tableId);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-tenant-id': `tenant-${params.tenantSlug}`,
  };

  if (params.idempotencyKey) {
    headers['idempotency-key'] = params.idempotencyKey;
  }

  return new NextRequest(
    `http://localhost:3000/api/qr-order?tenantSlug=${params.tenantSlug}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tableId: params.tableId,
        sessionToken: token,
        clientFingerprint: params.fingerprint || `fp_device_${crypto.randomUUID()}`,
        items: params.items || [{ productId: 'b1', quantity: 1 }],
      }),
    }
  );
}

test('MasaLink QR Sipariş Replay & Zorunlu Idempotency Test Paketi', async (t) => {
  await t.test('1. Eksik veya Geçersiz Idempotency-Key Kesin Olarak Reddedilmeli (HTTP 400)', async () => {
    // A. Hiç key yok
    const reqNoKey = createQrRequest({
      tenantSlug: 'artisan-burger',
      tableId: 'tbl-4',
    });
    const resNoKey = await qrOrderPost(reqNoKey);
    assert.equal(resNoKey.status, 400);
    const bodyNoKey = await resNoKey.json();
    assert.equal(bodyNoKey.errorCode, 'INVALID_IDEMPOTENCY_KEY');

    // B. Çok kısa / geçersiz key
    const reqShortKey = createQrRequest({
      tenantSlug: 'artisan-burger',
      tableId: 'tbl-4',
      idempotencyKey: 'short',
    });
    const resShortKey = await qrOrderPost(reqShortKey);
    assert.equal(resShortKey.status, 400);
  });

  await t.test('2. Aynı Idempotency-Key × 10 Ardışık İstek Testi', async () => {
    const key = crypto.randomUUID();
    const orderIds = new Set<string>();

    for (let i = 0; i < 10; i++) {
      const req = createQrRequest({
        tenantSlug: 'artisan-burger',
        tableId: 'tbl-4',
        idempotencyKey: key,
      });
      const res = await qrOrderPost(req);
      assert.equal(res.status, 200);
      const data = await res.json();
      orderIds.add(data.orderId);
      if (i > 0) {
        assert.equal(data.isIdempotentReplay, true);
      }
    }

    console.log(`[Test 2: Aynı Key x 10] Gönderilen: 10 İstek | Gerçekte Oluşan Sipariş: ${orderIds.size}`);
    assert.equal(orderIds.size, 1, '10 ardışık istekte yalnızca 1 sipariş oluşmalıdır.');
  });

  await t.test('3. Aynı Idempotency-Key × 100 Paralel İstek Testi (Race Condition & Concurrency)', async () => {
    const key = crypto.randomUUID();
    const promises: Promise<Response>[] = [];

    for (let i = 0; i < 100; i++) {
      const req = createQrRequest({
        tenantSlug: 'artisan-burger',
        tableId: 'tbl-4',
        idempotencyKey: key,
        fingerprint: `fp_worker_${i}`,
      });
      promises.push(qrOrderPost(req));
    }

    const responses = await Promise.all(promises);
    const orderIds = new Set<string>();

    for (const res of responses) {
      assert.equal(res.status, 200);
      const data = await res.json();
      orderIds.add(data.orderId);
    }

    console.log(`[Test 3: Aynı Key x 100 Paralel] Gönderilen: 100 Paralel İstek | Gerçekte Oluşan Sipariş: ${orderIds.size}`);
    assert.equal(orderIds.size, 1, '100 eşzamanlı istekte de atomik kilit altında tam 1 sipariş oluşmalıdır.');
  });

  await t.test('4. Farklı Fingerprint + Aynı Idempotency-Key (Fingerprint Spoofing Kalkanı)', async () => {
    const key = crypto.randomUUID();
    const orderIds = new Set<string>();

    for (let i = 0; i < 15; i++) {
      const req = createQrRequest({
        tenantSlug: 'artisan-burger',
        tableId: 'tbl-4',
        idempotencyKey: key,
        fingerprint: `spoofed_fingerprint_hash_${i}_${Math.random()}`,
      });
      const res = await qrOrderPost(req);
      assert.equal(res.status, 200);
      const data = await res.json();
      orderIds.add(data.orderId);
    }

    console.log(`[Test 4: Farklı Fingerprint + Aynı Key] Gönderilen: 15 İstek | Gerçekte Oluşan Sipariş: ${orderIds.size}`);
    assert.equal(orderIds.size, 1, 'Parmak izi değiştirilse bile aynı anahtar yeni sipariş oluşturmamalıdır.');
  });

  await t.test('5. Farklı Pod Simülasyonu + Aynı Idempotency-Key (Bellek Ayrışması Testi)', async () => {
    const key = crypto.randomUUID();

    // Pod 1 üzerinde ilk sipariş
    const reqPod1 = createQrRequest({
      tenantSlug: 'artisan-burger',
      tableId: 'tbl-4',
      idempotencyKey: key,
    });
    const resPod1 = await qrOrderPost(reqPod1);
    assert.equal(resPod1.status, 200);
    const dataPod1 = await resPod1.json();

    // Pod 2 Simülasyonu: Yerel bellek tamamen sıfırlanıyor (yeni bir pod ayağa kalktı)
    IdempotencyService.clearMemoryStore();

    // Pod 2 aynı isteği karşılar (Redis / kalıcı katmandan okur)
    const reqPod2 = createQrRequest({
      tenantSlug: 'artisan-burger',
      tableId: 'tbl-4',
      idempotencyKey: key,
    });
    const resPod2 = await qrOrderPost(reqPod2);
    assert.equal(resPod2.status, 200);
    const dataPod2 = await resPod2.json();

    console.log(`[Test 5: Farklı Pod Simülasyonu] Pod 1 Sipariş ID: ${dataPod1.orderId} | Pod 2 Sipariş ID: ${dataPod2.orderId}`);
    assert.equal(dataPod1.orderId, dataPod2.orderId, 'Farklı podlar aynı sipariş ID sonucunu dönmelidir.');
  });

  await t.test('6. Farklı Tenant + Aynı Idempotency-Key İzolasyonu', async () => {
    const key = crypto.randomUUID();

    // Tenant 1 (Artisan Burger)
    const reqTenant1 = createQrRequest({
      tenantSlug: 'artisan-burger',
      tableId: 'tbl-4',
      idempotencyKey: key,
    });
    const resTenant1 = await qrOrderPost(reqTenant1);
    assert.equal(resTenant1.status, 200);
    const dataTenant1 = await resTenant1.json();

    // Tenant 2 (Gourmet Pizza) — Farklı tenant aynı UUID kullansa bile kendi siparişini oluşturabilmeli
    const reqTenant2 = createQrRequest({
      tenantSlug: 'gourmet-pizza',
      tableId: 'tbl-1',
      idempotencyKey: key,
    });
    const resTenant2 = await qrOrderPost(reqTenant2);
    assert.equal(resTenant2.status, 200);
    const dataTenant2 = await resTenant2.json();

    console.log(`[Test 6: Farklı Tenant] Tenant 1 Sipariş ID: ${dataTenant1.orderId} | Tenant 2 Sipariş ID: ${dataTenant2.orderId}`);
    assert.notEqual(dataTenant1.orderId, dataTenant2.orderId, 'Farklı kiracılar aynı UUID ile bağımsız sipariş oluşturabilmelidir.');
  });

  await t.test('7. Farklı Masa + Aynı Idempotency-Key İzolasyonu (Aynı Kiracı İçinde)', async () => {
    const key = crypto.randomUUID();

    // Masa 4
    const reqTable4 = createQrRequest({
      tenantSlug: 'artisan-burger',
      tableId: 'tbl-4',
      idempotencyKey: key,
    });
    const resTable4 = await qrOrderPost(reqTable4);
    assert.equal(resTable4.status, 200);
    const dataTable4 = await resTable4.json();

    // Masa 2 (Aynı anahtarla başka masa)
    const reqTable2 = createQrRequest({
      tenantSlug: 'artisan-burger',
      tableId: 'tbl-2',
      idempotencyKey: key,
    });
    const resTable2 = await qrOrderPost(reqTable2);
    assert.equal(resTable2.status, 200);
    const dataTable2 = await resTable2.json();

    console.log(`[Test 7: Farklı Masa] Masa 4 Sipariş ID: ${dataTable4.orderId} | Masa 2 Sipariş ID: ${dataTable2.orderId}`);
    assert.notEqual(dataTable4.orderId, dataTable2.orderId, 'Farklı masalar aynı anahtar ile bağımsız sipariş oluşturabilmelidir.');
  });
});
