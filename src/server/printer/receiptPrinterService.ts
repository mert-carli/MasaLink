import crypto from 'crypto';
import { prisma } from '@/server/db/prisma';
import { createTenantDb } from '@/server/db/tenantDb';
import { realtimeHub } from '@/server/realtime/realtimeHub';
import { structuredLogger } from '@/server/observability/logger';
import { metricsCollector } from '@/server/observability/metrics';
import { sanitizePrintText, buildEscPosRawPayload } from '@/utils/printBridge';
import { ReceiptData } from '@/components/admin/ThermalReceiptModal';

export interface PrintReceiptParams {
  tenantId: string;
  tableId: string;
  tableName: string;
  orderId: string;
  cashierName?: string;
  paymentMethod: string;
  items: {
    name: string;
    quantity: number;
    price: number;
  }[];
  subtotal: number;
  taxAmount?: number;
  total: number;
  correlationId?: string;
  isKitchenTicket?: boolean;
}

export interface PrintReceiptResult {
  success: boolean;
  receiptNumber: string;
  orderId: string;
  tableId: string;
  total: number;
  rawEscPosLength: number;
  printedAt: string;
  durationMs: number;
  error?: string;
}

/**
 * MasaLink Termal Fiş ve Yazıcı Servisi (Thermal Receipt & Hardware Agent)
 * 
 * Sorumluluklar:
 * 1. ESC/POS 80mm termal fiş çıktısı hazırlama (Kasa Adisyon & Mutfak Sipariş Fişi).
 * 2. Donanım enjeksiyon koruması (Control Character Sanitization).
 * 3. Gerçek zamanlı terminallere (Kasa, Garson) fiş basıldı olayı yayma.
 * 4. Fiş denetim kaydını (Audit Trail) ve gözlemlenebilirlik ölçümlerini kaydetme.
 */
export class ReceiptPrinterService {
  private static receiptCounter = 1000;

  public static async printReceipt(params: PrintReceiptParams): Promise<PrintReceiptResult> {
    const correlationId = params.correlationId || `trc_prn_${Date.now()}`;
    const span = structuredLogger.startSpan('ThermalReceiptPrint', correlationId, params.tenantId, params.tableId);

    const receiptNumber = `F-${Date.now().toString().slice(-4)}-${++this.receiptCounter}`;
    const now = new Date().toLocaleString('tr-TR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    try {
      // 1. ESC/POS Fiş Modeli Hazırlığı
      const receiptData: ReceiptData = {
        type: params.isKitchenTicket ? 'kitchen' : 'bill',
        tableNumber: sanitizePrintText(params.tableName || params.tableId),
        orderId: sanitizePrintText(params.orderId),
        waiterName: sanitizePrintText(params.cashierName || 'Kasa Görevlisi'),
        timestamp: now,
        items: params.items.map((i) => ({
          name: sanitizePrintText(i.name),
          quantity: i.quantity,
          price: i.price,
        })),
        subtotal: params.subtotal,
        vat: params.taxAmount || Math.round(params.total * 0.1 * 100) / 100, // %10 Restoran KDV
        total: params.total,
        paymentMethod: sanitizePrintText(params.paymentMethod),
      };

      // 2. ESC/POS İkili Bayt Akışı Üretimi
      const rawEscPos = buildEscPosRawPayload(receiptData);
      const rawLength = rawEscPos.length;

      // 3. PostgreSQL Denetim Günlüğü (Audit Trail)
      if (process.env.DATABASE_URL) {
        try {
          const tenantDb = createTenantDb({ tenantId: params.tenantId });
          await tenantDb.auditLog.create({
            data: {
              tenantId: params.tenantId,
              action: params.isKitchenTicket ? 'KITCHEN_TICKET_PRINTED' : 'FISCAL_RECEIPT_PRINTED',
              entity: 'Table',
              entityId: params.tableId,
              metadata: {
                receiptNumber,
                orderId: params.orderId,
                total: params.total,
                paymentMethod: params.paymentMethod,
                correlationId,
              },
            },
          });
        } catch (dbErr) {
          structuredLogger.warn('[ReceiptPrinter] DB denetim kaydı uyarısı', {
            correlationId,
            meta: { error: String(dbErr) },
          });
        }
      }

      const durationMs = span.end({
        receiptNumber,
        orderId: params.orderId,
        rawBytes: rawLength,
      });

      // 4. Metrikleri Güncelle
      metricsCollector.recordReceiptPrinted(durationMs);

      // 5. Çoklu Cihaz Realtime SSE Bildirimi
      realtimeHub.broadcast(params.tenantId, {
        id: `evt_rcpt_${Date.now()}`,
        type: 'TABLE_STATUS_CHANGED',
        tenantId: params.tenantId,
        sourceDevice: 'cashier_pos',
        deviceName: 'Termal Fiş Yazıcısı (80mm)',
        timestamp: new Date().toISOString(),
        payload: {
          tableId: params.tableId,
          receiptNumber,
          orderId: params.orderId,
          total: params.total,
          status: 'RECEIPT_PRINTED',
          message: `${params.tableName} adisyon fişi (#${receiptNumber}) basıldı.`,
        },
      });

      return {
        success: true,
        receiptNumber,
        orderId: params.orderId,
        tableId: params.tableId,
        total: params.total,
        rawEscPosLength: rawLength,
        printedAt: now,
        durationMs,
      };
    } catch (err: any) {
      metricsCollector.recordPrintFailure();
      structuredLogger.error('[ReceiptPrinter] Fiş basımı sırasında hata oluştu', err, {
        correlationId,
        tenantId: params.tenantId,
        tableId: params.tableId,
      });

      return {
        success: false,
        receiptNumber: '',
        orderId: params.orderId,
        tableId: params.tableId,
        total: params.total,
        rawEscPosLength: 0,
        printedAt: now,
        durationMs: 0,
        error: err.message || 'Yazıcı bağlantı hatası',
      };
    }
  }
}
