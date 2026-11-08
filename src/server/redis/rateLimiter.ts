import { redis } from './redisClient';

export interface RateLimitCheckResult {
  allowed: boolean;
  currentCount: number;
  remainingCount: number;
  resetInSeconds: number;
  isLocked?: boolean;
}

/**
 * MasaLink Dağıtık Hız Sınırlayıcı (Distributed Rate Limiter)
 * 
 * Amaç: Farklı sunucular / IP'ler üzerinden gelen PIN brute-force denemelerini,
 * QR menü sipariş flood saldırılarını ve manager yetkilendirme isteklerini
 * merkezi Redis üzerinde atomik olarak sınırlandırmak.
 */
export class DistributedRateLimiter {
  /**
   * Belirtilen anahtar için sabit/kayan pencere hız sınırı denetimi
   */
  public static async checkRateLimit(
    key: string,
    maxRequests: number,
    windowSeconds: number
  ): Promise<RateLimitCheckResult> {
    const redisKey = `masalink:ratelimit:${key}`;

    const currentCount = await redis.incr(redisKey);
    if (currentCount === 1) {
      await redis.expire(redisKey, windowSeconds);
    }

    const remaining = Math.max(0, maxRequests - currentCount);
    const allowed = currentCount <= maxRequests;

    return {
      allowed,
      currentCount,
      remainingCount: remaining,
      resetInSeconds: windowSeconds,
    };
  }

  /**
   * PIN / Parola kaba kuvvet (Brute-Force) koruması:
   * 5 hatalı denemede 10 dakika (600 sn) global kilit koyar.
   */
  public static async recordFailedAttempt(
    key: string,
    maxAllowed = 5,
    lockoutDurationSeconds = 600
  ): Promise<{
    failures: number;
    isLocked: boolean;
    lockDurationSeconds: number;
  }> {
    const countKey = `masalink:lockout:count:${key}`;
    const lockKey = `masalink:lockout:active:${key}`;

    const failures = await redis.incr(countKey);
    if (failures === 1) {
      await redis.expire(countKey, lockoutDurationSeconds);
    }

    const isLocked = failures >= maxAllowed;
    if (isLocked) {
      await redis.set(lockKey, 'LOCKED', { ex: lockoutDurationSeconds });
    }

    return {
      failures,
      isLocked,
      lockDurationSeconds: lockoutDurationSeconds,
    };
  }

  /**
   * Kilitli olup olmadığını sorgular
   */
  public static async isLockoutActive(key: string): Promise<boolean> {
    const lockKey = `masalink:lockout:active:${key}`;
    const locked = await redis.get(lockKey);
    return locked === 'LOCKED';
  }

  /**
   * Kalan kilit süresini saniye cinsinden döndürür
   */
  public static async getLockoutRemaining(key: string): Promise<number> {
    const lockKey = `masalink:lockout:active:${key}`;
    const remaining = await redis.ttl(lockKey);
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Başarılı giriş sonrasında kilit ve sayaç durumunu sıfırlar
   */
  public static async resetLockout(key: string): Promise<void> {
    const countKey = `masalink:lockout:count:${key}`;
    const lockKey = `masalink:lockout:active:${key}`;
    await redis.del(countKey, lockKey);
  }

  public static async reset(key: string): Promise<void> {
    return this.resetLockout(key);
  }
}
