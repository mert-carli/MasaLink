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
const { getActiveTableToken } = require('../../src/utils/tableSessionRegistry');
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

        if (req.method === 'POST') {
          const nextRes = await qrOrderRoute.POST(nextReq);
          const resText = await nextRes.text();
          res.writeHead(nextRes.status, { 'Content-Type': 'application/json' });
          return res.end(resText);
        }

        res.writeHead(405);
        res.end();
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

function postJson(port, path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...extraHeaders,
        },
      },
      (res) => {
        let resBody = '';
        res.on('data', (chunk) => (resBody += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(resBody) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: resBody });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runMultiGuestTest() {
  console.log('===============================================================================');
  console.log('   MASALINK - SAHA SENARYOSU 6: AYNI MASADA 4 MİSAFİR & ALMAN USULÜ HESAP      ');
  console.log('===============================================================================\n');

  const { server, port } = await startLocalRouteServer();

  // P0 Güvenlik Katmanı: Masanın gerçek 128-bit yüksek entropili oturum token'ı
  const tenantSlug = 'artisan-burger';
  const tableId = 'tbl-4';
  const activeSessionToken = getActiveTableToken(tenantSlug, tableId);

  try {
    // 0. P0 Güvenlik Kontrolleri:
    // A) Idempotency-Key olmadan gönderilen QR siparişi reddedilmeli (HTTP 400)
    console.log('[0/3] P0 Güvenlik Kontrolleri (Idempotency-Key & Masa Token Denetimi)...');
    const noKeyRes = await postJson(port, `/api/qr-order?tenantSlug=${tenantSlug}`, {
      tableId,
      sessionToken: activeSessionToken,
      items: [{ productId: 'b1', quantity: 1 }],
    });
    if (noKeyRes.status !== 400 || noKeyRes.body?.errorCode !== 'INVALID_IDEMPOTENCY_KEY') {
      throw new Error(`Eksik Idempotency-Key 400 ile reddedilmeliydi, alınan: ${noKeyRes.status}`);
    }

    // B) Sahte masa oturum token'ı reddedilmeli (HTTP 403 INVALID_TOKEN)
    const badTokenRes = await postJson(
      port,
      `/api/qr-order?tenantSlug=${tenantSlug}`,
      {
        tableId,
        sessionToken: 'mst_forged_token_0000000000000000',
        items: [{ productId: 'b1', quantity: 1 }],
      },
      { 'Idempotency-Key': crypto.randomUUID() }
    );
    if (badTokenRes.status !== 403 || badTokenRes.body?.errorCode !== 'INVALID_TOKEN') {
      throw new Error(`Sahte masa token'ı 403 ile reddedilmeliydi, alınan: ${badTokenRes.status}`);
    }
    console.log('  ✅ Eksik Idempotency-Key (HTTP 400) ve sahte masa tokenı (HTTP 403) reddedildi!\n');

    // 1. Misafir 1 (Can) ve Misafir 2 (Elif) aynı masa üzerinden sipariş veriyor
    console.log('[1/3] Masa 4 Üzerinden Çoklu Misafir (Can, Elif, Murat, Ortak Masa) Siparişi Gönderiliyor...');

    const multiGuestOrderPayload = {
      tableId,
      clientFingerprint: `fp_multi_guest_${Date.now()}`,
      sessionToken: activeSessionToken,
      visionAiDetected: true,
      customerNote: 'Patatesler masanın ortasına sıcak gelsin lütfen',
      items: [
        {
          productId: 'b1', // Trüflü Smash Burger (295 TL) + Cheddar (35 TL) = 330 TL
          quantity: 1,
          cookingLevel: 'Orta Pişmiş',
          selectedOptions: [{ id: 'ex-1', name: 'Ekstra Eritilmiş Cheddar' }],
          guestTag: 'Can (Misafir 1)',
        },
        {
          productId: 'b2', // Double Cheddar Bacon (340 TL)
          quantity: 1,
          cookingLevel: 'Çok Pişmiş',
          selectedOptions: [],
          guestTag: 'Elif (Misafir 2)',
        },
        {
          productId: 'b4', // Crispy Tavuk Burger (240 TL)
          quantity: 1,
          selectedOptions: [],
          guestTag: 'Murat (Misafir 3)',
        },
        {
          productId: 'y1', // Baharatlı Patates (110 TL x 2 = 220 TL) -> Ortak Masa
          quantity: 2,
          selectedOptions: [],
          guestTag: 'Ortak Masa',
        },
      ],
    };

    const orderRes = await postJson(port, `/api/qr-order?tenantSlug=${tenantSlug}`, multiGuestOrderPayload, {
      'Idempotency-Key': crypto.randomUUID(),
    });
    console.log(`Sunucu HTTP Durumu: ${orderRes.status}`);

    if (orderRes.status !== 200 || !orderRes.body.success) {
      throw new Error('Sipariş başarısız: ' + JSON.stringify(orderRes.body));
    }

    const orderData = orderRes.body;
    console.log(`✅ Sipariş Başarıyla Oluşturuldu: #${orderData.orderId}`);
    console.log(`✅ Sunucu Tarafından Hesaplanan Masa Toplamı: ₺${orderData.total}`);

    // Beklenen toplam: 330 (Can) + 340 (Elif) + 240 (Murat) + 220 (Ortak) = 1130 TL
    if (orderData.total !== 1130) {
      throw new Error(`Toplam tutar 1130 TL olmalıydı, alınan: ${orderData.total}`);
    }

    // 2. Kişi Bazlı (Guest Tag) Ayrıştırma Doğrulaması
    console.log('\n[2/3] Kişi Bazlı (Guest Tag) Sipariş ve Tutar Dağılımı Denetleniyor...');
    const byGuest = {};
    for (const item of orderData.items) {
      const tag = item.guestTag || 'Belirtilmemiş';
      if (!byGuest[tag]) byGuest[tag] = { total: 0, items: [] };
      byGuest[tag].total += item.lineTotal;
      byGuest[tag].items.push(`${item.quantity}x ${item.productName} (₺${item.lineTotal})`);
    }

    for (const [guest, info] of Object.entries(byGuest)) {
      console.log(`  👤 ${guest.padEnd(18)} -> ₺${info.total} | [${info.items.join(', ')}]`);
    }

    if (
      byGuest['Can (Misafir 1)']?.total !== 330 ||
      byGuest['Elif (Misafir 2)']?.total !== 340 ||
      byGuest['Murat (Misafir 3)']?.total !== 240 ||
      byGuest['Ortak Masa']?.total !== 220
    ) {
      throw new Error('Kişi bazlı tutar ayrıştırmasında hata var!');
    }
    console.log('✅ Kişi bazlı tüm harcamalar kuruşu kuruşuna doğru ayrıştırıldı!');

    // 3. Alman Usulü (Split Bill) Hesap Bölüşüm Simülasyonu
    console.log('\n[3/3] Alman Usulü (Kişi Bazlı + Ortak Kalem Paylaşımı) Hesaplaması Doğrulanıyor...');
    const guestCount = 3; // Can, Elif, Murat
    const sharedPerPerson = Math.round(byGuest['Ortak Masa'].total / guestCount); // 220 / 3 = 73 TL

    const canPay = byGuest['Can (Misafir 1)'].total + sharedPerPerson;
    const elifPay = byGuest['Elif (Misafir 2)'].total + sharedPerPerson;
    const muratPay = byGuest['Murat (Misafir 3)'].total + (byGuest['Ortak Masa'].total - sharedPerPerson * 2);

    console.log(`  💳 Can'ın Ödeyeceği   (Kendi: ₺330 + Ortak Pay: ₺${sharedPerPerson}): ₺${canPay}`);
    console.log(`  💳 Elif'in Ödeyeceği  (Kendi: ₺340 + Ortak Pay: ₺${sharedPerPerson}): ₺${elifPay}`);
    console.log(`  💳 Murat'ın Ödeyeceği (Kendi: ₺240 + Ortak Pay: ₺${byGuest['Ortak Masa'].total - sharedPerPerson * 2}): ₺${muratPay}`);
    console.log(`  📊 Bölüşülen Toplam Sağlaması: ₺${canPay + elifPay + muratPay} === ₺${orderData.total}`);

    if (canPay + elifPay + muratPay !== orderData.total) {
      throw new Error('Alman usulü toplam sağlaması masa toplamıyla eşleşmedi!');
    }

    console.log('\n===============================================================================');
    console.log('🎉 TÜM DOĞRULAMALAR BAŞARILI: ÇOKLU MİSAFİR & ALMAN USULÜ HESAP KUSURSUZ ÇALIŞIYOR!');
    console.log('===============================================================================');
  } finally {
    server.close();
  }
}

runMultiGuestTest().catch((err) => {
  console.error('❌ Test Hatası:', err);
  process.exit(1);
});
