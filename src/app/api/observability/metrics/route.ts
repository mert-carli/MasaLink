import { NextRequest, NextResponse } from 'next/server';
import { metricsCollector } from '@/server/observability/metrics';
import { resolveTenantFromRequest } from '@/utils/tenantAuth';
import { applySecurityHeaders } from '@/server/security/headers';

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const authStaff = resolveTenantFromRequest(req);
    const isAuthorized =
      authStaff?.source === 'service_key' ||
      (authStaff?.role && ['owner', 'admin', 'manager'].includes(authStaff.role.toLowerCase()));

    if (!isAuthorized) {
      return applySecurityHeaders(
        NextResponse.json(
          { success: false, error: 'Yetkisiz erişim: Metrikler korunmaktadır.' },
          { status: 401 }
        )
      );
    }
  }

  const metrics = metricsCollector.getSnapshot();
  const response = NextResponse.json(metrics, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
  return applySecurityHeaders(response);
}
