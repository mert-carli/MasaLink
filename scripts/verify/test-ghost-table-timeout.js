const { spawnSync } = require('child_process');
if (!process.execArgv.some((arg) => arg.includes('tsx'))) {
  const res = spawnSync(process.execPath, ['--import', 'tsx', __filename, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(res.status ?? 1);
}

const http = require('http');
const crypto = require('crypto');

// Ephemeral per-run secrets (zero hardcoded secrets)
process.env.MASALINK_JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.MASALINK_INTERNAL_SYNC_KEY = crypto.randomBytes(32).toString('hex');

const { NextRequest } = require('next/server');
const { createSignedSessionToken } = require('../../src/utils/tenantAuth');
const { getActiveTableToken, refreshTableSession } = require('../../src/utils/tableSessionRegistry');
const ghostTableRoute = require('../../src/app/api/vision-ai/ghost-table/route');
const qrOrderRoute = require('../../src/app/api/qr-order/route');

function startLocalRouteServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const bodyBuffer = Buffer.concat(chunks);

        const url = `http://127.0.0.1:${server.address().port}${req.url}`;
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (Array.isArray(v)) headers.set(k, v.join(', '));
          else if (typeof v === 'string') headers.set(k, v);
        }

        const nextReq = new NextRequest(url, {
          method: req.method,
          headers,
          body: bodyBuffer.length > 0 && req.method !== 'GET' && req.method !== 'HEAD' ? bodyBuffer : undefined,
        });

        let nextRes;
        if (req.url.startsWith('/api/vision-ai/ghost-table')) {
          if (req.method === 'GET') nextRes = await ghostTableRoute.GET(nextReq);
          else if (req.method === 'POST') nextRes = await ghostTableRoute.POST(nextReq);
        } else if (req.url.startsWith('/api/qr-order')) {
          if (req.method === 'POST') nextRes = await qrOrderRoute.POST(nextReq);
        }

        if (!nextRes) {
          res.writeHead(404);
          return res.end();
        }

        const resText = await nextRes.text();
        res.writeHead(nextRes.status, { 'Content-Type': 'application/json' });
        res.end(resText);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });

    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
    server.on('error', reject);
  });
}

function httpRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runGhostTableTest() {
  console.log('===============================================================================');
  console.log('   MASALINK - SAHA SENARYOSU 6: HAYALET MASA & VISION AI ZAMAN AŞIMI SIFIRLAMA ');
  console.log('===============================================================================\n');

  console.log('[1/5] Yerel Rota Sunucusu Başlatılıyor...');
  const { server, port } = await startLocalRouteServer();

  // P0 Güvenlik Katmanı: Yetkili Vision AI / Yönetici Oturum Token'ı
  const staffToken = createSignedSessionToken({
    userId: 'vision-edge-1',
    name: 'Vision AI NVR',
    role: 'manager',
    tenantId: 'artisan-burger',
  });
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${staffToken}`,
    Cookie: `masalink_staff_session=${staffToken}`,
  };

  const healthRes = await httpRequest({
    hostname: '127.0.0.1',
    port,
    path: '/api/vision-ai/ghost-table',
    method: 'GET',
  });
  if (healthRes.status !== 200) {
    throw new Error('Vision AI Ghost Table servisi yanıt vermedi!');
  }
  console.log('✅ Vision AI Ghost Table Servisi Hazır ve Dinlemede.\n');

  // Masanın başlangıçtaki aktif token'ını kaydet
  const initialTableToken = getActiveTableToken('artisan-burger', 'tbl-4');

  try {
    console.log('--- SENARYO CANLANDIRMASI ---');
    console.log("Masa 4'teki misafirler hesabı ödeyip masadan 'Kalktım' demeden ayrıldı.");
    console.log("Garson masayı sistemden temizliğe almayı unuttu (Masa sistemde 'served' olarak asılı kaldı).\n");

    // 0. P0 Güvenlik Kontrolü: Yetkisiz telemetri reddedilmeli (HTTP 401)
    const unauthRes = await httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/vision-ai/ghost-table',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { tableId: 'tbl-4', personCount: 0, emptyDurationSeconds: 180 }
    );
    if (unauthRes.status !== 401) {
      throw new Error(`Yetkisiz telemetri 401 ile reddedilmeliydi, alınan: ${unauthRes.status}`);
    }
    console.log('🔒 P0 Güvenlik Kontrolü: Oturumsuz telemetri enjeksiyonu reddedildi (HTTP 401).\n');

    // 1. Durum: Kamera 60 saniyedir kimseyi görmüyor
    console.log('[2/5] Kamera Telemetrisi: 60 saniye kesintisiz boş...');
    const t1 = await httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/vision-ai/ghost-table',
        method: 'POST',
        headers: authHeaders,
      },
      {
        tableId: 'tbl-4',
        tableName: 'Masa 4',
        section: 'salon',
        personCount: 0,
        emptyDurationSeconds: 60,
        confidenceScore: 0.94,
        currentTableStatus: 'served',
        totalAmount: 890,
      }
    );

    console.log('60 sn Sonuç:', {
      isGhostTable: t1.data.evaluation?.isGhostTable,
      action: t1.data.evaluation?.actionTaken,
    });
    if (t1.data.evaluation?.isGhostTable !== false || t1.data.evaluation?.actionTaken !== 'NONE') {
      throw new Error('60 saniyede yanlışlıkla tetiklendi!');
    }

    // 2. Durum: Kamera 120 saniyedir kimseyi görmüyor (Erken Uyarı Eşiği)
    console.log('\n[3/5] Kamera Telemetrisi: 120 saniye (2 dakika) boş -> Erken İkaz Kontrolü...');
    const t2 = await httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/vision-ai/ghost-table',
        method: 'POST',
        headers: authHeaders,
      },
      {
        tableId: 'tbl-4',
        tableName: 'Masa 4',
        section: 'salon',
        personCount: 0,
        emptyDurationSeconds: 120,
        confidenceScore: 0.94,
        currentTableStatus: 'served',
        totalAmount: 890,
      }
    );

    console.log('120 sn Sonuç:', {
      isGhostTable: t2.data.evaluation?.isGhostTable,
      action: t2.data.evaluation?.actionTaken,
      reason: t2.data.evaluation?.reason,
    });
    if (t2.data.evaluation?.actionTaken !== 'DISPATCH_WARNING') {
      throw new Error('120 saniyede DISPATCH_WARNING verilmedi!');
    }
    console.log("✅ Erken uyarı garson ve kasaya iletildi: 'Masa 2 dakikadır boş, 60 saniye sonra sıfırlanacak'.");

    // 3. Durum: Kamera 180 saniyedir (3 dakika) kimseyi görmüyor (KRİTİK HAYALET MASA SIFIRLAMA)
    console.log('\n[4/5] Kamera Telemetrisi: 180 saniye (3 DAKİKA) kesintisiz boş -> OTOMATİK SIFIRLAMA PROTOKOLÜ...');
    const t3 = await httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/vision-ai/ghost-table',
        method: 'POST',
        headers: authHeaders,
      },
      {
        tableId: 'tbl-4',
        tableName: 'Masa 4',
        section: 'salon',
        personCount: 0,
        emptyDurationSeconds: 180,
        confidenceScore: 0.95,
        currentTableStatus: 'served',
        totalAmount: 890,
      }
    );

    console.log('180 sn Sonuç:', {
      isGhostTable: t3.data.evaluation?.isGhostTable,
      action: t3.data.evaluation?.actionTaken,
      revokedSessionToken: t3.data.evaluation?.revokedSessionToken,
      reason: t3.data.evaluation?.reason,
    });

    if (
      t3.data.evaluation?.isGhostTable !== true ||
      t3.data.evaluation?.actionTaken !== 'AUTO_RESET_TO_CLEANING' ||
      !t3.data.evaluation?.revokedSessionToken
    ) {
      throw new Error('3 dakikalık hayalet masa sıfırlama protokolü başarısız!');
    }
    console.log("✅ 3 Dakika Eşiği Aşıldı: Eski müşterinin 128-bit oturum token'ı iptal edildi ve masa otomatik temizliğe çekildi!");

    // 4. Doğrulama: Yeni gelen bir müşteri eski iptal edilen token ile sipariş vermeye çalışırsa ne olur?
    console.log('\n[5/5] Güvenlik Denetimi: Yeni müşteri masaya oturduğunda eski iptal edilen oturum ile istek atarsa?');
    const expiredOrderRes = await httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/qr-order?tenantSlug=artisan-burger',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
      },
      {
        tableId: 'tbl-4',
        clientFingerprint: 'new_guest_device',
        sessionToken: initialTableToken,
        items: [{ productId: 'b1', name: 'Trüflü Smash Burger', quantity: 1 }],
      }
    );

    console.log(`📡 Geçersiz/İptal Edilmiş Token Sipariş Yanıtı: HTTP ${expiredOrderRes.status}`, expiredOrderRes.data);
    if (expiredOrderRes.status !== 403 || expiredOrderRes.data.success !== false) {
      throw new Error("İptal edilmiş hayalet masa token'ı reddedilmedi!");
    }
    console.log('✅ Güvenlik Kalkanı Onaylandı: Yeni müşteri eski müşterinin adisyonunu göremez ve eski token ile sipariş veremez!');

    console.log('\n===============================================================================');
    console.log('🎉 TÜM DOĞRULAMALAR BAŞARILI: HAYALET MASA ZAMAN AŞIMI & VISION AI KUSURSUZ ÇALIŞIYOR!');
    console.log('===============================================================================');
  } finally {
    refreshTableSession('artisan-burger', 'tbl-4');
    server.close();
    console.log('\nTest sunucusu güvenle kapatıldı.');
  }
}

runGhostTableTest().catch((err) => {
  console.error('❌ Test Hatası:', err);
  process.exit(1);
});
