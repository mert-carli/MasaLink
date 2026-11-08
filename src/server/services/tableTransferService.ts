import { Prisma, TableStatus, TableSessionStatus } from '@prisma/client';
import { prisma } from '@/server/db/prisma';
import { withDistributedLock } from '@/server/redis/distributedLock';
import { realtimeHub } from '@/server/realtime/realtimeHub';
import { structuredLogger } from '@/server/observability/logger';

export class TableTransferError extends Error {
  constructor(message: string, public readonly code: string = 'TRANSFER_ERROR') {
    super(message);
    this.name = 'TableTransferError';
  }
}

export interface TableTransferParams {
  tenantId: string;
  sourceTableId: string;
  targetTableId: string;
  mode: 'transfer' | 'merge';
  userId?: string;
  waiterName?: string;
  expectedSourceVersion?: number;
  expectedTargetVersion?: number;
}

export interface TableTransferResult {
  success: boolean;
  mode: 'transfer' | 'merge';
  sourceTableId: string;
  sourceTableName: string;
  sourceNewVersion: number;
  targetTableId: string;
  targetTableName: string;
  targetNewVersion: number;
  transferredAmount: number;
  totalTargetAmount: number;
  persistedToDb: boolean;
  timestamp: string;
}

/**
 * Masa Taşıma ve Masa Birleştirme Servisi (Server-side Table Transfer & Merge Service)
 * 
 * Özellikler:
 * 1. Dağıtık Kilit (Distributed Lock): Karşılıklı kilitlenme (deadlock) olmaması için
 *    kaynak ve hedef masa kimlikleri alfabetik sırada kilitlenir.
 * 2. İyimser Kilit (Optimistic Locking): İstemcinin gördüğü masa versiyonu doğrulanır;
 *    çakışma durumunda 409 Conflict fırlatılır.
 * 3. Atomik Veritabanı Hareketi ($transaction):
 *    - Kaynak masanın aktif adisyonu hedef masaya aktarılır veya birleştirilir.
 *    - Kaynak masanın durumu CLEANING (temizlik bekliyor) yapılır.
 *    - Hedef masanın durumu PREPARING/SERVED yapılır.
 *    - AuditLog tablosuna kimin ne zaman hangi masayı taşıdığı kaydedilir.
 * 4. Çoklu Kiracı İzolasyonu (Tenant Guard): Farklı kiracılar arası masa aktarımı engellenir.
 * 5. Gerçek Zamanlı Dağıtım (Realtime Sync): Kasa, KDS ve Garson terminallerine
 *    TABLE_TRANSFERRED veya TABLE_MERGED olayları SSE ve Redis Pub/Sub üzerinden push edilir.
 */
export class TableTransferService {
  public static async executeTransfer(params: TableTransferParams): Promise<TableTransferResult> {
    const {
      tenantId,
      sourceTableId,
      targetTableId,
    } = params;

    if (!tenantId) {
      throw new TableTransferError('Kiracı kimliği (tenantId) zorunludur.', 'TENANT_REQUIRED');
    }

    if (!sourceTableId || !targetTableId) {
      throw new TableTransferError('Kaynak ve hedef masa kimliği zorunludur.', 'INVALID_TABLE_IDS');
    }

    if (sourceTableId === targetTableId) {
      throw new TableTransferError('Bir masa kendisine aktarılamaz veya birleştirilemez.', 'SAME_TABLE_ERROR');
    }

    // Deadlock koruması: Masaları daima alfabetik sırayla kilitle
    const [firstLockId, secondLockId] = [sourceTableId, targetTableId].sort();

    return await withDistributedLock(`table:${firstLockId}`, async () => {
      return await withDistributedLock(`table:${secondLockId}`, async () => {
        return await this.performTransferInternal(params);
      });
    });
  }

  private static async performTransferInternal(params: TableTransferParams): Promise<TableTransferResult> {
    const isProduction = process.env.NODE_ENV === 'production';
    const hasDatabase = Boolean(process.env.DATABASE_URL);

    if (isProduction && !hasDatabase) {
      throw new TableTransferError(
        'Üretim ortamında veritabanı bağlantısı zorunludur. İşlem iptal edildi.',
        'DATABASE_REQUIRED'
      );
    }

    if (hasDatabase) {
      try {
        return await this.executeInPrismaTransaction(params);
      } catch (err: any) {
        if (err instanceof TableTransferError) {
          throw err;
        }
        structuredLogger.error('Masa aktarımı veritabanı işlemi sırasında hata oluştu', {
          error: err?.message,
          tenantId: params.tenantId,
          sourceTableId: params.sourceTableId,
          targetTableId: params.targetTableId,
        });

        if (isProduction) {
          throw new TableTransferError(
            `Veritabanı aktarım hatası: ${err?.message || 'Bilinmeyen hata'}`,
            'DATABASE_ERROR'
          );
        }
      }
    }

    // Fallback: Test veya DB bulunmayan geliştirme ortamları için kontrollü fallback
    return this.executeFallbackMemory(params);
  }

  private static async executeInPrismaTransaction(params: TableTransferParams): Promise<TableTransferResult> {
    const {
      tenantId,
      sourceTableId,
      targetTableId,
      mode,
      userId,
      waiterName = 'Garson',
      expectedSourceVersion,
      expectedTargetVersion,
    } = params;

    return await prisma.$transaction(async (tx) => {
      // 1. Masaları doğrula ve kilitle
      const sourceTable = await tx.table.findFirst({
        where: {
          tenantId,
          OR: [{ id: sourceTableId }, { code: sourceTableId }],
        },
      });

      if (!sourceTable) {
        throw new TableTransferError(`Kaynak masa bulunamadı: ${sourceTableId}`, 'SOURCE_TABLE_NOT_FOUND');
      }

      const targetTable = await tx.table.findFirst({
        where: {
          tenantId,
          OR: [{ id: targetTableId }, { code: targetTableId }],
        },
      });

      if (!targetTable) {
        throw new TableTransferError(`Hedef masa bulunamadı: ${targetTableId}`, 'TARGET_TABLE_NOT_FOUND');
      }

      // 2. İyimser Kilit (Optimistic Lock) Kontrolleri
      if (expectedSourceVersion !== undefined && sourceTable.version !== expectedSourceVersion) {
        throw new TableTransferError(
          `Kaynak masa versiyon çakışması! (Beklenen: ${expectedSourceVersion}, Güncel: ${sourceTable.version})`,
          'OPTIMISTIC_LOCK_CONFLICT'
        );
      }

      if (expectedTargetVersion !== undefined && targetTable.version !== expectedTargetVersion) {
        throw new TableTransferError(
          `Hedef masa versiyon çakışması! (Beklenen: ${expectedTargetVersion}, Güncel: ${targetTable.version})`,
          'OPTIMISTIC_LOCK_CONFLICT'
        );
      }

      // 3. Kaynak masanın aktif oturumunu (TableSession) bul
      const sourceSession = await tx.tableSession.findFirst({
        where: {
          tenantId,
          tableId: sourceTable.id,
          status: TableSessionStatus.ACTIVE,
        },
        include: {
          orders: {
            where: {
              status: { not: 'CANCELLED' },
            },
            include: {
              items: true,
            },
          },
        },
      });

      // Hedef masanın aktif oturumunu bul
      const targetSession = await tx.tableSession.findFirst({
        where: {
          tenantId,
          tableId: targetTable.id,
          status: TableSessionStatus.ACTIVE,
        },
        include: {
          orders: {
            where: {
              status: { not: 'CANCELLED' },
            },
          },
        },
      });

      const sourceTotal = Number(sourceSession?.totalAmount ?? 0);
      let targetTotal = Number(targetSession?.totalAmount ?? 0);

      if (mode === 'transfer') {
        // Taşıma modu: Hedef masada aktif bir oturum varsa birleştirme (merge) önerilmelidir
        if (targetSession && Number(targetSession.totalAmount) > 0) {
          throw new TableTransferError(
            `Hedef masada (${targetTable.name}) zaten açık bir adisyon var. Lütfen 'Adisyon Birleştir' modunu kullanın.`,
            'TARGET_TABLE_OCCUPIED'
          );
        }

        // Eğer kaynak masada aktif oturum varsa, oturumu ve siparişleri hedef masaya bağla
        if (sourceSession) {
          await tx.tableSession.update({
            where: { id: sourceSession.id },
            data: {
              tableId: targetTable.id,
            },
          });

          await tx.order.updateMany({
            where: {
              tenantId,
              sessionId: sourceSession.id,
            },
            data: {
              tableId: targetTable.id,
            },
          });
        }
        targetTotal = sourceTotal;
      } else {
        // Birleştirme (merge) modu:
        if (sourceSession) {
          if (targetSession) {
            // İki oturum var: kaynak oturumun siparişlerini hedef oturuma bağla ve kaynağı kapat
            await tx.order.updateMany({
              where: {
                tenantId,
                sessionId: sourceSession.id,
              },
              data: {
                tableId: targetTable.id,
                sessionId: targetSession.id,
              },
            });

            const combinedTotal = Number(targetSession.totalAmount) + Number(sourceSession.totalAmount);
            const combinedPaid = Number(targetSession.paidAmount) + Number(sourceSession.paidAmount);

            await tx.tableSession.update({
              where: { id: targetSession.id },
              data: {
                totalAmount: new Prisma.Decimal(combinedTotal),
                paidAmount: new Prisma.Decimal(combinedPaid),
              },
            });

            await tx.tableSession.update({
              where: { id: sourceSession.id },
              data: {
                status: TableSessionStatus.CLOSED,
                closedAt: new Date(),
                closeReason: `MERGED_INTO_${targetTable.code}`,
              },
            });

            targetTotal = combinedTotal;
          } else {
            // Hedefte oturum yoksa doğrudan oturumun tableId'sini değiştir
            await tx.tableSession.update({
              where: { id: sourceSession.id },
              data: {
                tableId: targetTable.id,
              },
            });

            await tx.order.updateMany({
              where: {
                tenantId,
                sessionId: sourceSession.id,
              },
              data: {
                tableId: targetTable.id,
              },
            });
            targetTotal = sourceTotal;
          }
        }
      }

      // 4. Masaların versiyon ve durumlarını güncelle
      const updatedSourceTable = await tx.table.update({
        where: { id: sourceTable.id },
        data: {
          status: TableStatus.CLEANING,
          version: { increment: 1 },
        },
      });

      const updatedTargetTable = await tx.table.update({
        where: { id: targetTable.id },
        data: {
          status: TableStatus.PREPARING,
          version: { increment: 1 },
        },
      });

      // 5. AuditLog kaydı oluştur
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: userId || null,
          action: mode === 'transfer' ? 'TABLE_TRANSFER' : 'TABLE_MERGE',
          entity: 'table',
          entityId: sourceTable.id,
          metadata: {
            sourceTableId: sourceTable.id,
            sourceTableCode: sourceTable.code,
            targetTableId: targetTable.id,
            targetTableCode: targetTable.code,
            mode,
            waiterName,
            transferredAmount: sourceTotal,
            totalTargetAmount: targetTotal,
          },
        },
      });

      const result: TableTransferResult = {
        success: true,
        mode,
        sourceTableId: sourceTable.id,
        sourceTableName: sourceTable.name,
        sourceNewVersion: updatedSourceTable.version,
        targetTableId: targetTable.id,
        targetTableName: targetTable.name,
        targetNewVersion: updatedTargetTable.version,
        transferredAmount: sourceTotal,
        totalTargetAmount: targetTotal,
        persistedToDb: true,
        timestamp: new Date().toISOString(),
      };

      // 6. Realtime Hub ile istemcilere push et
      realtimeHub.broadcast(tenantId, {
        id: `trf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type: mode === 'transfer' ? 'TABLE_TRANSFERRED' : 'TABLE_MERGED',
        tenantId,
        sourceDevice: 'server_guard',
        deviceName: 'Transfer Engine',
        timestamp: new Date().toISOString(),
        payload: {
          ...result,
          waiterName,
        },
      });

      return result;
    });
  }

  private static executeFallbackMemory(params: TableTransferParams): TableTransferResult {
    const { tenantId, sourceTableId, targetTableId, mode, waiterName = 'Garson' } = params;

    const result: TableTransferResult = {
      success: true,
      mode,
      sourceTableId,
      sourceTableName: sourceTableId,
      sourceNewVersion: (params.expectedSourceVersion || 1) + 1,
      targetTableId,
      targetTableName: targetTableId,
      targetNewVersion: (params.expectedTargetVersion || 1) + 1,
      transferredAmount: 0,
      totalTargetAmount: 0,
      persistedToDb: false,
      timestamp: new Date().toISOString(),
    };

    realtimeHub.broadcast(tenantId, {
      id: `trf_fb_${Date.now()}`,
      type: mode === 'transfer' ? 'TABLE_TRANSFERRED' : 'TABLE_MERGED',
      tenantId,
      sourceDevice: 'server_guard',
      deviceName: 'Transfer Engine',
      timestamp: new Date().toISOString(),
      payload: {
        ...result,
        waiterName,
      },
    });

    return result;
  }
}
