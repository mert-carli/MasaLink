import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { redis } from '@/server/redis/redisClient';
import { realtimeHub } from '@/server/realtime/realtimeHub';
import { metricsCollector } from '@/server/observability/metrics';

/**
 * MasaLink Sağlık ve Canlılık Kontrol Noktası (Health / Liveness / Readiness Endpoint)
 * 
 * 1. Liveness Probe (?type=live):
 *    - Kubernetes veya Docker konteyner sürecinin ayakta olup olmadığını kontrol eder.
 *    - Veritabanına yük bindirmez, anında 200 döner.
 * 2. Readiness Probe (?type=ready):
 *    - Uygulamanın istek almaya hazır olup olmadığını (PostgreSQL bağlantısı) doğrular.
 *    - Veritabanı ulaşılamaz ise 503 döner (Trafik bu pod'a yönlendirilmez).
 * 3. Genel Health Check (varsayılan):
 *    - DB gecikmesi, Redis durumu, çalışma süresi ve bellek tüketimini raporlar.
 *    - Production modunda hassas verileri (finansal toplamlar, müşteri sayıları) sızdırmaz.
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const searchParams = req.nextUrl.searchParams;
  const probeType = searchParams.get('type')?.toLowerCase();

  // 1. KUBERNETES / DOCKER LIVENESS PROBE
  if (probeType === 'live' || probeType === 'liveness') {
    return NextResponse.json(
      {
        status: 'alive',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  }

  // 2. DEPENDENCY SAĞLIK DENETİMİ (PostgreSQL)
  let dbStatus = 'disconnected';
  let dbLatencyMs = 0;

  if (process.env.DATABASE_URL) {
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - dbStart;
      dbStatus = 'healthy';
    } catch (_) {
      dbStatus = 'unreachable';
    }
  } else {
    dbStatus = process.env.NODE_ENV === 'production' ? 'unconfigured' : 'dev_fallback_memory';
  }

  const isHealthy = process.env.NODE_ENV === 'production'
    ? (Boolean(process.env.DATABASE_URL) && dbStatus === 'healthy')
    : dbStatus !== 'unreachable';

  // 3. KUBERNETES / DOCKER READINESS PROBE
  if (probeType === 'ready' || probeType === 'readiness') {
    const isReady = isHealthy && dbStatus === 'healthy';
    return NextResponse.json(
      {
        status: isReady ? 'ready' : 'not_ready',
        database: dbStatus,
        timestamp: new Date().toISOString(),
      },
      { status: isReady ? 200 : 503 }
    );
  }

  // 4. PRODUCTION GÜVENLİK FİLTRESİ
  // Production ortamında hassas finansal verileri ve kiracı detaylarını sızdırma!
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        status: isHealthy ? 'healthy' : 'degraded',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        checks: {
          database: dbStatus,
          redis: redis.getStatus().connected ? 'healthy' : 'degraded',
        },
      },
      { status: isHealthy ? 200 : 503 }
    );
  }

  // 5. GELİŞTİRME / TEST DETAYLI RAPORU
  const redisStatus = redis.getStatus();
  const memUsage = process.memoryUsage();
  const metrics = metricsCollector.getSnapshot();

  return NextResponse.json(
    {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptimeSeconds: Math.floor(process.uptime()),
      latencyMs: Date.now() - startTime,
      services: {
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
        },
        redis: {
          engine: redisStatus.engine,
          connected: redisStatus.connected,
          activeKeys: redisStatus.activeKeyCount,
        },
        realtimeHub: {
          activeClients: realtimeHub.getConnectedCount('tenant-artisan-burger'),
        },
      },
      metricsSummary: {
        totalOrders: metrics.orders.submittedTotal,
        totalRevenueTry: metrics.payments.totalRevenueTry,
        receiptsPrinted: metrics.printer.receiptsPrintedTotal,
      },
      memory: {
        rssMb: Math.round((memUsage.rss / 1024 / 1024) * 10) / 10,
        heapUsedMb: Math.round((memUsage.heapUsed / 1024 / 1024) * 10) / 10,
        heapTotalMb: Math.round((memUsage.heapTotal / 1024 / 1024) * 10) / 10,
      },
    },
    { status: isHealthy ? 200 : 503 }
  );
}
