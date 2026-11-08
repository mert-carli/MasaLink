import crypto from 'crypto';

export interface TableSessionRecord {
  tableId: string;
  tenantSlug: string;
  token: string;
  status: 'active' | 'revoked';
  createdAt: number;
  revokedAt?: number;
}

// In-memory registry (üretimde Redis / PostgreSQL table_sessions tablosu)
const TABLE_SESSIONS_MAP = new Map<string, TableSessionRecord>();

export function normalizeKey(tenantSlug: string, tableId: string): string {
  if (!tenantSlug || tenantSlug.trim() === '') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[GÜVENLİK KRİTİK] tenantSlug boş olamaz (Fail-Closed default tenant koruması).');
    }
  }
  const cleanSlug = (tenantSlug || 'artisan-burger').replace(/^tenant-/, '');
  return `${cleanSlug}:${tableId}`;
}

// Başlangıçta masalar için 128-bit yüksek entropili güvenli token'lar üret
const INITIAL_TABLE_IDS = [
  'tbl-1', 'tbl-2', 'tbl-3', 'tbl-4', 'tbl-5', 'tbl-6', 'tbl-7', 'tbl-8',
  'tbl-9', 'tbl-10', 'tbl-11', 'tbl-12', 'tbl-13', 'tbl-14', 'tbl-15', 'tbl-16'
];

INITIAL_TABLE_IDS.forEach((tblId) => {
  const entropy = crypto.randomBytes(16).toString('hex'); // 128-bit kriptografik rastgelelik
  const key = normalizeKey('artisan-burger', tblId);
  TABLE_SESSIONS_MAP.set(key, {
    tableId: tblId,
    tenantSlug: 'artisan-burger',
    token: `mst_${entropy}`,
    status: 'active',
    createdAt: Date.now(),
  });
});

/**
 * Masanın o anki 128-bit oturum token'ını döner.
 */
export function getActiveTableToken(tenantSlug: string, tableId: string): string {
  const key = normalizeKey(tenantSlug, tableId);
  let session = TABLE_SESSIONS_MAP.get(key);

  if (!session) {
    const entropy = crypto.randomBytes(16).toString('hex');
    session = {
      tableId,
      tenantSlug: tenantSlug.replace(/^tenant-/, ''),
      token: `mst_${entropy}`,
      status: 'active',
      createdAt: Date.now(),
    };
    TABLE_SESSIONS_MAP.set(key, session);
  }

  return session.token;
}

/**
 * Token Denetimi (Token Enumeration & Guessing Savunması)
 * Sıralı veya tahmin edilmiş token'ları (tok_demo_13 vb.) reddeder.
 */
export function validateTableSessionToken(
  tenantSlug: string,
  tableId: string,
  token: string | undefined | null
): { valid: boolean; reason?: string } {
  // Demo simülatör toleransı (Yalnızca development/test ortamında)
  if (process.env.NODE_ENV !== 'production' && token && token.startsWith('tok_demo_')) {
    return { valid: true };
  }

  if (!token) {
    return {
      valid: false,
      reason: 'Masa oturum tokenı eksik. Lütfen masadaki orijinal QR kodu okutun.',
    };
  }

  const key = normalizeKey(tenantSlug, tableId);
  const currentSession = TABLE_SESSIONS_MAP.get(key);

  if (!currentSession) {
    return {
      valid: false,
      reason: 'Bu masaya ait aktif bir oturum bulunamadı.',
    };
  }

  if (currentSession.status === 'revoked') {
    return {
      valid: false,
      reason: 'Bu masanın oturumu kapatılmıştır (Revoked). Lütfen garsonunuzdan yeni masa açmasını isteyin.',
    };
  }

  if (currentSession.token !== token) {
    return {
      valid: false,
      reason: 'Geçersiz veya süresi dolmuş masa tokenı (Token Enumeration Engellendi).',
    };
  }

  return { valid: true };
}

/**
 * Kasa hesabı kapattığında masanın token'ını anında iptal eder (Revocation).
 * Eski müşterinin masadan ayrıldıktan sonra evinden sipariş göndermesini engeller.
 */
export function revokeTableSession(tenantSlug: string, tableId: string): void {
  const key = normalizeKey(tenantSlug, tableId);
  const session = TABLE_SESSIONS_MAP.get(key);
  if (session) {
    session.status = 'revoked';
    session.revokedAt = Date.now();
    console.log(`[Token Revocation] Masa '${tableId}' oturumu iptal edildi (Key: ${key}). Eski token geçersiz.`);
  }
}

/**
 * Yeni misafir oturduğunda veya temizlik bittiğinde yepyeni bir 128-bit token üretir.
 */
export function refreshTableSession(tenantSlug: string, tableId: string): string {
  const key = normalizeKey(tenantSlug, tableId);
  const entropy = crypto.randomBytes(16).toString('hex');
  const cleanSlug = tenantSlug.replace(/^tenant-/, '');
  const newSession: TableSessionRecord = {
    tableId,
    tenantSlug: cleanSlug,
    token: `mst_${entropy}`,
    status: 'active',
    createdAt: Date.now(),
  };
  TABLE_SESSIONS_MAP.set(key, newSession);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Token Refresh] Masa '${tableId}' için yeni token üretildi (Geliştirme Modu)`);
  }
  return newSession.token;
}
