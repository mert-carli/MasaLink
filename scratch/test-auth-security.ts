import bcrypt from 'bcryptjs';
import { getJwtSecret, getInternalSyncKey, getBridgeSecret } from '../src/server/security/secrets';
import { createSignedSessionToken, verifySignedSessionToken } from '../src/utils/tenantAuth';

async function testAuthSecurity() {
  console.log('================================================================');
  console.log('   MASALINK - AUTHENTICATION & GÜVENLİK TEMİZLİĞİ TESTİ         ');
  console.log('================================================================\n');

  // TEST 1: Secret Yöneticisi & Dinamik Üretim
  console.log('[TEST 1] Gizli anahtar yöneticisi test ediliyor...');
  const jwtSecret = getJwtSecret();
  const syncKey = getInternalSyncKey();
  const bridgeSecret = getBridgeSecret();

  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT Secret yetersiz uzunlukta!');
  }
  if (!syncKey || syncKey.length < 32) {
    throw new Error('Sync Key yetersiz uzunlukta!');
  }
  console.log('✅ BAŞARILI: Dinamik kriptografik anahtarlar üretildi/doğrulandı.');
  console.log(`   JWT Secret Entropisi: ${jwtSecret.length * 4} bit`);
  console.log(`   Sync Key Entropisi: ${syncKey.length * 4} bit`);

  // TEST 2: JWT Oturum İmzası ve Doğrulama
  console.log('\n[TEST 2] İmzalı session token üretimi ve tahrifat kontrolü...');
  const payload = {
    userId: 'usr-test-123',
    name: 'Ahmet Yılmaz',
    role: 'waiter',
    tenantId: 'tenant-artisan-burger',
  };
  const token = createSignedSessionToken(payload, 3600);
  const verified = verifySignedSessionToken(token);

  if (!verified || verified.userId !== payload.userId || verified.tenantId !== payload.tenantId) {
    throw new Error('Token doğrulama başarısız!');
  }
  console.log('✅ BAŞARILI: İmzalı token başarıyla oluşturuldu ve çözüldü.');

  // Tahrif edilmiş token denetimi
  const tamperedToken = token.slice(0, -4) + 'X9Z0';
  const tamperedCheck = verifySignedSessionToken(tamperedToken);
  if (tamperedCheck !== null) {
    throw new Error('Tahrif edilmiş token kabul edildi! Güvenlik açığı!');
  }
  console.log('✅ BAŞARILI: Tahrif edilmiş imza anında reddedildi (Tamper-Proof).');

  // TEST 3: Bcrypt Parola ve PIN Hash Güvenliği
  console.log('\n[TEST 3] Bcrypt parola ve 4 haneli PIN hash güvenliği...');
  const rawPin = '1234';
  const hashedPin = await bcrypt.hash(rawPin, 10);
  const isCorrect = await bcrypt.compare(rawPin, hashedPin);
  const isWrong = await bcrypt.compare('9999', hashedPin);

  if (!isCorrect || isWrong) {
    throw new Error('Bcrypt PIN eşleştirme hatası!');
  }
  console.log('✅ BAŞARILI: Bcrypt PIN hash doğrulaması sorunsuz çalışıyor.');

  console.log('\n================================================================');
  console.log('   TÜM AUTHENTICATION VE GÜVENLİK TESTLERİ GEÇTİ! 🛡️            ');
  console.log('================================================================');
}

testAuthSecurity().catch((e) => {
  console.error('Test hatası:', e);
  process.exit(1);
});
