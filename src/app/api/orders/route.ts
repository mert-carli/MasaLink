import { NextRequest, NextResponse } from 'next/server';
import { OrderStatus } from '@prisma/client';
import { resolveTenantFromRequest } from '@/utils/tenantAuth';
import { requireTenant, requireTableQrToken, requireRole } from '@/server/security/authGuard';
import { OrderService, OrderDomainError } from '@/server/services/orderService';
import { TableVersionConflictError } from '@/server/db/tableRepository';
import { validateSubmitOrder, ValidationError } from '@/server/validation/adminSchemas';
import { readJsonBodyWithLimit } from '@/server/security/bodyLimit';
import { RateLimitEngine } from '@/server/security/rateLimitEngine';
import { safeErrorResponse } from '@/server/security/errorHandler';

export async function POST(req: NextRequest) {
  let tableIdForLogging: string | undefined = undefined;
  let tenantIdForLogging: string | undefined = undefined;
  try {
    const tenantCheck = requireTenant(req);
    if (!tenantCheck.ok) return tenantCheck.errorResponse;
    const tenantCtx = tenantCheck.data;

    const authStaff = resolveTenantFromRequest(req);

    const rawBody = await readJsonBodyWithLimit(req);
    const validated = validateSubmitOrder(rawBody);

    const {
      tableId,
      source = 'POS', // 'POS' | 'WAITER' | 'QR'
      items,
      clientVersion,
      customerNote,
      guestName,
      requiresApproval = false,
      idempotencyKey,
      qrToken,
    } = validated;

    tableIdForLogging = tableId;
    tenantIdForLogging = authStaff?.tenantId || tenantCtx.tenantId;

    // Cross-Tenant Güvenlik Kalkanı: Oturumdaki kiracı ile istenen hedef kiracı çelişemez
    const requestedSlug = req.nextUrl.searchParams.get('tenantSlug') || req.headers.get('x-tenant-slug');
    const requestedTenantId = req.headers.get('x-tenant-id');

    if (authStaff) {
      if (requestedSlug && requestedSlug !== authStaff.tenantId && !authStaff.tenantId.includes(requestedSlug)) {
        return NextResponse.json(
          {
            success: false,
            errorCode: 'CROSS_TENANT_FORBIDDEN',
            error: 'Erişim engellendi: Başka bir restorana ait sipariş oluşturulamaz.',
          },
          { status: 403 }
        );
      }
      if (requestedTenantId && requestedTenantId !== authStaff.tenantId) {
        return NextResponse.json(
          {
            success: false,
            errorCode: 'CROSS_TENANT_FORBIDDEN',
            error: 'Erişim engellendi: Başka bir restorana ait sipariş oluşturulamaz.',
          },
          { status: 403 }
        );
      }
    }

    // P0: Güvenlik Doğrulaması — Kaynağa göre kimlik ve rol denetimi
    if (source === 'QR') {
      if (!authStaff) {
        const qrCheck = requireTableQrToken(req, tableId, qrToken);
        if (!qrCheck.ok) return qrCheck.errorResponse;
      }
    } else {
      // POS veya WAITER siparişleri için yetkili personel oturumu zorunludur (Bypass Kalkanı)
      if (!authStaff) {
        return NextResponse.json(
          {
            success: false,
            errorCode: 'UNAUTHORIZED',
            error: 'POS veya Garson siparişi oluşturmak için personel oturumu zorunludur.',
          },
          { status: 401 }
        );
      }

      const staffRole = (authStaff.role || '').toLowerCase();
      if (authStaff.source === 'session') {
        if (source === 'POS' && !['cashier', 'manager', 'admin', 'owner'].includes(staffRole)) {
          return NextResponse.json(
            {
              success: false,
              errorCode: 'FORBIDDEN_ORDER_SOURCE',
              error: 'POS siparişi oluşturmak için kasiyer veya yönetici rolü gereklidir.',
            },
            { status: 403 }
          );
        }

        if (source === 'WAITER' && !['waiter', 'manager', 'admin', 'owner'].includes(staffRole)) {
          return NextResponse.json(
            {
              success: false,
              errorCode: 'FORBIDDEN_ORDER_SOURCE',
              error: 'Garson siparişi oluşturmak için garson veya yönetici rolü gereklidir.',
            },
            { status: 403 }
          );
        }
      }
    }

    const effectiveTenantId = tenantIdForLogging;
    const effectiveUserId = authStaff?.userId || tenantCtx.userId;

    // Çok Boyutlu Hız Sınırı (Tenant / User / IP Kotası)
    const rateCheck = await RateLimitEngine.evaluate(req, {
      tableId,
      tenantId: effectiveTenantId,
    });
    if (!rateCheck.allowed && rateCheck.response) {
      return rateCheck.response;
    }

    const result = await OrderService.submitOrder({
      tenantId: effectiveTenantId,
      branchId: tenantCtx.branchId,
      tableId,
      source: source as any,
      items,
      clientVersion: typeof clientVersion === 'number' ? clientVersion : undefined,
      customerNote,
      guestName,
      createdById: effectiveUserId,
      requiresApproval: Boolean(requiresApproval),
      idempotencyKey,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return safeErrorResponse(err, req, {
      fallbackMessage: 'Sipariş işlenirken bir sunucu hatası oluştu.',
      tenantId: tenantIdForLogging,
      tableId: tableIdForLogging,
    });
  }
}

export async function GET(req: NextRequest) {
  try {
    const tenantCheck = requireTenant(req);
    if (!tenantCheck.ok) return tenantCheck.errorResponse;
    const tenantCtx = tenantCheck.data;

    // Personel rolü denetimi (Garson, Kasiyer, Müdür, Yönetici)
    const roleCheck = await requireRole(req, ['waiter', 'cashier', 'manager', 'owner', 'admin']);
    if (!roleCheck.ok) return roleCheck.errorResponse;

    const authTenantId = roleCheck.data.tenantId;
    const requestedTenantId = req.headers.get('x-tenant-id') || req.nextUrl.searchParams.get('tenantId');
    if (requestedTenantId && authTenantId && requestedTenantId !== authTenantId) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'CROSS_TENANT_FORBIDDEN',
          error: 'Erişim engellendi: Başka bir restorana ait siparişler listelenemez.',
        },
        { status: 403 }
      );
    }

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const rawStatus = url.searchParams.get('status');
    const tableId = url.searchParams.get('tableId') || undefined;
    const dateFrom = url.searchParams.get('dateFrom') || undefined;
    const dateTo = url.searchParams.get('dateTo') || undefined;

    const validStatuses: OrderStatus[] = [
      OrderStatus.PENDING_APPROVAL,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.SERVED,
      OrderStatus.CANCELLED,
    ];
    const status = rawStatus && validStatuses.includes(rawStatus as OrderStatus) ? (rawStatus as OrderStatus) : undefined;

    const result = await OrderService.getPaginatedOrders({
      tenantId: roleCheck.data.tenantId || tenantCtx.tenantId,
      page,
      limit,
      status,
      tableId,
      dateFrom,
      dateTo,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    return safeErrorResponse(err, req, {
      fallbackMessage: 'Siparişler listelenirken bir hata oluştu.',
    });
  }
}
