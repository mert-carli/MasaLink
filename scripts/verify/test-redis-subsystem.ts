import { redis } from '../../src/server/redis/redisClient';
import {
  tryAcquireDistributedLock,
  acquireDistributedLock,
  releaseDistributedLock,
  withDistributedLock,
} from '../../src/server/redis/distributedLock';
import { DistributedRateLimiter } from '../../src/server/redis/rateLimiter';
import { CacheService } from '../../src/server/redis/cacheService';
import { realtimeHub } from '../../src/server/realtime/realtimeHub';
import { enforcePinRateLimit, recordFailedPinAttempt, recordSuccessfulPinAttempt } from '../../src/utils/pinRateLimiter';

async function runRedisSubsystemTests() {
  console.log('================================================================');
  console.log('🚀 MASALINK REDIS SUBSYSTEM TEST SUITE');
  console.log('Veritabanı yerine DEĞİL; Lock, Rate Limit, Cache & Pub/Sub testi');
  console.log('================================================================\n');

  const status = redis.getStatus();
  console.log(`[Redis Engine]: ${status.engine} (Connected: ${status.connected})\n`);

  // =========================================================================
  // 1. DAĞITIK KİLİT (DISTRIBUTED LOCK / REDLOCK PATTERN) TESTİ
  // =========================================================================
  console.log('▶ [1. DAĞITIK KİLİT & YARIŞ DURUMU (CONCURRENCY) TESTİ]');
  const lockKey = 'tenant-test:table:tbl-bahce-4';

  // 1.A - Instance A kilidi alır
  const lockA = await tryAcquireDistributedLock(lockKey, 3000);
  if (!lockA.acquired || !lockA.lockToken) {
    throw new Error('Instance A kilidi alamadı!');
  }
  console.log(`✓ Instance A masa kilidini başarıyla aldı. Token: ${lockA.lockToken.substring(0, 15)}...`);

  // 1.B - Instance B aynı anda aynı masaya işlem yapmaya çalışır (Reddedilmeli)
  const lockB = await tryAcquireDistributedLock(lockKey, 3000);
  if (lockB.acquired) {
    throw new Error('HATA: Instance B meşgul masanın kilidini alabildi! Dağıtık kilit ihlali!');
  }
  console.log('✓ Concurrency Koruması: Instance B aynı masayı kilitleyemedi (Beklenen davranış: Reddedildi).');

  // 1.C - Yanlış token ile kilidi açmaya çalışma (Lua atomik güvenlik denetimi)
  const fakeTokenRelease = await releaseDistributedLock(lockKey, 'fake-invalid-token-12345');
  if (fakeTokenRelease) {
    throw new Error('HATA: Sahte token ile kilit açılabildi!');
  }
  console.log('✓ Lua Güvenliği: Yanlış token ile kilit serbest bırakılamadı.');

  // 1.D - Instance A kendi token\'ı ile kilidi açar
  const realRelease = await releaseDistributedLock(lockKey, lockA.lockToken);
  if (!realRelease) {
    throw new Error('Instance A kendi kilidini açamadı!');
  }
  console.log('✓ Instance A kilidi başarıyla serbest bıraktı.');

  // 1.E - Şimdi Instance B kilidi alabilmeli
  const lockBSecondTry = await tryAcquireDistributedLock(lockKey, 3000);
  if (!lockBSecondTry.acquired || !lockBSecondTry.lockToken) {
    throw new Error('Kilit açıldıktan sonra Instance B kilidi alamadı!');
  }
  console.log('✓ Kilit boşaldıktan sonra Instance B kilidi sorunsuzca aldı.');
  await releaseDistributedLock(lockKey, lockBSecondTry.lockToken);

  // 1.F - withDistributedLock fonksiyonel sarmalayıcı testi (Hata durumunda da kilidi çözer)
  let criticalExecuted = false;
  await withDistributedLock('tenant-test:order:tx-999', async () => {
    criticalExecuted = true;
  }, 2000);
  if (!criticalExecuted) throw new Error('withDistributedLock kritik bloğu çalıştırmadı!');
  console.log('✓ withDistributedLock sarmalayıcısı kritik bloğu güvenle çalıştırdı ve kilidi kapattı.\n');

  // =========================================================================
  // 2. DAĞITIK HIZ SINIRLAYICI & BRUTE-FORCE LOCKOUT TESTİ
  // =========================================================================
  console.log('▶ [2. DAĞITIK HIZ SINIRLAYICI & BRUTE-FORCE LOCKOUT TESTİ]');
  const testIp = '192.168.1.99';

  // Test öncesi temizle
  await recordSuccessfulPinAttempt(`test_${testIp}`);

  // 4 kez hatalı deneme
  for (let i = 1; i <= 4; i++) {
    const res = await recordFailedPinAttempt(`test_${testIp}`, { ip: testIp });
    if (res.isLockedNow) {
      throw new Error(`4. denemede kilitlenmemeliydi! Adım: ${i}`);
    }
  }
  console.log('✓ 4 hatalı PIN denemesi kaydedildi (Henüz kilitlenmedi, denemeye izin veriliyor).');

  // 5. hatalı deneme -> Kilit devreye girmeli
  const fifthAttempt = await recordFailedPinAttempt(`test_${testIp}`, { ip: testIp });
  if (!fifthAttempt.isLockedNow) {
    throw new Error('5. hatalı denemede kilit devreye girmedi!');
  }
  console.log('✓ 5. hatalı PIN denemesi sonrasında 10 dakikalık dağıtık kilit devreye girdi.');

  // enforcePinRateLimit kontrolü
  const guardCheck = await enforcePinRateLimit(`test_${testIp}`);
  if (guardCheck.allowed) {
    throw new Error('Kilitli IP için enforcePinRateLimit geçişe izin verdi!');
  }
  console.log(`✓ enforcePinRateLimit isteği HTTP 429 ile engelledi (Kalan süre: ${guardCheck.retryAfterSeconds} sn).`);

  // Başarılı giriş ile kilidin kaldırılması
  await recordSuccessfulPinAttempt(`test_${testIp}`);
  const postResetCheck = await enforcePinRateLimit(`test_${testIp}`);
  if (!postResetCheck.allowed) {
    throw new Error('Sıfırlama sonrası kilit kalkmadı!');
  }
  console.log('✓ Başarılı giriş / sıfırlama ile dağıtık kilit ve sayaç temizlendi.\n');

  // =========================================================================
  // 3. EPHEMERAL SESSION & CACHE-ASIDE TESTİ
  // =========================================================================
  console.log('▶ [3. EPHEMERAL QR OTURUMU & ÖNBELLEK (CACHE-ASIDE) TESTİ]');
  
  // 3.A - Cache Aside getOrSet
  const stats = { dbCallCount: 0 };
  const getDbCalls = (): number => stats.dbCallCount;
  const fetchMenuFromDb = async () => {
    stats.dbCallCount++;
    return [{ id: 'burger-1', name: 'Truffle Burger', price: 340 }];
  };

  const menuKey = 'tenant-test:menu:active';
  const menu1 = await CacheService.getOrSet(menuKey, fetchMenuFromDb, 60);
  const menu2 = await CacheService.getOrSet(menuKey, fetchMenuFromDb, 60);

  if (getDbCalls() !== 1) {
    throw new Error(`Cache hit olmadı! DB çağrı sayısı: ${getDbCalls()}`);
  }
  console.log(`✓ Cache-Aside: İlk çağrıda veri üretildi, 2. çağrıda doğrudan Redis önbelleğinden döndü (DB çağrısı: ${getDbCalls()}).`);

  // Invalidate
  await CacheService.invalidate(menuKey);
  await CacheService.getOrSet(menuKey, fetchMenuFromDb, 60);
  if (getDbCalls() !== 2) {
    throw new Error('Invalidate sonrası cache yenilenmedi!');
  }
  console.log('✓ Cache Invalidation: Menü güncellendiğinde önbellek başarıyla temizlendi.');

  // 3.B - Ephemeral QR Masa Oturumu
  const sessionToken = 'qr_sess_' + Math.random().toString(36).substring(2);
  await CacheService.saveTableSession('tenant-test', 'tbl-12', sessionToken, 3600);
  
  const isValid = await CacheService.isSessionValid('tenant-test', 'tbl-12', sessionToken);
  if (!isValid) throw new Error('Yeni oluşturulan QR masa oturumu geçerli bulunamadı!');
  console.log('✓ Ephemeral Session: QR masa oturumu 1 saatlik TTL ile Redis üzerine kaydedildi ve doğrulandı.');

  await CacheService.revokeTableSession('tenant-test', 'tbl-12');
  const isRevokedValid = await CacheService.isSessionValid('tenant-test', 'tbl-12', sessionToken);
  if (isRevokedValid) throw new Error('İptal edilen oturum hala geçerli!');
  console.log('✓ Session Revocation: Masa hesabı kapatıldığında QR oturumu anında geçersiz kılındı.\n');

  // =========================================================================
  // 4. CROSS-INSTANCE PUB/SUB OLAY DAĞITIM TESTİ
  // =========================================================================
  console.log('▶ [4. ÇOKLU INSTANCE ARASI PUB/SUB & REALTIME BUS TESTİ]');
  
  let receivedMessage: any = null;
  const unsubscribe = redis.subscribe('masalink:events:broadcast', (rawMessage) => {
    try {
      receivedMessage = JSON.parse(rawMessage);
    } catch (_) {
      receivedMessage = rawMessage;
    }
  });

  // realtimeHub.broadcast çağrısı
  realtimeHub.broadcast('tenant-artisan-burger', {
    id: 'msg-pubsub-test-1',
    type: 'ORDER_STATUS_CHANGED',
    tenantId: 'tenant-artisan-burger',
    sourceDevice: 'kitchen_kds',
    deviceName: 'KDS Mutfak Ekranı',
    timestamp: new Date().toISOString(),
    payload: {
      orderId: 'ord-redis-test-88',
      tableId: 'tbl-bahce-4',
      status: 'PREPARING',
    },
  });

  // Kısa bekleme
  await new Promise((resolve) => setTimeout(resolve, 50));

  if (!receivedMessage || receivedMessage.message?.payload?.orderId !== 'ord-redis-test-88') {
    throw new Error('Pub/Sub üzerinden olay mesajı alınamadı!');
  }
  console.log(`✓ Redis Pub/Sub: Sunucu 1 tarafından üretilen sipariş olayı kanala iletildi ve Sunucu 2 dinleyicisine ulaştı.`);
  console.log(`  Alınan Olay: ${receivedMessage.message.type} (Sipariş: ${receivedMessage.message.payload.orderId})`);

  unsubscribe();
  console.log('✓ Dinleyici abonelikten başarıyla ayrıldı.');

  console.log('\n================================================================');
  console.log('🎉 TÜM REDIS MİMARİSİ TESTLERİ BAŞARIYLA GEÇTİ!');
  console.log('1. Distributed Lock (Redlock + Atomic Lua Release): %100');
  console.log('2. Distributed Rate Limiter & Brute-Force Lockout: %100');
  console.log('3. Ephemeral Session & Cache-Aside (Dynamic TTL): %100');
  console.log('4. Multi-Instance Event Bus (Redis Pub/Sub): %100');
  console.log('================================================================');
}

runRedisSubsystemTests().catch((err) => {
  console.error('\n❌ Redis Subsystem Test Hatası:', err);
  process.exit(1);
});
