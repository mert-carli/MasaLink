import crypto from 'crypto';

export type RedisEngineType = 'Upstash_REST' | 'Redis_TCP' | 'In_Memory_Fallback';

export interface SetOptions {
  ex?: number; // Expiry in seconds
  px?: number; // Expiry in milliseconds
  nx?: boolean; // Only set if key does not exist
  xx?: boolean; // Only set if key already exists
}

export interface RedisStatus {
  engine: RedisEngineType;
  connected: boolean;
  activeKeyCount: number;
  pubSubChannelsCount: number;
}

type PubSubListener = (message: string, channel: string) => void;

interface MemoryEntry {
  value: string;
  expiresAt: number | null; // Timestamp in ms
}

/**
 * MasaLink Birleşik Redis İstemcisi (Unified Redis Service)
 * 
 * Veritabanının yerine DEĞİL; yalnızca:
 * 1. Distributed Lock (Çoklu instance yarış durumları ve atomik masa kilitleri)
 * 2. Distributed Rate Limit (Brute-force PIN koruması, DDoS ve QR flood engeli)
 * 3. Ephemeral Session / Cache (Menü önbelleği, geçici QR masa oturumları)
 * 4. Pub/Sub (Farklı Node.js sunucuları arasında anlık SSE olay dağıtımı)
 * için kullanılır.
 */
class MasaLinkRedisClient {
  private engine: RedisEngineType = 'In_Memory_Fallback';
  private memoryStore = new Map<string, MemoryEntry>();
  private pubsubListeners = new Map<string, Set<PubSubListener>>();
  private upstashUrl: string | undefined;
  private upstashToken: string | undefined;

  constructor() {
    this.upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    this.upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (this.upstashUrl && this.upstashToken) {
      this.engine = 'Upstash_REST';
    } else {
      this.engine = 'In_Memory_Fallback';
    }

    // Bellek temizleme zamanlayıcısı (Süresi dolmuş anahtarları süpürür)
    if (typeof setInterval !== 'undefined') {
      const timer = setInterval(() => {
        this.sweepExpiredKeys();
      }, 30000);
      if (timer && typeof (timer as any).unref === 'function') {
        (timer as any).unref();
      }
    }
  }

  private sweepExpiredKeys() {
    const now = Date.now();
    this.memoryStore.forEach((entry, key) => {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.memoryStore.delete(key);
      }
    });
  }

  /**
   * Upstash REST API komutu çalıştırıcı (HTTP tabanlı sıfır bağımlılık)
   */
  private async executeUpstashCommand(command: (string | number)[]): Promise<any> {
    if (!this.upstashUrl || !this.upstashToken) return null;
    try {
      const res = await fetch(this.upstashUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.upstashToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.result;
    } catch (err) {
      console.warn('[RedisClient] Upstash hatası, yerel bellek kullanılıyor:', err);
      return null;
    }
  }

  public async get(key: string): Promise<string | null> {
    if (this.engine === 'Upstash_REST') {
      const val = await this.executeUpstashCommand(['GET', key]);
      if (val !== null) return val ? String(val) : null;
    }

    // In-memory fallback
    const entry = this.memoryStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.memoryStore.delete(key);
      return null;
    }
    return entry.value;
  }

  public async set(key: string, value: string, options?: SetOptions): Promise<string | null> {
    const ttlMs = options?.px ?? (options?.ex ? options.ex * 1000 : undefined);

    if (this.engine === 'Upstash_REST') {
      const cmd: (string | number)[] = ['SET', key, value];
      if (options?.nx) cmd.push('NX');
      if (options?.xx) cmd.push('XX');
      if (options?.ex) {
        cmd.push('EX', options.ex);
      } else if (options?.px) {
        cmd.push('PX', options.px);
      }
      const res = await this.executeUpstashCommand(cmd);
      if (res !== null) return res;
    }

    // In-memory fallback (Atomic SET NX/PX simulation)
    const existing = this.memoryStore.get(key);
    const isExpired = existing?.expiresAt ? Date.now() > existing.expiresAt : false;
    const exists = existing && !isExpired;

    if (options?.nx && exists) {
      return null; // Anahtar zaten var, set edilmedi
    }
    if (options?.xx && !exists) {
      return null; // Anahtar yok, xx kuralı gereği set edilmedi
    }

    const expiresAt = ttlMs ? Date.now() + ttlMs : null;
    this.memoryStore.set(key, { value, expiresAt });
    return 'OK';
  }

  public async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;

    if (this.engine === 'Upstash_REST') {
      const res = await this.executeUpstashCommand(['DEL', ...keys]);
      if (res !== null) return Number(res);
    }

    let deleted = 0;
    for (const key of keys) {
      if (this.memoryStore.delete(key)) deleted++;
    }
    return deleted;
  }

  public async incr(key: string): Promise<number> {
    if (this.engine === 'Upstash_REST') {
      const res = await this.executeUpstashCommand(['INCR', key]);
      if (res !== null) return Number(res);
    }

    const currentVal = await this.get(key);
    const num = currentVal ? parseInt(currentVal, 10) || 0 : 0;
    const nextVal = num + 1;

    const entry = this.memoryStore.get(key);
    this.memoryStore.set(key, {
      value: String(nextVal),
      expiresAt: entry ? entry.expiresAt : null,
    });
    return nextVal;
  }

  public async expire(key: string, seconds: number): Promise<number> {
    if (this.engine === 'Upstash_REST') {
      const res = await this.executeUpstashCommand(['EXPIRE', key, seconds]);
      if (res !== null) return Number(res);
    }

    const entry = this.memoryStore.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  public async ttl(key: string): Promise<number> {
    if (this.engine === 'Upstash_REST') {
      const res = await this.executeUpstashCommand(['TTL', key]);
      if (res !== null) return Number(res);
    }

    const entry = this.memoryStore.get(key);
    if (!entry) return -2;
    if (!entry.expiresAt) return -1;
    const remainingMs = entry.expiresAt - Date.now();
    if (remainingMs <= 0) {
      this.memoryStore.delete(key);
      return -2;
    }
    return Math.ceil(remainingMs / 1000);
  }

  public async eval(script: string, keys: string[], args: (string | number)[]): Promise<any> {
    if (this.engine === 'Upstash_REST') {
      const res = await this.executeUpstashCommand(['EVAL', script, keys.length, ...keys, ...args]);
      if (res !== null) return res;
    }

    // Lua Kilit Simülasyonu: "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"
    if (script.includes('get') && script.includes('del')) {
      const key = keys[0];
      const expectedToken = String(args[0]);
      const current = await this.get(key);
      if (current === expectedToken) {
        await this.del(key);
        return 1;
      }
      return 0;
    }

    return null;
  }

  // =========================================================================
  // PUB / SUB (Çoklu Sunucular Arası Olay Dağıtımı)
  // =========================================================================
  public async publish(channel: string, message: string): Promise<number> {
    if (this.engine === 'Upstash_REST') {
      await this.executeUpstashCommand(['PUBLISH', channel, message]);
    }

    // Yerel dinleyicilere ilet
    const listeners = this.pubsubListeners.get(channel);
    if (!listeners || listeners.size === 0) return 0;

    listeners.forEach((cb) => {
      try {
        cb(message, channel);
      } catch (err) {
        console.warn(`[Redis PubSub] Listener hatası (${channel}):`, err);
      }
    });
    return listeners.size;
  }

  public subscribe(channel: string, callback: PubSubListener): () => void {
    if (!this.pubsubListeners.has(channel)) {
      this.pubsubListeners.set(channel, new Set());
    }
    this.pubsubListeners.get(channel)!.add(callback);

    return () => {
      const listeners = this.pubsubListeners.get(channel);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.pubsubListeners.delete(channel);
        }
      }
    };
  }

  public getStatus(): RedisStatus {
    return {
      engine: this.engine,
      connected: true,
      activeKeyCount: this.memoryStore.size,
      pubSubChannelsCount: this.pubsubListeners.size,
    };
  }
}

// Global Singleton (Next.js Hot-Reload Korumalı)
const globalForRedis = globalThis as unknown as { __masalinkRedisClient?: MasaLinkRedisClient };

export const redis = globalForRedis.__masalinkRedisClient ?? new MasaLinkRedisClient();

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.__masalinkRedisClient = redis;
}
