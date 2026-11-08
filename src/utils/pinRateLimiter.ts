import { NextRequest } from 'next/server';
import { DistributedRateLimiter } from '@/server/redis/rateLimiter';
import { prisma } from '@/server/db/prisma';

export interface PinRateLimitState {
  consecutiveFailures: number;
  lockedUntil?: number;
  lastAttemptAt: number;
}

const PIN_RATE_LIMIT_STORE = new Map<string, PinRateLimitState>();
const MAX_ALLOWED_FAILURES = 5;
const LOCKOUT_DURATION_MS = 10 * 60 * 1000; // 10 Dakika
let simulatedRedisOutage = false;

export function simulateRateLimiterRedisOutage(active: boolean): void {
  simulatedRedisOutage = active;
}

export function clearPinRateLimitStore(): void {
  PIN_RATE_LIMIT_STORE.clear();
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return '127.0.0.1';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 1. PIN / Giriş Denemesi Öncesi Kontrol:
 * - L1: Çoklu instance uyumlu Redis DistributedRateLimiter üzerinden kilit durumunu sorgular.
 * - L2: Redis kesintisinde PostgreSQL AuditLog üzerinden tüm podların ortak başarısızlık sayısını doğrular.
 * - L3: Production modunda Redis ve DB tamamen ulaşılamazsa güvenli fail-closed davranır.
 */
export async function enforcePinRateLimit(clientKey: string): Promise<{
  allowed: boolean;
  isLocked?: boolean;
  retryAfterSeconds?: number;
  error?: string;
}> {
  let redisFailure = simulatedRedisOutage;

  // 1. L1: Redis Dağıtık Kilit Denetimi
  if (!redisFailure) {
    try {
      const isLockedDistributed = await DistributedRateLimiter.isLockoutActive(clientKey);
      if (isLockedDistributed) {
        const remainingSeconds = (await DistributedRateLimiter.getLockoutRemaining(clientKey)) || 600;
        return {
          allowed: false,
          isLocked: true,
          retryAfterSeconds: remainingSeconds,
          error: `🚨 GÜVENLİK KİLİDİ: Art arda ${MAX_ALLOWED_FAILURES} hatalı PIN girildiği için erişim 10 dakika süreyle engellendi. Kalan süre: ${remainingSeconds} saniye.`,
        };
      }
    } catch (err) {
      redisFailure = true;
      console.warn('[pinRateLimiter] Dağıtık kilit sorgulama uyarısı:', err);
    }
  }

  // 2. L2: Redis Kesintisinde PostgreSQL Paylaşımlı Denetim (Multi-Pod Fallback)
  if (redisFailure && process.env.DATABASE_URL) {
    try {
      const tenMinutesAgo = new Date(Date.now() - 600 * 1000);
      const failCount = await prisma.auditLog.count({
        where: {
          action: 'AUTH_FAILED',
          entity: 'RATE_LIMIT',
          entityId: clientKey,
          createdAt: { gte: tenMinutesAgo },
        },
      });

      if (failCount >= MAX_ALLOWED_FAILURES) {
        return {
          allowed: false,
          isLocked: true,
          retryAfterSeconds: 600,
          error: `🚨 GÜVENLİK KİLİDİ: Art arda ${MAX_ALLOWED_FAILURES} hatalı deneme nedeniyle erişim 10 dakika süreyle engellendi.`,
        };
      }
    } catch (dbErr) {
      if (process.env.NODE_ENV === 'production') {
        // Production'da her iki katman da çökerse kaba kuvvet saldırısına karşı FAIL-CLOSED
        return {
          allowed: false,
          isLocked: true,
          retryAfterSeconds: 60,
          error: 'Güvenlik doğrulama altyapısı geçici olarak hizmet veremiyor. Lütfen bekleyiniz.',
        };
      }
    }
  }

  // 3. Bellek İçi Fallback Kontrolü (Yerel Pod)
  const state = PIN_RATE_LIMIT_STORE.get(clientKey);

  if (state && state.lockedUntil) {
    const now = Date.now();
    if (now < state.lockedUntil) {
      const remainingSeconds = Math.ceil((state.lockedUntil - now) / 1000);
      return {
        allowed: false,
        isLocked: true,
        retryAfterSeconds: remainingSeconds,
        error: `🚨 GÜVENLİK KİLİDİ: Art arda ${MAX_ALLOWED_FAILURES} hatalı PIN girildiği için erişim 10 dakika süreyle engellendi. Kalan süre: ${remainingSeconds} saniye.`,
      };
    } else {
      PIN_RATE_LIMIT_STORE.delete(clientKey);
    }
  }

  // Production ortamında Redis kapalıysa pod başına tolerans 2 denemeye düşürülür (Konservatif Savunma)
  if (redisFailure && process.env.NODE_ENV === 'production' && state && state.consecutiveFailures >= 2) {
    return {
      allowed: false,
      isLocked: true,
      retryAfterSeconds: 300,
      error: '🚨 GÜVENLİK KİLİDİ: Güvenli mod kapsamında çoklu başarısız deneme nedeniyle erişim geçici olarak durduruldu.',
    };
  }

  // Exponential Backoff (Yapay Gecikme)
  if (state && state.consecutiveFailures > 0) {
    const backoffMs = Math.min(4000, Math.pow(2, state.consecutiveFailures - 1) * 500);
    await sleep(backoffMs);
  }

  return { allowed: true };
}

/**
 * 2. Hatalı Giriş Kaydı:
 * - Redis kümesinde sayacı artırır.
 * - PostgreSQL AuditLog'a yazar (Redis çökse dahi podlar arası ortak sayaç).
 * - Yerel pod kopyasını günceller.
 */
export async function recordFailedPinAttempt(
  clientKey: string,
  meta?: { endpoint?: string; ip?: string }
): Promise<{
  failures: number;
  isLockedNow: boolean;
  lockDurationMinutes: number;
}> {
  let distributedFailures = 0;
  let distributedLocked = false;

  if (!simulatedRedisOutage) {
    try {
      const distResult = await DistributedRateLimiter.recordFailedAttempt(
        clientKey,
        MAX_ALLOWED_FAILURES,
        600
      );
      distributedFailures = distResult.failures;
      distributedLocked = distResult.isLocked;
    } catch (err) {
      console.warn('[pinRateLimiter] Dağıtık sayaç artırma uyarısı:', err);
    }
  }

  // PostgreSQL Paylaşımlı Kayıt (Multi-Pod güvencesi)
  if (process.env.DATABASE_URL) {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: 'system',
          action: 'AUTH_FAILED',
          entity: 'RATE_LIMIT',
          entityId: clientKey,
          metadata: meta ? (meta as any) : {},
        },
      });
    } catch (_) {}
  }

  const now = Date.now();
  let state = PIN_RATE_LIMIT_STORE.get(clientKey);

  if (!state) {
    state = {
      consecutiveFailures: 0,
      lastAttemptAt: now,
    };
    PIN_RATE_LIMIT_STORE.set(clientKey, state);
  }

  state.consecutiveFailures = Math.max(state.consecutiveFailures + 1, distributedFailures);
  state.lastAttemptAt = now;

  const isLockedNow = distributedLocked || state.consecutiveFailures >= MAX_ALLOWED_FAILURES;

  if (isLockedNow) {
    state.lockedUntil = now + LOCKOUT_DURATION_MS;

    try {
      const { realtimeHub } = await import('@/server/realtime/realtimeHub');
      realtimeHub.broadcast('all', {
        id: `evt_lockout_${now}`,
        type: 'SECURITY_LOCKOUT_TRIGGERED',
        tenantId: 'all',
        sourceDevice: 'server_guard',
        deviceName: 'PIN Rate Limiter',
        timestamp: new Date().toISOString(),
        payload: {
          clientKey,
          ip: meta?.ip || 'unknown',
          endpoint: meta?.endpoint || '/api/auth/verify-pin',
          consecutiveFailures: state.consecutiveFailures,
          lockedUntil: new Date(state.lockedUntil).toISOString(),
          lockDurationMinutes: 10,
        },
      });
    } catch (_) {}
  }

  return {
    failures: state.consecutiveFailures,
    isLockedNow,
    lockDurationMinutes: 10,
  };
}

/**
 * 3. Başarılı Doğrulama: Sayacı sıfırlar
 */
export async function recordSuccessfulPinAttempt(clientKey: string): Promise<void> {
  if (!simulatedRedisOutage) {
    try {
      await DistributedRateLimiter.resetLockout(clientKey);
    } catch (err) {
      console.warn('[pinRateLimiter] Dağıtık sayaç sıfırlama uyarısı:', err);
    }
  }

  PIN_RATE_LIMIT_STORE.delete(clientKey);

  try {
    const { realtimeHub } = await import('@/server/realtime/realtimeHub');
    realtimeHub.broadcast('all', {
      id: `evt_lock_clear_${Date.now()}`,
      type: 'SECURITY_LOCKOUT_CLEARED',
      tenantId: 'all',
      sourceDevice: 'server_guard',
      deviceName: 'PIN Rate Limiter',
      timestamp: new Date().toISOString(),
      payload: { clientKey },
    });
  } catch (_) {}
}
