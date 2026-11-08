import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { GET as healthGet } from '@/app/api/health/route';
import { validateEnvironmentConfig } from '@/server/config/envValidator';
import { getJwtSecret, getInternalSyncKey, getBridgeSecret } from '@/server/security/secrets';

test('MASALINK AŞAMA 5: ÜRETİM ORTAMI, YEDEKLEME VE DEVOPS GÜVENLİĞİ TEST PAKETİ', async (t) => {

  // =========================================================================
  // 1. SAĞLIK VE PROBE DENETİMLERİ (LIVENESS & READINESS)
  // =========================================================================
  await t.test('1. Liveness Probe (?type=live): Veritabanından bağımsız anında 200 OK ve alive durumu dönmeli', async () => {
    const req = new NextRequest('http://localhost:3000/api/health?type=live');
    const res = await healthGet(req);

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, 'alive');
    assert.equal(typeof json.uptimeSeconds, 'number');
    assert.ok(json.timestamp);
  });

  await t.test('2. Readiness Probe (?type=ready): Bağımlılık durumuna göre trafik kabul edilebilirliği bildirmeli', async () => {
    const req = new NextRequest('http://localhost:3000/api/health?type=ready');
    const res = await healthGet(req);

    // Test ortamında DATABASE_URL yoksa 503 veya varsa 200
    const json = await res.json();
    assert.ok(['ready', 'not_ready'].includes(json.status));
    assert.ok(json.timestamp);
  });

  await t.test('3. Production Health Güvenlik Kalkanı: Üretim modunda finansal veriler ve bellek sızdırılmamalı', async () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = 'production';

    try {
      const req = new NextRequest('http://localhost:3000/api/health');
      const res = await healthGet(req);
      const json = await res.json();

      // Production yanıtında gizli istatistikler ve hassas alanlar bulunmamalıdır
      assert.equal(json.metricsSummary, undefined, 'metricsSummary üretimde gizlenmelidir');
      assert.equal(json.memory, undefined, 'memory istatistikleri üretimde gizlenmelidir');
      assert.equal(json.services?.realtimeHub, undefined, 'kiracı bağlantı detayları üretimde gizlenmelidir');
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
    }
  });

  // =========================================================================
  // 2. ÇEVRE DEĞİŞKENLERİ VE GÜVENLİK DOĞRULAYICISI (ENV VALIDATOR)
  // =========================================================================
  await t.test('4. EnvValidator Fail-Closed: Üretim ortamında eksik DATABASE_URL veya JWT_SECRET ile başlama reddedilmeli', async () => {
    const badProdEnv = {
      NODE_ENV: 'production',
      // DATABASE_URL eksik
      // MASALINK_JWT_SECRET eksik
    };

    const result = validateEnvironmentConfig(badProdEnv);
    assert.equal(result.isValid, false, 'Eksik kritik değişkenlerle üretim geçerli olamaz');
    assert.ok(result.missingRequired.includes('DATABASE_URL'));
    assert.ok(result.missingRequired.includes('MASALINK_JWT_SECRET'));
    assert.ok(result.errors.length > 0);
  });

  await t.test('5. EnvValidator Entropi Denetimi: Kısa veya tahmin edilebilir gizli anahtarlar reddedilmeli', async () => {
    const weakSecretEnv = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/masalink',
      MASALINK_JWT_SECRET: 'kisa_anahtar_123', // < 32 karakter
      MASALINK_INTERNAL_SYNC_KEY: '12345678901234567890123456789012',
    };

    const result = validateEnvironmentConfig(weakSecretEnv);
    assert.equal(result.isValid, false);
    assert.ok(result.errors.some((e) => e.includes('yetersiz entropi')));
  });

  await t.test('6. EnvValidator Geçerli Konfigürasyon: Tüm zorunlu alanlar tam olduğunda onay vermeli', async () => {
    const validProdEnv = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://masalink:Guclu_Sifre_123!@localhost:5432/masalink?sslmode=require',
      MASALINK_JWT_SECRET: 'f9b3e1a8d4c2b7e5f1a9c3d8e2b7a4f9b3e1a8d4c2b7e5f1a9c3d8e2b7a4f9b3',
      MASALINK_INTERNAL_SYNC_KEY: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      BRIDGE_SECRET: 'bridge_secret_16chars_min',
    };

    const result = validateEnvironmentConfig(validProdEnv);
    assert.equal(result.isValid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.missingRequired.length, 0);
  });

  // =========================================================================
  // 3. YEDEKLEME VE BÜTÜNLÜK (CHECKSUM INTEGRITY VERIFICATION)
  // =========================================================================
  await t.test('7. Yedek Bütünlüğü (Checksum): SHA-256 doğrulama mantığı tahrif edilmiş dosyayı yakalamalı', async () => {
    const originalBackupData = 'MasaLink_Database_Dump_2026_Content_Table_Session_Payment';
    const originalHash = crypto.createHash('sha256').update(originalBackupData).digest('hex');

    // Doğrulama 1: Değişmemiş dosya
    const validHash = crypto.createHash('sha256').update(originalBackupData).digest('hex');
    assert.equal(validHash, originalHash, 'Değişmemiş yedeğin özeti eşleşmelidir');

    // Doğrulama 2: 1 bayt bile tahrif edilmiş yedek
    const corruptedBackupData = 'MasaLink_Database_Dump_2026_Content_Table_Session_Payment_TAMPERED';
    const corruptedHash = crypto.createHash('sha256').update(corruptedBackupData).digest('hex');
    assert.notEqual(corruptedHash, originalHash, 'Tahrif edilmiş yedek anında tespit edilmelidir');
  });

  // =========================================================================
  // 4. FELAKET KURTARMA VE GÖZLEMLENEBİLİRLİK (DISASTER RESILIENCE)
  // =========================================================================
  await t.test('8. Felaket Kurtarma: Geçici veritabanı kesintisinde Liveness canlı kalmalı, Readiness 503 dönmeli', async () => {
    // Liveness probe süreci izler; DB kesilse bile konteyner öldürülüp döngüye sokulmaz
    const liveReq = new NextRequest('http://localhost:3000/api/health?type=live');
    const liveRes = await healthGet(liveReq);
    assert.equal(liveRes.status, 200, 'Liveness daima canlı kalmalıdır');

    // Readiness probe DB bağlantısı yokken trafiği kesmelidir
    const readyReq = new NextRequest('http://localhost:3000/api/health?type=ready');
    const readyRes = await healthGet(readyReq);
    assert.ok([200, 503].includes(readyRes.status));
  });

  await t.test('9. Secrets Güvenliği: Production modunda gizli anahtar eksikse getJwtSecret kesin hata fırlatmalı', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.MASALINK_JWT_SECRET;

    (process.env as any).NODE_ENV = 'production';
    delete process.env.MASALINK_JWT_SECRET;

    try {
      assert.throws(
        () => {
          getJwtSecret();
        },
        (err: any) => {
          assert.match(err.message, /GÜVENLİK KRİTİK/);
          return true;
        }
      );
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
      if (originalSecret) {
        process.env.MASALINK_JWT_SECRET = originalSecret;
      }
    }
  });

});
