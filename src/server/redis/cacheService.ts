import { redis } from './redisClient';

/**
 * MasaLink Geçici Önbellek ve Oturum Yöneticisi (Ephemeral Cache & Session Service)
 * 
 * Veritabanının yerine DEĞİL; yalnızca:
 * - Menü ve fiyat sorgularını hızlandırmak (TTL: 60 saniye)
 * - Masanın QR oturum belirtecini (Token) anında doğrulamak
 * - Hesap kapatıldığında veya hayalet masa algılandığında oturumu milisaniyeler içinde iptal etmek (Revocation)
 * için kullanılır.
 */
export class CacheService {
  public static async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  public static async set(key: string, value: any, ttlSeconds = 60): Promise<void> {
    try {
      const raw = JSON.stringify(value);
      await redis.set(key, raw, { ex: ttlSeconds });
    } catch (err) {
      console.warn(`[CacheService] set hatası (${key}):`, err);
    }
  }

  public static async del(...keys: string[]): Promise<number> {
    return await redis.del(...keys);
  }

  public static async invalidate(...keys: string[]): Promise<number> {
    return await redis.del(...keys);
  }

  /**
   * Cache-Aside Deseni: Önbellekte varsa döner, yoksa fetcher ile hesaplayıp önbelleğe yazar
   */
  public static async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds = 60
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const fresh = await fetcher();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  // =========================================================================
  // EPHEMERAL QR TABLE SESSIONS (Geçici Masa Oturumları)
  // =========================================================================
  public static async saveTableSession(
    tenantId: string,
    tableId: string,
    token: string,
    ttlSeconds = 14400 // 4 saat
  ): Promise<void> {
    const key = `masalink:session:${tenantId}:${tableId}`;
    await redis.set(key, token, { ex: ttlSeconds });

    // Çift yönlü arama için ters indeks
    const revKey = `masalink:token:${token}`;
    await redis.set(revKey, `${tenantId}:${tableId}`, { ex: ttlSeconds });
  }

  public static async isSessionValid(tenantId: string, tableId: string, token: string): Promise<boolean> {
    const key = `masalink:session:${tenantId}:${tableId}`;
    const storedToken = await redis.get(key);
    return storedToken === token;
  }

  public static async revokeTableSession(tenantId: string, tableId: string): Promise<void> {
    const key = `masalink:session:${tenantId}:${tableId}`;
    const storedToken = await redis.get(key);
    if (storedToken) {
      const revKey = `masalink:token:${storedToken}`;
      await redis.del(revKey);
    }
    await redis.del(key);
  }
}
