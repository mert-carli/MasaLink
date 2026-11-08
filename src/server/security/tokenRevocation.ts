import { redis } from '@/server/redis/redisClient';
import { prisma } from '@/server/db/prisma';
import crypto from 'crypto';
import { verifySignedSessionToken } from '@/utils/tenantAuth';

/**
 * Hibrit JWT / Session Revocation Servisi
 * 
 * Çift Katmanlı Mimari (L1 Redis + L2 Persistent Fallback):
 * 1. L1: Dağıtık Redis Cache (Mikrosaniye seviyesinde yüksek performanslı kontrol).
 * 2. L2: Veritabanı ve Yerel Güvenlik Kalkanı.
 * 
 * ⚠️ Redis Fail-Closed Tasarımı:
 * - Production çoklu pod ortamında Redis kesintiye uğrarsa veya ulaşılamazsa,
 *   sistem rastgele fail-open davranıp başka podda iptal edilmiş token'ı GEÇERLİ SAYMAZ!
 * - L2 PostgreSQL üzerinden oturum ve kullanıcı güncelleme zaman damgası (`updatedAt`) denetlenir.
 * - Dağıtık denetim tamamen başarısız olursa ve oturumun geçerliliği garanti edilemiyorsa,
 *   üretim ortamında Fail-Closed prensibiyle işlem reddedilir.
 */
export class TokenRevocationService {
  private static simulatedRedisOutage = false;
  private static localMemoryBlacklist = new Set<string>();
  private static localUserVersions = new Map<string, number>();

  /**
   * Testler için Redis kesintisi simülasyonunu açar/kapatır
   */
  public static simulateRedisOutage(active: boolean): void {
    this.simulatedRedisOutage = active;
  }

  public static isRedisOutageSimulated(): boolean {
    return this.simulatedRedisOutage;
  }

  private static getTokenHash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Belirli bir tekil oturum token'ını kara listeye alır (Logout)
   */
  static async revoke(token: string, expirySeconds: number = 43200): Promise<void> {
    if (!token) return;
    const tokenHash = this.getTokenHash(token);
    const key = `revoked_token:${tokenHash}`;

    // Yerel kopyaya yaz
    this.localMemoryBlacklist.add(tokenHash);

    // 1. L1: Redis'e yaz
    if (!this.simulatedRedisOutage) {
      try {
        await redis.set(key, 'revoked', { ex: Math.max(60, expirySeconds) });
      } catch (err) {
        console.warn('[TokenRevocationService] Redis revoke yazma hatası:', err);
      }
    }

    // 2. L2: PostgreSQL Denetim Kaydı (Redis çökse dahi tüm podların okuyabileceği kalıcı iz)
    if (process.env.DATABASE_URL) {
      try {
        await prisma.auditLog.create({
          data: {
            tenantId: 'system',
            action: 'TOKEN_REVOKED',
            entity: 'AUTH_TOKEN',
            entityId: tokenHash,
            metadata: {
              revokedAt: new Date().toISOString(),
              expirySeconds,
            },
          },
        });
      } catch (dbErr) {
        console.warn('[TokenRevocationService] DB audit revoke kaydı uyarısı:', dbErr);
      }
    }
  }

  /**
   * Kullanıcının güncel oturum versiyon numarasını getirir
   */
  static async getUserTokenVersion(userId: string): Promise<number> {
    if (!userId) return 1;

    if (!this.simulatedRedisOutage) {
      try {
        const val = await redis.get(`user_version:${userId}`);
        if (val) return parseInt(val, 10);
      } catch (_) {}
    }

    return this.localUserVersions.get(userId) || 1;
  }

  /**
   * Kullanıcının tüm cihazlardaki oturumlarını anında geçersiz kılar
   * (PIN / Şifre sıfırlama, Rol değişikliği veya Kullanıcı pasifleştirme anında tetiklenir)
   */
  static async invalidateAllUserSessions(userId: string): Promise<number> {
    if (!userId) return 1;
    const current = await this.getUserTokenVersion(userId);
    const newVersion = current + 1;

    // Yerel versiyonu güncelle
    this.localUserVersions.set(userId, newVersion);

    // 1. L1: Redis versiyonunu güncelle
    if (!this.simulatedRedisOutage) {
      try {
        await redis.set(`user_version:${userId}`, String(newVersion), { ex: 30 * 86400 });
      } catch (err) {
        console.warn('[TokenRevocationService] Redis version güncelleme hatası:', err);
      }
    }

    // 2. L2: PostgreSQL User updatedAt güncellemesi (Tüm podlar için kalıcı oturum geçersiz kılma)
    if (process.env.DATABASE_URL) {
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { updatedAt: new Date() },
        });
      } catch (dbErr) {
        console.warn('[TokenRevocationService] DB user updatedAt güncelleme hatası:', dbErr);
      }
    }

    return newVersion;
  }

  /**
   * Token'ın veya oturumun geçersiz olup olmadığını kontrol eder (Fail-Closed Güvenceli)
   */
  static async isRevoked(
    token: string,
    payload?: { userId?: string; tokenVersion?: number; issuedAt?: number }
  ): Promise<boolean> {
    if (!token) return true;
    const tokenHash = this.getTokenHash(token);

    // 1. Bu podun yerel kara listesinde varsa anında reddet
    if (this.localMemoryBlacklist.has(tokenHash)) {
      return true;
    }

    // Payload verilmediyse token'dan güvenle çözümle
    let effectivePayload = payload;
    if (!effectivePayload && typeof token === 'string' && token.includes('.')) {
      try {
        const decoded = verifySignedSessionToken(token);
        if (decoded) {
          effectivePayload = {
            userId: decoded.userId,
            tokenVersion: decoded.tokenVersion,
            issuedAt: decoded.issuedAt,
          };
        }
      } catch (_) {}
    }

    // 2. L1: Redis Kontrolü (Redis ulaşılabiliyorsa)
    let redisFailure = this.simulatedRedisOutage;
    if (!redisFailure) {
      try {
        const revokedKey = `revoked_token:${tokenHash}`;
        const isExplicitlyRevoked = await redis.get(revokedKey);
        if (isExplicitlyRevoked === 'revoked') {
          return true;
        }

        if (effectivePayload && effectivePayload.userId && typeof effectivePayload.tokenVersion === 'number') {
          const currentVersion = await this.getUserTokenVersion(effectivePayload.userId);
          if (effectivePayload.tokenVersion < currentVersion) {
            return true;
          }
        }
        return false;
      } catch (err) {
        redisFailure = true;
      }
    }

    // 3. L2: Redis Kesintisinde PostgreSQL Kalıcı Doğrulama (Multi-Pod Fail-Closed Kalkanı)
    if (process.env.DATABASE_URL) {
      try {
        // A. Tekil token kara liste DB kontrolü
        const revokedAudit = await prisma.auditLog.findFirst({
          where: {
            action: 'TOKEN_REVOKED',
            entity: 'AUTH_TOKEN',
            entityId: tokenHash,
          },
        });
        if (revokedAudit) {
          return true;
        }

        // B. Kullanıcı şifre/yetki değişim DB kontrolü
        if (effectivePayload && effectivePayload.userId) {
          const dbUser = await prisma.user.findUnique({
            where: { id: effectivePayload.userId },
            select: { isActive: true, updatedAt: true },
          });

          if (!dbUser || !dbUser.isActive) {
            return true; // Kullanıcı pasife alınmış veya silinmiş
          }

          // Eğer token veriliş tarihi kullanıcının son güncellenme tarihinden eskiyse oturum düşürülmüştür
          if (effectivePayload.issuedAt && dbUser.updatedAt.getTime() > effectivePayload.issuedAt + 1000) {
            return true;
          }
        }

        return false;
      } catch (dbErr) {
        // Hem Redis hem Veritabanı ulaşılamıyorsa:
        if (process.env.NODE_ENV === 'production') {
          // ⚠️ Production Güvenlik İlkesi: Oturumun geçerliliği kanıtlanamadığında FAIL-CLOSED davran
          console.error('[GÜVENLİK KRİTİK] Revocation kontrolü servis kesintisi nedeniyle FAIL-CLOSED uygulandı.');
          return true;
        }
      }
    }

    // 4. Test ve Development Ortamında: Redis kapalıysa yerel depoya bak
    if (effectivePayload && effectivePayload.userId && typeof effectivePayload.tokenVersion === 'number') {
      const localVer = this.localUserVersions.get(effectivePayload.userId) || 1;
      if (effectivePayload.tokenVersion < localVer) {
        return true;
      }
    }

    // Production modunda Redis kesintisi varsa ve DB yoksa kesinlikle fail-closed
    if (process.env.NODE_ENV === 'production' && redisFailure) {
      return true;
    }

    return false;
  }

  /**
   * Testler için tüm yerel belleği temizler
   */
  public static clearLocalStore(): void {
    this.localMemoryBlacklist.clear();
    this.localUserVersions.clear();
  }
}
