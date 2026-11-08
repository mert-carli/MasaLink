import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantFromRequest } from '@/utils/tenantAuth';
import { TableTransferService, TableTransferError } from '@/server/services/tableTransferService';
import { structuredLogger } from '@/server/observability/logger';

const ALLOWED_ROLES = new Set(['waiter', 'cashier', 'manager', 'owner', 'admin']);

export async function POST(req: NextRequest) {
  try {
    const authContext = resolveTenantFromRequest(req);
    if (!authContext) {
      return NextResponse.json(
        { success: false, error: 'Yetkisiz erişim: Masa taşıma/birleştirme işlemi için geçerli oturum gerekli.' },
        { status: 401 }
      );
    }

    const userRole = (authContext.role || '').toLowerCase();
    if (!ALLOWED_ROLES.has(userRole)) {
      return NextResponse.json(
        { success: false, error: 'Bu işlem için yetkiniz bulunmamaktadır.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      sourceTableId,
      targetTableId,
      mode,
      expectedSourceVersion,
      expectedTargetVersion,
      waiterName,
    } = body || {};

    if (!sourceTableId || typeof sourceTableId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Kaynak masa kimliği (sourceTableId) zorunludur.' },
        { status: 400 }
      );
    }

    if (!targetTableId || typeof targetTableId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Hedef masa kimliği (targetTableId) zorunludur.' },
        { status: 400 }
      );
    }

    if (mode !== 'transfer' && mode !== 'merge') {
      return NextResponse.json(
        { success: false, error: "İşlem türü (mode) 'transfer' veya 'merge' olmalıdır." },
        { status: 400 }
      );
    }

    const result = await TableTransferService.executeTransfer({
      tenantId: authContext.tenantId,
      sourceTableId,
      targetTableId,
      mode,
      userId: authContext.userId,
      waiterName: typeof waiterName === 'string' && waiterName.trim() ? waiterName.trim() : 'Garson',
      expectedSourceVersion: typeof expectedSourceVersion === 'number' ? expectedSourceVersion : undefined,
      expectedTargetVersion: typeof expectedTargetVersion === 'number' ? expectedTargetVersion : undefined,
    });

    return NextResponse.json({
      success: true,
      message: mode === 'transfer' ? 'Masa başarıyla aktarıldı.' : 'Masalar başarıyla birleştirildi.',
      data: result,
    });
  } catch (err: any) {
    if (err instanceof TableTransferError) {
      const statusCode =
        err.code === 'OPTIMISTIC_LOCK_CONFLICT'
          ? 409
          : err.code === 'TARGET_TABLE_OCCUPIED' || err.code === 'SAME_TABLE_ERROR' || err.code === 'INVALID_TABLE_IDS'
          ? 400
          : err.code === 'SOURCE_TABLE_NOT_FOUND' || err.code === 'TARGET_TABLE_NOT_FOUND'
          ? 404
          : err.code === 'DATABASE_REQUIRED'
          ? 503
          : 500;

      return NextResponse.json(
        {
          success: false,
          errorCode: err.code,
          error: err.message,
        },
        { status: statusCode }
      );
    }

    structuredLogger.error('Masa aktarımı beklenmeyen hata', { error: err?.message });
    return NextResponse.json(
      {
        success: false,
        error: 'Masa aktarımı sırasında beklenmeyen bir hata oluştu.',
      },
      { status: 500 }
    );
  }
}
