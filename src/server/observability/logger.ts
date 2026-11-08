import crypto from 'crypto';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  correlationId: string;
  event: string;
  tenantId?: string;
  tableId?: string;
  orderId?: string;
  latencyMs?: number;
  message?: string;
  meta?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export class Span {
  private startTime: number;

  constructor(
    public readonly name: string,
    public readonly correlationId: string,
    public readonly tenantId?: string,
    public readonly tableId?: string
  ) {
    this.startTime = Date.now();
  }

  public end(extraMeta?: Record<string, any>): number {
    const duration = Date.now() - this.startTime;
    structuredLogger.info(`[Span: ${this.name}] Tamamlandı`, {
      correlationId: this.correlationId,
      event: `span_${this.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_completed`,
      tenantId: this.tenantId,
      tableId: this.tableId,
      latencyMs: duration,
      meta: extraMeta,
    });
    return duration;
  }
}

/**
 * MasaLink Yapısal Günlük Kayıt Sistemi (Structured Observability Logger)
 * 
 * Özellikler:
 * 1. JSON formatında makine-okunur (Datadog, Grafana Loki, CloudWatch uyumlu) günlükler.
 * 2. `correlationId` (Trace ID) takibi ile siparişin QR'dan fiş basımına kadar tüm yolculuğunu eşleştirme.
 * 3. Milisaniye hassasiyetli `latencyMs` metrik ölçümü.
 */
class StructuredLogger {
  private generateCorrelationId(): string {
    return `trc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  public startSpan(name: string, correlationId?: string, tenantId?: string, tableId?: string): Span {
    const traceId = correlationId || this.generateCorrelationId();
    return new Span(name, traceId, tenantId, tableId);
  }

  private log(level: LogLevel, message: string, context: Partial<StructuredLog> = {}) {
    const correlationId = context.correlationId || this.generateCorrelationId();
    const entry: StructuredLog = {
      timestamp: new Date().toISOString(),
      level,
      correlationId,
      event: context.event || 'app_event',
      tenantId: context.tenantId,
      tableId: context.tableId,
      orderId: context.orderId,
      latencyMs: context.latencyMs,
      message,
      meta: context.meta,
      error: context.error,
    };

    const formatted = JSON.stringify(entry);
    if (level === 'ERROR') {
      console.error(formatted);
    } else if (level === 'WARN') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }

    return entry;
  }

  public debug(message: string, context: Partial<StructuredLog> = {}): StructuredLog {
    return this.log('DEBUG', message, context);
  }

  public info(message: string, context: Partial<StructuredLog> = {}): StructuredLog {
    return this.log('INFO', message, context);
  }

  public warn(message: string, context: Partial<StructuredLog> = {}): StructuredLog {
    return this.log('WARN', message, context);
  }

  public error(message: string, err?: Error | unknown, context: Partial<StructuredLog> = {}): StructuredLog {
    const errorObj = err instanceof Error ? {
      name: err.name,
      message: err.message,
      stack: err.stack,
    } : undefined;

    return this.log('ERROR', message, { ...context, error: errorObj });
  }
}

export const structuredLogger = new StructuredLogger();
