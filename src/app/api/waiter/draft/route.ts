import { NextRequest, NextResponse } from 'next/server';
import { WaiterOrderDraft } from '@/utils/waiterDraftStorage';
import { getActiveDraft, upsertDraft, clearDraft } from '@/server/db/draftAuditRepository';
import { requireTenant } from '@/server/security/authGuard';
import { validateWaiterDraft, ValidationError } from '@/server/validation/adminSchemas';

// In-memory fallback draft storage by tenantId:waiterId (Multi-tenant isolated)
const SERVER_DRAFTS_MAP = new Map<string, WaiterOrderDraft>();

export async function GET(req: NextRequest) {
  try {
    const tenantCheck = requireTenant(req);
    if (!tenantCheck.ok) return tenantCheck.errorResponse;
    const tenantId = tenantCheck.data.tenantId;

    const { searchParams } = new URL(req.url);
    const waiterId = searchParams.get('waiterId');

    if (!waiterId) {
      return NextResponse.json({ success: false, error: 'waiterId zorunludur.' }, { status: 400 });
    }

    // 1. Veritabanından okumayı dene (PostgreSQL)
    if (process.env.DATABASE_URL) {
      try {
        const dbDraft = await getActiveDraft(tenantId, waiterId);
        if (dbDraft) {
          return NextResponse.json({
            success: true,
            draft: {
              waiterId: dbDraft.waiterId,
              waiterName: 'Garson',
              tableId: dbDraft.tableId,
              tableName: 'Masa',
              cart: dbDraft.cart,
              itemCount: dbDraft.itemCount,
              totalAmount: Number(dbDraft.totalAmount),
              updatedAt: dbDraft.updatedAt.getTime(),
            },
            source: 'database',
          });
        }
      } catch (dbErr) {
        // DB henüz ayakta değilse in-memory fallback'e düş
      }
    }

    // 2. In-Memory Fallback (Tenant İzolasyonlu)
    const draftKey = `${tenantId}:${waiterId}`;
    const draft = SERVER_DRAFTS_MAP.get(draftKey);

    // 45 dakikadan eski taslakları düşür
    if (draft && Date.now() - draft.updatedAt > 45 * 60 * 1000) {
      SERVER_DRAFTS_MAP.delete(draftKey);
      return NextResponse.json({ success: true, draft: null });
    }

    return NextResponse.json({
      success: true,
      draft: draft || null,
      source: 'memory',
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: 'Taslak okunamadı.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const tenantCheck = requireTenant(req);
    if (!tenantCheck.ok) return tenantCheck.errorResponse;
    const tenantId = tenantCheck.data.tenantId;

    const rawBody = await req.json();
    const validated = validateWaiterDraft(rawBody);
    const { waiterId, waiterName, tableId, tableName, cart, itemCount, totalAmount } = validated;

    const draftKey = `${tenantId}:${waiterId}`;

    // Boş sepet gelirse taslağı temizle
    if (!cart || Object.keys(cart).length === 0) {
      SERVER_DRAFTS_MAP.delete(draftKey);
      if (process.env.DATABASE_URL) {
        try {
          await clearDraft(tenantId, waiterId);
        } catch {}
      }
      return NextResponse.json({ success: true, cleared: true });
    }

    // Otomatik sepet adedi ve tutar hesabı (istemci göndermese bile doğrula)
    let calculatedItemCount = 0;
    let calculatedTotal = 0;
    if (cart && typeof cart === 'object') {
      for (const key of Object.keys(cart)) {
        const item = (cart as any)[key];
        const qty = item?.quantity || 1;
        const price = item?.product?.price || item?.item?.price || 0;
        calculatedItemCount += qty;
        calculatedTotal += price * qty;
      }
    }

    const effectiveItemCount = itemCount || calculatedItemCount;
    const effectiveTotal = totalAmount || calculatedTotal;

    const draftRecord: WaiterOrderDraft = {
      waiterId,
      waiterName: waiterName || 'Garson',
      tableId,
      tableName: tableName || 'Masa',
      cart,
      itemCount: effectiveItemCount,
      totalAmount: effectiveTotal,
      updatedAt: Date.now(),
    };

    // 1. In-memory her zaman güncellenir (hızlı lokal okuma için)
    SERVER_DRAFTS_MAP.set(draftKey, draftRecord);

    // 2. Veritabanına kalıcı yaz (PostgreSQL)
    let persistedToDb = false;
    if (process.env.DATABASE_URL) {
      try {
        await upsertDraft({
          tenantId,
          waiterId,
          tableId,
          cart: cart as any,
          itemCount: effectiveItemCount,
          totalAmount: effectiveTotal,
        });
        persistedToDb = true;
      } catch (dbErr) {
        // Fallback devam eder
      }
    }

    return NextResponse.json({
      success: true,
      message: persistedToDb 
        ? 'Yarım kalan sipariş taslağı PostgreSQL veritabanına mühürlendi.' 
        : 'Yarım kalan sipariş taslağı belleğe alındı.',
      updatedAt: draftRecord.updatedAt,
      persistedToDb,
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message, field: error.field }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Taslak kaydedilemedi.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const tenantCheck = requireTenant(req);
    if (!tenantCheck.ok) return tenantCheck.errorResponse;
    const tenantId = tenantCheck.data.tenantId;

    const { searchParams } = new URL(req.url);
    const waiterId = searchParams.get('waiterId');

    if (waiterId) {
      const draftKey = `${tenantId}:${waiterId}`;
      SERVER_DRAFTS_MAP.delete(draftKey);
      if (process.env.DATABASE_URL) {
        try {
          await clearDraft(tenantId, waiterId);
        } catch {}
      }
    }

    return NextResponse.json({ success: true, message: 'Taslak silindi.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: 'Taslak silinemedi.' }, { status: 500 });
  }
}
