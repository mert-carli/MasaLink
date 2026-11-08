/**
 * MasaLink Distributed Lock Bridge
 * 
 * Veritabanının yerine DEĞİL; çoklu instance'lar arasında masa ve ödeme işlemlerinde
 * yarış durumlarını (Race Condition) önlemek için Redis SETNX/PX kilidi kullanır.
 */

import { acquireDistributedLock as coreAcquire } from '@/server/redis/distributedLock';
import { redis } from '@/server/redis/redisClient';

export interface DistributedLockResult {
  acquired: boolean;
  lockToken: string;
  release: () => Promise<void>;
  engine: 'Upstash_Redis' | 'Local_Node_Mutex';
}

export async function acquireDistributedLock(
  resourceKey: string,
  ttlMs = 5000,
  maxWaitMs = 6000
): Promise<DistributedLockResult> {
  const lock = await coreAcquire(resourceKey, ttlMs, maxWaitMs);
  const status = redis.getStatus();

  return {
    acquired: true,
    lockToken: lock.lockToken,
    engine: status.engine === 'Upstash_REST' ? 'Upstash_Redis' : 'Local_Node_Mutex',
    release: async () => {
      await lock.release();
    },
  };
}

export function getLockEngineStatus(): {
  isDistributed: boolean;
  engine: 'Upstash_Redis' | 'Local_Node_Mutex';
  upstashConfigured: boolean;
} {
  const status = redis.getStatus();
  const isDistributed = status.engine !== 'In_Memory_Fallback';
  return {
    isDistributed,
    engine: isDistributed ? 'Upstash_Redis' : 'Local_Node_Mutex',
    upstashConfigured: isDistributed,
  };
}
