import { NextRequest, NextResponse } from 'next/server';
import { 
  getActiveTableToken, 
  validateTableSessionToken, 
  refreshTableSession, 
  revokeTableSession 
} from '@/utils/tableSessionRegistry';
import { resolveTenantFromRequest } from '@/utils/tenantAuth';
import { resolveTenantContext } from '@/server/db/tenantContext';
import {
  validateSessionToken as dbValidateSessionToken,
  refreshSession as dbRefreshSession,
  revokeActiveSession as dbRevokeActiveSession,
  findTableByCode,
  getOrOpenSession,
} from '@/server/db/tableRepository';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantCtx = resolveTenantContext(req);
  const tenantId = tenantCtx.tenantId;
  const tenantSlug = tenantCtx.tenantSlug || searchParams.get('tenantSlug');
  const tableId = searchParams.get('tableId');
  const token = searchParams.get('token');

  if (!tenantSlug) {
    return NextResponse.json({ success: false, error: 'Fail-Closed: Kiracı restoran bilgisi (tenantSlug) zorunludur.' }, { status: 400 });
  }

  if (!tableId) {
    return NextResponse.json({ success: false, error: 'Masa ID zorunludur.' }, { status: 400 });
  }

  // 1. Token doğrulama sorgusu
  if (token) {
    // Veritabanı bağlıysa DB üzerinden doğrula
    if (process.env.DATABASE_URL) {
      try {
        const dbCheck = await dbValidateSessionToken(tenantId, tableId, token);
        if (dbCheck.valid) {
          return NextResponse.json({
            success: true,
            valid: true,
            source: 'database',
          });
        }
      } catch (dbErr) {
        // Fallback
      }
    }

    const check = validateTableSessionToken(tenantSlug, tableId, token);
    return NextResponse.json({
      success: true,
      valid: check.valid,
      reason: check.reason,
      source: 'memory',
    });
  }

  // 2. Aktif token sorgusu (Yetkisiz token çalınmasını engelle - Yalnızca personel alabilir)
  const authStaff = resolveTenantFromRequest(req);
  if (!authStaff) {
    return NextResponse.json(
      { success: false, error: 'Yetkisiz erişim: Masanın aktif oturum belirtecini almak için yetkili oturum zorunludur.' },
      { status: 401 }
    );
  }
  if (process.env.DATABASE_URL) {
    try {
      const tableRow = await findTableByCode(tenantId, tableId);
      if (tableRow) {
        const session = await getOrOpenSession(tenantId, tableRow.id);
        return NextResponse.json({
          success: true,
          tenantSlug,
          tableId,
          token: session.token,
          source: 'database',
        });
      }
    } catch (dbErr) {
      // Fallback
    }
  }

  const activeToken = getActiveTableToken(tenantSlug, tableId);
  return NextResponse.json({
    success: true,
    tenantSlug,
    tableId,
    token: activeToken,
    source: 'memory',
  });
}

export async function POST(req: NextRequest) {
  try {
    const tenantCtx = resolveTenantContext(req);
    const authContext = resolveTenantFromRequest(req);
    if (!authContext) {
      return NextResponse.json({ success: false, error: 'Yetkisiz erişim.' }, { status: 403 });
    }

    const tenantId = authContext.tenantId || tenantCtx.tenantId;

    const body = await req.json();
    const { action, tableId } = body;
    const tenantSlug = body.tenantSlug || tenantCtx.tenantSlug;

    if (!tenantSlug) {
      return NextResponse.json({ success: false, error: 'Fail-Closed: tenantSlug zorunludur.' }, { status: 400 });
    }

    if (!tableId) {
      return NextResponse.json({ success: false, error: 'Masa ID zorunludur.' }, { status: 400 });
    }

    if (action === 'refresh') {
      let newToken = '';
      if (process.env.DATABASE_URL) {
        try {
          const tableRow = await findTableByCode(tenantId, tableId);
          if (tableRow) {
            const dbRefreshed = await dbRefreshSession(tenantId, tableRow.id);
            newToken = dbRefreshed.token;
          }
        } catch {}
      }
      if (!newToken) {
        newToken = refreshTableSession(tenantSlug, tableId);
      }
      return NextResponse.json({ success: true, tableId, newToken });
    }

    if (action === 'revoke') {
      if (process.env.DATABASE_URL) {
        try {
          const tableRow = await findTableByCode(tenantId, tableId);
          if (tableRow) {
            await dbRevokeActiveSession(tenantId, tableRow.id, 'Manuel veya ödeme sonrası oturum sonlandırma');
          }
        } catch {}
      }
      revokeTableSession(tenantSlug, tableId);
      return NextResponse.json({ success: true, tableId, revoked: true });
    }

    return NextResponse.json({ success: false, error: 'Geçersiz eylem.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
