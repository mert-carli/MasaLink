import crypto from 'crypto';
import { Prisma, TableSessionStatus, TableStatus } from '@prisma/client';
import { prisma } from './prisma';
import { createTenantDb } from './tenantDb';

/**
 * Masa & Masa Oturumu Çok Kiracılı Kalıcılık Katmanı.
 * 
 * HER SORGUNUN başında zorunlu `tenantId` parametresi aranır.
 * Hiçbir fonksiyon tenantId olmadan çağrılamaz.
 */

type Tx = Prisma.TransactionClient;

export class TableVersionConflictError extends Error {
  constructor(public readonly currentVersion: number) {
    super(`Masa başka bir cihaz tarafından güncellendi (v${currentVersion}).`);
    this.name = 'TableVersionConflictError';
  }
}

export function generateSessionToken(): string {
  return `mst_${crypto.randomBytes(16).toString('hex')}`; // 128-bit
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export async function findTableByCode(tenantId: string, tableCode: string) {
  const tenantDb = createTenantDb({ tenantId });
  return tenantDb.table.findFirst({
    where: { code: tableCode, isActive: true },
  });
}

export async function getActiveSession(tenantId: string, tableId: string) {
  const tenantDb = createTenantDb({ tenantId });
  return tenantDb.tableSession.findFirst({
    where: { tableId, status: TableSessionStatus.ACTIVE },
  });
}

/**
 * Masa için aktif oturumu döner; yoksa atomik oluşturur.
 * PostgreSQL partial unique index sayesinde aynı anda iki oturum açılamaz.
 */
export async function getOrOpenSession(
  tenantId: string,
  tableId: string,
  opts: { openedById?: string; waiterId?: string; guestCount?: number } = {}
) {
  const tenantDb = createTenantDb({ tenantId });
  const existing = await getActiveSession(tenantId, tableId);
  if (existing) return existing;

  try {
    return await tenantDb.tableSession.create({
      data: {
        tenantId,
        tableId,
        token: generateSessionToken(),
        ...opts,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const raced = await getActiveSession(tenantId, tableId);
      if (raced) return raced;
    }
    throw err;
  }
}

/**
 * QR Kod Oturum Token Doğrulaması.
 * Kiracı, masa kodu ve token üçlüsünü atomik olarak doğrular.
 */
export async function validateSessionToken(
  tenantId: string,
  tableCode: string,
  token: string | null | undefined
): Promise<{ valid: boolean; reason?: string; sessionId?: string; tableId?: string; tenantId?: string }> {
  if (!token) return { valid: false, reason: 'Masa oturum tokenı eksik. Lütfen masadaki orijinal QR kodu okutun.' };

  const tenantDb = createTenantDb({ tenantId });
  const session = await tenantDb.tableSession.findUnique({
    where: { token },
    include: { table: { select: { id: true, code: true, tenantId: true } } },
  });

  if (!session || session.table.code !== tableCode || session.tenantId !== tenantId || !safeEqual(session.token, token)) {
    return { valid: false, reason: 'Geçersiz veya tahrif edilmiş masa tokenı (Kiracı/Masa Uyuşmazlığı).' };
  }

  if (session.status !== TableSessionStatus.ACTIVE) {
    return { valid: false, reason: 'Bu masanın oturumu kapatılmıştır. Lütfen garsonunuzdan yeni masa açmasını isteyin.' };
  }

  return { valid: true, sessionId: session.id, tableId: session.tableId, tenantId: session.tenantId };
}

/**
 * Oturumu sonlandır / Token iptal et (Hesap kapandı veya hayalet masa sıfırlandı).
 */
export async function revokeActiveSession(
  tenantId: string,
  tableId: string,
  reason: string,
  status: TableSessionStatus = TableSessionStatus.REVOKED
) {
  const tenantDb = createTenantDb({ tenantId });
  const now = new Date();
  return tenantDb.tableSession.updateMany({
    where: { tableId, status: TableSessionStatus.ACTIVE },
    data: {
      status,
      closeReason: reason,
      ...(status === TableSessionStatus.REVOKED ? { revokedAt: now } : { closedAt: now }),
    },
  });
}

/**
 * Eski token'ı iptal edip masaya yeni 128-bit token atar (Atomik Transaction).
 */
export async function refreshSession(tenantId: string, tableId: string, reason = 'refresh') {
  const tenantDb = createTenantDb({ tenantId });
  return tenantDb.$transaction(async (tx) => {
    const now = new Date();
    await tx.tableSession.updateMany({
      where: { tableId, status: TableSessionStatus.ACTIVE, tenantId },
      data: { status: TableSessionStatus.REVOKED, closeReason: reason, revokedAt: now },
    });
    return tx.tableSession.create({
      data: { tenantId, tableId, token: generateSessionToken() },
    });
  });
}

/**
 * Optimistic locking ile masa durumu güncelleme (Lost Update Kalkanı).
 */
export async function updateTableStatus(
  tenantId: string,
  tableId: string,
  status: TableStatus,
  expectedVersion?: number
): Promise<{ version: number }> {
  const tenantDb = createTenantDb({ tenantId });

  const res = await tenantDb.table.updateMany({
    where: { id: tableId, ...(expectedVersion !== undefined ? { version: expectedVersion } : {}) },
    data: { status, version: { increment: 1 } },
  });

  const current = await tenantDb.table.findFirst({
    where: { id: tableId },
    select: { version: true },
  });

  if (!current) throw new Error('Masa bulunamadı veya kiracıya ait değil.');
  if (res.count === 0) throw new TableVersionConflictError(current.version);

  return { version: current.version };
}

/**
 * Atomik parçalı ödeme kaydı (Çift çekim ve bakiye aşımı kalkanı).
 * Koşullu SQL sorgusu ile tenantId kontrolü zorunludur.
 */
export async function recordPartialPayment(
  tx: Tx,
  tenantId: string,
  sessionId: string,
  amount: Prisma.Decimal | number
): Promise<{ success: boolean; paidAmount: Prisma.Decimal; remaining: Prisma.Decimal }> {
  const amt = new Prisma.Decimal(amount);
  const updated = await tx.$executeRaw`
    UPDATE "TableSession"
       SET "paidAmount" = "paidAmount" + ${amt}
     WHERE "id" = ${sessionId}
       AND "tenantId" = ${tenantId}
       AND "status" = 'ACTIVE'
       AND "paidAmount" + ${amt} <= "totalAmount" + 0.01`;

  const s = await tx.tableSession.findFirstOrThrow({
    where: { id: sessionId, tenantId },
    select: { paidAmount: true, totalAmount: true },
  });

  const remaining = Prisma.Decimal.max(0, s.totalAmount.minus(s.paidAmount));
  return { success: updated === 1, paidAmount: s.paidAmount, remaining };
}
