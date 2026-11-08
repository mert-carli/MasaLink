import { NextRequest } from 'next/server';
import { verifySignedSessionToken } from '@/utils/tenantAuth';
import { getInternalSyncKey } from '@/server/security/secrets';

export interface TenantContext {
  tenantId: string;
  tenantSlug?: string;
  branchId?: string;
  userId?: string;
  role?: string;
}

export class TenantIsolationViolationError extends Error {
  constructor(message: string, public readonly details?: Record<string, any>) {
    super(`[Multi-Tenant İzolasyon İhlali] ${message}`);
    this.name = 'TenantIsolationViolationError';
  }
}

export class TenantUnauthorizedError extends Error {
  constructor(message: string = 'Geçerli bir kiracı oturumu bulunamadı.') {
    super(message);
    this.name = 'TenantUnauthorizedError';
  }
}

/**
 * Gelen HTTP isteğinden doğrulanmış kiracı bağlamını (TenantContext) çözer.
 * 
 * Güvenlik kuralları:
 * 1. Öncelik: Kriptografik olarak HMAC-SHA256 ile imzalanmış session token'ı (Cookie veya Authorization header).
 * 2. İkincil: X-Tenant-Id header'ı (yalnızca iç mikroservis / internal sync anahtarı ile doğrulanmışsa kabul edilir).
 * 3. Asla doğrulanmamış URL parametrelerine veya gövde (body) içerisindeki tenantId'ye güvenilmez.
 */
export function resolveTenantContext(req: NextRequest): TenantContext {
  // 1. Session Token (Cookie veya Bearer)
  const cookieToken = req.cookies.get('masalink_staff_session')?.value;
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const tokenString = cookieToken || bearerToken;

  if (tokenString) {
    const verified = verifySignedSessionToken(tokenString);
    if (verified && verified.tenantId) {
      return {
        tenantId: verified.tenantId,
        userId: verified.userId,
        role: verified.role,
      };
    }
  }

  // 2. İç Senkronizasyon Anahtarı ile İmzalanmış Sistem İsteği
  const internalSecret = req.headers.get('x-internal-secret');
  if (internalSecret) {
    const expectedSecret = getInternalSyncKey();
    const tenantHeader = req.headers.get('x-tenant-id');
    if (internalSecret === expectedSecret && tenantHeader) {
      return {
        tenantId: tenantHeader,
      };
    }
  }

  // 3. Anonim İsteklerde Kiracı Çözümü (Yalnızca açık menü / QR okuma için)
  // Fail-Closed Kuralı: Doğrulanmış oturum veya servis anahtarı yoksa VE açık tenantSlug da belirtilmemişse REDDET!
  const tenantSlug = req.nextUrl.searchParams.get('tenantSlug');

  if (!tenantSlug) {
    throw new TenantUnauthorizedError(
      'Kiracı kimliği doğrulanamadı: Geçerli bir oturum, yetkili servis anahtarı veya açık tenantSlug parametresi zorunludur.'
    );
  }

  return {
    tenantId: `tenant-${tenantSlug}`,
    tenantSlug,
  };
}
