import { redis } from '../redis/redisClient';
import { realtimeHub } from '../realtime/realtimeHub';

export interface OperationalMetrics {
  uptimeSeconds: number;
  orders: {
    submittedTotal: number;
    kdsTicketsProcessed: number;
    readyTotal: number;
    cancelledTotal: number;
  };
  payments: {
    completedTotal: number;
    totalRevenueTry: number;
    onlineProviders: {
      iyzicoTotal: number;
      paytrTotal: number;
    };
    cashTotal: number;
    cardTotal: number;
  };
  tables: {
    sessionsClosedTotal: number;
    activeSessions: number;
  };
  printer: {
    receiptsPrintedTotal: number;
    failuresTotal: number;
  };
  performance: {
    avgOrderToKdsLatencyMs: number;
    avgKdsPrepDurationMs: number;
    avgPaymentDurationMs: number;
    avgReceiptPrintDurationMs: number;
  };
  infrastructure: {
    redisEngine: string;
    redisConnected: boolean;
    realtimeActiveClients: number;
  };
}

/**
 * MasaLink Operasyonel Metrik Toplayıcı (Operational Metrics Collector)
 * 
 * QR Sipariş -> KDS -> Hazır -> Ödeme -> Adisyon Kapatma -> Fiş Basımı
 * zincirindeki tüm aşamaların canlı performans ve sayaç metriklerini toplar.
 */
class MetricsCollector {
  private startTime = Date.now();

  // Sayaçlar
  private ordersSubmitted = 0;
  private kdsTicketsProcessed = 0;
  private ordersReady = 0;
  private ordersCancelled = 0;

  private paymentsCompleted = 0;
  private totalRevenueTry = 0;
  private iyzicoTotal = 0;
  private paytrTotal = 0;
  private cashTotal = 0;
  private cardTotal = 0;

  private sessionsClosed = 0;
  private receiptsPrinted = 0;
  private printFailures = 0;

  // Gecikme Örnekleri (Kayan Pencere)
  private orderToKdsLatencies: number[] = [];
  private kdsPrepDurations: number[] = [];
  private paymentDurations: number[] = [];
  private receiptPrintDurations: number[] = [];

  private recordLatency(arr: number[], ms: number, maxSamples = 100) {
    arr.push(ms);
    if (arr.length > maxSamples) {
      arr.shift();
    }
  }

  private calcAvg(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sum = arr.reduce((acc, v) => acc + v, 0);
    return Math.round((sum / arr.length) * 10) / 10;
  }

  // --- Olay Kayıt Fonksiyonları ---

  public recordOrderSubmitted(meta?: { source?: string; amount?: number }) {
    this.ordersSubmitted++;
  }

  public recordKdsProcessed(latencyMs: number) {
    this.kdsTicketsProcessed++;
    this.recordLatency(this.orderToKdsLatencies, latencyMs);
  }

  public recordOrderReady(prepDurationMs: number) {
    this.ordersReady++;
    this.recordLatency(this.kdsPrepDurations, prepDurationMs);
  }

  public recordOrderCancelled() {
    this.ordersCancelled++;
  }

  public recordPaymentCompleted(params: {
    amount: number;
    provider?: 'IYZICO' | 'PAYTR' | string;
    method?: 'ONLINE' | 'CASH' | 'CARD' | string;
    durationMs?: number;
  }) {
    this.paymentsCompleted++;
    this.totalRevenueTry += params.amount;

    if (params.provider === 'IYZICO') this.iyzicoTotal++;
    else if (params.provider === 'PAYTR') this.paytrTotal++;

    if (params.method === 'CASH') this.cashTotal++;
    else if (params.method === 'CARD') this.cardTotal++;

    if (params.durationMs) {
      this.recordLatency(this.paymentDurations, params.durationMs);
    }
  }

  public recordSessionClosed() {
    this.sessionsClosed++;
  }

  public recordReceiptPrinted(durationMs?: number) {
    this.receiptsPrinted++;
    if (durationMs) {
      this.recordLatency(this.receiptPrintDurations, durationMs);
    }
  }

  public recordPrintFailure() {
    this.printFailures++;
  }

  /**
   * Canlı Metrik Raporu
   */
  public getSnapshot(): OperationalMetrics {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const redisStatus = redis.getStatus();

    return {
      uptimeSeconds,
      orders: {
        submittedTotal: this.ordersSubmitted,
        kdsTicketsProcessed: this.kdsTicketsProcessed,
        readyTotal: this.ordersReady,
        cancelledTotal: this.ordersCancelled,
      },
      payments: {
        completedTotal: this.paymentsCompleted,
        totalRevenueTry: Math.round(this.totalRevenueTry * 100) / 100,
        onlineProviders: {
          iyzicoTotal: this.iyzicoTotal,
          paytrTotal: this.paytrTotal,
        },
        cashTotal: this.cashTotal,
        cardTotal: this.cardTotal,
      },
      tables: {
        sessionsClosedTotal: this.sessionsClosed,
        activeSessions: Math.max(0, this.ordersSubmitted - this.sessionsClosed),
      },
      printer: {
        receiptsPrintedTotal: this.receiptsPrinted,
        failuresTotal: this.printFailures,
      },
      performance: {
        avgOrderToKdsLatencyMs: this.calcAvg(this.orderToKdsLatencies),
        avgKdsPrepDurationMs: this.calcAvg(this.kdsPrepDurations),
        avgPaymentDurationMs: this.calcAvg(this.paymentDurations),
        avgReceiptPrintDurationMs: this.calcAvg(this.receiptPrintDurations),
      },
      infrastructure: {
        redisEngine: redisStatus.engine,
        redisConnected: redisStatus.connected,
        realtimeActiveClients: realtimeHub.getConnectedCount('tenant-artisan-burger'),
      },
    };
  }

  public resetForTesting() {
    this.ordersSubmitted = 0;
    this.kdsTicketsProcessed = 0;
    this.ordersReady = 0;
    this.ordersCancelled = 0;
    this.paymentsCompleted = 0;
    this.totalRevenueTry = 0;
    this.iyzicoTotal = 0;
    this.paytrTotal = 0;
    this.cashTotal = 0;
    this.cardTotal = 0;
    this.sessionsClosed = 0;
    this.receiptsPrinted = 0;
    this.printFailures = 0;
    this.orderToKdsLatencies = [];
    this.kdsPrepDurations = [];
    this.paymentDurations = [];
    this.receiptPrintDurations = [];
  }
}

export const metricsCollector = new MetricsCollector();
