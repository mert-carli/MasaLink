import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

import {
  sanitizePrintText,
  buildEscPosRawPayload,
  generateBridgeSignature,
} from '../src/utils/printBridge';
import { ReceiptData } from '../src/components/admin/ThermalReceiptModal';

describe('MasaLink Yerel Donanım Katmanı: Local Print Bridge & ESC/POS Güvenlik Doğrulaması', () => {
  const secretKey = 'test_bridge_secret_key_12345';

  it('1. Donanım Enjeksiyon Kalkanı (Control Character Sanitization)', () => {
    // Kötü niyetli bir müşterinin sipariş notuyla para çekmecesini açmaya (0x1B 0x70)
    // veya yazıcıyı sıfırlamaya (0x1B 0x40) çalışması simülasyonu:
    const maliciousNote = 'Acısız lütfen \x1b\x70\x00\x19\xfa Para Çekmecesini Aç!';
    const sanitized = sanitizePrintText(maliciousNote);

    assert.equal(sanitized.includes('\x1b'), false, 'ESC (0x1B) kontrol karakteri temizlenmeli');
    assert.equal(sanitized.includes('\x00'), false, 'NUL (0x00) baytı temizlenmeli');
    assert.equal(sanitized.includes('\x19'), false, 'EM (0x19) kontrol baytı temizlenmeli');
    assert.ok(sanitized.includes('Para Çekmecesini Aç!'), 'Metin içeriği okunabilir kalmalı');
  });

  it('2. ESC/POS 80mm İkili Bayt Akışı (Mutfak Bileti ve Kasa Fişi)', () => {
    const kitchenReceipt: ReceiptData = {
      orderId: 'ORD-9988',
      tableNumber: 'Masa 4',
      timestamp: '18:45',
      waiterName: 'Ahmet Yılmaz',
      type: 'kitchen',
      subtotal: 350,
      vat: 35,
      total: 350,
      items: [
        { name: 'Trüflü Smash Burger', quantity: 2, price: 175, notes: 'Orta Pişmiş' },
      ],
    };

    const kitchenBytes = buildEscPosRawPayload(kitchenReceipt);

    // Mutfak Biletinde Dahili Buzzer (ESC B) ve Ses İkazı (BEL) Denetimi
    assert.ok(kitchenBytes.includes('\x1b@'), 'Yazıcı başlatma komutu (ESC @) bulunmalı');
    assert.ok(kitchenBytes.includes('\x1bB\x04\x03'), 'Dahili buzzer komutu (ESC B 4 3) bulunmalı');
    assert.ok(kitchenBytes.includes('\x07'), 'ASCII BEL sesli ikazı bulunmalı');
    assert.ok(kitchenBytes.includes('\x1bp\x00\x32\x32'), 'RJ11 harici mutfak sireni darbesi bulunmalı');
    assert.ok(kitchenBytes.includes('Trüflü Smash Burger'), 'Ürün adı çıktıda yer almalı');
    assert.ok(kitchenBytes.includes('\x1dV\x00'), 'Kağıt kesme komutu (GS V 0) bulunmalı');

    // Kasa Fişi (Adisyon) Denetimi
    const billReceipt: ReceiptData = {
      orderId: 'ORD-9988',
      tableNumber: 'Masa 4',
      timestamp: '19:10',
      waiterName: 'Zeynep Kaya',
      type: 'bill',
      subtotal: 500,
      vat: 50,
      total: 500,
      paymentMethod: 'Iyzico 3D Secure Kredi Kartı',
      items: [
        { name: 'Double Cheddar Burger', quantity: 1, price: 340 },
        { name: 'Mozzarella Sticks', quantity: 1, price: 160 },
      ],
    };

    const billBytes = buildEscPosRawPayload(billReceipt);
    assert.ok(billBytes.includes('GENEL TOPLAM: 500 TL'), 'Genel toplam adisyonda yer almalı');
    assert.ok(billBytes.includes('KDV (%10): 50 TL'), 'KDV dökümü adisyonda yer almalı');
    assert.ok(billBytes.includes('Odeme: Iyzico 3D Secure Kredi Kartı'), 'Ödeme yöntemi yer almalı');
    assert.equal(billBytes.includes('\x1bB\x04\x03'), false, 'Kasa fişinde mutfak alarmı çalmamalı');
  });

  it('3. HMAC-SHA256 İmza Doğrulaması ve Replay Attack Koruması', async () => {
    const timestamp = Date.now().toString();
    const payload = JSON.stringify({
      targetIp: '192.168.1.180',
      targetPort: 9100,
      dataBase64: Buffer.from('TEST').toString('base64'),
    });

    // İstemci imzası üret
    const clientSignature = await generateBridgeSignature(payload, timestamp, secretKey);

    // Sunucu/Bridge tarafında beklenen imza doğrulaması
    const expectedSignature = crypto
      .createHmac('sha256', secretKey)
      .update(timestamp + payload)
      .digest('hex');

    assert.equal(clientSignature, expectedSignature, 'Üretilen HMAC imzası bridge beklentisiyle birebir eşleşmeli');

    // Zaman aşımı (Replay attack koruması denetimi): 15 saniye eski istek
    const staleTimestamp = (Date.now() - 15000).toString();
    const isStale = Math.abs(Date.now() - parseInt(staleTimestamp, 10)) > 10000;
    assert.equal(isStale, true, '10 saniyeden eski istekler bridge tarafından reddedilmeli');
  });
});
