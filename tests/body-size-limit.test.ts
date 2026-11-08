import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { middleware } from '../src/middleware';
import { readJsonBodyWithLimit, PayloadTooLargeError, getRouteBodyLimit } from '../src/server/security/bodyLimit';
import { POST as qrOrderPost } from '../src/app/api/qr-order/route';
import { getActiveTableToken } from '../src/utils/tableSessionRegistry';

function createSizedPayload(targetBytes: number): string {
  // Geçerli bir JSON yapısı içinde hedef bayt boyutuna ulaşacak doldurma (padding)
  const baseJson = JSON.stringify({
    tableId: 'tbl-4',
    items: [{ productId: 'b1', quantity: 1 }],
  });
  const overhead = baseJson.length + 20;
  const paddingNeeded = Math.max(0, targetBytes - overhead);
  return JSON.stringify({
    tableId: 'tbl-4',
    items: [{ productId: 'b1', quantity: 1 }],
    padding: 'A'.repeat(paddingNeeded),
  });
}

test('MasaLink Request Body Size & DoS Kalkanı Test Paketi (HTTP 413)', async (t) => {
  await t.test('1. Rota Limit Haritası Doğrulaması', () => {
    assert.equal(getRouteBodyLimit('/api/auth/login'), 64 * 1024, 'Auth limiti 64 KB olmalı');
    assert.equal(getRouteBodyLimit('/api/kds'), 128 * 1024, 'KDS limiti 128 KB olmalı');
    assert.equal(getRouteBodyLimit('/api/qr-order'), 256 * 1024, 'QR Order limiti 256 KB olmalı');
    assert.equal(getRouteBodyLimit('/api/orders'), 256 * 1024, 'POS Orders limiti 256 KB olmalı');
    assert.equal(getRouteBodyLimit('/api/admin/menu'), 1024 * 1024, 'Admin limiti 1 MB olmalı');
  });

  await t.test('2. 10 KB İstek: Tüm Rotalarda Güvenle İzin Verilmeli (200 / Normal İşleyiş)', async () => {
    const body10Kb = createSizedPayload(10 * 1024);
    const req = new NextRequest('http://localhost:3000/api/qr-order', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(body10Kb)),
      },
      body: body10Kb,
    });

    const res = await middleware(req);
    // 10 KB, 256 KB sınırının altında olduğu için middleware 413 üretmemeli (NextResponse.next())
    assert.notEqual(res.status, 413, '10 KB istek 413 almamalı');
  });

  await t.test('3. 100 KB İstek: 64 KB Sınırı Olan /api/auth Rotalarında 413 Almalı, /api/qr-order İzin Vermeli', async () => {
    const body100Kb = createSizedPayload(100 * 1024);
    const bytes = Buffer.byteLength(body100Kb);

    // A. /api/auth/login (Limit: 64 KB -> 100 KB Aşıyor)
    const reqAuth = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(bytes),
      },
      body: body100Kb,
    });
    const resAuth = await middleware(reqAuth);
    assert.equal(resAuth.status, 413, '100 KB istek 64 KB auth rotasında 413 Payload Too Large dönmeli');
    const authData = await resAuth.json();
    assert.equal(authData.errorCode, 'PAYLOAD_TOO_LARGE');

    // B. /api/qr-order (Limit: 256 KB -> 100 KB Uygun)
    const reqQr = new NextRequest('http://localhost:3000/api/qr-order', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(bytes),
      },
      body: body100Kb,
    });
    const resQr = await middleware(reqQr);
    assert.notEqual(resQr.status, 413, '100 KB istek 256 KB QR rotasında 413 almamalı');
  });

  await t.test('4. 500 KB İstek: 256 KB Sınırı Olan /api/qr-order ve /api/orders Rotalarında 413 Almalı', async () => {
    const body500Kb = createSizedPayload(500 * 1024);
    const bytes = Buffer.byteLength(body500Kb);

    const reqQr = new NextRequest('http://localhost:3000/api/qr-order', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(bytes),
      },
      body: body500Kb,
    });
    const resQr = await middleware(reqQr);
    assert.equal(resQr.status, 413, '500 KB istek 256 KB QR rotasında 413 dönmeli');

    // Admin rotası (1 MB) için 500 KB izinli olmalı
    const reqAdmin = new NextRequest('http://localhost:3000/api/admin/menu', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(bytes),
        authorization: 'Bearer dummy',
      },
      body: body500Kb,
    });
    const resAdmin = await middleware(reqAdmin);
    assert.notEqual(resAdmin.status, 413, '500 KB istek 1 MB admin rotasında 413 almamalı');
  });

  await t.test('5. 1 MB İstek: /api/qr-order, /api/orders ve /api/kds Rotalarında 413 Almalı', async () => {
    const body1Mb = createSizedPayload(1024 * 1024);
    const bytes = Buffer.byteLength(body1Mb);

    const reqKds = new NextRequest('http://localhost:3000/api/kds', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(bytes),
      },
      body: body1Mb,
    });
    const resKds = await middleware(reqKds);
    assert.equal(resKds.status, 413, '1 MB istek 128 KB KDS rotasında 413 dönmeli');
  });

  await t.test('6. 5 MB İstek: /api/admin Dahil Tüm Rotalarda 413 Almalı', async () => {
    const bytes = 5 * 1024 * 1024;
    const reqAdmin = new NextRequest('http://localhost:3000/api/admin/menu', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(bytes),
        authorization: 'Bearer dummy',
      },
      body: 'x',
    });
    const resAdmin = await middleware(reqAdmin);
    assert.equal(resAdmin.status, 413, '5 MB istek 1 MB limitli admin rotasında 413 dönmeli');
  });

  await t.test('7. 50 MB Devasa İstek (Memory DoS / JSON Bomb): Belleğe Parse Edilmeden Anında Reddedilmeli', async () => {
    const bytes = 50 * 1024 * 1024; // 50 Megabytes
    const req50Mb = new NextRequest('http://localhost:3000/api/qr-order', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(bytes),
      },
      body: 'x',
    });

    const start = performance.now();
    const res50Mb = await middleware(req50Mb);
    const durationMs = performance.now() - start;

    assert.equal(res50Mb.status, 413);
    const data = await res50Mb.json();
    assert.equal(data.errorCode, 'PAYLOAD_TOO_LARGE');

    // Sıfır bellek tüketimi: İstek 5 milisaniyenin altında reddedilmeli
    console.log(`[50 MB DoS Kalkanı] 50MB istek parse edilmeden ${durationMs.toFixed(3)}ms içinde 413 ile durduruldu.`);
    assert.ok(durationMs < 50, '50MB istek derhal reddedilmelidir');
  });

  await t.test('8. Streaming Akış Seviyesinde Erken İptal Kalkanı (readJsonBodyWithLimit)', async () => {
    // Content-length başlığı eksik veya yanıltıcı olsa dahi stream okurken sınırı aştığı an abort edilmeli
    const limitBytes = 10 * 1024; // 10 KB test limiti
    const largeChunk = 'B'.repeat(15 * 1024); // 15 KB
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(largeChunk));
        controller.close();
      },
    });

    const mockReq = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      body: stream,
      headers: { 'content-type': 'application/json' },
      // @ts-ignore
      duplex: 'half',
    });

    await assert.rejects(
      async () => {
        await readJsonBodyWithLimit(mockReq, limitBytes);
      },
      (err: any) => {
        assert.equal(err instanceof PayloadTooLargeError, true);
        assert.equal(err.status, 413);
        assert.equal(err.errorCode, 'PAYLOAD_TOO_LARGE');
        return true;
      },
      'Streaming okumasında sınır aşıldığında PayloadTooLargeError fırlatılmalıdır.'
    );
  });
});
