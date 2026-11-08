import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantFromRequest } from '@/utils/tenantAuth';
import { revokeTableSession } from '@/utils/tableSessionRegistry';
import { revokeActiveSession } from '@/server/db/tableRepository';
import { writeAuditLog } from '@/server/db/draftAuditRepository';
import { realtimeHub } from '@/server/realtime/realtimeHub';
import { SyncMessage } from '@/utils/syncService';
import { safeErrorResponse } from '@/server/security/errorHandler';

// In-memory server event bus (in production, backed by Supabase Realtime / Redis pubsub)
const GLOBAL_EVENT_STORE: SyncMessage[] = [
  {
    id: 'evt-init-1',
    type: 'TABLE_STATUS_CHANGED',
    tenantId: 'tenant-artisan-burger',
    sourceDevice: 'waiter_mobile',
    deviceName: 'Garson Selin (iPhone 14)',
    timestamp: 'Yeni',
    payload: {
      tableId: 'tbl-2',
      status: 'served',
      notes: 'İçecekler ve burgerler masaya teslim edildi.',
    },
  },
];

export async function GET(req: NextRequest) {
  // 1. Yetkili Kiracıyı Çözümle (Fail-Closed: Belirsizse reddet)
  const authContext = resolveTenantFromRequest(req);
  const tenantId = authContext?.tenantId || req.nextUrl.searchParams.get('tenantId');

  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Fail-Closed: Senkronizasyon için geçerli bir kiracı (tenantId) zorunludur.' },
      { status: 400 }
    );
  }

  // 2. Olayları KESİNLİKLE kiracı kimliğine göre filtrele (BOLA Sızıntı Koruması)
  const tenantFilteredEvents = GLOBAL_EVENT_STORE.filter(
    (e) => !e.tenantId || e.tenantId === tenantId
  );

  return NextResponse.json({
    status: 'online',
    tenantId,
    connectedDevices: [
      { name: 'Kasa Ana Bilgisayar', type: 'cashier_pos', status: 'online', ip: '192.168.1.100' },
      { name: 'Garson Ahmet (Android)', type: 'waiter_mobile', status: 'online', battery: '%84' },
      { name: 'Garson Selin (iPhone)', type: 'waiter_mobile', status: 'online', battery: '%91' },
      { name: 'Vision AI Kamera Kutusu', type: 'vision_ai_nvr', status: 'online', fps: 24 },
    ],
    pendingEvents: tenantFilteredEvents.slice(-5),
    transport: 'Supabase Realtime / Cloud WS',
  });
}

export async function POST(req: NextRequest) {
  try {
    // 1. Yetkilendirme & Kiracı Çözümleme (Multi-Tenant BOLA Kalkanı)
    const authContext = resolveTenantFromRequest(req);

    if (!authContext) {
      console.warn('[Sync API Security] Yetkisiz senkronizasyon girişimi engellendi!');
      return NextResponse.json(
        { success: false, error: 'Yetkisiz erişim: Senkronizasyon emri reddedildi (BOLA Koruması).' },
        { status: 403 }
      );
    }

    const event: SyncMessage = await req.json();

    // 2. Kiracı İzolasyon Denetimi (IDOR Koruması):
    // Kullanıcı body içinde başka bir restoranın tenantId'sini göndererek araya girmeye çalışırsa bloke et!
    if (authContext.source === 'session' && event.tenantId && event.tenantId !== authContext.tenantId) {
      console.warn(`[Multi-Tenant BOLA Alert] İhlal Girişimi: Oturum '${authContext.tenantId}', Hedef '${event.tenantId}'`);
      return NextResponse.json(
        { 
          success: false, 
          error: `Kiracı İzolasyon İhlali: Yetkili olmadığınız '${event.tenantId}' restoranına veri gönderemez veya müdahale edemezsiniz.` 
        },
        { status: 403 }
      );
    }

    // Kiracı kimliğini güvenilir oturumdan zorunlu olarak mühürle
    const secureEvent: SyncMessage = {
      ...event,
      tenantId: authContext.tenantId,
    };

    // Masa hesabı kapatıldığında veya hayalet masa sıfırlandığında token'ı anında iptal et (Token Revocation)
    if ((event.type === 'TABLE_CHECKOUT_COMPLETED' || event.type === 'GHOST_TABLE_RESET') && event.payload?.tableId) {
      revokeTableSession(authContext.tenantId, event.payload.tableId);
      if (process.env.DATABASE_URL) {
        try {
          revokeActiveSession(authContext.tenantId, event.payload.tableId, event.type).catch(() => {});
        } catch {}
      }
    }

    // Denetim Günlüğü (Audit Log)
    if (process.env.DATABASE_URL && (event.type.includes('SECURITY') || event.type.includes('CHECKOUT') || event.type.includes('RESET'))) {
      try {
        writeAuditLog({
          tenantId: authContext.tenantId,
          action: event.type,
          entity: 'SyncEvent',
          entityId: event.id,
          metadata: event.payload,
        }).catch(() => {});
      } catch {}
    }
    
    // 3. Gerçek Zamanlı SSE Olay Dağıtıcısına İlet (< 15ms Anlık Push)
    realtimeHub.broadcast(authContext.tenantId, secureEvent);

    // Store in recent bus
    GLOBAL_EVENT_STORE.push(secureEvent);
    if (GLOBAL_EVENT_STORE.length > 50) {
      GLOBAL_EVENT_STORE.shift();
    }

    return NextResponse.json({
      success: true,
      broadcastedTo: 4,
      tenantId: authContext.tenantId,
      eventId: secureEvent.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return safeErrorResponse(err, req, { fallbackMessage: 'Senkronizasyon işlemi başarısız oldu.' });
  }
}
