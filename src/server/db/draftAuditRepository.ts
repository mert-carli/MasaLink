import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

/** Garson taslakları (eski SERVER_DRAFTS_MAP) ve denetim günlüğü (eski DISCOUNT_AUDIT_LOGS). */

export const DRAFT_TTL_MS = 45 * 60 * 1000;

export async function getActiveDraft(tenantId: string, waiterId: string) {
  const draft = await prisma.orderDraft.findFirst({ where: { tenantId, waiterId } });
  if (!draft) return null;
  if (draft.expiresAt.getTime() < Date.now()) {
    await prisma.orderDraft.deleteMany({ where: { id: draft.id } });
    return null;
  }
  return draft;
}

export async function upsertDraft(input: {
  tenantId: string;
  waiterId: string;
  tableId: string;
  cart: Prisma.InputJsonValue;
  itemCount: number;
  totalAmount: number;
}) {
  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);
  const data = {
    tableId: input.tableId,
    cart: input.cart,
    itemCount: input.itemCount,
    totalAmount: new Prisma.Decimal(input.totalAmount),
    expiresAt,
  };
  return prisma.orderDraft.upsert({
    where: { waiterId: input.waiterId },
    create: { tenantId: input.tenantId, waiterId: input.waiterId, ...data },
    update: data,
  });
}

export async function clearDraft(tenantId: string, waiterId: string) {
  await prisma.orderDraft.deleteMany({ where: { tenantId, waiterId } });
}

/** Süresi dolmuş taslakları temizler (cron / periyodik görevden çağrılmalı). */
export async function purgeExpiredDrafts() {
  const res = await prisma.orderDraft.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return res.count;
}

export async function writeAuditLog(input: {
  tenantId: string;
  action: string;
  entity: string;
  entityId?: string;
  actorId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string;
}) {
  return prisma.auditLog.create({ data: { ...input, metadata: input.metadata ?? {} } });
}
