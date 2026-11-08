import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/server/security/authGuard';
import { OrderService } from '@/server/services/orderService';
import { ValidationError, validateKdsStatusUpdate } from '@/server/validation/adminSchemas';
import { readJsonBodyWithLimit } from '@/server/security/bodyLimit';
import { RateLimitEngine } from '@/server/security/rateLimitEngine';
import { safeErrorResponse } from '@/server/security/errorHandler';

export const dynamic = 'force-dynamic';

function formatErrorResponse(err: any, fallbackMessage: string, req?: NextRequest) {
  return safeErrorResponse(err, req, { fallbackMessage });
}

// GET: KDS ekranını görüntüleme (Mutfak, Garson, Kasa, Yönetici operasyonel görünürlük için izleyebilir)
export async function GET(req: NextRequest) {
  try {
    const authCheck = await requireRole(req, [
      'kitchen',
      'chef',
      'waiter',
      'cashier',
      'manager',
      'owner',
      'admin',
    ]);
    if (!authCheck.ok) return authCheck.errorResponse;

    const tenantId = authCheck.data.tenantId;
    const orders = await OrderService.getActiveKdsOrders(tenantId);

    return NextResponse.json({
      success: true,
      tenantId,
      orders,
    });
  } catch (err: any) {
    return formatErrorResponse(err, 'KDS siparişleri listelenemedi.', req);
  }
}

// POST: Sipariş durumunu değiştirme (Minimum Yetki Prensibi: Yalnızca KITCHEN, CHEF, MANAGER, OWNER)
// ⚠️ Garson (WAITER) veya Kasiyer (CASHIER) KDS mutasyon işlemi YAPAMAZ (403 Forbidden).
export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireRole(req, [
      'kitchen',
      'chef',
      'manager',
      'owner',
      'admin',
    ]);
    if (!authCheck.ok) return authCheck.errorResponse;

    const tenantId = authCheck.data.tenantId;

    // Çok Boyutlu Mutfak İstasyon Hız Sınırı
    const rateCheck = await RateLimitEngine.evaluate(req, { tenantId });
    if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;

    const body = await readJsonBodyWithLimit(req);

    // 🛡️ Mass-assignment kalkanı ve katı durum şeması
    const validated = validateKdsStatusUpdate(body);

    const result = await OrderService.updateOrderStatus({
      tenantId,
      orderId: validated.orderId,
      status: validated.status,
      tableId: validated.tableId,
      changedById: authCheck.data.userId || 'kds-terminal',
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return formatErrorResponse(err, 'Sipariş durumu güncellenemedi.', req);
  }
}
