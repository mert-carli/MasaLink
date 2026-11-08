import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/server/db/prisma';
import { createSignedSessionToken } from '@/utils/tenantAuth';
import { TokenRevocationService } from '@/server/security/tokenRevocation';
import { getClientIp, enforcePinRateLimit, recordFailedPinAttempt, recordSuccessfulPinAttempt } from '@/utils/pinRateLimiter';

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);

    // Rate Limiting (Kaba kuvvet saldırılarına karşı IP bazlı 5 hatalı girişte 10 dk kilit)
    const rateCheck = await enforcePinRateLimit(`login_${clientIp}`);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'ACCOUNT_LOCKED',
          error: 'Çok fazla hatalı giriş denemesi! Güvenlik nedeniyle erişim 10 dakika kilitlendi.',
          retryAfterSeconds: rateCheck.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { email, password, tenantSlug, tenantId } = body as {
      email?: string;
      password?: string;
      tenantSlug?: string;
      tenantId?: string;
    };

    const requestedTenant =
      tenantId ||
      tenantSlug ||
      req.nextUrl.searchParams.get('tenantSlug') ||
      req.headers.get('x-tenant-id');

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json(
        { success: false, error: 'E-posta ve şifre zorunludur.' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 1. PostgreSQL Veritabanından Kullanıcıyı Sorgula (Tenant-Aware)
    if (process.env.DATABASE_URL) {
      try {
        const userWhere: any = {
          email: normalizedEmail,
          isActive: true,
        };
        if (requestedTenant) {
          userWhere.OR = [
            { tenantId: requestedTenant },
            { tenant: { slug: requestedTenant } },
          ];
        }

        const user = await prisma.user.findFirst({
          where: userWhere,
          include: {
            role: true,
            tenant: true,
            branch: true,
          },
        });

        if (user && user.passwordHash) {
          const passwordValid = await bcrypt.compare(password, user.passwordHash);
          if (passwordValid) {
            recordSuccessfulPinAttempt(`login_${clientIp}`);

            // Son giriş zamanını güncelle
            await prisma.user.update({
              where: { id: user.id },
              data: { lastLoginAt: new Date() },
            }).catch(() => {});

            const tokenVersion = await TokenRevocationService.getUserTokenVersion(user.id);
            const sessionToken = createSignedSessionToken({
              userId: user.id,
              name: user.name,
              role: user.role.key.toLowerCase(),
              tenantId: user.tenantId,
              tokenVersion,
            });

            const authUser = {
              id: user.id,
              name: user.name,
              tenantId: user.tenantId,
              restaurantName: user.tenant.name,
              branchName: user.branch?.name || 'Merkez Şube',
              email: user.email || '',
              role: user.role.key.toLowerCase(),
              plan: user.tenant.plan.toLowerCase(),
              token: sessionToken,
            };

            const response = NextResponse.json({
              success: true,
              user: authUser,
            });

            response.cookies.set('masalink_session', sessionToken, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'strict',
              path: '/',
              maxAge: 60 * 60 * 12,
            });

            return response;
          }
        }
      } catch (dbErr) {
        console.warn('[Login API] DB sorgu uyarısı:', dbErr);
      }
    }

    // 2. Geliştirme Ortamı Fallback (Yalnızca production olmayan ortamlarda)
    if (process.env.NODE_ENV !== 'production') {
      const devAdminPass = process.env.SEED_ADMIN_PASSWORD || 'demo123';
      if (normalizedEmail === 'admin@masalink.com' && password === devAdminPass) {
        recordSuccessfulPinAttempt(`login_${clientIp}`);
        const sessionToken = createSignedSessionToken({
          userId: 'usr-dev-admin',
          name: 'Murat Yılmaz (Dev Admin)',
          role: 'owner',
          tenantId: 'tenant-artisan-burger',
        });

        const devUser = {
          id: 'usr-dev-admin',
          name: 'Murat Yılmaz (Dev Admin)',
          tenantId: 'tenant-artisan-burger',
          restaurantName: 'Artisan Burger Bar',
          branchName: 'Kadıköy Merkez Şube',
          email: 'admin@masalink.com',
          role: 'owner',
          plan: 'pro',
          token: sessionToken,
        };

        const response = NextResponse.json({
          success: true,
          user: devUser,
          isDevFallback: true,
        });

        response.cookies.set('masalink_session', sessionToken, {
          httpOnly: true,
          secure: false,
          sameSite: 'strict',
          path: '/',
          maxAge: 60 * 60 * 12,
        });

        await recordSuccessfulPinAttempt(`login_${clientIp}`);
        return response;
      }
    }

    // Hatalı giriş kaydı
    const failRecord = await recordFailedPinAttempt(`login_${clientIp}`, { endpoint: '/api/auth/login', ip: clientIp });
    return NextResponse.json(
      {
        success: false,
        errorCode: failRecord.isLockedNow ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS',
        error: failRecord.isLockedNow
          ? 'Art arda 5 hatalı giriş nedeniyle hesap 10 dakika kilitlendi.'
          : 'E-posta veya şifre hatalı.',
      },
      { status: failRecord.isLockedNow ? 429 : 401 }
    );
  } catch (error: any) {
    console.error('Login API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Giriş işlemi sırasında sunucu hatası.' },
      { status: 500 }
    );
  }
}
