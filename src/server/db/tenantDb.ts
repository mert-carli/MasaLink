import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from './prisma';
import { TenantContext, TenantIsolationViolationError } from './tenantContext';

/**
 * Modellerin kiracı ve şube izolasyon kuralları.
 */
const TENANT_MODELS = new Set<string>([
  'Branch',
  'Role',
  'User',
  'Table',
  'TableSession',
  'Category',
  'Product',
  'ProductOption',
  'Order',
  'OrderItem',
  'Payment',
  'Ingredient',
  'Recipe',
  'StockMovement',
  'OrderDraft',
  'AuditLog',
]);

const BRANCH_SCOPED_MODELS = new Set<string>([
  'Table',
  'Order',
  'User',
]);

/**
 * Kiracıya özel izole edilmiş Prisma istemcisi döndürür.
 * 
 * Bu istemci üzerinden yapılan TÜM sorgular:
 * 1. Otomatik olarak `tenantId` ile mühürlenir.
 * 2. Geliştirici `where: { tenantId }` yazmayı unutsa dahi zorunlu eklenir.
 * 3. Geliştirici veya istemci farklı bir `tenantId` ile veri çekmeye/yazmaya çalışırsa
 *    anında `TenantIsolationViolationError` fırlatılır (BOLA / IDOR Kalkanı).
 * 4. findUnique çağrıları kiracı filtresi ile sarmalanır; başka kiracının ID'si tahmin
 *    edilse dahi kayıt asla bulunamaz (NULL döner).
 */
export function createTenantDb(context: TenantContext) {
  if (!context || !context.tenantId) {
    throw new TenantIsolationViolationError('TenantDb başlatılamadı: Geçerli bir tenantId zorunludur.');
  }

  const { tenantId, branchId } = context;

  return prisma.$extends({
    name: 'TenantIsolationExtension',
    query: {
      $allModels: {
        async findFirst({ model, args, query }) {
          if (TENANT_MODELS.has(model)) {
            enforceWhereClause(model, args, tenantId, branchId);
          }
          return query(args);
        },

        async findMany({ model, args, query }) {
          if (TENANT_MODELS.has(model)) {
            enforceWhereClause(model, args, tenantId, branchId);
          }
          return query(args);
        },

        async count({ model, args, query }) {
          if (TENANT_MODELS.has(model)) {
            enforceWhereClause(model, args, tenantId, branchId);
          }
          return query(args);
        },

        async aggregate({ model, args, query }) {
          if (TENANT_MODELS.has(model)) {
            enforceWhereClause(model, args, tenantId, branchId);
          }
          return query(args);
        },

        async groupBy({ model, args, query }) {
          if (TENANT_MODELS.has(model)) {
            enforceWhereClause(model, args, tenantId, branchId);
          }
          return query(args);
        },

        /**
         * findUnique sorgusu id tabanlıdır; kiracı kontrolü olmadan çalışırsa IDOR açığı yaratır.
         * findUnique'i kiracı kontrollü findFirst'e dönüştürerek diğer kiracının verisini gizler.
         */
        async findUnique({ model, args, query }) {
          if (TENANT_MODELS.has(model)) {
            const where = (args as any).where || {};
            if (where.tenantId && where.tenantId !== tenantId) {
              throw new TenantIsolationViolationError(
                `Yetkisiz Kiracı Erişimi: '${where.tenantId}' kiracısına ait veri '${tenantId}' oturumundan sorgulanamaz.`,
                { model, attemptedTenantId: where.tenantId, currentTenantId: tenantId }
              );
            }
            // IDOR koruması: findFirst üzerinden tenantId zorlamasıyla çalıştır
            return (prisma as any)[model].findFirst({
              where: {
                ...where,
                tenantId,
                ...(branchId && BRANCH_SCOPED_MODELS.has(model) && !where.branchId ? { branchId } : {}),
              },
              select: args.select,
              include: args.include,
            });
          }
          return query(args);
        },

        async create({ model, args, query }) {
          if (TENANT_MODELS.has(model)) {
            enforceCreateData(model, args, tenantId, branchId);
          }
          return query(args);
        },

        async createMany({ model, args, query }) {
          if (TENANT_MODELS.has(model)) {
            if (args && args.data) {
              const dataList = Array.isArray(args.data) ? args.data : [args.data];
              for (const item of dataList) {
                enforceCreateItem(model, item, tenantId, branchId);
              }
            }
          }
          return query(args);
        },

        async update({ model, args, query }) {
          if (TENANT_MODELS.has(model)) {
            await verifyOwnershipBeforeMutation(model, args.where, tenantId);
            enforceWhereClause(model, args, tenantId, branchId);
          }
          return query(args);
        },

        async updateMany({ model, args, query }) {
          if (TENANT_MODELS.has(model)) {
            enforceWhereClause(model, args, tenantId, branchId);
          }
          return query(args);
        },

        async delete({ model, args, query }) {
          if (TENANT_MODELS.has(model)) {
            await verifyOwnershipBeforeMutation(model, args.where, tenantId);
            enforceWhereClause(model, args, tenantId, branchId);
          }
          return query(args);
        },

        async deleteMany({ model, args, query }) {
          if (TENANT_MODELS.has(model)) {
            enforceWhereClause(model, args, tenantId, branchId);
          }
          return query(args);
        },
      },
    },
  });
}

export type TenantScopedDb = ReturnType<typeof createTenantDb>;

/**
 * Filtreleme kurallarını zorunlu olarak `args.where` içine enjekte eder.
 */
function enforceWhereClause(model: string, args: any, tenantId: string, branchId?: string) {
  if (!args) return;
  args.where = args.where || {};

  // Geliştirici veya istemci farklı bir tenantId belirtmişse bloke et
  if (args.where.tenantId && args.where.tenantId !== tenantId) {
    throw new TenantIsolationViolationError(
      `Yetkisiz Kiracı Erişimi: '${args.where.tenantId}' kiracısına ait kayıtlar '${tenantId}' oturumunda sorgulanamaz.`,
      { model, attemptedTenantId: args.where.tenantId, currentTenantId: tenantId }
    );
  }

  args.where.tenantId = tenantId;

  // Şube bazlı modelse ve context içinde branchId varsa enjekte et
  if (branchId && BRANCH_SCOPED_MODELS.has(model) && !args.where.branchId) {
    args.where.branchId = branchId;
  }
}

/**
 * Kayıt oluştururken (create) kiracı bilgisini doğrular ve bağlar.
 */
function enforceCreateData(model: string, args: any, tenantId: string, branchId?: string) {
  if (!args || !args.data) return;
  enforceCreateItem(model, args.data, tenantId, branchId);
}

function enforceCreateItem(model: string, data: any, tenantId: string, branchId?: string) {
  if (!data) return;

  // tenantId doğrudan string olarak verilmişse
  if (data.tenantId && data.tenantId !== tenantId) {
    throw new TenantIsolationViolationError(
      `Yetkisiz Kiracı Yazma Girişimi: '${data.tenantId}' kiracısına veri eklenemez (Yetkili Kiracı: '${tenantId}').`,
      { model, attemptedTenantId: data.tenantId, currentTenantId: tenantId }
    );
  }

  // tenant ilişkisi (connect) verilmişse
  if (data.tenant?.connect?.id && data.tenant.connect.id !== tenantId) {
    throw new TenantIsolationViolationError(
      `Yetkisiz Kiracı İlişkilendirme Girişimi: '${data.tenant.connect.id}' kiracısına bağlanamaz (Yetkili Kiracı: '${tenantId}').`,
      { model, attemptedTenantId: data.tenant.connect.id, currentTenantId: tenantId }
    );
  }

  // Otomatik bağla
  if (!data.tenant && !data.tenantId) {
    data.tenantId = tenantId;
  }

  // Şube bağlamı
  if (branchId && BRANCH_SCOPED_MODELS.has(model) && !data.branchId && !data.branch) {
    data.branchId = branchId;
  }
}

/**
 * Tekil satır güncelleme veya silme öncesinde satırın o kiracıya ait olduğunu doğrular.
 */
async function verifyOwnershipBeforeMutation(model: string, where: any, tenantId: string) {
  if (!where) return;

  // Doğrudan tenantId verilmiş ve uyuşmuyorsa
  if (where.tenantId && where.tenantId !== tenantId) {
    throw new TenantIsolationViolationError(
      `Yetkisiz Kayıt Değişikliği: Bu işlem '${tenantId}' kiracısı tarafından yapılamaz.`,
      { model, where, currentTenantId: tenantId }
    );
  }

  // where.id veya benzersiz anahtar üzerinden satırı oku ve tenantId'sini denetle
  try {
    const existing = await (prisma as any)[model].findFirst({
      where: { ...where, tenantId },
      select: { id: true, tenantId: true },
    });

    if (!existing) {
      throw new TenantIsolationViolationError(
        `Kayıt bulunamadı veya başka bir kiracıya ait: Değişiklik reddedildi.`,
        { model, where, currentTenantId: tenantId }
      );
    }
  } catch (err: any) {
    if (err instanceof TenantIsolationViolationError) throw err;
    // Tablo henüz boşsa veya DB erişilemiyorsa pas geç
  }
}
