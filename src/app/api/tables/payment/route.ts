import { NextRequest, NextResponse } from 'next/server';
import { 
  recordAtomicPartialPayment, 
  clearTableLedger 
} from '@/utils/concurrencyLock';
import { withDistributedLock } from '@/server/redis/distributedLock';
import { resolveTenantFromRequest } from '@/utils/tenantAuth';
import { 
  validateDiscountSecurityAsync, 
  recordDiscountAudit,
} from '@/utils/managerAuth';
import { Prisma, TableSessionStatus, TableStatus } from '@prisma/client';
import { createTenantDb } from '@/server/db/tenantDb';
import { 
  findTableByCode, 
  getActiveSession, 
  recordPartialPayment,
  revokeActiveSession as dbRevokeActiveSession 
} from '@/server/db/tableRepository';
import { realtimeHub } from '@/server/realtime/realtimeHub';
import { CacheService } from '@/server/redis/cacheService';
import { validateSettlePayment, ValidationError } from '@/server/validation/adminSchemas';
import { IdempotencyService } from '@/server/security/idempotencyService';

export async function POST(req: NextRequest) {
  try {
    const authContext = resolveTenantFromRequest(req);
    if (!authContext) {
      return NextResponse.json({ success: false, error: 'Yetkisiz erişim: Ödeme işlemi için geçerli oturum gerekli.' }, { status: 403 });
    }

    const rawBody = await req.json();
    const validated = validateSettlePayment(rawBody);

    const { 
      tableId, 
      totalAmount, 
      paymentAmount, 
      paymentMethod = 'Kredi Kartı',
      discountType = 'none',
      discountValue = 0,
      discountReason = 'Müşteri Memnuniyeti',
      compedItems = [],
      cancelledItems = [],
      managerPin,
      managerAuthToken,
      cashierName,
      expectedVersion,
      idempotencyKey: bodyIdempotencyKey,
    } = validated;

    // Idempotency Key Çözümlemesi (Header veya Body)
    const idempotencyKey =
      req.headers.get('idempotency-key') ||
      req.headers.get('x-idempotency-key') ||
      bodyIdempotencyKey;

    const paymentPayload = {
      tableId,
      totalAmount,
      paymentAmount,
      paymentMethod,
      discountType,
      discountValue,
    };

    // Erken Idempotency Denetimi (Payload Hash Kontrollü)
    if (idempotencyKey && IdempotencyService.isValidKey(idempotencyKey)) {
      const idemCheck = await IdempotencyService.checkOrAcquire({
        tenantId: authContext.tenantId,
        scope: `pay:${tableId}`,
        idempotencyKey,
        payload: paymentPayload,
      });

      if (idemCheck.state === 'MISMATCH') {
        return NextResponse.json(
          {
            success: false,
            errorCode: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
            error: 'Aynı Idempotency-Key farklı bir ödeme parametresi ile tekrar kullanılamaz.',
          },
          { status: 409 }
        );
      }

      if (idemCheck.state === 'REPLAY') {
        return NextResponse.json(
          {
            ...idemCheck.cachedResponse,
            isIdempotentReplay: true,
            message: 'Bu tahsilat daha önce başarıyla kaydedilmiştir (Mükerrer tahsilat engellendi).',
          },
          { status: idemCheck.statusCode || 200 }
        );
      }
    }

    // 1. İNDİRİM & İKRAM YETKİ KONTROLÜ (Privilege Escalation & Skimming Kalkanı)
    let managerInfo: { name: string; title: string; role: string } | undefined = undefined;
    let targetPayable = totalAmount;

    if (discountType !== 'none' || (compedItems && compedItems.length > 0) || (cancelledItems && cancelledItems.length > 0)) {
      const discountCheck = await validateDiscountSecurityAsync({
        subtotal: totalAmount,
        discountType,
        discountValue,
        discountReason,
        compedItems,
        cancelledItems,
        currentUserRole: authContext.role,
        currentUserId: authContext.userId,
        currentUserName: cashierName,
        managerPin,
        managerAuthToken,
        tenantId: authContext.tenantId,
        resourceId: tableId,
      });

      if (!discountCheck.allowed) {
        if (idempotencyKey && IdempotencyService.isValidKey(idempotencyKey)) {
          await IdempotencyService.releaseKey(authContext.tenantId, `pay:${tableId}`, idempotencyKey);
        }
        return NextResponse.json(
          {
            success: false,
            errorCode: discountCheck.errorCode || 'UNAUTHORIZED_DISCOUNT',
            requiresManagerPin: discountCheck.requiresManagerPin,
            error: discountCheck.error || 'Yetkisiz indirim/ikram: Yönetici PIN doğrulaması gereklidir.',
          },
          { status: 403 }
        );
      }

      targetPayable = discountCheck.netPayable;
      if (discountCheck.manager) {
        managerInfo = {
          name: discountCheck.manager.name,
          title: discountCheck.manager.title,
          role: discountCheck.manager.role,
        };
      }

      // Denetim kaydını yaz (Audit log)
      recordDiscountAudit({
        tableId,
        cashierName: cashierName || authContext.userId || 'Kasiyer',
        managerName: discountCheck.manager?.name,
        managerRole: discountCheck.manager?.role,
        originalSubtotal: totalAmount,
        discountAmount: discountCheck.totalDiscountAmount,
        compedAmount: discountCheck.compedAmount,
        netPayable: discountCheck.netPayable,
        effectivePercentage: discountCheck.effectivePercentage,
        reason: discountReason,
        compedItems,
      });
    }

    // 2. TENANT-AWARE DAĞITIK MASA KİLİDİ İÇİNDE ATOMİK İŞLEM
    const lockKey = `tenant:${authContext.tenantId}:table:${tableId}`;
    const result = await withDistributedLock(lockKey, async () => {
      // PostgreSQL Optimistic Lock & Session Kontrolü
      let dbRemaining = targetPayable - paymentAmount;
      let isCompleted = false;

      if (process.env.DATABASE_URL) {
        try {
          const tenantDb = createTenantDb({ tenantId: authContext.tenantId });
          const tableRow = await findTableByCode(authContext.tenantId, tableId);

          if (!tableRow) {
            return {
              statusCode: 404,
              response: { success: false, error: 'Masa bulunamadı.' },
            };
          }

          // İyimser versiyon çakışması kontrolü
          if (expectedVersion !== undefined && tableRow.version !== expectedVersion) {
            return {
              statusCode: 409,
              response: {
                success: false,
                errorCode: 'TABLE_VERSION_CONFLICT',
                error: `Masa başka bir cihaz tarafından güncellendi (Güncel Versiyon: v${tableRow.version}).`,
                currentVersion: tableRow.version,
              },
            };
          }

          const activeSession = await getActiveSession(authContext.tenantId, tableRow.id);
          if (!activeSession) {
            return {
              statusCode: 400,
              response: {
                success: false,
                errorCode: 'NO_ACTIVE_SESSION',
                error: 'Bu masada açık bir adisyon bulunmuyor veya hesap zaten kapatılmış.',
              },
            };
          }

          // Atomik DB Transaction ($transaction)
          const txRes = await tenantDb.$transaction(async (tx) => {
            const partialRes = await recordPartialPayment(tx as any, authContext.tenantId, activeSession.id, paymentAmount);
            if (!partialRes.success) {
              return { success: false, error: 'OVERPAYMENT_NOT_ALLOWED' };
            }

            const isSessionFullyPaid = Number(partialRes.remaining) <= 0.01;

            const paymentRow = await tx.payment.create({
              data: {
                tenantId: authContext.tenantId,
                sessionId: activeSession.id,
                amount: new Prisma.Decimal(paymentAmount),
                method: paymentMethod.toLowerCase().includes('nakit') ? 'CASH' : 'CARD',
                status: 'COMPLETED',
                discountType: discountType === 'percent' ? 'PERCENT' : discountType === 'amount' ? 'AMOUNT' : 'NONE',
                discountValue: new Prisma.Decimal(discountValue),
                discountReason,
                compedItems: compedItems as any,
                cashierId: authContext.userId,
                idempotencyKey: idempotencyKey ? `pay:${idempotencyKey}` : undefined,
              },
            });

            if (isSessionFullyPaid) {
              await tx.tableSession.update({
                where: { id: activeSession.id },
                data: {
                  status: TableSessionStatus.CLOSED,
                  closeReason: 'Hesap ödendi (Tam Tahsilat)',
                  closedAt: new Date(),
                },
              });

              await tx.table.update({
                where: { id: tableRow.id },
                data: {
                  status: TableStatus.CLEANING,
                  version: { increment: 1 },
                },
              });
            }

            return {
              success: true,
              isCompleted: isSessionFullyPaid,
              remaining: Number(partialRes.remaining),
              paymentId: paymentRow.id,
            };
          });

          if (!txRes.success) {
            return {
              statusCode: 400,
              response: {
                success: false,
                errorCode: 'OVERPAYMENT_NOT_ALLOWED',
                error: 'Bakiye aşımı engellendi: Kalan ödenecek tutardan fazlası tahsil edilemez.',
              },
            };
          }

          isCompleted = Boolean(txRes.isCompleted);
          dbRemaining = txRes.remaining ?? 0;
        } catch (dbErr: any) {
          console.warn('[Payment API] DB ödeme transaction hatası:', dbErr);
          if (process.env.NODE_ENV === 'production') {
            return {
              statusCode: 500,
              response: {
                success: false,
                error: 'Veritabanı kayıt hatası nedeniyle tahsilat tamamlanamadı.',
              },
            };
          }
        }
      } else if (process.env.NODE_ENV === 'production') {
        return {
          statusCode: 503,
          response: {
            success: false,
            error: 'Üretim ortamında veritabanı bağlantısı zorunludur. Tahsilat geçici belleğe kaydedilemez.',
          },
        };
      }

      // Bellek İçi Ledger Senkronizasyonu (Dev/Test Fallback & Memory Guard)
      const paymentResult = recordAtomicPartialPayment(tableId, targetPayable, paymentAmount);
      if (!paymentResult.success && !process.env.DATABASE_URL) {
        return {
          statusCode: 400,
          response: {
            success: false,
            errorCode: 'OVERPAYMENT_NOT_ALLOWED',
            error: paymentResult.error,
            remaining: paymentResult.remaining,
            paidSoFar: paymentResult.paidSoFar,
          },
        };
      }

      const finalRemaining = process.env.DATABASE_URL ? dbRemaining : paymentResult.remaining;
      const finalIsCompleted = process.env.DATABASE_URL ? isCompleted : paymentResult.remaining <= 0.01;

      if (finalIsCompleted) {
        clearTableLedger(tableId);

        try {
          await CacheService.revokeTableSession(authContext.tenantId, tableId);
        } catch (_) {}

        realtimeHub.broadcast(authContext.tenantId, {
          id: `evt_pay_pos_${Date.now()}`,
          type: 'TABLE_CHECKOUT_COMPLETED',
          tenantId: authContext.tenantId,
          sourceDevice: 'cashier_pos',
          deviceName: cashierName || 'Kasa Terminali',
          timestamp: new Date().toISOString(),
          payload: {
            tableId,
            paidAmount: paymentAmount,
            paymentMethod,
            isCompleted: true,
            remainingBalance: 0,
          },
        });
      } else {
        realtimeHub.broadcast(authContext.tenantId, {
          id: `evt_part_pay_${Date.now()}`,
          type: 'ORDER_STATUS_CHANGED',
          tenantId: authContext.tenantId,
          sourceDevice: 'cashier_pos',
          deviceName: cashierName || 'Kasa Terminali',
          timestamp: new Date().toISOString(),
          payload: {
            tableId,
            paidAmount: paymentAmount,
            remainingBalance: finalRemaining,
            isCompleted: false,
            message: `Masadan ₺${paymentAmount.toFixed(2)} parçalı ödeme alındı. Kalan: ₺${finalRemaining.toFixed(2)}`,
          },
        });
      }

      const successResponse = {
        success: true,
        tableId,
        paymentMethod,
        paidAmount: paymentAmount,
        totalPaid: targetPayable - finalRemaining,
        remainingBalance: finalRemaining,
        isCompleted: finalIsCompleted,
        managerApproved: managerInfo,
        message: finalIsCompleted 
          ? 'Masa adisyon bakiyesi tamamen kapandı (Tam Tahsilat).' 
          : `Parçalı ödeme alındı. Kalan bakiye: ₺${finalRemaining.toFixed(2)}`,
      };

      if (idempotencyKey && IdempotencyService.isValidKey(idempotencyKey)) {
        await IdempotencyService.markCompleted({
          tenantId: authContext.tenantId,
          scope: `pay:${tableId}`,
          idempotencyKey,
          payload: paymentPayload,
          response: successResponse,
          statusCode: 200,
        });
      }

      return {
        statusCode: 200,
        response: successResponse,
      };
    });

    if (result.statusCode >= 400 && idempotencyKey && IdempotencyService.isValidKey(idempotencyKey)) {
      await IdempotencyService.releaseKey(authContext.tenantId, `pay:${tableId}`, idempotencyKey);
    }

    return NextResponse.json(result.response, { status: result.statusCode });

  } catch (error: any) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message, field: error.field }, { status: 400 });
    }
    console.error('Payment API Error:', error);
    return NextResponse.json({ success: false, error: 'Ödeme işlemi sırasında kilit hatası oluştu.' }, { status: 500 });
  }
}
