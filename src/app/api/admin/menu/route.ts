import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/server/security/authGuard';
import { AdminCrudService } from '@/server/services/adminCrudService';
import {
  ValidationError,
  validateCreateCategory,
  validateUpdateCategory,
  validateCreateProduct,
  validateUpdateProduct,
  validateCreateExtra,
  validateUpdateExtra,
} from '@/server/validation/adminSchemas';

import { safeErrorResponse } from '@/server/security/errorHandler';

export const dynamic = 'force-dynamic';

function formatErrorResponse(err: any, fallbackMessage: string, req?: NextRequest) {
  return safeErrorResponse(err, req, { fallbackMessage });
}

// GET: Personel ve yönetim menüyü görebilir
export async function GET(req: NextRequest) {
  try {
    const authCheck = await requireRole(req, ['owner', 'manager', 'cashier', 'waiter']);
    if (!authCheck.ok) return authCheck.errorResponse;

    const tenantId = authCheck.data.tenantId;

    const [categories, products, extras] = await Promise.all([
      AdminCrudService.listCategories(tenantId),
      AdminCrudService.listProducts(tenantId),
      AdminCrudService.listExtras(tenantId),
    ]);

    return NextResponse.json({
      success: true,
      tenantId,
      categories,
      products,
      extras,
    });
  } catch (err: any) {
    console.error('[Admin Menu API GET] Hata:', err);
    return formatErrorResponse(err, 'Menü listesi yüklenemedi.');
  }
}

// POST: Menü öğesi ekleme (Yalnızca OWNER ve MANAGER)
export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireRole(req, ['owner', 'manager']);
    if (!authCheck.ok) return authCheck.errorResponse;

    const tenantId = authCheck.data.tenantId;
    const body = await req.json();
    const { type, data } = body;

    if (!type || !data) {
      return NextResponse.json({ success: false, error: 'type ve data alanları zorunludur.' }, { status: 400 });
    }

    if (type === 'category') {
      const validated = validateCreateCategory(data);
      const result = await AdminCrudService.createCategory(tenantId, validated);
      return NextResponse.json({ success: true, category: result });
    }

    if (type === 'product') {
      const validated = validateCreateProduct(data);
      const result = await AdminCrudService.createProduct(tenantId, validated as any);
      return NextResponse.json({ success: true, product: result });
    }

    if (type === 'extra') {
      const validated = validateCreateExtra(data);
      const result = await AdminCrudService.createExtra(tenantId, validated);
      return NextResponse.json({ success: true, extra: result });
    }

    return NextResponse.json({ success: false, error: 'Geçersiz tür.' }, { status: 400 });
  } catch (err: any) {
    console.error('[Admin Menu API POST] Hata:', err);
    return formatErrorResponse(err, 'Menü öğesi eklenemedi.');
  }
}

// PATCH: Menü öğesi güncelleme (Yalnızca OWNER ve MANAGER)
export async function PATCH(req: NextRequest) {
  try {
    const authCheck = await requireRole(req, ['owner', 'manager']);
    if (!authCheck.ok) return authCheck.errorResponse;

    const tenantId = authCheck.data.tenantId;
    const body = await req.json();
    const { type, id, data } = body;

    if (!type || !id || !data) {
      return NextResponse.json({ success: false, error: 'type, id ve data alanları zorunludur.' }, { status: 400 });
    }

    if (typeof id !== 'string') {
      return NextResponse.json({ success: false, error: 'Geçerli bir id belirtilmelidir.' }, { status: 400 });
    }

    if (type === 'category') {
      const validated = validateUpdateCategory(data);
      const result = await AdminCrudService.updateCategory(tenantId, id, validated);
      return NextResponse.json({ success: true, category: result });
    }

    if (type === 'product') {
      const validated = validateUpdateProduct(data);
      const result = await AdminCrudService.updateProduct(tenantId, id, validated as any);
      return NextResponse.json({ success: true, product: result });
    }

    if (type === 'extra') {
      const validated = validateUpdateExtra(data);
      const result = await AdminCrudService.updateExtra(tenantId, id, validated);
      return NextResponse.json({ success: true, extra: result });
    }

    return NextResponse.json({ success: false, error: 'Geçersiz tür.' }, { status: 400 });
  } catch (err: any) {
    console.error('[Admin Menu API PATCH] Hata:', err);
    return formatErrorResponse(err, 'Menü öğesi güncellenemedi.');
  }
}

// DELETE: Menü öğesi silme (Yalnızca OWNER ve MANAGER)
export async function DELETE(req: NextRequest) {
  try {
    const authCheck = await requireRole(req, ['owner', 'manager']);
    if (!authCheck.ok) return authCheck.errorResponse;

    const tenantId = authCheck.data.tenantId;
    const body = await req.json();
    const { type, id } = body;

    if (!type || !id || typeof id !== 'string') {
      return NextResponse.json({ success: false, error: 'type ve geçerli bir id zorunludur.' }, { status: 400 });
    }

    if (type === 'category') {
      await AdminCrudService.deleteCategory(tenantId, id);
      return NextResponse.json({ success: true, deletedId: id });
    }

    if (type === 'product') {
      await AdminCrudService.deleteProduct(tenantId, id);
      return NextResponse.json({ success: true, deletedId: id });
    }

    if (type === 'extra') {
      await AdminCrudService.deleteExtra(tenantId, id);
      return NextResponse.json({ success: true, deletedId: id });
    }

    return NextResponse.json({ success: false, error: 'Geçersiz tür.' }, { status: 400 });
  } catch (err: any) {
    console.error('[Admin Menu API DELETE] Hata:', err);
    return formatErrorResponse(err, 'Menü öğesi silinemedi.');
  }
}
