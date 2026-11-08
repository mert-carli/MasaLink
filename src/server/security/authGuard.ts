import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantFromRequest, verifyTableQrToken } from '@/utils/tenantAuth';
import { resolveTenantContext, TenantUnauthorizedError } from '@/server/db/tenantContext';
import { TokenRevocationService } from '@/server/security/tokenRevocation';

export interface AuthenticatedStaffContext {
  tenantId: string;
  userId?: string;
  role?: string;
  tokenVersion?: number;
  issuedAt?: number;
  token?: string;
  source: 'session' | 'service_key';
}

export interface TenantContextResult {
  tenantId: string;
  tenantSlug?: string;
  branchId?: string;
  userId?: string;
}

export interface TableQrContextResult {
  tableId: string;
  tenantSlug: string;
  isValid: boolean;
}

export type GuardResult<T> =
  | {
      ok: true;
      success: true;
      data: T;
      context: T;
      errorResponse: null;
      response: null;
    }
  | {
      ok: false;
      success: false;
      data: null;
      context: null;
      errorResponse: NextResponse;
      response: NextResponse;
    };

function successResult<T>(data: T): GuardResult<T> {
  return {
    ok: true,
    success: true,
    data,
    context: data,
    errorResponse: null,
    response: null,
  };
}

function failureResult<T>(status: number, error: string, errorCode?: string): GuardResult<T> {
  const body: Record<string, any> = { success: false, error };
  if (errorCode) body.errorCode = errorCode;
  const resp = NextResponse.json(body, { status });
  return {
    ok: false,
    success: false,
    data: null,
    context: null,
    errorResponse: resp,
    response: resp,
  };
}

/**
 * 1. requireAuth:
 * İstekte geçerli bir personel oturum token'ı veya dahili servis anahtarı bulunmasını zorunlu kılar.
 * Token imzasını ve Redis kara liste (revocation) kontrolünü doğrular.
 */
export async function requireAuth(req: NextRequest): Promise<GuardResult<AuthenticatedStaffContext>> {
  const authStaff = resolveTenantFromRequest(req);

  if (!authStaff) {
    return failureResult(401, 'Bu işlem için yetkili personel oturumu gereklidir.', 'UNAUTHORIZED');
  }

  // Token iptal edilmiş (revoked / logout yapılmış veya şifre/yetki değişimi) mi denetle
  if (authStaff.source === 'session' && (authStaff as any).token) {
    const isRevoked = await TokenRevocationService.isRevoked(
      (authStaff as any).token,
      {
        userId: authStaff.userId,
        tokenVersion: (authStaff as any).tokenVersion,
        issuedAt: (authStaff as any).issuedAt,
      }
    );
    if (isRevoked) {
      return failureResult(
        401,
        'Oturum sonlandırılmış veya güvenlik nedeniyle geçersiz kılınmıştır. Lütfen tekrar giriş yapınız.',
        'TOKEN_REVOKED'
      );
    }
  }

  return successResult(authStaff);
}

/**
 * 2. requireRole:
 * Önce kimlik doğrulaması yapar (requireAuth), ardından personelin rolünü denetler.
 * Dahili servis anahtarları tam yetkili kabul edilir.
 */
export async function requireRole(
  req: NextRequest,
  allowedRoles: string[] = ['owner', 'admin', 'manager']
): Promise<GuardResult<AuthenticatedStaffContext>> {
  const authResult = await requireAuth(req);
  if (!authResult.ok) {
    return authResult;
  }

  const staff = authResult.data;

  // Servis anahtarı tam yetkilidir
  if (staff.source === 'service_key') {
    return successResult(staff);
  }

  // Fail-Closed: Rol bilgisi boş veya tanımsızsa ASLA varsayılan rol verme, reddet!
  if (!staff.role || typeof staff.role !== 'string') {
    return failureResult(403, 'Kullanıcıya atanmış geçerli bir rol bulunamadı.', 'ROLE_MISSING');
  }

  const staffRole = staff.role.toLowerCase();
  const normalizedAllowed = allowedRoles.map((r) => r.toLowerCase());

  if (!normalizedAllowed.includes(staffRole)) {
    return failureResult(403, 'Bu işlemi gerçekleştirmek için yetkiniz yetersizdir.', 'FORBIDDEN');
  }

  return successResult(staff);
}

// requireStaffRole: Geriye dönük uyumluluk için requireRole alias'ı
export const requireStaffRole = requireRole;

/**
 * 3. requireTenant:
 * Kiracı bağlamını (tenantId) çözümler.
 * Production ortamında doğrulanmış bir kiracı oturumu veya açık tenantSlug olmasını zorunlu kılar.
 */
export function requireTenant(req: NextRequest): GuardResult<TenantContextResult> {
  try {
    const ctx = resolveTenantContext(req);
    return successResult({
      tenantId: ctx.tenantId,
      tenantSlug: ctx.tenantSlug,
      branchId: ctx.branchId,
      userId: ctx.userId,
    });
  } catch (err: any) {
    if (err instanceof TenantUnauthorizedError) {
      return failureResult(401, err.message, 'TENANT_UNAUTHORIZED');
    }
    return failureResult(400, 'Geçerli bir kiracı bağlamı bulunamadı.', 'TENANT_INVALID');
  }
}

/**
 * 4. requireTableQrToken:
 * Müşteri tarafından yapılan masa işlemlerinde kriptografik QR token doğrulaması yapar.
 * Boş, eksik veya tahrif edilmiş token'ları anında 401 ile reddeder.
 */
export function requireTableQrToken(
  req: NextRequest,
  tableId: string,
  explicitToken?: string | null
): GuardResult<TableQrContextResult> {
  // Fail-Closed: Masa ID yoksa veya geçersizse anında reddet
  if (!tableId || typeof tableId !== 'string') {
    return failureResult(400, 'Geçerli bir masa ID (tableId) belirtilmelidir.', 'TABLE_ID_REQUIRED');
  }

  const token =
    explicitToken ||
    req.headers.get('x-table-token') ||
    req.nextUrl.searchParams.get('qrToken');

  // Fail-Closed: Token boşsa veya tanımsızsa ASLA doğrulamayı başarılı sayma
  if (!token || typeof token !== 'string') {
    return failureResult(
      401,
      'Masa QR tokenı eksik! Sipariş verebilmek için masadaki QR kodu okutmalısınız.',
      'QR_TOKEN_MISSING'
    );
  }

  const tenantSlug =
    req.nextUrl.searchParams.get('tenantSlug') ||
    req.headers.get('x-tenant-slug');

  // Fail-Closed: Tenant slug belirtilmemişse varsayılan atama yapma, reddet
  if (!tenantSlug) {
    return failureResult(400, 'Kiracı restoran bilgisi (tenantSlug) bulunamadı.', 'TENANT_SLUG_MISSING');
  }

  const isValid = verifyTableQrToken(token, tenantSlug, tableId);

  if (!isValid) {
    return failureResult(
      401,
      'Geçersiz veya eksik masa QR kodu! Lütfen masadaki QR kodu yeniden okutunuz.',
      'INVALID_QR_TOKEN'
    );
  }

  return successResult({
    tableId,
    tenantSlug,
    isValid: true,
  });
}
