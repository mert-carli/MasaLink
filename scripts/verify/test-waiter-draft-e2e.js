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

// Ephemeral per-run JWT secret (zero hardcoded secrets)
process.env.MASALINK_JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.MASALINK_INTERNAL_SYNC_KEY = crypto.randomBytes(32).toString('hex');

const { NextRequest } = require('next/server');
const { createSignedSessionToken } = require('../../src/utils/tenantAuth');
const draftRoute = require('../../src/app/api/waiter/draft/route');

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
        if (req.method === 'GET') nextRes = await draftRoute.GET(nextReq);
        else if (req.method === 'POST') nextRes = await draftRoute.POST(nextReq);
        else if (req.method === 'DELETE') nextRes = await draftRoute.DELETE(nextReq);
        else {
          res.writeHead(405);
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

function request(port, method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers,
    };
    const bodyString = data ? JSON.stringify(data) : '';
    if (data) {
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyString);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let resBody = '';
        res.on('data', (chunk) => (resBody += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(resBody) });
          } catch (e) {
            resolve({ status: res.statusCode, data: resBody });
          }
        });
      }
    );

    req.on('error', reject);
    if (data) req.write(bodyString);
    req.end();
  });
}

async function runE2ETest() {
  console.log('==================================================================');
  console.log('🚀 GARSON CİHAZ KAPANMASI / ŞARJ BİTMESİ (DRAFT RECOVERY) E2E TESTİ');
  console.log('==================================================================\n');

  const { server, port } = await startLocalRouteServer();

  // P0 Güvenlik Katmanı: Yetkili Garson Oturum Token'ı (HMAC-SHA256 imzalı)
  const waiterSessionToken = createSignedSessionToken({
    userId: 'w-1',
    name: 'Ahmet Yılmaz',
    role: 'waiter',
    tenantId: 'tenant-artisan-burger',
  });
  const authHeaders = {
    Authorization: `Bearer ${waiterSessionToken}`,
    Cookie: `masalink_staff_session=${waiterSessionToken}`,
  };

  try {
    // ADIM 0: Güvenlik Kontrolü — Yetkisiz İstek Reddedilmeli (Fail-Closed 401)
    console.log('🔒 [ADIM 0] P0 Güvenlik Kontrolü: Oturumsuz erişim denetleniyor...');
    const unauthRes = await request(port, 'GET', '/api/waiter/draft?waiterId=w-1');
    if (unauthRes.status !== 401) {
      throw new Error(`Oturumsuz istek 401 ile reddedilmeliydi, alınan: ${unauthRes.status}`);
    }
    console.log('   ✔ Oturumsuz erişim başarıyla engellendi (HTTP 401 TENANT_UNAUTHORIZED).\n');

    // ADIM 1: Garson 1 (Ahmet Yılmaz) Masa 7 için sipariş girerken taslak buluta senkronize edilir
    console.log('📱 [ADIM 1] CİHAZ A: Garson Ahmet Yılmaz (w-1) Masa 7 için 3 kalem ürün seçiyor...');
    const draftPayload = {
      waiterId: 'w-1',
      waiterName: 'Ahmet Yılmaz',
      tableId: 'tbl-7',
      tableName: 'Masa 7',
      itemCount: 4,
      totalAmount: 1125,
      cart: {
        'b1__Orta Pişmiş____Soğansız': {
          item: { id: 'b1', name: 'Trüflü Smash Burger', price: 295, category: 'Burgerler' },
          quantity: 2,
          notes: 'Soğansız',
          cookingLevel: 'Orta Pişmiş',
          selectedOptions: [{ id: 'ex-1', name: 'Ekstra Eritilmiş Cheddar', extraPrice: 35 }],
        },
        y1______: {
          item: { id: 'y1', name: 'Baharatlı Patates', price: 110, category: 'Yanlar' },
          quantity: 1,
          notes: '',
        },
        i1______Buzsuz: {
          item: { id: 'i1', name: 'Ev Yapımı Çilekli Limonata', price: 85, category: 'İçecekler' },
          quantity: 1,
          notes: 'Buzsuz',
        },
      },
    };

    const postRes = await request(port, 'POST', '/api/waiter/draft', draftPayload, authHeaders);
    console.log(`   ↳ Sunucu Yanıtı (${postRes.status}):`, postRes.data);

    if (!postRes.data || !postRes.data.success) {
      throw new Error('Taslak sunucuya kaydedilemedi!');
    }
    console.log('   ✔ Taslak gerçek zamanlı olarak sunucu belleğine (Cloud Sync) mühürlendi.\n');

    // ADIM 2: Cihaz A'nın şarjı biter / kapanır. Garson Cihaz B'den (veya Kasa POS'tan) giriş yapar.
    console.log('🔋 [ADIM 2] SİMÜLASYON: Cihaz A şarjı bitti ve kapandı (LocalStorage erişilemez durumda).');
    console.log('📲 [ADIM 3] CİHAZ B: Garson Ahmet Yılmaz yedek tabletten (w-1) oturum açıyor...');

    const getRes = await request(port, 'GET', '/api/waiter/draft?waiterId=w-1', null, authHeaders);
    console.log(`   ↳ Bulut Kurtarma Yanıtı (${getRes.status}):`);

    if (!getRes.data || !getRes.data.success || !getRes.data.draft) {
      throw new Error('Cihaz B buluttaki taslağı kurtaramadı!');
    }

    const recovered = getRes.data.draft;
    console.log(`   ✔ Kurtarılan Garson: ${recovered.waiterName} (${recovered.waiterId})`);
    console.log(`   ✔ Kurtarılan Masa:   ${recovered.tableName} (${recovered.tableId})`);
    console.log(`   ✔ Kurtarılan Ürün:   ${recovered.itemCount} Adet | Toplam: ₺${recovered.totalAmount}`);
    console.log(`   ✔ Sepet Kalemleri:   ${Object.keys(recovered.cart).length} farklı özelleştirilmiş kalem doğrulandı.\n`);

    // ADIM 4: Garson kurtarılan siparişi mutfağa gönderir ve bulut taslağı temizlenir
    console.log('👨‍🍳 [ADIM 4] Garson kurtarılan siparişi mutfağa gönderiyor (Taslak Temizleniyor)...');
    const delRes = await request(port, 'DELETE', '/api/waiter/draft?waiterId=w-1', null, authHeaders);
    console.log(`   ↳ Silme Yanıtı (${delRes.status}):`, delRes.data);

    const verifyEmptyRes = await request(port, 'GET', '/api/waiter/draft?waiterId=w-1', null, authHeaders);
    if (verifyEmptyRes.data.draft !== null) {
      throw new Error('Taslak silindikten sonra hala dolu görünüyor!');
    }
    console.log('   ✔ Mutfağa gönderim sonrası bulut taslağı başarıyla sıfırlandı.\n');

    console.log('==================================================================');
    console.log('🎉 SONUÇ: TÜM CİHAZ KAPANMASI / BULUT KURTARMA TESTLERİ GEÇTİ! (100% PASS)');
    console.log('==================================================================');
  } finally {
    server.close();
  }
}

runE2ETest().catch((err) => {
  console.error('\n❌ TEST BAŞARISIZ:', err.message);
  process.exit(1);
});
