import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/server/security/authGuard';
import { AdminCrudService } from '@/server/services/adminCrudService';
import { ValidationError, validateCreateIngredient, validateSaveRecipe } from '@/server/validation/adminSchemas';

import { safeErrorResponse } from '@/server/security/errorHandler';

export const dynamic = 'force-dynamic';

function formatErrorResponse(err: any, fallbackMessage: string, req?: NextRequest) {
  return safeErrorResponse(err, req, { fallbackMessage });
}

// GET: Hammadde ve reçete maliyetlerini görme (Hassas Veri: Yalnızca OWNER, MANAGER ve KITCHEN)
export async function GET(req: NextRequest) {
  try {
    const authCheck = await requireRole(req, ['owner', 'manager', 'kitchen']);
    if (!authCheck.ok) return authCheck.errorResponse;

    const tenantId = authCheck.data.tenantId;
    const ingredients = await AdminCrudService.listIngredients(tenantId);

    return NextResponse.json({
      success: true,
      tenantId,
      ingredients,
    });
  } catch (err: any) {
    console.error('[Admin Recipes API GET] Hata:', err);
    return formatErrorResponse(err, 'Reçete ve malzeme listesi yüklenemedi.');
  }
}

// POST: Hammadde ekleme veya reçete kaydetme (Yalnızca OWNER ve MANAGER)
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

    if (type === 'ingredient') {
      // 🛡️ Mass-assignment kalkanı: Katı allow-list doğrulaması
      const validated = validateCreateIngredient(data);
      const result = await AdminCrudService.createIngredient(tenantId, validated);
      return NextResponse.json({ success: true, ingredient: result });
    }

    if (type === 'recipe') {
      // 🛡️ Mass-assignment kalkanı: Katı allow-list doğrulaması
      const validated = validateSaveRecipe(data);
      const result = await AdminCrudService.saveRecipe(
        tenantId,
        validated.productId,
        validated.recipeData
      );
      return NextResponse.json({ success: true, recipe: result });
    }

    return NextResponse.json({ success: false, error: 'Geçersiz tür.' }, { status: 400 });
  } catch (err: any) {
    console.error('[Admin Recipes API POST] Hata:', err);
    return formatErrorResponse(err, 'Reçete işlemi kaydedilemedi.');
  }
}
