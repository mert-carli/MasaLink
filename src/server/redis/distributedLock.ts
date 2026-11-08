import crypto from 'crypto';
import { redis } from './redisClient';

export interface DistributedLock {
  resourceKey: string;
  lockToken: string;
  engine: string;
  release: () => Promise<boolean>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Tek bir atomik deneme ile kilidi almaya çalışır (Beklemeden hemen döner)
 */
export async function tryAcquireDistributedLock(
  resourceKey: string,
  ttlMs = 5000
): Promise<
  | { acquired: true; lockToken: string; engine: string; release: () => Promise<boolean> }
  | { acquired: false; lockToken: null; engine: string; release: () => Promise<boolean> }
> {
  const lockKey = `masalink:lock:${resourceKey}`;
  const lockToken = `tok_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  const result = await redis.set(lockKey, lockToken, { nx: true, px: ttlMs });

  if (result === 'OK') {
    return {
      acquired: true,
      lockToken,
      engine: redis.getStatus().engine,
      release: async () => releaseDistributedLock(resourceKey, lockToken),
    };
  }

  return {
    acquired: false,
    lockToken: null,
    engine: redis.getStatus().engine,
    release: async () => false,
  };
}

/**
 * Güvenli Kilit Bırakma (Atomic Lua Script)
 * Sadece kilidi oluşturan token sahibi kilidi silebilir!
 */
export async function releaseDistributedLock(
  resourceKey: string,
  lockToken: string
): Promise<boolean> {
  const lockKey = `masalink:lock:${resourceKey}`;
  const unlockScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  const delResult = await redis.eval(unlockScript, [lockKey], [lockToken]);
  return delResult === 1;
}

/**
 * MasaLink Dağıtık Kilit Yöneticisi (Distributed Lock Engine)
 * 
 * Amaç: Birden fazla sunucu (Vercel serverless worker, Docker container, Kubernetes pod)
 * eşzamanlı olarak aynı masada ödeme almaya çalıştığında veya sipariş versiyonunu değiştirdiğinde,
 * tek bir sunucunun yerel Node.js Mutex'i yetersiz kalır.
 * 
 * Çözüm: Redis tabanlı SET key token NX PX {ttlMs} algoritması ve Lua güvenli kilit açma komutu.
 */
export async function acquireDistributedLock(
  resourceKey: string,
  ttlMs = 5000,
  maxWaitMs = 6000
): Promise<DistributedLock> {
  const startTime = Date.now();
  let backoffMs = 50;

  while (Date.now() - startTime < maxWaitMs) {
    const attempt = await tryAcquireDistributedLock(resourceKey, ttlMs);
    if (attempt.acquired) {
      return {
        resourceKey,
        lockToken: attempt.lockToken,
        engine: attempt.engine,
        release: attempt.release,
      };
    }

    // Kilit meşgul, üstel geri çekilme ile bekle ve tekrar dene
    await sleep(backoffMs);
    backoffMs = Math.min(200, Math.floor(backoffMs * 1.5));
  }

  throw new Error(`[DistributedLock] '${resourceKey}' kaynağı için kilit edinilemedi (Zaman aşımı: ${maxWaitMs}ms)!`);
}

/**
 * Bir görevi dağıtık kilit altında sıralı ve güvenli olarak çalıştırır.
 */
export async function withDistributedLock<T>(
  resourceKey: string,
  task: () => Promise<T>,
  ttlMs = 5000,
  maxWaitMs = 6000
): Promise<T> {
  const lock = await acquireDistributedLock(resourceKey, ttlMs, maxWaitMs);
  try {
    return await task();
  } finally {
    await lock.release();
  }
}
