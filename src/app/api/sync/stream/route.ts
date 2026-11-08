import { NextRequest } from 'next/server';
import { resolveTenantContext } from '@/server/db/tenantContext';
import { resolveTenantFromRequest } from '@/utils/tenantAuth';
import { realtimeHub } from '@/server/realtime/realtimeHub';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const tenantCtx = resolveTenantContext(req);
    const authStaff = resolveTenantFromRequest(req);
    const tenantId = authStaff?.tenantId || tenantCtx.tenantId;

    const encoder = new TextEncoder();
    let keepAliveTimer: NodeJS.Timeout | null = null;
    let unregister: (() => void) | null = null;

    const stream = new ReadableStream({
      start(controller) {
        // 1. İstemciyi RealtimeHub'a kaydet
        unregister = realtimeHub.registerClient(
          tenantId,
          (data: string) => {
            try {
              controller.enqueue(encoder.encode(data));
            } catch (e) {
              // İstemci soketi kapandıysa
            }
          },
          () => {
            try {
              controller.close();
            } catch (e) {}
          }
        );

        // 2. Anında Bağlantı Onayı (Handshake Event) Gönder
        const handshake = {
          type: 'SYNC_CONNECTED',
          tenantId,
          timestamp: new Date().toISOString(),
          message: 'MasaLink Real-Time Olay Akışı Aktif (SSE < 20ms)',
        };
        controller.enqueue(encoder.encode(`event: handshake\ndata: ${JSON.stringify(handshake)}\n\n`));

        // 3. Kalp Atışı (Keep-Alive Ping) - 15 saniyede bir
        keepAliveTimer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(':ping\n\n'));
          } catch (e) {
            if (keepAliveTimer) clearInterval(keepAliveTimer);
          }
        }, 15000);
      },
      cancel() {
        if (keepAliveTimer) clearInterval(keepAliveTimer);
        if (unregister) unregister();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Nginx proxy arabelleğe almayı engeller
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: 'Fail-Closed: Kiracı kimliği doğrulanamadı.' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
