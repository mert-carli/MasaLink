import { NextRequest, NextResponse } from 'next/server';
import { DistributedRateLimiter } from '@/server/redis/rateLimiter';
import { applySecurityHeaders } from '@/server/security/headers';

function extractStaffContextFromRequest(req: NextRequest): { tenantId?: string; userId?: string } | null {
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const cookieToken = req.cookies.get('masalink_session')?.value || req.cookies.get('masalink_staff_session')?.value;
  const token = bearerToken || cookieToken;
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payloadJson = Buffer.from(parts[0], 'base64url').toString('utf8');
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}

export interface RateLimitPolicy {
  name: string;
  maxRequests: number;
  windowSeconds: number;
}

export const RATE_LIMIT_POLICIES = {
  AUTH_LOGIN: { name: 'AUTH_LOGIN', maxRequests: 10, windowSeconds: 60 },
  AUTH_PIN: { name: 'AUTH_PIN', maxRequests: 10, windowSeconds: 60 },
  QR_ORDER_TABLE: { name: 'QR_ORDER_TABLE', maxRequests: 15, windowSeconds: 60 },
  QR_ORDER_IP: { name: 'QR_ORDER_IP', maxRequests: 30, windowSeconds: 60 },
  PAYMENT_INITIATE: { name: 'PAYMENT_INITIATE', maxRequests: 15, windowSeconds: 60 },
  ORDERS_POS: { name: 'ORDERS_POS', maxRequests: 120, windowSeconds: 60 },
  KDS_OPERATIONS: { name: 'KDS_OPERATIONS', maxRequests: 180, windowSeconds: 60 },
  ADMIN_MANAGEMENT: { name: 'ADMIN_MANAGEMENT', maxRequests: 60, windowSeconds: 60 },
  DEFAULT_API: { name: 'DEFAULT_API', maxRequests: 100, windowSeconds: 60 },
} as const;

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return '127.0.0.1';
}

export class RateLimitEngine {
  /**
   * Çok boyutlu hız sınırı kontrolü:
   * Sadece IP veya parmak izine DEĞİL; Kiracı (tenant), Kullanıcı/Oturum (user/session)
   * ve Masa (tableId) kombinasyonlarına göre katmanlı kısıtlama uygular.
   */
  public static async evaluate(
    req: NextRequest,
    meta?: {
      tableId?: string;
      tenantId?: string;
      customEmail?: string;
    }
  ): Promise<{
    allowed: boolean;
    dimension?: string;
    limit?: number;
    remaining?: number;
    retryAfterSeconds?: number;
    response?: NextResponse;
  }> {
    const { pathname } = req.nextUrl;
    const method = req.method.toUpperCase();
    const ip = getClientIp(req);
    const authStaff = extractStaffContextFromRequest(req);
    const effectiveTenantId = meta?.tenantId || authStaff?.tenantId || req.headers.get('x-tenant-id') || 'anon_tenant';
    const effectiveUserId = authStaff?.userId;

    // 1. /api/auth/login (Sıkı: IP bazlı brute-force koruması)
    if (pathname === '/api/auth/login' && method === 'POST') {
      const policy = RATE_LIMIT_POLICIES.AUTH_LOGIN;
      const key = `login:ip:${ip}`;
      const check = await DistributedRateLimiter.checkRateLimit(key, policy.maxRequests, policy.windowSeconds);
      if (!check.allowed) {
        return this.createRejection(policy.maxRequests, check.resetInSeconds, 'IP');
      }
    }

    // 2. /api/auth/verify-pin (Sıkı: IP + Tenant bazlı kalkan)
    if (pathname === '/api/auth/verify-pin' && method === 'POST') {
      const policy = RATE_LIMIT_POLICIES.AUTH_PIN;
      const key = `pin:ip_tenant:${ip}:${effectiveTenantId}`;
      const check = await DistributedRateLimiter.checkRateLimit(key, policy.maxRequests, policy.windowSeconds);
      if (!check.allowed) {
        return this.createRejection(policy.maxRequests, check.resetInSeconds, 'IP_TENANT');
      }
    }

    // 3. /api/qr-order (Çok Boyutlu: Masa Koruması + IP Koruması)
    // 🛡️ Parmak izi değiştirilse bile aynı masaya 1 dakikada 15'ten fazla sipariş verilemez!
    if (pathname === '/api/qr-order' && method === 'POST') {
      // Boyut A: Masa bazlı kota
      if (meta?.tableId) {
        const tablePolicy = RATE_LIMIT_POLICIES.QR_ORDER_TABLE;
        const tableKey = `qr:table:${effectiveTenantId}:${meta.tableId}`;
        const tableCheck = await DistributedRateLimiter.checkRateLimit(tableKey, tablePolicy.maxRequests, tablePolicy.windowSeconds);
        if (!tableCheck.allowed) {
          return this.createRejection(tablePolicy.maxRequests, tableCheck.resetInSeconds, 'TABLE_FLOOD_GUARD');
        }
      }

      // Boyut B: IP bazlı kota
      const ipPolicy = RATE_LIMIT_POLICIES.QR_ORDER_IP;
      const ipKey = `qr:ip:${ip}`;
      const ipCheck = await DistributedRateLimiter.checkRateLimit(ipKey, ipPolicy.maxRequests, ipPolicy.windowSeconds);
      if (!ipCheck.allowed) {
        return this.createRejection(ipPolicy.maxRequests, ipCheck.resetInSeconds, 'IP_FLOOD_GUARD');
      }
    }

    // 4. /api/payment/initiate (Masa & IP bazlı ödeme başlatma kotası)
    if (pathname === '/api/payment/initiate' && method === 'POST') {
      const policy = RATE_LIMIT_POLICIES.PAYMENT_INITIATE;
      const target = meta?.tableId ? `table:${meta.tableId}` : `ip:${ip}`;
      const key = `pay_init:${effectiveTenantId}:${target}`;
      const check = await DistributedRateLimiter.checkRateLimit(key, policy.maxRequests, policy.windowSeconds);
      if (!check.allowed) {
        return this.createRejection(policy.maxRequests, check.resetInSeconds, 'PAYMENT_BURST_GUARD');
      }
    }

    // 5. /api/orders (POS / Garson: Esnek Restoran Operasyonu)
    if (pathname === '/api/orders' && method === 'POST') {
      const policy = RATE_LIMIT_POLICIES.ORDERS_POS;
      const target = effectiveUserId ? `user:${effectiveUserId}` : `ip:${ip}`;
      const key = `pos_order:${effectiveTenantId}:${target}`;
      const check = await DistributedRateLimiter.checkRateLimit(key, policy.maxRequests, policy.windowSeconds);
      if (!check.allowed) {
        return this.createRejection(policy.maxRequests, check.resetInSeconds, 'OPERATIONAL_BURST');
      }
    }

    // 6. /api/kds (Mutfak İşlemleri: Yüksek Akışlı İstasyon Kotası)
    if (pathname.startsWith('/api/kds') && method === 'POST') {
      const policy = RATE_LIMIT_POLICIES.KDS_OPERATIONS;
      const target = effectiveUserId ? `user:${effectiveUserId}` : `ip:${ip}`;
      const key = `kds_mutation:${effectiveTenantId}:${target}`;
      const check = await DistributedRateLimiter.checkRateLimit(key, policy.maxRequests, policy.windowSeconds);
      if (!check.allowed) {
        return this.createRejection(policy.maxRequests, check.resetInSeconds, 'KITCHEN_THROTTLE');
      }
    }

    // 7. /api/admin/* (Yönetim Paneli Mutasyonları: Kullanıcı/IP Kotası)
    if (pathname.startsWith('/api/admin') && ['POST', 'PUT', 'DELETE'].includes(method)) {
      const policy = RATE_LIMIT_POLICIES.ADMIN_MANAGEMENT;
      const target = effectiveUserId ? `admin_user:${effectiveUserId}` : `ip:${ip}`;
      const key = `admin_ops:${effectiveTenantId}:${target}`;
      const check = await DistributedRateLimiter.checkRateLimit(key, policy.maxRequests, policy.windowSeconds);
      if (!check.allowed) {
        return this.createRejection(policy.maxRequests, check.resetInSeconds, 'ADMIN_RATE_LIMIT');
      }
    }

    return { allowed: true };
  }

  private static createRejection(
    maxRequests: number,
    retryAfterSeconds: number,
    dimension: string
  ) {
    const resp = NextResponse.json(
      {
        success: false,
        errorCode: 'RATE_LIMIT_EXCEEDED',
        error: `İstek kotası aşıldı (${dimension}). Lütfen ${retryAfterSeconds} saniye sonra tekrar deneyiniz.`,
        limit: maxRequests,
        retryAfterSeconds,
        dimension,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds),
          'RateLimit-Limit': String(maxRequests),
          'RateLimit-Remaining': '0',
          'RateLimit-Reset': String(retryAfterSeconds),
        },
      }
    );
    return {
      allowed: false,
      dimension,
      limit: maxRequests,
      remaining: 0,
      retryAfterSeconds,
      response: applySecurityHeaders(resp),
    };
  }
}
