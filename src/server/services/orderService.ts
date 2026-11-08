import { OrderSource, OrderStatus, Prisma, StockMovementType, TableStatus } from '@prisma/client';
import { prisma } from '@/server/db/prisma';
import { createTenantDb } from '@/server/db/tenantDb';
import { getOrOpenSession, TableVersionConflictError } from '@/server/db/tableRepository';
import { realtimeHub } from '@/server/realtime/realtimeHub';
import { SyncMessage, SyncEventType } from '@/utils/syncService';
import { MENU_ITEMS, MENU_EXTRAS } from '@/utils/menuData';
import { INITIAL_TABLES } from '@/utils/tableData';
import { metricsCollector } from '@/server/observability/metrics';
import { structuredLogger } from '@/server/observability/logger';
import { AdminCrudService } from '@/server/services/adminCrudService';

export interface SubmitOrderExtraInput {
  id?: string;
  code?: string;
  name?: string;
  price?: number;
}

export interface SubmitOrderItemInput {
  productId?: string;
  productCode?: string;
  name?: string;
  quantity: number;
  cookingLevel?: string;
  selectedOptions?: SubmitOrderExtraInput[];
  extras?: SubmitOrderExtraInput[];
  customNote?: string;
  notes?: string;
  guestTag?: string;
}

export interface SubmitOrderParams {
  tenantId: string;
  branchId?: string;
  tableId: string; // e.g. "tbl-4" or DB ID
  source: 'QR' | 'WAITER' | 'POS';
  items: SubmitOrderItemInput[];
  clientVersion?: number;
  customerNote?: string;
  guestName?: string;
  createdById?: string;
  requiresApproval?: boolean;
  idempotencyKey?: string;
}

export interface VerifiedOrderItem {
  productId?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes?: string;
  extras: { name: string; price: number }[];
  guestTag?: string;
}

export interface SubmitOrderResult {
  success: boolean;
  orderId: string;
  orderNumber: number;
  tableId: string;
  tableCode: string;
  tableVersion: number;
  subtotal: number;
  total: number;
  status: string;
  requiresWaiterApproval: boolean;
  items: VerifiedOrderItem[];
  customerNote?: string;
  timestamp: string;
  persistedToDb: boolean;
}

export class OrderDomainError extends Error {
  constructor(message: string, public readonly code: string = 'ORDER_DOMAIN_ERROR') {
    super(message);
    this.name = 'OrderDomainError';
  }
}

function sanitizeText(str?: string): string | undefined {
  if (!str || typeof str !== 'string') return undefined;
  const sanitized = str.replace(/[\x00-\x1F\x7F]/g, '').trim();
  return sanitized.length > 0 ? sanitized : undefined;
}

/**
 * MasaLink Merkezi Sipariş Motoru (Centralized Order Service)
 * 
 * QR Menü, Garson Terminali ve Kasa POS Terminali aynı motor üzerinden sipariş geçer.
 * Tek bir atomik transaction içinde:
 * 1. Optimistic locking ile masa versiyonunu denetler ve artırır.
 * 2. Aktif TableSession'ı doğrular veya oluşturur.
 * 3. Sunucu menüsünden resmi fiyatları çözer (fiyat manipülasyonu engeli).
 * 4. Order ve OrderItem snapshot satırlarını oluşturur.
 * 5. TableSession.totalAmount adisyon defterini artırır.
 * 6. Varsa ürün reçetesine göre hammadde stoklarını düşer ve StockMovement kaydı atar.
 */
export class OrderService {
  public static async submitOrder(params: SubmitOrderParams): Promise<SubmitOrderResult> {
    const {
      tenantId,
      branchId,
      tableId,
      source,
      items,
      clientVersion,
      customerNote,
      guestName,
      createdById,
      requiresApproval = false,
      idempotencyKey,
    } = params;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new OrderDomainError('Sipariş sepeti boş olamaz.', 'EMPTY_CART');
    }

    const orderSource: OrderSource = 
      source === 'QR' ? OrderSource.QR : 
      source === 'WAITER' ? OrderSource.WAITER : 
      OrderSource.POS;

    const orderStatus: OrderStatus = requiresApproval 
      ? OrderStatus.PENDING_APPROVAL 
      : OrderStatus.PREPARING;

    // -------------------------------------------------------------------------
    // 1. POSTGRESQL VERİTABANI TRANSACTİON MOTORU
    // -------------------------------------------------------------------------
    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId, branchId });

        const dbResult = await tenantDb.$transaction(async (tx) => {
          // Idempotency: Aynı anahtar ile daha önce kayıt yapılmışsa mevcut siparişi dön
          if (idempotencyKey) {
            const existingOrder = await tx.order.findFirst({
              where: { tenantId, idempotencyKey },
              include: { items: true },
            });
            if (existingOrder) {
              return {
                success: true,
                orderId: existingOrder.id,
                orderNumber: existingOrder.orderNumber,
                tableId: existingOrder.tableId || tableId,
                tableCode: existingOrder.tableId || tableId,
                tableVersion: 1,
                subtotal: Number(existingOrder.subtotal),
                total: Number(existingOrder.total),
                status: existingOrder.status as any,
                requiresWaiterApproval: existingOrder.status === 'PENDING_APPROVAL',
                items: existingOrder.items.map((it) => ({
                  productId: it.productId || undefined,
                  productName: it.productName,
                  quantity: it.quantity,
                  unitPrice: Number(it.unitPrice),
                  lineTotal: Number(it.lineTotal),
                  extras: (it.extras as any) || [],
                })),
                customerNote: existingOrder.customerNote || undefined,
                timestamp: existingOrder.createdAt.toISOString(),
                persistedToDb: true,
              };
            }
          }

          // A. Masa Çözümleme ve Optimistic Locking
          const table = await tx.table.findFirst({
            where: {
              OR: [{ id: tableId }, { code: tableId }],
              isActive: true,
            },
          });

          if (!table) {
            throw new OrderDomainError(`Masa sistemde bulunamadı: ${tableId}`, 'TABLE_NOT_FOUND');
          }

          // Versiyon Çakışması Kontrolü (Lost Update Kalkanı)
          if (clientVersion !== undefined && clientVersion !== table.version) {
            throw new TableVersionConflictError(table.version);
          }

          const nextTableVersion = table.version + 1;

          // B. Aktif Oturumu Çözümle veya Aç
          let session = await tx.tableSession.findFirst({
            where: { tableId: table.id, status: 'ACTIVE' },
          });

          if (!session) {
            session = await tx.tableSession.create({
              data: {
                tenantId,
                tableId: table.id,
                token: `mst_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`,
                openedById: createdById,
              },
            });
          }

          // C. Sunucu Taraflı Menü ve Fiyat Doğrulama
          const productCodesOrIds = Array.from(new Set(items.map((i) => i.productId || i.productCode || i.name || '')));
          const dbProducts = await tx.product.findMany({
            where: {
              OR: [
                { id: { in: productCodesOrIds } },
                { code: { in: productCodesOrIds } },
              ],
              isActive: true,
            },
            include: {
              recipe: {
                include: { items: true },
              },
            },
          });

          let subtotalDecimal = new Prisma.Decimal(0);
          const verifiedItems: VerifiedOrderItem[] = [];
          const orderItemsCreateData: Prisma.OrderItemCreateWithoutOrderInput[] = [];
          const stockMovementsToApply: { ingredientId: string; qty: Prisma.Decimal; itemIndex: number }[] = [];

          for (let idx = 0; idx < items.length; idx++) {
            const clientItem = items[idx];
            const quantity = Math.max(1, Math.min(99, Math.floor(Number(clientItem.quantity) || 1)));

            // DB'de ürünü ara
            let product = dbProducts.find(
              (p) => (clientItem.productId && p.id === clientItem.productId) ||
                     (clientItem.productCode && p.code === clientItem.productCode) ||
                     (clientItem.name && p.name.toLowerCase() === clientItem.name.toLowerCase())
            );

            // DB'de henüz yoksa (menü mock fallback)
            let unitPrice = 0;
            let productName = clientItem.name || 'Ürün';
            let productId: string | undefined = undefined;

            if (product) {
              productId = product.id;
              productName = product.name;
              unitPrice = Number(product.price);
            } else {
              const mockProduct = MENU_ITEMS.find(
                (m) => m.id === clientItem.productId || m.id === clientItem.productCode || m.name.toLowerCase() === (clientItem.name || '').toLowerCase()
              );
              if (mockProduct) {
                productId = mockProduct.id;
                productName = mockProduct.name;
                unitPrice = mockProduct.price;
              } else {
                throw new OrderDomainError(`Menüde bulunamayan geçersiz ürün: ${clientItem.name || clientItem.productId}`, 'INVALID_PRODUCT');
              }
            }

            // Ekstra Malzemeleri Doğrula
            const incomingExtras = clientItem.selectedOptions || clientItem.extras || [];
            const verifiedExtras: { name: string; price: number }[] = [];

            for (const extra of incomingExtras) {
              const matchedExtra = MENU_EXTRAS.find(
                (e) => (extra.id && e.id === extra.id) ||
                       (extra.code && e.id === extra.code) ||
                       (extra.name && e.name.toLowerCase() === extra.name.toLowerCase())
              );
              if (matchedExtra) {
                unitPrice += matchedExtra.extraPrice;
                verifiedExtras.push({ name: matchedExtra.name, price: matchedExtra.extraPrice });
              }
            }

            const lineTotal = unitPrice * quantity;
            subtotalDecimal = subtotalDecimal.plus(lineTotal);

            // Notları filtrele
            const noteParts: string[] = [];
            const safeCooking = sanitizeText(clientItem.cookingLevel);
            const safeNote = sanitizeText(clientItem.customNote || clientItem.notes);
            if (safeCooking) noteParts.push(safeCooking);
            if (verifiedExtras.length > 0) noteParts.push(`Ekstra: ${verifiedExtras.map((e) => e.name).join(', ')}`);
            if (safeNote) noteParts.push(safeNote);
            const combinedNote = noteParts.length > 0 ? noteParts.join(' • ') : undefined;

            const effectiveGuestTag = sanitizeText(clientItem.guestTag) || sanitizeText(guestName) || 'Misafir 1';

            verifiedItems.push({
              productId,
              productName,
              quantity,
              unitPrice,
              lineTotal,
              notes: combinedNote,
              extras: verifiedExtras,
              guestTag: effectiveGuestTag,
            });

            orderItemsCreateData.push({
              tenant: { connect: { id: tenantId } },
              product: productId ? { connect: { id: productId } } : undefined,
              productName,
              unitPrice: new Prisma.Decimal(unitPrice),
              quantity,
              lineTotal: new Prisma.Decimal(lineTotal),
              extras: verifiedExtras as any,
              cookingLevel: safeCooking,
              note: combinedNote,
              guestTag: effectiveGuestTag,
              station: product ? product.station : 'NONE',
            });

            // Reçete Stok Düşüm Hazırlığı
            if (product && product.recipe) {
              for (const recipeItem of product.recipe.items) {
                const grossUsage = new Prisma.Decimal(recipeItem.netAmount)
                  .times(new Prisma.Decimal(1).plus(new Prisma.Decimal(recipeItem.wastePercent).dividedBy(100)))
                  .times(quantity)
                  .dividedBy(product.recipe.yield);

                stockMovementsToApply.push({
                  ingredientId: recipeItem.ingredientId,
                  qty: grossUsage,
                  itemIndex: idx,
                });
              }
            }
          }

          // D. Şube Sıradaki Sipariş Numarasını Bul
          const lastOrder = await tx.order.findFirst({
            where: { tenantId },
            orderBy: { orderNumber: 'desc' },
            select: { orderNumber: true },
          });
          const nextOrderNumber = (lastOrder?.orderNumber ?? 0) + 1;

          // E. Order Kaydı Oluştur
          const effectiveBranchId = branchId || table.branchId;
          const createdOrder = await tx.order.create({
            data: {
              tenantId,
              branchId: effectiveBranchId,
              tableId: table.id,
              sessionId: session.id,
              orderNumber: nextOrderNumber,
              source: orderSource,
              status: orderStatus,
              subtotal: subtotalDecimal,
              total: subtotalDecimal,
              customerNote: sanitizeText(customerNote),
              guestName: sanitizeText(guestName),
              createdById,
              idempotencyKey,
              items: {
                create: orderItemsCreateData,
              },
            },
            include: { items: true },
          });

          // F. Masa Durumunu ve Versiyonunu Güncelle
          const targetTableStatus: TableStatus = orderStatus === OrderStatus.PENDING_APPROVAL
            ? table.status // onay beklerken mevcut durumunu koru
            : TableStatus.PREPARING;

          await tx.table.update({
            where: { id: table.id },
            data: {
              status: targetTableStatus,
              version: nextTableVersion,
            },
          });

          // G. Adisyon Defterini (TableSession.totalAmount) Güncelle
          await tx.tableSession.update({
            where: { id: session.id },
            data: {
              totalAmount: { increment: subtotalDecimal },
            },
          });

          // H. Hammadde Stoklarını Düş ve Değişmez Deftere Kaydet
          for (const usage of stockMovementsToApply) {
            const ing = await tx.ingredient.update({
              where: { id: usage.ingredientId },
              data: { currentStock: { decrement: usage.qty } },
              select: { currentStock: true, costPerUnit: true },
            });

            await tx.stockMovement.create({
              data: {
                tenantId,
                ingredientId: usage.ingredientId,
                type: StockMovementType.SALE,
                quantity: usage.qty.negated(),
                balanceAfter: ing.currentStock,
                unitCost: ing.costPerUnit,
                orderItemId: createdOrder.items[usage.itemIndex]?.id,
                userId: createdById,
                reason: `Sipariş #${createdOrder.orderNumber} (${source})`,
              },
            });
          }

          return {
            success: true,
            orderId: createdOrder.id,
            orderNumber: createdOrder.orderNumber,
            tableId: table.id,
            tableCode: table.code,
            tableVersion: nextTableVersion,
            subtotal: Number(subtotalDecimal),
            total: Number(subtotalDecimal),
            status: createdOrder.status,
            requiresWaiterApproval: requiresApproval,
            items: verifiedItems,
            customerNote: sanitizeText(customerNote),
            timestamp: createdOrder.createdAt.toISOString(),
            persistedToDb: true,
          };
        });

        OrderService.broadcastOrderEvent(tenantId, source, dbResult);
        return dbResult;
      } catch (dbErr: any) {
        if (dbErr instanceof OrderDomainError || dbErr instanceof TableVersionConflictError) {
          throw dbErr;
        }
        if (process.env.NODE_ENV === 'production') {
          throw new OrderDomainError(
            'Üretim ortamında veritabanı hatası nedeniyle sipariş güvenle kaydedilemedi: ' + dbErr.message,
            'DATABASE_ERROR'
          );
        }
        console.warn('[OrderService] PostgreSQL hatası, fallback yürütülüyor:', dbErr.message);
      }
    }

    // -------------------------------------------------------------------------
    // 2. GELİŞTİRME ORTAMI & VERİTABANI OLMADIĞINDA IN-MEMORY FALLBACK
    // -------------------------------------------------------------------------
    if (process.env.NODE_ENV === 'production') {
      throw new OrderDomainError(
        'Üretim ortamında veritabanı bağlantısı zorunludur. Sipariş geçici belleğe yazılamaz.',
        'DATABASE_REQUIRED'
      );
    }
    let total = 0;
    const verifiedItems: VerifiedOrderItem[] = [];

    for (const item of items) {
      const itemName = item.name || (item as any).productName || '';
      let match = MENU_ITEMS.find(
        (m) =>
          m.id === item.productId ||
          m.id === item.productCode ||
          (itemName && m.name.toLowerCase() === itemName.toLowerCase())
      );

      if (!match) {
        const dynProds = await AdminCrudService.listProducts(tenantId);
        const dynMatch = dynProds.find(
          (p) =>
            p.id === item.productId ||
            p.code === item.productId ||
            p.code === item.productCode ||
            (itemName && p.name.toLowerCase() === itemName.toLowerCase())
        );
        if (dynMatch) {
          match = {
            id: dynMatch.id,
            name: dynMatch.name,
            price: dynMatch.price,
            category: (dynMatch.categoryName || 'Genel') as any,
          };
        }
      }

      if (!match) {
        throw new OrderDomainError(
          `Menüde bulunamayan geçersiz ürün: ${itemName || item.productId}`,
          'INVALID_PRODUCT'
        );
      }

      const quantity = Math.max(1, Math.min(99, Math.floor(Number(item.quantity) || 1)));
      let unitPrice = match.price;
      const verifiedExtras: { name: string; price: number }[] = [];

      for (const extra of item.selectedOptions || item.extras || []) {
        const found = MENU_EXTRAS.find((e) => e.name.toLowerCase() === (extra.name || '').toLowerCase());
        if (found) {
          unitPrice += found.extraPrice;
          verifiedExtras.push({ name: found.name, price: found.extraPrice });
        }
      }

      const lineTotal = unitPrice * quantity;
      total += lineTotal;

      const safeCooking = sanitizeText(item.cookingLevel);
      const safeCustom = sanitizeText(item.customNote || item.notes);
      const noteParts: string[] = [];
      if (safeCooking) noteParts.push(safeCooking);
      if (verifiedExtras.length > 0) noteParts.push(`Ekstra: ${verifiedExtras.map((e) => e.name).join(', ')}`);
      if (safeCustom) noteParts.push(safeCustom);

      verifiedItems.push({
        productId: match.id,
        productName: match.name,
        quantity,
        unitPrice,
        lineTotal,
        notes: noteParts.length > 0 ? noteParts.join(' • ') : undefined,
        extras: verifiedExtras,
        guestTag: sanitizeText(item.guestTag) || sanitizeText(guestName) || 'Misafir 1',
      });
    }

    const orderNumber = Math.floor(Date.now() / 1000) % 10000;
    const newVersion = (clientVersion || 1) + 1;

    const fallbackResult: SubmitOrderResult = {
      success: true,
      orderId: `ORD-${Date.now().toString().slice(-6)}`,
      orderNumber,
      tableId,
      tableCode: tableId,
      tableVersion: newVersion,
      subtotal: total,
      total,
      status: orderStatus,
      requiresWaiterApproval: requiresApproval,
      items: verifiedItems,
      customerNote: sanitizeText(customerNote),
      timestamp: new Date().toISOString(),
      persistedToDb: false,
    };

    OrderService.broadcastOrderEvent(tenantId, source, fallbackResult);
    return fallbackResult;
  }

  /**
   * Sipariş olayını MasaLink RealtimeHub üzerinden ilgili kiracının tüm cihazlarına anında dağıtır (<15ms)
   */
  private static broadcastOrderEvent(
    tenantId: string,
    source: 'QR' | 'WAITER' | 'POS',
    result: SubmitOrderResult
  ) {
    try {
      const syncEvent: SyncMessage = {
        id: `order-${result.orderId}`,
        type: result.requiresWaiterApproval
          ? 'QR_ORDER_PENDING_APPROVAL'
          : (source === 'QR' ? 'QR_ORDER_SUBMITTED' : 'ORDER_ITEMS_ADDED'),
        tenantId,
        sourceDevice: source === 'QR' ? 'customer_qr' : (source === 'WAITER' ? 'waiter_mobile' : 'cashier_pos'),
        deviceName: source === 'QR' ? `Masa QR (${result.tableCode})` : (source === 'WAITER' ? 'Garson Terminali' : 'Kasa POS'),
        timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        payload: {
          orderId: result.orderId,
          orderNumber: result.orderNumber,
          tableId: result.tableId,
          tableCode: result.tableCode,
          tableVersion: result.tableVersion,
          total: result.total,
          status: result.status,
          requiresWaiterApproval: result.requiresWaiterApproval,
          items: result.items,
          customerNote: result.customerNote,
          timestamp: result.timestamp,
        },
      };
      realtimeHub.broadcast(tenantId, syncEvent);

      // Observability: Metrik ve Yapısal Günlük Kaydı
      metricsCollector.recordOrderSubmitted({ source, amount: result.total });
      structuredLogger.info(`[OrderLifecycle] Sipariş oluşturuldu (#${result.orderNumber})`, {
        event: 'order_submitted',
        tenantId,
        tableId: result.tableId,
        orderId: result.orderId,
        meta: { source, total: result.total, itemsCount: result.items.length },
      });
    } catch (err) {
      console.warn('[OrderService] Realtime broadcast başarısız oldu:', err);
    }
  }

  /**
   * KDS (Mutfak Ekranı) için aktif hazırlanmakta olan veya servise hazır siparişleri listeler
   */
  public static async getActiveKdsOrders(tenantId: string) {
    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        const orders = await tenantDb.order.findMany({
          where: {
            status: { in: [OrderStatus.PREPARING, OrderStatus.READY] },
          },
          include: {
            table: true,
            items: true,
          },
          orderBy: { createdAt: 'asc' },
          take: 50,
        });

        if (orders && orders.length > 0) {
          return orders.map((o) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            tableId: o.tableId || o.table?.code || 'tbl-1',
            tableCode: o.table?.name || o.table?.code || `Masa ${o.tableId}`,
            source: o.source,
            status: o.status,
            customerNote: o.customerNote,
            createdAt: o.createdAt.toISOString(),
            total: Number(o.total),
            items: o.items.map((i) => ({
              id: i.id,
              name: i.productName,
              quantity: i.quantity,
              unitPrice: Number(i.unitPrice),
              cookingLevel: i.cookingLevel,
              extras: (i.extras as any[]) || [],
              note: i.note,
              guestTag: i.guestTag,
              status: i.status,
            })),
          }));
        }
      } catch (err: any) {
        console.warn('[OrderService] getActiveKdsOrders DB hatası:', err.message);
      }
    }
    return [];
  }

  /**
   * Mutfak KDS üzerinden sipariş durumunu günceller ('READY' / 'SERVED' / 'PREPARING')
   * ve tüm Garson, POS ve QR ekranlarına Real-Time SSE olayı fırlatır (<15ms).
   */
  public static async updateOrderStatus(params: {
    tenantId: string;
    orderId: string;
    status: 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
    tableId?: string;
    changedById?: string;
  }): Promise<{ success: boolean; orderId: string; status: string; tableId?: string }> {
    const { tenantId, orderId, status, tableId } = params;

    let targetTableId = tableId;
    let orderNumber: number | undefined;
    let itemsSummary: any[] = [];

    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        const existingOrder = await tenantDb.order.findUnique({
          where: { id: orderId },
          include: { table: true, items: true },
        });

        if (existingOrder) {
          targetTableId = targetTableId || existingOrder.tableId || existingOrder.table?.code;
          orderNumber = existingOrder.orderNumber;
          itemsSummary = existingOrder.items.map((i) => ({
            name: i.productName,
            quantity: i.quantity,
          }));

          await tenantDb.order.update({
            where: { id: orderId },
            data: {
              status: status as OrderStatus,
            },
          });

          // Durum SERVED ise masa durumunu da 'SERVED' yap
          if (status === 'SERVED' && existingOrder.tableId) {
            await tenantDb.table.update({
              where: { id: existingOrder.tableId },
              data: { status: TableStatus.SERVED },
            });
          }
        }
      } catch (err: any) {
        console.warn('[OrderService] updateOrderStatus DB hatası, fallback yürütülüyor:', err.message);
      }
    }

    // Gerçek Zamanlı RealtimeHub SSE Dağıtımı
    try {
      const isReady = status === 'READY';
      const eventType: SyncEventType = isReady ? 'ORDER_READY_FOR_PICKUP' : 'ORDER_STATUS_CHANGED';

      const syncMessage: SyncMessage = {
        id: `kds-${orderId}-${Date.now()}`,
        type: eventType,
        tenantId,
        sourceDevice: 'kitchen_kds',
        deviceName: 'Mutfak KDS Ekranı',
        timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        payload: {
          orderId,
          orderNumber: orderNumber || Math.floor(Math.random() * 900) + 100,
          tableId: targetTableId || 'tbl-1',
          tableCode: targetTableId || 'tbl-1',
          status,
          readyAt: new Date().toISOString(),
          items: itemsSummary,
        },
      };

      realtimeHub.broadcast(tenantId, syncMessage);

      // Observability: Hazır Sipariş Metriği ve Günlük Kaydı
      if (isReady) {
        metricsCollector.recordOrderReady(450);
        structuredLogger.info(`[KdsLifecycle] Sipariş servise hazır (#${orderId})`, {
          event: 'order_ready_for_pickup',
          tenantId,
          tableId: targetTableId,
          orderId,
        });
      }

      // Ayrıca masa durumunun güncellenmesi için TABLE_STATUS_CHANGED fırlat
      if (status === 'SERVED' && targetTableId) {
        realtimeHub.broadcast(tenantId, {
          id: `tbl-status-${Date.now()}`,
          type: 'TABLE_STATUS_CHANGED',
          tenantId,
          sourceDevice: 'kitchen_kds',
          deviceName: 'Mutfak KDS Ekranı',
          timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          payload: {
            tableId: targetTableId,
            status: 'served',
            notes: 'Mutfak KDS: Sipariş servisi tamamlandı.',
          },
        });
      }
    } catch (realtimeErr) {
      console.warn('[OrderService] KDS Realtime bildirimi gönderilemedi:', realtimeErr);
    }

    return {
      success: true,
      orderId,
      status,
      tableId: targetTableId,
    };
  }

  /**
   * Sayfalanmış ve Filtrelenmiş Sipariş Listesi (N+1 Önleyici & Düşük Bellek Projeksiyonu)
   */
  public static async getPaginatedOrders(params: {
    tenantId: string;
    page?: number;
    limit?: number;
    status?: OrderStatus;
    tableId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<{
    items: Array<{
      id: string;
      orderNumber: number;
      tableId: string | null;
      tableName: string;
      source: string;
      status: string;
      total: number;
      itemsCount: number;
      createdAt: string;
    }>;
    pagination: {
      page: number;
      limit: number;
      totalCount: number;
      totalPages: number;
    };
  }> {
    const { tenantId, page = 1, limit = 20, status, tableId, dateFrom, dateTo } = params;
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const safePage = Math.max(1, page);
    const skip = (safePage - 1) * safeLimit;

    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        const where: Prisma.OrderWhereInput = {
          tenantId,
          ...(status ? { status } : {}),
          ...(tableId ? { tableId } : {}),
          ...(dateFrom || dateTo
            ? {
                createdAt: {
                  ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                  ...(dateTo ? { lte: new Date(dateTo) } : {}),
                },
              }
            : {}),
        };

        const [totalCount, orders] = await Promise.all([
          tenantDb.order.count({ where }),
          tenantDb.order.findMany({
            where,
            select: {
              id: true,
              orderNumber: true,
              tableId: true,
              source: true,
              status: true,
              total: true,
              createdAt: true,
              table: { select: { name: true, code: true } },
              _count: { select: { items: true } },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: safeLimit,
          }),
        ]);

        return {
          items: orders.map((o) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            tableId: o.tableId,
            tableName: o.table?.name || o.table?.code || `Masa ${o.tableId || ''}`,
            source: o.source,
            status: o.status,
            total: Number(o.total),
            itemsCount: o._count.items,
            createdAt: o.createdAt.toISOString(),
          })),
          pagination: {
            page: safePage,
            limit: safeLimit,
            totalCount,
            totalPages: Math.ceil(totalCount / safeLimit) || 1,
          },
        };
      } catch (err: any) {
        console.warn('[OrderService] getPaginatedOrders DB hatası:', err.message);
      }
    }

    return {
      items: [],
      pagination: {
        page: safePage,
        limit: safeLimit,
        totalCount: 0,
        totalPages: 1,
      },
    };
  }
}
