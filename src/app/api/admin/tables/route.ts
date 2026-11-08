import { NextRequest, NextResponse } from 'next/server';
import { TableSection } from '@prisma/client';
import { requireRole } from '@/server/security/authGuard';
import { AdminCrudService } from '@/server/services/adminCrudService';
import { ValidationError, validateCreateTable, validateUpdateTable } from '@/server/validation/adminSchemas';

import { safeErrorResponse } from '@/server/security/errorHandler';

export const dynamic = 'force-dynamic';

function formatErrorResponse(err: any, fallbackMessage: string, req?: NextRequest) {
  return safeErrorResponse(err, req, { fallbackMessage });
}

// GET: Masa ve bölge listesini görme
export async function GET(req: NextRequest) {
  try {
    const authCheck = await requireRole(req, ['owner', 'manager', 'cashier', 'waiter']);
    if (!authCheck.ok) return authCheck.errorResponse;

    const tenantId = authCheck.data.tenantId;
    const sectionParam = req.nextUrl.searchParams.get('section') as TableSection | null;
    const tables = await AdminCrudService.listTables(tenantId, sectionParam || undefined);

    return NextResponse.json({
      success: true,
      tenantId,
      tables,
    });
  } catch (err: any) {
    console.error('[Admin Tables API GET] Hata:', err);
    return formatErrorResponse(err, 'Masa listesi yüklenemedi.');
  }
}

// POST: Masa oluşturma (Yalnızca OWNER ve MANAGER)
export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireRole(req, ['owner', 'manager']);
    if (!authCheck.ok) return authCheck.errorResponse;

    const tenantId = authCheck.data.tenantId;
    const body = await req.json();

    // 🛡️ Mass-assignment kalkanı: Katı allow-list doğrulaması
    const validated = validateCreateTable(body);

    const result = await AdminCrudService.createTable(tenantId, validated);
    return NextResponse.json({ success: true, table: result });
  } catch (err: any) {
    console.error('[Admin Tables API POST] Hata:', err);
    return formatErrorResponse(err, 'Masa oluşturulamadı.');
  }
}

// PATCH: Masa güncelleme (Yalnızca OWNER ve MANAGER)
export async function PATCH(req: NextRequest) {
  try {
    const authCheck = await requireRole(req, ['owner', 'manager']);
    if (!authCheck.ok) return authCheck.errorResponse;

    const tenantId = authCheck.data.tenantId;
    const body = await req.json();
    const { id, data } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ success: false, error: 'id zorunludur.' }, { status: 400 });
    }

    // 🛡️ Mass-assignment kalkanı: Katı allow-list doğrulaması
    const validated = validateUpdateTable(data);

    const result = await AdminCrudService.updateTable(tenantId, id, validated);
    return NextResponse.json({ success: true, table: result });
  } catch (err: any) {
    console.error('[Admin Tables API PATCH] Hata:', err);
    return formatErrorResponse(err, 'Masa güncellenemedi.');
  }
}

// DELETE: Masa silme (Yalnızca OWNER ve MANAGER)
export async function DELETE(req: NextRequest) {
  try {
    const authCheck = await requireRole(req, ['owner', 'manager']);
    if (!authCheck.ok) return authCheck.errorResponse;

    const tenantId = authCheck.data.tenantId;
    const body = await req.json();
    const { id } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ success: false, error: 'id zorunludur.' }, { status: 400 });
    }

    await AdminCrudService.deleteTable(tenantId, id);
    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    console.error('[Admin Tables API DELETE] Hata:', err);
    return formatErrorResponse(err, 'Masa silinemedi.');
  }
}
