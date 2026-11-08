import { Prisma, TableSessionStatus } from '@prisma/client';
import { prisma } from '@/server/db/prisma';
import { createTenantDb } from '@/server/db/tenantDb';
import {
  findTableByCode,
  getActiveSession,
  revokeActiveSession as dbRevokeActiveSession,
  recordPartialPayment,
} from '@/server/db/tableRepository';
import {
  withTableLock,
  recordAtomicPartialPayment,
  clearTableLedger,
} from '@/utils/concurrencyLock';
import { withDistributedLock } from '@/server/redis/distributedLock';
import { CacheService } from '@/server/redis/cacheService';
import { realtimeHub } from '@/server/realtime/realtimeHub';
import { getStoredTables, saveStoredTables, AdminTable } from '@/utils/tableData';
import { metricsCollector } from '@/server/observability/metrics';
import { structuredLogger } from '@/server/observability/logger';
import {
  IPaymentGateway,
  InitiatePaymentParams,
  InitiatePaymentResult,
  PaymentProviderType,
  PaymentRecord,
  WebhookVerificationResult,
} from './types';
import { IyzicoProvider } from './providers/iyzicoProvider';
import { PayTRProvider } from './providers/paytrProvider';

export class PaymentDomainError extends Error {
  constructor(message: string, public readonly code: string = 'PAYMENT_ERROR') {
    super(message);
    this.name = 'PaymentDomainError';
  }
}

// Bellek İçi Ödeme Kayıt Defteri (Veritabanı bağlı olmadığında dev/test fallback'i)
const PENDING_PAYMENT_RECORDS = new Map<string, PaymentRecord>();

/**
 * MasaLink Merkezi Ödeme Servisi (Centralized Payment Service)
 * 
 * Sorumluluklar:
 * 1. Iyzico ve PayTR sağlayıcılarını tek çatı altında yönetme (Adapter Pattern).
 * 2. Masadan QR ile çevrimiçi ödeme başlatma (3D Secure / Checkout Form).
 * 3. Webhook ve geri bildirim imzalarını (HMAC-SHA256) doğrulama.
 * 4. Çift tahsilatı ve yarış durumlarını engelleyen atomik dağıtık kilit (Distributed Table Lock).
 * 5. Hesap tamamen kapandığında PostgreSQL oturumunu kapatma, masayı boşaltma,
 *    Redis QR oturumunu geçersiz kılma ve KDS/Kasa/Garson ekranlarına anlık SSE yayını yapma.
 */
export class PaymentService {
  private static providers = new Map<PaymentProviderType, IPaymentGateway>([
    ['IYZICO', new IyzicoProvider() as IPaymentGateway],
    ['PAYTR', new PayTRProvider() as IPaymentGateway],
  ]);

  /**
   * Sağlayıcı seçimi (Varsayılan IYZICO veya PAYTR)
   */
  public static getGateway(provider?: PaymentProviderType): IPaymentGateway {
    const selected = provider || (process.env.DEFAULT_PAYMENT_PROVIDER?.toUpperCase() as PaymentProviderType) || 'IYZICO';
    const gateway = this.providers.get(selected);
    if (!gateway) {
      throw new PaymentDomainError(`Bilinmeyen ödeme sağlayıcısı: ${selected}`, 'UNKNOWN_PROVIDER');
    }
    return gateway;
  }

  /**
   * 1. Çevrimiçi Ödeme Başlatma (Iyzico / PayTR QR Checkout)
   */
  public static async initiateOnlinePayment(
    params: InitiatePaymentParams,
    preferredProvider?: PaymentProviderType
  ): Promise<InitiatePaymentResult> {
    if (!params.tenantId || !params.tableId || !Number.isFinite(params.amount) || params.amount <= 0 || params.amount > 1_000_000) {
      throw new PaymentDomainError('Geçersiz ödeme parametreleri: tenantId, tableId ve sıfırdan büyük sonlu tutar zorunludur.', 'INVALID_PARAMS');
    }

    const gateway = this.getGateway(preferredProvider);

    // Dağıtık Kilit altında tutar ve bakiye kontrolü
    return await withTableLock(params.tableId, async () => {
      // Masanın mevcut durumunu doğrula
      const storedTables = getStoredTables();
      const currentTable = storedTables.find((t) => t.id === params.tableId);
      const totalAmount = currentTable?.totalAmount || params.amount;

      // Bekleyen işlem kaydını oluştur
      const merchantOrderId = params.idempotencyKey || `ord_${params.tenantId}_${params.tableId}_${Date.now()}`;
      
      const paymentRecord: PaymentRecord = {
        id: `pay_${Date.now()}`,
        tenantId: params.tenantId,
        tableId: params.tableId,
        sessionId: params.sessionId,
        provider: gateway.providerName,
        method: 'ONLINE',
        status: 'PENDING',
        amount: params.amount,
        currency: params.currency || 'TRY',
        merchantOrderId,
        isPartial: !!params.isPartialPayment,
        guestName: params.guestName,
        createdAt: new Date().toISOString(),
      };

      PENDING_PAYMENT_RECORDS.set(merchantOrderId, paymentRecord);

      // Sağlayıcıya ilet
      const result = await gateway.initiatePayment({
        ...params,
        idempotencyKey: merchantOrderId,
      });

      if (!result.success) {
        paymentRecord.status = 'FAILED';
        paymentRecord.error = result.errorMessage;
      }

      return result;
    });
  }

  /**
   * 2. Webhook & Geri Bildirim İşleme (Iyzico / PayTR Webhook Listener)
   */
  public static async processWebhook(
    provider: PaymentProviderType,
    rawBody: string | Record<string, any>,
    headers?: Record<string, string>
  ): Promise<{
    success: boolean;
    verification: WebhookVerificationResult;
    isCompleted?: boolean;
    remainingBalance?: number;
    error?: string;
  }> {
    const gateway = this.getGateway(provider);

    // Kriptografik imza doğrulaması
    const verification = await gateway.verifyWebhook(rawBody, headers);
    if (!verification.isValid) {
      console.warn(`[PaymentService] ${provider} webhook imza doğrulaması başarısız!`, verification.errorMessage);
      return { success: false, verification, error: verification.errorMessage || 'Geçersiz HMAC imzası' };
    }

    if (verification.status !== 'SUCCESS') {
      console.warn(`[PaymentService] ${provider} ödeme başarısız bildirimi aldı:`, verification.merchantOrderId);
      return { success: false, verification, error: 'Ödeme sağlayıcısı işlemi onaylamadı.' };
    }

    // Başarılı ödeme tahsilatının tamamlanması
    const settlement = await this.finalizeSettlement({
      merchantOrderId: verification.merchantOrderId,
      paidAmount: verification.paidAmount,
      provider: verification.provider,
      providerTransactionId: verification.providerTransactionId,
    });

    return {
      success: true,
      verification,
      isCompleted: settlement.isCompleted,
      remainingBalance: settlement.remainingBalance,
    };
  }

  /**
   * 3. Atomik Tahsilat Kapatma (Settlement & Real-Time Broadcast)
   */
  public static async finalizeSettlement(params: {
    merchantOrderId: string;
    paidAmount: number;
    provider: PaymentProviderType;
    providerTransactionId: string;
  }): Promise<{ isCompleted: boolean; remainingBalance: number; tableId: string }> {
    const paymentLockKey = `payment:${params.merchantOrderId}`;

    // Webhook yarış durumlarını önlemek için işlem bazlı dağıtık kilit
    return await withDistributedLock(paymentLockKey, async () => {
      const record = PENDING_PAYMENT_RECORDS.get(params.merchantOrderId);

      // Mükerrer / Replay Webhook Koruması (Idempotent Webhook Guard)
      if (record && record.status === 'COMPLETED') {
        console.info(
          `[PaymentService] ${params.merchantOrderId} için mükerrer webhook çağrısı tespit edildi (idempotent no-op).`
        );
        return {
          isCompleted: true,
          remainingBalance: 0,
          tableId: record.tableId,
        };
      }
      let tenantId = record?.tenantId;
      let tableId = record?.tableId;

      if ((!tableId || !tenantId) && params.merchantOrderId.startsWith('ord_')) {
        const parts = params.merchantOrderId.split('_');
        if (parts.length >= 3) {
          tenantId = parts[1];
          tableId = parts[2];
        }
      }

      // Fail-Closed: Kiracı veya Masa kimliği belirsizse tahsilatı kesinlikle reddet!
      if (!tenantId || !tableId) {
        throw new PaymentDomainError(
          'Fail-Closed: Ödeme mutabakatı için kiracı (tenantId) ve masa (tableId) kimliği zorunludur.',
          'INVALID_SETTLEMENT_PAYLOAD'
        );
      }

      // Veritabanı Idempotent Çift Tahsilat Kontrolü
      if (process.env.DATABASE_URL) {
        try {
          const tenantDb = createTenantDb({ tenantId });
          const existingPayment = await tenantDb.payment.findFirst({
            where: {
              tenantId,
              idempotencyKey: params.merchantOrderId,
            },
          });
          if (existingPayment) {
            console.info(`[PaymentService] ${params.merchantOrderId} DB'de zaten kayıtlı (idempotent no-op).`);
            return {
              isCompleted: true,
              remainingBalance: 0,
              tableId,
            };
          }
        } catch (_) {}
      }

      // Masa bazlı dağıtık kilit altında hesap bakiyesini düş
      return await withTableLock(tableId, async () => {
      const storedTables = getStoredTables();
      const currentTable = storedTables.find((t) => t.id === tableId);
      const totalAmount = currentTable?.totalAmount || params.paidAmount;

      const paymentResult = recordAtomicPartialPayment(tableId, totalAmount, params.paidAmount);
      if (!paymentResult.success) {
        throw new PaymentDomainError(paymentResult.error || 'Bakiye aşımı tespit edildi!', 'OVERPAYMENT');
      }
      const isCompleted = paymentResult.remaining <= 0.01;

      // Kayıt durumunu güncelle veya deftere ekle (Replay Webhook Guard)
      if (record) {
        record.status = isCompleted ? 'COMPLETED' : 'PARTIAL';
      } else {
        PENDING_PAYMENT_RECORDS.set(params.merchantOrderId, {
          id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          merchantOrderId: params.merchantOrderId,
          tenantId,
          tableId,
          amount: params.paidAmount,
          currency: 'TRY',
          method: 'ONLINE',
          provider: params.provider,
          status: isCompleted ? 'COMPLETED' : 'PARTIAL',
          isPartial: !isCompleted,
          createdAt: new Date().toISOString(),
        });
      }

      // 1. PostgreSQL Kalıcı Kayıt Güncellemesi
      if (process.env.DATABASE_URL) {
        try {
          const tenantDb = createTenantDb({ tenantId });
          const tableRow = await findTableByCode(tenantId, tableId);
          if (tableRow) {
            const activeSession = await getActiveSession(tenantId, tableRow.id);
            if (activeSession) {
              await tenantDb.$transaction(async (tx) => {
                const partialRes = await recordPartialPayment(tx as any, tenantId, activeSession.id, params.paidAmount);
                if (!partialRes.success) {
                  throw new PaymentDomainError('Database bakiye aşımı engellendi!', 'OVERPAYMENT');
                }
                await tx.payment.create({
                  data: {
                    tenantId,
                    sessionId: activeSession.id,
                    amount: new Prisma.Decimal(params.paidAmount),
                    method: 'ONLINE',
                    status: 'COMPLETED',
                    idempotencyKey: params.merchantOrderId,
                  },
                });

                if (isCompleted) {
                  await dbRevokeActiveSession(
                    tenantId,
                    tableRow.id,
                    `${params.provider} Masadan Çevrimiçi Ödeme (Tam Tahsilat)`,
                    TableSessionStatus.CLOSED
                  );
                }
              });
            }
          }
        } catch (dbErr: any) {
          console.warn('[PaymentService] DB ödeme kaydı uyarısı:', dbErr);
          if (process.env.NODE_ENV === 'production') {
            throw new PaymentDomainError('Veritabanı kayıt hatası: ' + dbErr.message, 'DATABASE_ERROR');
          }
        }
      } else if (process.env.NODE_ENV === 'production') {
        throw new PaymentDomainError(
          'Üretim ortamında veritabanı bağlantısı zorunludur. Çevrimiçi tahsilat geçici belleğe kaydedilemez.',
          'DATABASE_REQUIRED'
        );
      }

      // 2. Bellek İçi Masa Durumu Güncellemesi
      if (isCompleted) {
        clearTableLedger(tableId);

        const updatedTables = storedTables.map((t) => {
          if (t.id === tableId) {
            return {
              ...t,
              status: 'empty' as const,
              totalAmount: 0,
              items: [],
              lastActivity: `Hesap Masadan ${params.provider} ile Ödendi (₺${params.paidAmount.toFixed(2)})`,
            };
          }
          return t;
        });
        saveStoredTables(updatedTables);

        // 3. Redis Ephemeral QR Oturumunu İptal Et (Masa hesabı kapandı)
        try {
          await CacheService.revokeTableSession(tenantId, tableId);
        } catch (_) {}

        // 4. Tüm Terminallere (Kasa PC, Garson, KDS) Anlık Realtime SSE Bildirimi
        realtimeHub.broadcast(tenantId, {
          id: `evt_pay_${Date.now()}`,
          type: 'TABLE_CHECKOUT_COMPLETED',
          tenantId,
          sourceDevice: 'customer_qr',
          deviceName: `Masa QR (${tableId})`,
          timestamp: new Date().toISOString(),
          payload: {
            tableId,
            paidAmount: params.paidAmount,
            provider: params.provider,
            paymentMethod: `${params.provider} Çevrimiçi Kart`,
            isCompleted: true,
            remainingBalance: 0,
            merchantOrderId: params.merchantOrderId,
          },
        });
      } else {
        // Parçalı Ödeme Bildirimi
        realtimeHub.broadcast(tenantId, {
          id: `evt_part_pay_${Date.now()}`,
          type: 'ORDER_STATUS_CHANGED',
          tenantId,
          sourceDevice: 'customer_qr',
          deviceName: `Masa QR (${tableId})`,
          timestamp: new Date().toISOString(),
          payload: {
            tableId,
            paidAmount: params.paidAmount,
            remainingBalance: paymentResult.remaining,
            provider: params.provider,
            isCompleted: false,
            message: `Masadan ₺${params.paidAmount.toFixed(2)} parçalı ödeme alındı. Kalan: ₺${paymentResult.remaining.toFixed(2)}`,
          },
        });
      }

      if (record) {
        record.status = 'COMPLETED';
        record.completedAt = new Date().toISOString();
        record.providerTransactionId = params.providerTransactionId;
      }

      // Observability: Metrik Kayıtları
      metricsCollector.recordPaymentCompleted({
        amount: params.paidAmount,
        provider: params.provider,
        method: 'ONLINE',
      });
      if (isCompleted) {
        metricsCollector.recordSessionClosed();
      }

      structuredLogger.info(`[PaymentSettlement] ${params.provider} tahsilatı tamamlandı`, {
        event: 'payment_settlement_completed',
        tenantId,
        tableId,
        meta: {
          paidAmount: params.paidAmount,
          isCompleted,
          remainingBalance: paymentResult.remaining,
          merchantOrderId: params.merchantOrderId,
        },
      });

      return {
        isCompleted,
        remainingBalance: paymentResult.remaining,
        tableId,
      };
    });
    });
  }

  /**
   * 4. Ödeme Sorgulama
   */
  public static getPaymentRecord(merchantOrderId: string): PaymentRecord | undefined {
    return PENDING_PAYMENT_RECORDS.get(merchantOrderId);
  }

  /**
   * 5. Yarıda Kalan veya Zaman Aşımına Uğrayan Ödemeleri Uzlaştırma (Reconciliation Engine)
   */
  public static async reconcilePendingPayments(tenantId: string): Promise<{
    checkedCount: number;
    timedOutCount: number;
    reconciledCount: number;
  }> {
    let checkedCount = 0;
    let timedOutCount = 0;
    const now = Date.now();
    const TIMEOUT_MS = 15 * 60 * 1000; // 15 dakika

    PENDING_PAYMENT_RECORDS.forEach((rec) => {
      if (rec.tenantId === tenantId && rec.status === 'PENDING') {
        checkedCount++;
        const createdAt = new Date(rec.createdAt).getTime();
        if (now - createdAt > TIMEOUT_MS) {
          rec.status = 'FAILED';
          rec.error = 'PAYMENT_SESSION_EXPIRED';
          timedOutCount++;
        }
      }
    });

    return { checkedCount, timedOutCount, reconciledCount: timedOutCount };
  }

  /**
   * Test ortamları için bellek defterini sıfırlama
   */
  public static clearPendingRecords(): void {
    PENDING_PAYMENT_RECORDS.clear();
  }
}
