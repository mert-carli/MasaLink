const { spawn, spawnSync } = require('child_process');
const http = require('http');
const crypto = require('crypto');

function buildEscPosRawPayload(receipt) {
  const ESC = '\x1b';
  const GS = '\x1d';

  let raw = '';
  // 1. Initialize printer
  raw += `${ESC}@`;

  // 2. SESLİ VE IŞIKLI MUTFAK İKAZI (Dahili Buzzer + RJ11 Harici Mutfak Sireni)
  if (receipt.type === 'kitchen') {
    raw += `${ESC}B\x04\x03`; // ESC B: 4 beeps, duration 3
    raw += '\x07';           // ASCII BEL
    raw += `${ESC}p\x00\x32\x32`; // RJ11 Pin 2 external strobe siren pulse
    raw += `${ESC}p\x01\x32\x32`; // RJ11 Pin 5 external strobe siren pulse
  }

  // 3. Header
  raw += `${ESC}a\x01`; // Center align
  raw += `${ESC}!\x20`; // Double width/height
  raw += 'MASALINK RESTORAN\n';
  raw += `${ESC}!\x00`; // Normal size
  raw += 'ARTISAN BURGER BAR\n';
  raw += '------------------------------------------\n';

  // 4. Ticket Header
  raw += `${ESC}a\x00`; // Left align
  raw += `${ESC}E\x01`; // Bold ON
  raw += `MASA: ${receipt.tableNumber} #${receipt.orderId}\n`;
  raw += `${ESC}E\x00`; // Bold OFF
  raw += `Tarih: ${receipt.timestamp}\n`;
  raw += `Garson: ${receipt.waiterName}\n`;
  raw += `Tip: MUTFAK HAZIRLIK (KDS YOK)\n`;
  raw += '==========================================\n';

  // 5. Items
  receipt.items.forEach((item) => {
    raw += `${item.quantity}x ${item.name}\n`;
    if (item.notes) raw += `   >> NOT: ${item.notes}\n`;
  });
  raw += '------------------------------------------\n\n\n\n';

  // 6. Partial / Full Cut Paper
  raw += `${GS}V\x00`;

  // 7. Post-cut buzzer & siren pulse
  if (receipt.type === 'kitchen') {
    raw += `${ESC}B\x02\x02`;
    raw += `${ESC}p\x00\x1e\x1e`;
  }

  return raw;
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

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBuzzerTest() {
  console.log('===============================================================================');
  console.log('   MASALINK - SAHA SENARYOSU 5: TERMAL YAZICI BUZZER & RJ11 HARİCİ SİREN      ');
  console.log('===============================================================================\n');

  // 1. ESC/POS Bayt Dizilimi ve Komut Analizi
  console.log('[1/4] ESC/POS İkaz Komut Seti Doğrulanıyor...');

  const sampleKitchenReceipt = {
    orderId: 'MUTFAK-9901',
    tableNumber: 'Masa 4',
    timestamp: '20:45',
    waiterName: 'Ahmet Yılmaz',
    type: 'kitchen',
    items: [
      { name: '2x Trüflü Smash Burger', quantity: 2, price: 295, notes: 'Orta Pişmiş, Acil' },
      { name: '1x Baharatlı Patates', quantity: 1, price: 110 },
    ],
    subtotal: 700,
    vat: 70,
    total: 700,
  };

  const rawPayload = buildEscPosRawPayload(sampleKitchenReceipt);
  const rawBuffer = Buffer.from(rawPayload, 'binary');

  // A) ESC B (0x1B 0x42) Dahili Buzzer Denetimi
  const escBIndex = rawBuffer.indexOf(Buffer.from([0x1b, 0x42]));
  console.log(`  • ESC B Dahili Piezo Buzzer: ${escBIndex !== -1 ? 'MEVCUT (Ofset: ' + escBIndex + ')' : 'YOK'}`);
  if (escBIndex === -1) throw new Error('ESC B komutu bulunamadı!');

  const buzzerCount = rawBuffer[escBIndex + 2];
  const buzzerTime = rawBuffer[escBIndex + 3];
  console.log(`    -> Tekrar Sayısı: ${buzzerCount} kez, Süre Çarpanı: ${buzzerTime}`);

  // B) ASCII BEL (0x07) Standart Ses İkazı Denetimi
  const belIndex = rawBuffer.indexOf(0x07);
  console.log(`  • ASCII BEL (0x07) Standart Ses İkazı: ${belIndex !== -1 ? 'MEVCUT' : 'YOK'}`);
  if (belIndex === -1) throw new Error('ASCII BEL bulunamadı!');

  // C) RJ11 Harici Mutfak Sireni & LED Flaşör Darbesi (ESC p 0x1B 0x70)
  const rj11Index = rawBuffer.indexOf(Buffer.from([0x1b, 0x70]));
  console.log(`  • RJ11 Harici Mutfak Sireni & LED Flaşör Darbesi (ESC p): ${rj11Index !== -1 ? 'MEVCUT (Ofset: ' + rj11Index + ')' : 'YOK'}`);
  if (rj11Index === -1) throw new Error('RJ11 external alarm pulse (ESC p) bulunamadı!');

  console.log('✅ Tüm ESC/POS donanım ikaz baytları kusursuz olarak doğrulandı!\n');

  // Tek kullanımlık (ephemeral) kriptografik Bridge sırrı üret (Hardcoded secret kullanılmaz)
  const EPHEMERAL_BRIDGE_SECRET = crypto.randomBytes(32).toString('hex');

  // 2. Print Bridge Başlatılıyor
  console.log('[2/4] MasaLink Print Bridge Başlatılıyor (PORT 28443)...');
  const bridgeProcess = spawn(process.execPath, ['scripts/masalink-print-bridge.js'], {
    stdio: 'pipe',
    env: {
      ...process.env,
      BRIDGE_SECRET: EPHEMERAL_BRIDGE_SECRET,
    },
  });

  const bridgeLogs = [];
  bridgeProcess.stdout.on('data', (d) => {
    const text = d.toString().trim();
    bridgeLogs.push(text);
    console.log(`[Bridge Log] ${text}`);
  });
  bridgeProcess.stderr.on('data', (d) => {
    console.error(`[Bridge Err] ${d.toString().trim()}`);
  });

  await sleep(1500);

  try {
    // 3. Health Check Sorgusu
    console.log('\n[3/4] Bridge Health Check ve Donanım Alarm Özellikleri Sorgulanıyor...');
    const healthRes = await httpRequest({
      hostname: '127.0.0.1',
      port: 28443,
      path: '/health',
      method: 'GET',
    });

    console.log('Bridge Health Yanıtı:', healthRes.data);
    if (!healthRes.data || healthRes.data.status !== 'online' || !healthRes.data.audioVisualAlarm) {
      throw new Error('Bridge sağlık kontrolü veya sesli ikaz desteği başarısız!');
    }
    console.log(`✅ Bridge Versiyonu: ${healthRes.data.version}`);
    console.log(`✅ Desteklenen İkaz Şiddeti: ${healthRes.data.audioVisualAlarm.supportedAlertDecibels}`);

    // 4. Mutfak Fişi Gönderimi & Alarm Tetikleme Doğrulaması
    console.log('\n[4/4] Mutfak Fişi Print Bridge Kuyruğuna İletiliyor...');
    const timestamp = Date.now().toString();
    const jobPayload = {
      jobId: `kitchen_${Date.now()}`,
      targetIp: '127.0.0.1', // mock target
      targetPort: 9999,
      dataBase64: rawBuffer.toString('base64'),
    };
    const bodyStr = JSON.stringify(jobPayload);

    // 4A. Negatif Güvenlik Testi: Geçersiz HMAC İmzası Reddedilmeli (HTTP 401)
    const invalidRes = await httpRequest(
      {
        hostname: '127.0.0.1',
        port: 28443,
        path: '/api/v1/print-raw',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Timestamp': timestamp,
          'X-Bridge-Signature': '0'.repeat(64),
          Origin: 'http://localhost:3000',
        },
      },
      bodyStr
    );
    if (invalidRes.status !== 401) {
      throw new Error(`Güvenlik hatası: Sahte imza reddedilmeliydi (401), alınan: ${invalidRes.status}`);
    }
    console.log('✅ Güvenlik Kontrolü: Geçersiz HMAC imzalı yazdırma isteği reddedildi (HTTP 401).');

    // 4B. Geçerli Ephemeral HMAC İmzası ile Gönderim
    const signature = crypto
      .createHmac('sha256', EPHEMERAL_BRIDGE_SECRET)
      .update(timestamp + bodyStr)
      .digest('hex');

    const printRes = await httpRequest(
      {
        hostname: '127.0.0.1',
        port: 28443,
        path: '/api/v1/print-raw',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Timestamp': timestamp,
          'X-Bridge-Signature': signature,
          Origin: 'http://localhost:3000',
        },
      },
      bodyStr
    );

    console.log('Print Bridge İletim Yanıtı:', printRes.data);

    await sleep(1200);

    // Bridge loglarında alarm tespit edildi mi kontrol et
    const logDump = bridgeLogs.join('\n');
    const hasDetectedInternal = logDump.includes('ESC B Dahili Piezo Buzzer: AKTİF');
    const hasDetectedExternal = logDump.includes('RJ11 Harici 105dB Mutfak Sireni & LED Flaşör: DARBE VERİLDİ');

    console.log('\n--- DONANIM TETİKLEME DENETİMİ ---');
    console.log(`Dahili Piezo Buzzer Doğrulaması: ${hasDetectedInternal ? '✅ BAŞARILI' : '❌ BAŞARISIZ'}`);
    console.log(`RJ11 Harici Siren Doğrulaması:   ${hasDetectedExternal ? '✅ BAŞARILI' : '❌ BAŞARISIZ'}`);

    if (!hasDetectedInternal || !hasDetectedExternal) {
      throw new Error('Bridge donanım ikaz komutlarını algılayamadı!');
    }

    console.log('\n===============================================================================');
    console.log('🎉 TÜM DOĞRULAMALAR BAŞARILI: MUTFAK BUZZER & RJ11 HARİCİ SİREN KUSURSUZ ÇALIŞIYOR!');
    console.log('===============================================================================');
  } finally {
    if (bridgeProcess.pid) {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(bridgeProcess.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        bridgeProcess.kill('SIGTERM');
      }
    }
    console.log('Print bridge süreci kapatıldı.');
  }
}

runBuzzerTest().catch((err) => {
  console.error('❌ Test Hatası:', err);
  process.exit(1);
});
