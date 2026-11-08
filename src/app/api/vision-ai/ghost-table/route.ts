import { NextRequest, NextResponse } from 'next/server';
import { 
  evaluateGhostTableTelemetry, 
  VisionTableTelemetry, 
  GHOST_TABLE_THRESHOLD_SECONDS,
  GHOST_TABLE_WARNING_SECONDS 
} from '@/utils/visionGhostTableDetector';
import { getStoredTables, saveStoredTables, INITIAL_TABLES } from '@/utils/tableData';
import { resolveTenantFromRequest } from '@/utils/tenantAuth';
import { requireTenant } from '@/server/security/authGuard';
import { safeErrorResponse } from '@/server/security/errorHandler';

export async function GET() {
  return NextResponse.json({
    status: 'online',
    module: 'Vision AI Ghost Table (Hayalet Masa) & Auto-Timeout Engine',
    rules: {
      thresholdSeconds: GHOST_TABLE_THRESHOLD_SECONDS,
      thresholdMinutes: GHOST_TABLE_THRESHOLD_SECONDS / 60,
      warningSeconds: GHOST_TABLE_WARNING_SECONDS,
      minConfidenceScore: 0.60,
      actions: [
        'REVOKE_TABLE_SESSION_TOKEN',
        'AUTO_RESET_TO_CLEANING',
        'DISPATCH_WAITER_AUDIO_VIBRATION_MISSION',
        'UPDATE_CASHIER_POS_FLOOR_MAP'
      ]
    }
  });
}

export async function POST(req: NextRequest) {
  try {
    // 🛡️ Yetki Denetimi: Yalnızca NVR/Edge servis anahtarı veya yetkili personel telemetri gönderebilir
    const authStaff = resolveTenantFromRequest(req);
    const tenantCheck = requireTenant(req);
    
    if (!authStaff && !tenantCheck.ok) {
      return NextResponse.json(
        { success: false, error: 'Yetkisiz erişim: Vision AI telemetrisi için yetkili oturum veya servis anahtarı zorunludur.' },
        { status: 401 }
      );
    }

    const resolvedTenant = authStaff?.tenantId || (tenantCheck.ok ? tenantCheck.data.tenantSlug : null);
    if (!resolvedTenant) {
      return NextResponse.json(
        { success: false, error: 'Fail-Closed: Kiracı bilgisi bulunamadı.' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      tableId,
      tableName = 'Masa',
      section = 'salon',
      personCount = 0,
      emptyDurationSeconds = 0,
      confidenceScore = 0.95,
      currentTableStatus = 'served',
      totalAmount = 0,
      assignedWaiter = 'Ahmet Yılmaz',
    } = body as Partial<VisionTableTelemetry>;

    if (!tableId) {
      return NextResponse.json({ success: false, error: 'tableId parametresi zorunludur.' }, { status: 400 });
    }

    const telemetry: VisionTableTelemetry = {
      tableId,
      tableName,
      section: section as any,
      personCount,
      emptyDurationSeconds,
      confidenceScore,
      currentTableStatus,
      totalAmount,
      assignedWaiter,
    };

    const evaluation = evaluateGhostTableTelemetry(telemetry, resolvedTenant);

    return NextResponse.json({
      success: true,
      evaluation,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    return safeErrorResponse(error, req, { fallbackMessage: 'Telemetri işlenemedi.' });
  }
}
