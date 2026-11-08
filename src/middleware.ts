import { NextRequest, NextResponse } from 'next/server';
import { applySecurityHeaders } from '@/server/security/headers';
import { checkRequestContentLength } from '@/server/security/bodyLimit';
import { RateLimitEngine } from '@/server/security/rateLimitEngine';

/**
 * MasaLink Birinci Savunma Hattı: Global Edge Middleware (Perimeter Defense)
 * 
 * ÖNEMLİ: Bu middleware tek güvenlik katmanı DEĞİLDİR (Defense in Depth).
 * Kritik rotalar (admin, kds, orders, payment vb.) handler seviyesinde
 * bağımsız requireAuth / requireRole / requireTenant / requireTableQrToken
 * kontrollerine de sahiptir.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 0. Global Request Body Size & DoS Kalkanı (HTTP 413 Payload Too Large)
  // Devasa yüklerin (örn: 50MB JSON Bomb) belleğe parse edilmeden edge seviyesinde anında reddi
  if (pathname.startsWith('/api')) {
    const sizeCheck = checkRequestContentLength(req);
    if (!sizeCheck.allowed && sizeCheck.errorResponse) {
      return sizeCheck.errorResponse;
    }

    // 0.1 Global Çok Boyutlu Hız Sınırı (Rate Limiting: IP, Tenant, User/Session, Table)
    const rateCheck = await RateLimitEngine.evaluate(req);
    if (!rateCheck.allowed && rateCheck.response) {
      return rateCheck.response;
    }
  }

  // 1. Admin API Rotaları Çevre Koruması (/api/admin/*)
  if (pathname.startsWith('/api/admin')) {
    const hasSessionCookie =
      req.cookies.has('masalink_session') || req.cookies.has('masalink_staff_session');
    const hasAuthHeader = req.headers.has('authorization');
    const hasInternalKey = req.headers.has('x-internal-secret');

    if (!hasSessionCookie && !hasAuthHeader && !hasInternalKey) {
      return applySecurityHeaders(
        NextResponse.json(
          {
            success: false,
            errorCode: 'PERIMETER_UNAUTHORIZED',
            error: 'Erişim engellendi: Yetkili oturum belirteci (token) eksik.',
          },
          { status: 401 }
        )
      );
    }
  }

  // 2. KDS API Rotaları Çevre Koruması (/api/kds)
  if (pathname.startsWith('/api/kds') && req.method === 'POST') {
    const hasSessionCookie =
      req.cookies.has('masalink_session') || req.cookies.has('masalink_staff_session');
    const hasAuthHeader = req.headers.has('authorization');
    const hasInternalKey = req.headers.has('x-internal-secret');

    if (!hasSessionCookie && !hasAuthHeader && !hasInternalKey) {
      return applySecurityHeaders(
        NextResponse.json(
          {
            success: false,
            errorCode: 'PERIMETER_UNAUTHORIZED',
            error: 'Erişim engellendi: Mutfak operasyonu için oturum gereklidir.',
          },
          { status: 401 }
        )
      );
    }
  }

  // 3. UI Rotaları Koruma ve Yönlendirme (/admin/*)
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const hasSessionCookie =
      req.cookies.has('masalink_session') || req.cookies.has('masalink_staff_session');
    if (!hasSessionCookie) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('redirect', pathname);
      return applySecurityHeaders(NextResponse.redirect(loginUrl));
    }
  }

  // 4. Global HTTP Güvenlik Başlıkları (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
  const response = NextResponse.next();
  return applySecurityHeaders(response);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
