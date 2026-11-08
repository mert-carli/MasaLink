/**
 * MasaLink Eşzamanlılık ve Yarış Durumu Kalkanı (Race Condition & Concurrency Guard)
 * 
 * 1. Distributed Pessimistic Lock (Upstash Redis SETNX PX veya Local Node Mutex)
 * 2. Optimistic Versioning: version alanı kontrolü (Lost Update / Stale Write koruması)
 * 3. Atomic Payment Ledger: Parçalı hesap ödemelerinde mükerrer tahsilat ve bakiye aşımı engeli
 */

import { acquireDistributedLock, getLockEngineStatus } from '@/utils/distributedLock';

export { getLockEngineStatus };

/**
 * Belirli bir masa için kritik işlemi sıralı (serialized) ve atomik olarak çalıştırır.
 * - Upstash Redis ortam değişkenleri tanımlıysa: Birden çok sunucu/Vercel serverless worker arasında SETNX kilidi kurar.
 * - Tanımlı değilse: Node.js yerel asenkron Mutex kuyruğunu kullanır.
 */
export async function withTableLock<T>(
  tableId: string,
  task: () => Promise<T>,
  timeoutMs = 6000
): Promise<T> {
  const lock = await acquireDistributedLock(tableId, timeoutMs, timeoutMs);

  try {
    const result = await task();
    return result;
  } finally {
    await lock.release();
  }
}

// 2. OPTIMISTIC LOCKING / VERSIONING (LOST UPDATE KORUMASI)
const TABLE_VERSIONS = new Map<string, number>();

export function getTableVersion(tableId: string): number {
  return TABLE_VERSIONS.get(tableId) || 1;
}

export function resetTableVersion(tableId: string): void {
  TABLE_VERSIONS.set(tableId, 1);
}

/**
 * Optimistic Version Kontrolü:
 * İstemci veriyi okuduğu andaki versiyon numarası (örn: v3) ile
 * sunucudaki güncel versiyon (v3) eşleşiyorsa versiyonu v4 yapar ve onaylar.
 * Eğer başka bir cihaz araya girip v4 yaptıysa, istek HTTP 409 Conflict ile reddedilir.
 */
export function verifyAndIncrementVersion(
  tableId: string,
  clientVersion?: number
): { success: boolean; currentVersion: number; newVersion: number } {
  const current = TABLE_VERSIONS.get(tableId) || 1;

  if (clientVersion !== undefined && clientVersion !== current) {
    return {
      success: false,
      currentVersion: current,
      newVersion: current,
    };
  }

  const next = current + 1;
  TABLE_VERSIONS.set(tableId, next);
  return {
    success: true,
    currentVersion: current,
    newVersion: next,
  };
}

// 3. ATOMIC PAYMENT LEDGER (PARÇALI HESAP / BAKİYE AŞIMI KORUMASI)
interface TableLedger {
  totalAmount: number;
  paidAmount: number;
  lastPaymentAt: number;
}

const ATOMIC_LEDGERS = new Map<string, TableLedger>();

/**
 * Eşzamanlı parçalı ödemelerde bakiye aşımı kontrolü (Overpayment / Double-Spend Guard).
 * İki müşteri aynı anda kredi kartı çektiğinde, kalan tutardan fazlasının çekilmesini engeller.
 */
export function recordAtomicPartialPayment(
  tableId: string,
  totalAmount: number,
  paymentAmount: number
): {
  success: boolean;
  remaining: number;
  paidSoFar: number;
  error?: string;
} {
  let ledger = ATOMIC_LEDGERS.get(tableId);
  if (!ledger) {
    ledger = {
      totalAmount,
      paidAmount: 0,
      lastPaymentAt: Date.now(),
    };
    ATOMIC_LEDGERS.set(tableId, ledger);
  }

  // Eğer toplam tutar değiştiyse güncelle
  ledger.totalAmount = totalAmount;

  const potentialPaid = ledger.paidAmount + paymentAmount;
  const remaining = Math.max(0, ledger.totalAmount - potentialPaid);

  // Kalan tutardan fazlası ödenmeye çalışılıyorsa reddet (Kuruş hassasiyeti)
  if (potentialPaid > ledger.totalAmount + 0.01) {
    return {
      success: false,
      remaining: Math.max(0, ledger.totalAmount - ledger.paidAmount),
      paidSoFar: ledger.paidAmount,
      error: `Bakiye aşımı tespit edildi! Kalan ödenecek tutar: ₺${(ledger.totalAmount - ledger.paidAmount).toFixed(2)}, talep edilen: ₺${paymentAmount.toFixed(2)}.`,
    };
  }

  ledger.paidAmount = potentialPaid;
  ledger.lastPaymentAt = Date.now();

  return {
    success: true,
    remaining,
    paidSoFar: ledger.paidAmount,
  };
}

/**
 * Masa kapandığında ledger kaydını temizle
 */
export function clearTableLedger(tableId: string): void {
  ATOMIC_LEDGERS.delete(tableId);
  TABLE_VERSIONS.delete(tableId);
}
