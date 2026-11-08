import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/server/security/authGuard';
import { AdminCrudService } from '@/server/services/adminCrudService';
import { ValidationError, validateCreateStaff, validateUpdateStaff } from '@/server/validation/adminSchemas';

import { safeErrorResponse } from '@/server/security/errorHandler';

export const dynamic = 'force-dynamic';

function formatErrorResponse(err: any, fallbackMessage: string, req?: NextRequest) {
  return safeErrorResponse(err, req, { fallbackMessage });
}

// GET: Yalnızca OWNER ve MANAGER personel listesini görebilir (Personel verisi hassastır)
export async function GET(req: NextRequest) {
  try {
    const authCheck = await requireRole(req, ['owner', 'manager']);
    if (!authCheck.ok) return authCheck.errorResponse;

    const tenantId = authCheck.data.tenantId;
    const staff = await AdminCrudService.listStaff(tenantId);

    return NextResponse.json({
      success: true,
      tenantId,
      staff,
    });
  } catch (err: any) {
    return formatErrorResponse(err, 'Personel listesi yüklenemedi.', req);
  }
}

// POST: Personel oluşturma (Yalnızca OWNER ve MANAGER)
export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireRole(req, ['owner', 'manager']);
    if (!authCheck.ok) return authCheck.errorResponse;

    const tenantId = authCheck.data.tenantId;
    const body = await req.json();

    // 🛡️ Mass-assignment kalkanı: Katı allow-list doğrulaması
    const validatedData = validateCreateStaff(body);

    const result = await AdminCrudService.createStaff(tenantId, validatedData as any);
    return NextResponse.json({ success: true, staff: result });
  } catch (err: any) {
    return formatErrorResponse(err, 'Personel oluşturma işlemi başarısız oldu.', req);
  }
}

// PATCH: Personel güncelleme (Yalnızca OWNER ve MANAGER)
export async function PATCH(req: NextRequest) {
  try {
    const authCheck = await requireRole(req, ['owner', 'manager']);
    if (!authCheck.ok) return authCheck.errorResponse;

    const tenantId = authCheck.data.tenantId;
    const body = await req.json();

    // 🛡️ Mass-assignment kalkanı: Katı allow-list doğrulaması
    const validated = validateUpdateStaff(body);

    const result = await AdminCrudService.updateStaff(tenantId, validated.id, validated.data as any);
    return NextResponse.json({ success: true, staff: result });
  } catch (err: any) {
    return formatErrorResponse(err, 'Personel güncelleme işlemi başarısız oldu.', req);
  }
}

// DELETE: Personel silme (Yalnızca OWNER ve MANAGER)
export async function DELETE(req: NextRequest) {
  try {
    const authCheck = await requireRole(req, ['owner', 'manager']);
    if (!authCheck.ok) return authCheck.errorResponse;

    const tenantId = authCheck.data.tenantId;
    const body = await req.json();
    const { id } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ success: false, error: 'Silinecek personel id zorunludur.' }, { status: 400 });
    }

    await AdminCrudService.deleteStaff(tenantId, id);
    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    return formatErrorResponse(err, 'Personel silme işlemi başarısız oldu.', req);
  }
}
