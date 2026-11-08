import crypto from 'crypto';
import { redis } from '@/server/redis/redisClient';
import { prisma } from '@/server/db/prisma';
import { SubmitOrderResult } from '@/server/services/orderService';

export interface IdempotencyRecord<T = any> {
  key: string;
  tenantId: string;
  scope: string;
  payloadHash: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  response?: T;
  statusCode?: number;
  createdAt: number;
  expiresAt: number;
}

export type IdempotencyCheckResult<T = any> =
  | { state: 'NEW'; payloadHash: string }
  | { state: 'REPLAY'; cachedResponse: T; statusCode: number; payloadHash: string }
  | { state: 'IN_PROGRESS'; error: string; payloadHash: string }
  | { state: 'MISMATCH'; error: string; payloadHash: string; existingHash: string };

/**
 * Bellek içi yedek idempotency deposu
 */
const IN_MEMORY_IDEMPOTENCY_STORE = new Map<string, IdempotencyRecord>();
const IN_MEMORY_ORDER_FALLBACK = new Map<string, SubmitOrderResult>();

export class IdempotencyService {
  /**
   * Idempotency anahtarının UUID veya yüksek entropili güvenli string olduğunu doğrular
   */
  public static isValidKey(key: any): boolean {
    if (!key || typeof key !== 'string') return false;
    const trimmed = key.trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(trimmed) || (trimmed.length >= 16 && trimmed.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(trimmed));
  }

  /**
   * İstek gövdesinden (payload) deterministik ve kanonik SHA-256 özeti üretir
   */
  public static computePayloadHash(payload: any): string {
    if (payload === undefined || payload === null) {
      return crypto.createHash('sha256').update('').digest('hex');
    }

    const sortObjectKeys = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(sortObjectKeys);
      }
      if (obj !== null && typeof obj === 'object') {
        const sorted: Record<string, any> = {};
        Object.keys(obj)
          .sort()
          .forEach((k) => {
            sorted[k] = sortObjectKeys(obj[k]);
          });
        return sorted;
      }
      return obj;
    };

    const canonicalJson = JSON.stringify(sortObjectKeys(payload));
    return crypto.createHash('sha256').update(canonicalJson).digest('hex');
  }

  /**
   * Kompozit anahtar üretir: tenantId:scope:idempotencyKey
   */
  public static buildCompositeKey(tenantId: string, scope: string, idempotencyKey: string): string {
    return `${tenantId}:${scope}:${idempotencyKey.trim()}`;
  }

  /**
   * Evrensel Idempotency Denetimi ve Koruması:
   * 1. Anahtar daha önce aynı payload ile tamamlandıysa: 'REPLAY' döner.
   * 2. Anahtar aynı anda işleniyorsa: 'IN_PROGRESS' döner.
   * 3. Anahtar aynı fakat payload farklıysa: 'MISMATCH' (409 Conflict) döner.
   * 4. Yeni istek ise: Durumu atomik olarak 'IN_PROGRESS' yapar ve 'NEW' döner.
   */
  public static async checkOrAcquire<T = any>(params: {
    tenantId: string;
    scope: string;
    idempotencyKey: string;
    payload?: any;
    inProgressTtlMs?: number;
  }): Promise<IdempotencyCheckResult<T>> {
    const { tenantId, scope, idempotencyKey, payload, inProgressTtlMs = 60000 } = params;
    const compositeKey = this.buildCompositeKey(tenantId, scope, idempotencyKey);
    const payloadHash = this.computePayloadHash(payload);
    const now = Date.now();

    // 1. Redis'ten kontrol et
    const redisKey = `masalink:idem:${compositeKey}`;
    try {
      const cached = await redis.get(redisKey);
      if (cached) {
        const record = JSON.parse(cached) as IdempotencyRecord<T>;
        if (record.expiresAt && now > record.expiresAt) {
          // Süresi dolmuş
        } else if (record.payloadHash !== payloadHash) {
          return {
            state: 'MISMATCH',
            error: 'Aynı Idempotency-Key farklı bir istek içeriği ile tekrar kullanılamaz.',
            payloadHash,
            existingHash: record.payloadHash,
          };
        } else if (record.status === 'COMPLETED') {
          return {
            state: 'REPLAY',
            cachedResponse: record.response as T,
            statusCode: record.statusCode || 200,
            payloadHash,
          };
        } else if (record.status === 'IN_PROGRESS') {
          return {
            state: 'IN_PROGRESS',
            error: 'Bu işlem şu anda arka planda işlenmektedir. Lütfen bekleyiniz.',
            payloadHash,
          };
        }
      }
    } catch (_) {}

    // 2. Bellek İçi Kontrol
    const memRecord = IN_MEMORY_IDEMPOTENCY_STORE.get(compositeKey);
    if (memRecord) {
      if (memRecord.expiresAt && now > memRecord.expiresAt) {
        IN_MEMORY_IDEMPOTENCY_STORE.delete(compositeKey);
      } else if (memRecord.payloadHash !== payloadHash) {
        return {
          state: 'MISMATCH',
          error: 'Aynı Idempotency-Key farklı bir istek içeriği ile tekrar kullanılamaz.',
          payloadHash,
          existingHash: memRecord.payloadHash,
        };
      } else if (memRecord.status === 'COMPLETED') {
        return {
          state: 'REPLAY',
          cachedResponse: memRecord.response as T,
          statusCode: memRecord.statusCode || 200,
          payloadHash,
        };
      } else if (memRecord.status === 'IN_PROGRESS') {
        return {
          state: 'IN_PROGRESS',
          error: 'Bu işlem şu anda arka planda işlenmektedir. Lütfen bekleyiniz.',
          payloadHash,
        };
      }
    }

    // 3. Yeni işlem: 'IN_PROGRESS' olarak kilitle
    const inProgressRecord: IdempotencyRecord<T> = {
      key: idempotencyKey,
      tenantId,
      scope,
      payloadHash,
      status: 'IN_PROGRESS',
      createdAt: now,
      expiresAt: now + inProgressTtlMs,
    };

    IN_MEMORY_IDEMPOTENCY_STORE.set(compositeKey, inProgressRecord);
    try {
      await redis.set(redisKey, JSON.stringify(inProgressRecord), { px: inProgressTtlMs });
    } catch (_) {}

    return { state: 'NEW', payloadHash };
  }

  /**
   * İşlem tamamlandığında yanıtı ve durumu 'COMPLETED' olarak mühürler
   */
  public static async markCompleted<T = any>(params: {
    tenantId: string;
    scope: string;
    idempotencyKey: string;
    payload?: any;
    response: T;
    statusCode?: number;
    ttlSeconds?: number;
  }): Promise<void> {
    const { tenantId, scope, idempotencyKey, payload, response, statusCode = 200, ttlSeconds = 86400 } = params;
    const compositeKey = this.buildCompositeKey(tenantId, scope, idempotencyKey);
    const payloadHash = this.computePayloadHash(payload);
    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;

    const completedRecord: IdempotencyRecord<T> = {
      key: idempotencyKey,
      tenantId,
      scope,
      payloadHash,
      status: 'COMPLETED',
      response,
      statusCode,
      createdAt: now,
      expiresAt,
    };

    IN_MEMORY_IDEMPOTENCY_STORE.set(compositeKey, completedRecord);

    try {
      const redisKey = `masalink:idem:${compositeKey}`;
      await redis.set(redisKey, JSON.stringify(completedRecord), { ex: ttlSeconds });
    } catch (_) {}
  }

  /**
   * Hata durumunda in-progress kilidini temizler (istemci tekrar deneyebilsin)
   */
  public static async releaseKey(tenantId: string, scope: string, idempotencyKey: string): Promise<void> {
    const compositeKey = this.buildCompositeKey(tenantId, scope, idempotencyKey);
    IN_MEMORY_IDEMPOTENCY_STORE.delete(compositeKey);
    try {
      const redisKey = `masalink:idem:${compositeKey}`;
      await redis.del(redisKey);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // Geriye Dönük Uyumluluk (Legacy QR Order Desteği)
  // --------------------------------------------------------------------------

  /**
   * Önceden kaydedilmiş QR siparişini Redis, Veritabanı ve Bellekten sorgular
   */
  public static async getExistingQrOrder(
    tenantId: string,
    tableId: string,
    idempotencyKey: string,
    payload?: any
  ): Promise<SubmitOrderResult | null> {
    const compositeKey = this.buildCompositeKey(tenantId, tableId, idempotencyKey);

    // Yeni sistem denetimi
    if (payload !== undefined) {
      const check = await this.checkOrAcquire<SubmitOrderResult>({
        tenantId,
        scope: tableId,
        idempotencyKey,
        payload,
      });

      if (check.state === 'REPLAY') {
        return check.cachedResponse;
      }
      if (check.state === 'MISMATCH') {
        throw new Error('IDEMPOTENCY_PAYLOAD_MISMATCH');
      }
    }

    // 1. Redis Dağıtık Önbellek Denetimi
    try {
      const redisKey = `idempotency:qr:${compositeKey}`;
      const cached = await redis.get(redisKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed as SubmitOrderResult;
      }
    } catch (_) {}

    // 2. PostgreSQL Veritabanı Denetimi (Kalıcı Katman)
    if (process.env.DATABASE_URL) {
      try {
        const dbIdempotencyKey = `qr:${tableId}:${idempotencyKey.trim()}`;
        const existingOrder = await prisma.order.findFirst({
          where: {
            tenantId,
            tableId,
            idempotencyKey: dbIdempotencyKey,
          },
          include: { items: true },
        });

        if (existingOrder) {
          return {
            success: true,
            orderId: existingOrder.id,
            orderNumber: existingOrder.orderNumber,
            tableId: existingOrder.tableId || tableId,
            tableCode: existingOrder.tableId || tableId,
            tableVersion: 1,
            subtotal: Number(existingOrder.subtotal),
            total: Number(existingOrder.total),
            status: existingOrder.status as any,
            requiresWaiterApproval: false,
            items: existingOrder.items.map((it) => ({
              productId: it.productId || undefined,
              productName: it.productName,
              quantity: it.quantity,
              unitPrice: Number(it.unitPrice),
              lineTotal: Number(it.lineTotal),
              extras: (it as any).extras || [],
            })),
            customerNote: existingOrder.customerNote || undefined,
            timestamp: existingOrder.createdAt.toISOString(),
            persistedToDb: true,
          };
        }
      } catch (_) {}
    }

    // 3. Bellek İçi Depo Denetimi
    const mem = IN_MEMORY_IDEMPOTENCY_STORE.get(compositeKey);
    if (mem && mem.status === 'COMPLETED' && mem.response) {
      return mem.response as SubmitOrderResult;
    }
    return IN_MEMORY_ORDER_FALLBACK.get(compositeKey) || null;
  }

  /**
   * Başarılı sipariş sonucunu Redis, Bellek ve Idempotency katmanına mühürler
   */
  public static async saveQrOrder(
    tenantId: string,
    tableId: string,
    idempotencyKey: string,
    result: SubmitOrderResult,
    payload?: any
  ): Promise<void> {
    const compositeKey = this.buildCompositeKey(tenantId, tableId, idempotencyKey);

    IN_MEMORY_ORDER_FALLBACK.set(compositeKey, result);

    await this.markCompleted({
      tenantId,
      scope: tableId,
      idempotencyKey,
      payload,
      response: result,
      statusCode: 200,
    });

    try {
      const redisKey = `idempotency:qr:${compositeKey}`;
      await redis.set(redisKey, JSON.stringify(result), { ex: 86400 });
    } catch (_) {}
  }

  /**
   * Test simülasyonları için bellek içi depoyu temizler
   */
  public static clearMemoryStore(): void {
    IN_MEMORY_IDEMPOTENCY_STORE.clear();
    IN_MEMORY_ORDER_FALLBACK.clear();
  }
}
