import { OrderSource, OrderStatus, Prisma, StockMovementType } from '@prisma/client';
import { prisma } from './prisma';

/**
 * Sipariş oluşturma: sunucu taraflı fiyatlama + oturum toplamı + reçeteye göre
 * stok düşümü TEK transaction içinde yapılır. Herhangi bir adım başarısız olursa
 * hiçbir şey yazılmaz.
 */

export interface OrderLineInput {
  productCode: string;
  quantity: number;
  optionCodes?: string[];
  cookingLevel?: string;
  note?: string;
  guestTag?: string;
}

export interface CreateOrderInput {
  tenantId: string;
  branchId: string;
  tableId: string;
  sessionId: string;
  source: OrderSource;
  lines: OrderLineInput[];
  status?: OrderStatus;
  customerNote?: string;
  guestName?: string;
  createdById?: string;
  idempotencyKey?: string;
}

export class OrderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderValidationError';
  }
}

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export async function createOrder(input: CreateOrderInput) {
  if (!input.lines.length) throw new OrderValidationError('Sepet boş olamaz.');

  // İdempotency: aynı anahtarla gelen tekrar isteği mevcut siparişi döner.
  if (input.idempotencyKey) {
    const existing = await prisma.order.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
      include: { items: true },
    });
    if (existing) return existing;
  }

  return prisma.$transaction(async (tx) => {
    const codes = Array.from(new Set(input.lines.map((l) => l.productCode)));
    const products = await tx.product.findMany({
      where: { tenantId: input.tenantId, code: { in: codes }, isActive: true },
      include: { recipe: { include: { items: true } } },
    });
    const productByCode = new Map(products.map((p) => [p.code, p]));

    const optionCodes = Array.from(new Set(input.lines.flatMap((l) => l.optionCodes ?? [])));
    const options = optionCodes.length
      ? await tx.productOption.findMany({ where: { tenantId: input.tenantId, code: { in: optionCodes }, isActive: true } })
      : [];
    const optionByCode = new Map(options.map((o) => [o.code, o]));

    let subtotal = D(0);
    const itemsData: Prisma.OrderItemCreateWithoutOrderInput[] = [];
    const stockNeeds = new Map<string, Prisma.Decimal>(); // ingredientId → toplam brüt miktar
    const itemIngredientUsage: { index: number; ingredientId: string; qty: Prisma.Decimal }[] = [];

    input.lines.forEach((line, index) => {
      const product = productByCode.get(line.productCode);
      if (!product) throw new OrderValidationError(`Menüde bulunamayan ürün: ${line.productCode}`);
      const quantity = Math.max(1, Math.min(99, Math.floor(Number(line.quantity) || 1)));

      const extras = (line.optionCodes ?? [])
        .map((c) => optionByCode.get(c))
        .filter((o): o is NonNullable<typeof o> => Boolean(o));
      const unitPrice = extras.reduce((sum, o) => sum.plus(o.extraPrice), D(product.price));
      const lineTotal = unitPrice.times(quantity);
      subtotal = subtotal.plus(lineTotal);

      itemsData.push({
        tenant: { connect: { id: input.tenantId } },
        product: { connect: { id: product.id } },
        productName: product.name,
        unitPrice,
        quantity,
        lineTotal,
        extras: extras.map((o) => ({ code: o.code, name: o.name, price: o.extraPrice.toString() })),
        cookingLevel: line.cookingLevel,
        note: line.note,
        guestTag: line.guestTag,
        station: product.station,
      });

      for (const ri of product.recipe?.items ?? []) {
        const gross = D(ri.netAmount)
          .times(D(1).plus(D(ri.wastePercent).dividedBy(100)))
          .times(quantity)
          .dividedBy(product.recipe!.yield);
        stockNeeds.set(ri.ingredientId, (stockNeeds.get(ri.ingredientId) ?? D(0)).plus(gross));
        itemIngredientUsage.push({ index, ingredientId: ri.ingredientId, qty: gross });
      }
    });

    // Şube içi sıradaki sipariş numarası (aynı transaction'da; çakışma riskine karşı
    // ileride ayrı bir sayaç tablosu / sequence ile değiştirilebilir).
    const last = await tx.order.findFirst({
      where: { branchId: input.branchId },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });

    const order = await tx.order.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        tableId: input.tableId,
        sessionId: input.sessionId,
        orderNumber: (last?.orderNumber ?? 0) + 1,
        source: input.source,
        status: input.status ?? OrderStatus.PREPARING,
        subtotal,
        total: subtotal,
        customerNote: input.customerNote,
        guestName: input.guestName,
        createdById: input.createdById,
        idempotencyKey: input.idempotencyKey,
        items: { create: itemsData },
      },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });

    // Adisyon toplamını oturum defterine ekle.
    await tx.tableSession.update({
      where: { id: input.sessionId },
      data: { totalAmount: { increment: subtotal } },
    });

    // Reçeteye göre stok düşümü + değişmez stok defteri kaydı.
    for (const usage of itemIngredientUsage) {
      const ing = await tx.ingredient.update({
        where: { id: usage.ingredientId },
        data: { currentStock: { decrement: usage.qty } },
        select: { currentStock: true, costPerUnit: true },
      });
      await tx.stockMovement.create({
        data: {
          tenantId: input.tenantId,
          ingredientId: usage.ingredientId,
          type: StockMovementType.SALE,
          quantity: usage.qty.negated(),
          balanceAfter: ing.currentStock,
          unitCost: ing.costPerUnit,
          orderItemId: order.items[usage.index]?.id,
          userId: input.createdById,
          reason: `Sipariş #${order.orderNumber}`,
        },
      });
    }

    return order;
  });
}
