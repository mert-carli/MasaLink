function getRandomHex(bytesCount: number): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const arr = new Uint8Array(bytesCount);
    globalThis.crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Array.from({ length: bytesCount * 2 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

let devJwtSecret: string | null = null;
let devSyncKey: string | null = null;
let devBridgeSecret: string | null = null;

/**
 * JWT Oturum İmzası Gizli Anahtarı.
 * Production ortamında eksikse sunucunun başlamasını engeller (Fail-Closed).
 * Geliştirme ortamında asla sabit/tahmin edilebilir metin kullanmaz; rastgele 256-bit üretir.
 */
export function getJwtSecret(): string {
  const envSecret = process.env.MASALINK_JWT_SECRET;
  if (envSecret && envSecret.trim().length >= 32) {
    return envSecret.trim();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[GÜVENLİK KRİTİK] Production ortamında MASALINK_JWT_SECRET tanımlanmalıdır (minimum 32 karakter)!'
    );
  }

  if (!devJwtSecret) {
    devJwtSecret = getRandomHex(32);
    console.warn(
      '⚠️ [Güvenlik Uyarısı] MASALINK_JWT_SECRET ortam değişkeni bulunamadı. Geliştirme için geçici rastgele anahtar üretildi.'
    );
  }
  return devJwtSecret;
}

/**
 * Mikroservisler ve İç Senkronizasyon Anahtarı.
 */
export function getInternalSyncKey(): string {
  const envKey = process.env.MASALINK_INTERNAL_SYNC_KEY;
  if (envKey && envKey.trim().length >= 32) {
    return envKey.trim();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[GÜVENLİK KRİTİK] Production ortamında MASALINK_INTERNAL_SYNC_KEY tanımlanmalıdır (minimum 32 karakter)!'
    );
  }

  if (!devSyncKey) {
    devSyncKey = getRandomHex(32);
    console.warn(
      '⚠️ [Güvenlik Uyarısı] MASALINK_INTERNAL_SYNC_KEY bulunamadı. Geliştirme için geçici anahtar üretildi.'
    );
  }
  return devSyncKey;
}

/**
 * Yerel Termal Yazıcı Köprüsü HMAC Gizli Anahtarı.
 */
export function getBridgeSecret(): string {
  const envSecret = process.env.BRIDGE_SECRET;
  if (envSecret && envSecret.trim().length >= 16) {
    return envSecret.trim();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[GÜVENLİK KRİTİK] Production ortamında BRIDGE_SECRET tanımlanmalıdır!'
    );
  }

  if (!devBridgeSecret) {
    devBridgeSecret = getRandomHex(24);
  }
  return devBridgeSecret;
}
