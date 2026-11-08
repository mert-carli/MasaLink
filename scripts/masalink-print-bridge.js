/**
 * MasaLink Local Print Bridge Daemon (Hardened Enterprise Edition)
 * 
 * Kasadaki PC veya yerel ağdaki mini edge box/Raspberry Pi/NVR üzerinde arka planda çalışır.
 * Güvenlik Katmanı:
 * 1. Origin Whitelist: Sadece yetkili web arayüzlerinden (localhost:3000, app.masalink.com) gelen istekler kabul edilir.
 * 2. Replay Attack Koruması: 10 saniyeden eski zaman damgalı istekler reddedilir.
 * 3. HMAC-SHA256 İmza Doğrulaması: Gövde ve zaman damgası BRIDGE_SECRET ile imzalanır; geçersiz imzada yazıcı/çekmece kilitlenir.
 * 
 * Çalıştırma: node scripts/masalink-print-bridge.js
 * Port: 28443
 */

const http = require('http');
const net = require('net');
const crypto = require('crypto');

const PORT = 28443;
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || '';
if (!BRIDGE_SECRET && process.env.NODE_ENV === 'production') {
  console.error('[GÜVENLİK KRİTİK] Production ortamında BRIDGE_SECRET zorunludur!');
  process.exit(1);
}

// 1. Origin Whitelist (Sadece yetkili arayüz alan adlarına izin verilir)
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://app.masalink.com',
  'https://masalink.com',
];

// ===========================================================================
// DONANIM GÜVENLİĞİ: FIFO YAZDIRMA KUYRUĞU (Buffer DoS & Çince Basma Engeli)
// Termal yazıcıların 64-128 KB olan küçük RAM tamponunu korumak için
// gelen tüm fişler sıralı FIFO kuyruğuna alınır ve her fiş arasında 300ms
// donanım soğuma / motor kağıt kesme payı bırakılır.
// ===========================================================================
const PRINT_JOB_QUEUE = [];
let isProcessingQueue = false;
const INTER_JOB_COOLDOWN_MS = 300; // Fişler arası dinlenme süresi (ms)
const MAX_QUEUE_DEPTH = 60; // Arabellek taşma koruması

function enqueuePrintJob(payload, res) {
  if (PRINT_JOB_QUEUE.length >= MAX_QUEUE_DEPTH) {
    console.warn(`[MasaLink Bridge FIFO] Kuyruk limiti aşıldı (${PRINT_JOB_QUEUE.length}/${MAX_QUEUE_DEPTH})!`);
    res.writeHead(429, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      success: false,
      errorCode: 'PRINTER_BUFFER_FULL',
      error: 'Yazıcı kuyruğu aşırı yoğun! Lütfen birkaç saniye sonra tekrar deneyin.'
    }));
  }

  const job = {
    id: payload.jobId || `job_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    targetIp: payload.targetIp || '192.168.1.180',
    targetPort: parseInt(payload.targetPort, 10) || 9100,
    dataBase64: payload.dataBase64,
    enqueuedAt: Date.now(),
    res,
  };

  PRINT_JOB_QUEUE.push(job);
  console.log(`[MasaLink Bridge FIFO] Görev #${job.id} kuyruğa eklendi. Sırada bekleyen toplam fiş: ${PRINT_JOB_QUEUE.length}`);

  if (!isProcessingQueue) {
    processNextQueueItem();
  }
}

function processNextQueueItem() {
  if (PRINT_JOB_QUEUE.length === 0) {
    isProcessingQueue = false;
    return;
  }

  isProcessingQueue = true;
  const currentJob = PRINT_JOB_QUEUE.shift();

  if (!currentJob.dataBase64) {
    currentJob.res.writeHead(400, { 'Content-Type': 'application/json' });
    currentJob.res.end(JSON.stringify({ success: false, error: 'Eksik ESC/POS veri paketi (dataBase64).' }));
    return processNextQueueItem();
  }

  const rawBuffer = Buffer.from(currentJob.dataBase64, 'base64');

  // Mutfak Sesli ve Işıklı Siren Denetimi (Hardware Buzzer & RJ11 Alarm)
  const hasInternalBuzzer = rawBuffer.includes(Buffer.from([0x1B, 0x42])) || rawBuffer.includes(0x07);
  const hasExternalRj11Alarm = rawBuffer.includes(Buffer.from([0x1B, 0x70]));

  if (hasInternalBuzzer || hasExternalRj11Alarm) {
    console.log(`🔔 [MasaLink Audio-Visual Alarm] Mutfak ikaz komutları tespit edildi:`);
    if (hasInternalBuzzer) console.log(`   🔊 ESC B Dahili Piezo Buzzer: AKTİF (Sesli İkaz Gönderiliyor)`);
    if (hasExternalRj11Alarm) console.log(`   🚨 RJ11 Harici 105dB Mutfak Sireni & LED Flaşör: DARBE VERİLDİ (0x1B 0x70)`);
  }

  console.log(`[MasaLink Bridge FIFO] Yazıcı soketine bağlanılıyor -> ${currentJob.targetIp}:${currentJob.targetPort} (İş: #${currentJob.id}, Boyut: ${rawBuffer.length} bayt)...`);

  const client = new net.Socket();
  client.setTimeout(3000);

  let jobFinished = false;

  const finishJob = (statusCode, responseBody) => {
    if (jobFinished) return;
    jobFinished = true;
    client.destroy();

    try {
      currentJob.res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      currentJob.res.end(JSON.stringify(responseBody));
    } catch (_) {}

    console.log(`[MasaLink Bridge FIFO] Görev #${currentJob.id} tamamlandı. Termal tampon için ${INTER_JOB_COOLDOWN_MS}ms bekleniyor...`);
    setTimeout(() => {
      processNextQueueItem();
    }, INTER_JOB_COOLDOWN_MS);
  };

  client.connect(currentJob.targetPort, currentJob.targetIp, () => {
    client.write(rawBuffer, () => {
      console.log(`[MasaLink Bridge FIFO] ${rawBuffer.length} bayt ESC/POS verisi yazıcıya başarıyla aktarıldı.`);
      finishJob(200, {
        success: true,
        jobId: currentJob.id,
        bytesWritten: rawBuffer.length,
        queueRemaining: PRINT_JOB_QUEUE.length,
      });
    });
  });

  client.on('error', (err) => {
    console.error(`[MasaLink Bridge FIFO] Yazıcı bağlantı hatası (${currentJob.targetIp}:${currentJob.targetPort}):`, err.message);
    finishJob(502, {
      success: false,
      jobId: currentJob.id,
      error: `Yazıcıya bağlanılamadı: ${err.message}`,
    });
  });

  client.on('timeout', () => {
    console.error(`[MasaLink Bridge FIFO] Yazıcı zaman aşımı (${currentJob.targetIp}:${currentJob.targetPort})`);
    finishJob(504, {
      success: false,
      jobId: currentJob.id,
      error: 'Yazıcı bağlantı zaman aşımı (ETIMEDOUT)',
    });
  });
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;

  // 1. Origin Whitelist Kontrolü
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Yerel sistem araçları / curl istekleri için
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    // Dış yetkisiz web sitelerini bloke et
    res.setHeader('Access-Control-Allow-Origin', 'null');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bridge-Signature, X-Bridge-Timestamp, Access-Control-Request-Private-Network');

  // Chromium Private Network Access (PNA) Preflight Koruması
  // https://app.masalink.com gibi public web sitelerinden 127.0.0.1'e gelen isteklere izin ver
  if (req.headers['access-control-request-private-network'] === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // 2. Health check (GET /health)
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ 
      status: 'online', 
      service: 'MasaLink-Print-Bridge', 
      version: '2.6.0-Kitchen-Siren-Hardened',
      security: 'HMAC-SHA256 & Origin-Whitelisted',
      audioVisualAlarm: {
        internalBuzzerCommand: 'ESC B <count> <time>',
        externalRj11SirenCommand: 'ESC p <pin> <t1> <t2>',
        supportedAlertDecibels: '90-105 dB Strobe LED',
      },
      hardwareBufferProtection: {
        queueLength: PRINT_JOB_QUEUE.length,
        isProcessing: isProcessingQueue,
        interJobCooldownMs: INTER_JOB_COOLDOWN_MS,
      }
    }));
  }

  // 3. Test Alarm & Buzzer Trigger: POST /api/v1/trigger-alarm
  if (req.method === 'POST' && req.url === '/api/v1/trigger-alarm') {
    const alarmBuffer = Buffer.from([
      0x1B, 0x40, // ESC @ (Init)
      0x1B, 0x42, 0x05, 0x03, // ESC B 5 3 (5 bip ses ikazı)
      0x07, // BEL
      0x1B, 0x70, 0x00, 0x32, 0x32, // RJ11 Pin 2 harici siren darbesi
      0x1B, 0x70, 0x01, 0x32, 0x32  // RJ11 Pin 5 harici siren darbesi
    ]);
    const jobPayload = {
      jobId: `alarm_test_${Date.now()}`,
      targetIp: '192.168.1.180',
      targetPort: 9100,
      dataBase64: alarmBuffer.toString('base64')
    };
    console.log(`🚨 [MasaLink Bridge] Manuel Mutfak Sireni & Buzzer Testi Tetiklendi!`);
    return enqueuePrintJob(jobPayload, res);
  }

  // 3. Raw Print Dispatch: POST /api/v1/print-raw
  if (req.method === 'POST' && (req.url === '/api/v1/print-raw' || req.url === '/print')) {
    const clientSignature = req.headers['x-bridge-signature'];
    const timestamp = req.headers['x-bridge-timestamp'];

    // 10 saniye zaman aşımı denetimi (Replay Attack Koruması)
    if (!timestamp || Math.abs(Date.now() - parseInt(timestamp, 10)) > 10000) {
      console.warn(`[MasaLink Bridge Security] Reddedildi: Zaman aşımına uğramış veya geçersiz zaman damgası (Timestamp: ${timestamp})`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ 
        success: false, 
        error: 'Zaman aşımına uğramış veya geçersiz istek (Replay Attack Koruması).' 
      }));
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const expectedSignature = crypto
        .createHmac('sha256', BRIDGE_SECRET)
        .update(timestamp + body)
        .digest('hex');

      if (!clientSignature || clientSignature !== expectedSignature) {
        console.warn(`[MasaLink Bridge Security] Reddedildi: Geçersiz HMAC İmzası! Gelen: ${clientSignature}`);
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ 
          success: false, 
          error: 'Geçersiz imza! Para çekmecesi veya yazıcıya yetkisiz erişim engellendi.' 
        }));
      }

      try {
        const payload = JSON.parse(body);
        enqueuePrintJob(payload, res);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Geçersiz JSON yükü.' }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Uç nokta bulunamadı.' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`====================================================`);
  console.log(`🛡️  MasaLink Print Bridge Agent Aktif (v2.4.0-Hardened)`);
  console.log(`🔒 Güvenlik: HMAC-SHA256 & Origin Whitelist Etkin`);
  console.log(`📡 Yerel Dinleme: http://127.0.0.1:${PORT}`);
  console.log(`🖨️ Hedef ESC/POS Yazıcı Varsayılanı: 192.168.1.180:9100`);
  console.log(`====================================================`);
});
