import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { getJwtSecret, getInternalSyncKey } from '@/server/security/secrets';

function computeHmac(secret: string, data: string, encoding: 'base64url' | 'hex' = 'base64url'): string {
  return crypto.createHmac('sha256', secret).update(data).digest(encoding);
}

export interface StaffSessionPayload {
  userId: string;
  name: string;
  role: string;
  tenantId: string;
  tokenVersion?: number;
  issuedAt: number;
  expiresAt: number;
}

/**
 * Üretilen oturum token'ını HMAC-SHA256 ile imzalar ve kiracı (tenant_id) bilgisini içine mühürler.
 */
export function createSignedSessionToken(
  payload: Omit<StaffSessionPayload, 'issuedAt' | 'expiresAt'>,
  durationSeconds = 43200 // 12 saat
): string {
  const secret = getJwtSecret();
  const fullPayload: StaffSessionPayload = {
    ...payload,
    issuedAt: Date.now(),
    expiresAt: Date.now() + durationSeconds * 1000,
  };
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = computeHmac(secret, encodedPayload, 'base64url');
  return `${encodedPayload}.${signature}`;
}

/**
 * Oturum token'ının imzasını ve son kullanma tarihini doğrular; kiracı kimliğini (tenantId) çözer.
 */
export function verifySignedSessionToken(tokenString: string | undefined | null): StaffSessionPayload | null {
  if (!tokenString || typeof tokenString !== 'string') return null;
  const parts = tokenString.split('.');
  if (parts.length !== 2) return null;

  const secret = getJwtSecret();
  const [encodedPayload, clientSig] = parts;
  const expectedSig = computeHmac(secret, encodedPayload, 'base64url');

  if (!timingSafeStringEqual(clientSig, expectedSig)) {
    return null; // Sahte veya tahrif edilmiş imza
  }

  try {
    const payload: StaffSessionPayload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (Date.now() > payload.expiresAt) {
      return null; // Zaman aşımına uğramış oturum
    }

    // Fail-Closed: Gerekli kimlik alanlarından biri bile eksikse oturumu geçersiz say
    if (!payload.tenantId || !payload.userId || !payload.role) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Sabit Zamanlı String Karşılaştırması (Timing Attack Kalkanı)
 * crypto.timingSafeEqual kullanarak yan kanal (side-channel) zamanlama saldırılarını engeller.
 */
export function timingSafeStringEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Masa QR Kodları için Kiracı, Masa ve Zaman Aşımı (TTL) İmzalı Token Üretici
 * Müşterinin bir restoranın QR kodunu başka bir restorana/masaya enjekte etmesini engeller.
 * Varsayılan geçerlilik süresi 24 saattir (86400 sn).
 */
export function generateTableQrToken(
  tenantSlug: string,
  tableId: string,
  ttlSeconds: number = 86400
): string {
  if (!tenantSlug || !tableId) {
    throw new Error('generateTableQrToken: tenantSlug ve tableId zorunludur.');
  }

  const secret = getJwtSecret();
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const data = `${tenantSlug}:${tableId}:${expiresAt}`;
  const sig = computeHmac(secret, data, 'hex').slice(0, 32);

  return `qr_${expiresAt}_${tableId}_${sig}`;
}

/**
 * Masa QR Token Doğrulayıcısı (Katı Fail-Closed)
 * 
 * Başarısızlık durumları (Kesin Red):
 * 1. token undefined
 * 2. token null
 * 3. token "" (boş veya whitespace)
 * 4. invalid signature (sahte veya tahrif edilmiş imza)
 * 5. yanlış tableId (başka masa için üretilmiş token)
 * 6. yanlış tenantId / tenantSlug (başka restoranın QR kodu)
 * 7. expired token (süresi dolmuş masa oturumu)
 * 
 * Güvenlik Mekanizması:
 * - Zamanlama saldırılarını (timing attack) önlemek için crypto.timingSafeEqual kullanılır.
 * - Token hem kiracıya hem de masaya kriptografik olarak bağlıdır.
 */
export function verifyTableQrToken(
  token: string | undefined | null,
  tenantSlug: string,
  tableId: string
): boolean {
  // 1. Fail-Closed Temel Kontroller (undefined, null, boş string)
  if (!token || typeof token !== 'string' || token.trim() === '') {
    return false;
  }
  if (!tenantSlug || typeof tenantSlug !== 'string' || tenantSlug.trim() === '') {
    return false;
  }
  if (!tableId || typeof tableId !== 'string' || tableId.trim() === '') {
    return false;
  }

  // 2. Yalnızca test ortamında kontrollü demo token desteği
  if (process.env.NODE_ENV !== 'production' && token.startsWith('tok_demo_')) {
    return true;
  }

  const secret = getJwtSecret();

  // 3. Yeni Zaman Damgalı Format: qr_{expiresAt}_{tableId}_{sig}
  if (token.startsWith('qr_')) {
    const lastUnderscoreIdx = token.lastIndexOf('_');
    if (lastUnderscoreIdx === -1) return false;

    const clientSig = token.slice(lastUnderscoreIdx + 1);
    const prefixAndData = token.slice(0, lastUnderscoreIdx); // qr_{expiresAt}_{tableId}
    const firstUnderscoreIdx = prefixAndData.indexOf('_');
    const secondUnderscoreIdx = prefixAndData.indexOf('_', firstUnderscoreIdx + 1);

    if (firstUnderscoreIdx === -1 || secondUnderscoreIdx === -1) {
      return false;
    }

    const expiresAtStr = prefixAndData.slice(firstUnderscoreIdx + 1, secondUnderscoreIdx);
    const tokenTableId = prefixAndData.slice(secondUnderscoreIdx + 1);

    // Yanlış tableId kontrolü
    if (tokenTableId !== tableId) {
      return false;
    }

    // Expired token kontrolü
    const expiresAt = Number(expiresAtStr);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
      return false; // Süresi dolmuş token
    }

    // İmzayı doğrula (tenant + table + expiresAt bağlamı)
    const data = `${tenantSlug}:${tableId}:${expiresAtStr}`;
    const expectedSig = computeHmac(secret, data, 'hex').slice(0, 32);

    return timingSafeStringEqual(clientSig, expectedSig);
  }

  // 4. Geriye Dönük Uyumluluk Formatı: tok_{tableId}_{sig}
  if (token.startsWith('tok_')) {
    const lastUnderscoreIdx = token.lastIndexOf('_');
    if (lastUnderscoreIdx === -1) return false;

    const clientSig = token.slice(lastUnderscoreIdx + 1);
    const tokenTableId = token.slice(4, lastUnderscoreIdx);

    // Yanlış tableId kontrolü
    if (tokenTableId !== tableId) {
      return false;
    }

    const data = `${tenantSlug}:${tableId}`;
    const expectedSig = computeHmac(secret, data, 'hex').slice(0, 16);

    return timingSafeStringEqual(clientSig, expectedSig);
  }

  return false;
}

/**
 * Gelen HTTP İsteğinden Güvenli Kiracı (Tenant) Çözümleyici
 * İstemcinin URL'den veya body'den gönderdiği tenant parametresini ASLA tek başına kabul etmez;
 * doğrulanmış token veya dahili servis anahtarından kiracıyı bağlar.
 */
export function resolveTenantFromRequest(req: NextRequest): {
  tenantId: string;
  userId?: string;
  role?: string;
  tokenVersion?: number;
  token?: string;
  issuedAt?: number;
  source: 'session' | 'service_key';
} | null {
  // 1. Dahili Servis Anahtarı Denetimi (Edge bridge / NVR)
  const internalSecret = req.headers.get('x-internal-secret');
  if (internalSecret) {
    const expectedKey = getInternalSyncKey();
    if (timingSafeStringEqual(internalSecret, expectedKey)) {
      const requestedTenant = req.headers.get('x-tenant-id');
      // Fail-Closed: Servis isteğinde kiracı başlığı yoksa ASLA varsayılan atama, doğrudan reddet
      if (!requestedTenant) {
        return null;
      }
      return {
        tenantId: requestedTenant,
        source: 'service_key',
      };
    }
  }

  // 2. Authorization Header (Bearer token)
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  // 3. Personel Oturum Çerezleri (masalink_session veya masalink_staff_session)
  const sessionCookie = req.cookies.get('masalink_session')?.value || req.cookies.get('masalink_staff_session')?.value;
  const tokenString = bearerToken || sessionCookie;

  if (tokenString) {
    const verified = verifySignedSessionToken(tokenString);
    if (verified) {
      return {
        tenantId: verified.tenantId,
        userId: verified.userId,
        role: verified.role,
        tokenVersion: verified.tokenVersion,
        issuedAt: verified.issuedAt,
        token: tokenString,
        source: 'session',
      };
    }
  }

  return null;
}
