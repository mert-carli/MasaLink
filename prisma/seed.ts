/**
 * MasaLink demo seed — mevcut mock verileri (menuData, tableData, personel PIN'leri,
 * reçete modülü) PostgreSQL'e taşır. İdempotenttir: tekrar çalıştırıldığında
 * mevcut kayıtları günceller, aktif oturum/siparişleri yalnızca ilk seferde oluşturur.
 *
 * Çalıştırma: npm run db:seed
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import {
  KitchenStation,
  OrderSource,
  OrderStatus,
  Prisma,
  PrismaClient,
  RoleKey,
  StockMovementType,
  StockUnit,
  TableSection,
  TableStatus,
  TenantPlan,
  TenantStatus,
} from '@prisma/client';
import { QUICK_MENU_ITEMS, MENU_EXTRAS } from '../src/utils/menuData';
import { INITIAL_TABLES } from '../src/utils/tableData';

const prisma = new PrismaClient();

// Mevcut kodla uyum için sabit kiracı kimliği korunuyor ('tenant-artisan-burger').
const TENANT_ID = 'tenant-artisan-burger';
const TENANT_SLUG = 'artisan-burger';

const ROLE_PERMISSIONS: Record<RoleKey, string[]> = {
  OWNER: ['*'],
  ADMIN: ['*'],
  MANAGER: ['order:*', 'payment:*', 'discount:approve', 'item:cancel', 'item:comp', 'stock:*', 'table:*', 'report:read'],
  CASHIER: ['order:create', 'order:read', 'payment:create', 'discount:limited', 'table:read', 'table:update'],
  WAITER: ['order:create', 'order:read', 'table:read', 'table:update', 'qr:approve'],
  KITCHEN: ['order:read', 'order-item:update-status'],
};

const ROLE_NAMES: Record<RoleKey, string> = {
  OWNER: 'İşletme Sahibi',
  ADMIN: 'Genel Müdür',
  MANAGER: 'Müdür / Vardiya Amiri',
  CASHIER: 'Kasiyer',
  WAITER: 'Garson',
  KITCHEN: 'Mutfak',
};

// verify-pin/route.ts ve managerAuth.ts içindeki demo personel.
const STAFF: { name: string; role: RoleKey; pin: string; section?: TableSection; avatar?: string }[] = [
  { name: 'Ahmet Yılmaz', role: 'WAITER', pin: '1234', section: 'SALON', avatar: '👨‍🍳' },
  { name: 'Mehmet Demir', role: 'WAITER', pin: '5678', section: 'BAHCE', avatar: '🧑‍🌾' },
  { name: 'Ayşe Kaya', role: 'WAITER', pin: '9012', section: 'TERAS', avatar: '👩‍🍳' },
  { name: 'Selin Yıldız', role: 'WAITER', pin: '3456', section: 'TERAS', avatar: '👩' },
  { name: 'Zeynep Kaya', role: 'CASHIER', pin: '4321', avatar: 'ZK' },
  { name: 'Caner Öztürk', role: 'CASHIER', pin: '8765', avatar: 'CÖ' },
  // Eski mock'ta Emre Şahin hem kasiyer hem müdür olarak aynı PIN'le (1122) tanımlıydı → tek kayıt.
  { name: 'Emre Şahin', role: 'MANAGER', pin: '1122', avatar: 'EŞ' },
  // Eski mock'ta Ali Demir'in PIN'i (8765) Caner Öztürk ile çakışıyordu; PIN-only girişte
  // belirsizlik yaratmaması için 8766 olarak ayrıştırıldı.
  { name: 'Ali Demir', role: 'MANAGER', pin: '8766', avatar: 'AD' },
  { name: 'Mehmet Kaya', role: 'ADMIN', pin: '9999', avatar: 'MK' },
];

const STATION_BY_CATEGORY: Record<string, KitchenStation> = {
  Burgerler: 'GRILL',
  Yanlar: 'GRILL',
  İçecekler: 'BAR',
  Tatlılar: 'COLD',
  Soslar: 'COLD',
};

const SECTION_MAP: Record<string, TableSection> = { salon: 'SALON', bahce: 'BAHCE', teras: 'TERAS', bar: 'BAR' };
const STATUS_MAP: Record<string, TableStatus> = {
  empty: 'EMPTY',
  waiting_menu: 'WAITING_MENU',
  preparing: 'PREPARING',
  ordered: 'PREPARING',
  served: 'SERVED',
  bill_requested: 'BILL_REQUESTED',
  cleaning: 'CLEANING',
};

// MenuRecipeModule.tsx'teki hammaddeler — stok TEMEL birime çevrildi (kg → gram).
const INGREDIENTS: { key: string; name: string; unit: StockUnit; stock: number; critical: number; costPerUnit: number; waste: number }[] = [
  { key: 'kiyma', name: 'Dana Kıyma (%20 Yağlı)', unit: 'GRAM', stock: 8500, critical: 5000, costPerUnit: 0.42, waste: 5 },
  { key: 'ekmek', name: 'Brioche Burger Ekmeği', unit: 'PIECE', stock: 32, critical: 40, costPerUnit: 14, waste: 3 },
  { key: 'mayonez', name: 'Trüf Aromalı Mayonez', unit: 'GRAM', stock: 1200, critical: 1500, costPerUnit: 0.28, waste: 6 },
  { key: 'cheddar', name: 'Cheddar Peyniri Dilim', unit: 'SLICE', stock: 65, critical: 50, costPerUnit: 6, waste: 2 },
  { key: 'patates', name: 'Patates (Dondurulmuş Özel Kesim)', unit: 'GRAM', stock: 24000, critical: 15000, costPerUnit: 0.045, waste: 8 },
  { key: 'sogan', name: 'Karamelize Soğan Harcı', unit: 'GRAM', stock: 3400, critical: 2000, costPerUnit: 0.09, waste: 4 },
];

// Ürün kodu (menuData) → reçete kalemleri.
const RECIPES: Record<string, { ing: string; net: number; waste: number }[]> = {
  b1: [
    { ing: 'kiyma', net: 160, waste: 5 },
    { ing: 'ekmek', net: 1, waste: 3 },
    { ing: 'mayonez', net: 30, waste: 6 },
    { ing: 'cheddar', net: 2, waste: 2 },
  ],
  b2: [
    { ing: 'kiyma', net: 220, waste: 5 },
    { ing: 'ekmek', net: 1, waste: 3 },
    { ing: 'cheddar', net: 3, waste: 2 },
  ],
  y1: [{ ing: 'patates', net: 200, waste: 8 }],
};

async function main() {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && process.env.ALLOW_PRODUCTION_DEMO_SEED !== 'true') {
    throw new Error(
      '[GÜVENLİK ENGELİ] Üretim ortamında sabit PIN ve şifrelere sahip demo seed çalıştırılamaz! Gerçek kurulum için güvenli admin oluşturun (ALLOW_PRODUCTION_DEMO_SEED=true bayrağı zorunludur).'
    );
  }

  const slugifyTr = (s: string) =>
    s
      .toLocaleLowerCase('tr-TR')
      .replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c] as string)
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.|\.$/g, '');

  const adminPassword = process.env.SEED_ADMIN_PASSWORD || (isProduction ? '' : 'demo123');
  if (isProduction && (!adminPassword || adminPassword.length < 12)) {
    throw new Error('[GÜVENLİK ENGELİ] Üretim ortamında SEED_ADMIN_PASSWORD en az 12 karakter olmalıdır!');
  }

  // 1. Kiracı & şube
  const tenant = await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    create: { id: TENANT_ID, slug: TENANT_SLUG, name: 'Artisan Burger Bar', plan: TenantPlan.PRO, status: TenantStatus.ACTIVE },
    update: { name: 'Artisan Burger Bar' },
  });
  const branch = await prisma.branch.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'kadikoy-merkez' } },
    create: { tenantId: tenant.id, slug: 'kadikoy-merkez', name: 'Kadıköy Merkez Şube' },
    update: {},
  });

  // 2. Roller
  const roles = {} as Record<RoleKey, { id: string }>;
  for (const key of Object.values(RoleKey)) {
    roles[key] = await prisma.role.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key } },
      create: { tenantId: tenant.id, key, name: ROLE_NAMES[key], permissions: ROLE_PERMISSIONS[key] },
      update: { name: ROLE_NAMES[key], permissions: ROLE_PERMISSIONS[key] },
    });
  }

  // 3. Kullanıcılar (bcrypt hash)
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@masalink.com' } },
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      roleId: roles.OWNER.id,
      name: 'Murat Yılmaz',
      email: 'admin@masalink.com',
      passwordHash: await bcrypt.hash(adminPassword, 12),
    },
    update: {},
  });

  const usersByName = new Map<string, string>();
  for (const s of STAFF) {
    const email = `${slugifyTr(s.name)}@staff.artisan-burger.local`;
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      create: {
        tenantId: tenant.id,
        branchId: branch.id,
        roleId: roles[s.role].id,
        name: s.name,
        email,
        pinHash: await bcrypt.hash(s.pin, 10),
        section: s.section,
        avatar: s.avatar,
      },
      update: { roleId: roles[s.role].id, section: s.section, avatar: s.avatar },
    });
    usersByName.set(s.name, user.id);
  }

  // 4. Menü
  const categoryNames = Array.from(new Set(QUICK_MENU_ITEMS.map((i) => i.category)));
  const categories = new Map<string, string>();
  for (let idx = 0; idx < categoryNames.length; idx++) {
    const name = categoryNames[idx];
    const c = await prisma.category.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name } },
      create: { tenantId: tenant.id, name, sortOrder: idx },
      update: { sortOrder: idx },
    });
    categories.set(name, c.id);
  }

  const productIdByCode = new Map<string, string>();
  for (let idx = 0; idx < QUICK_MENU_ITEMS.length; idx++) {
    const item = QUICK_MENU_ITEMS[idx];
    const data = {
      categoryId: categories.get(item.category)!,
      name: item.name,
      description: item.description,
      price: new Prisma.Decimal(item.price),
      station: STATION_BY_CATEGORY[item.category] ?? KitchenStation.NONE,
      isPopular: Boolean(item.popular),
      sortOrder: idx,
    };
    const p = await prisma.product.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: item.id } },
      create: { tenantId: tenant.id, code: item.id, ...data },
      update: data,
    });
    productIdByCode.set(item.id, p.id);
  }

  for (const ex of MENU_EXTRAS) {
    await prisma.productOption.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: ex.id } },
      create: { tenantId: tenant.id, code: ex.id, name: ex.name, extraPrice: new Prisma.Decimal(ex.extraPrice) },
      update: { name: ex.name, extraPrice: new Prisma.Decimal(ex.extraPrice) },
    });
  }

  // 5. Hammadde, açılış stoğu & reçeteler
  const ingredientIdByKey = new Map<string, string>();
  for (const ing of INGREDIENTS) {
    const existing = await prisma.ingredient.findUnique({
      where: { tenantId_name: { tenantId: tenant.id, name: ing.name } },
    });
    if (existing) {
      ingredientIdByKey.set(ing.key, existing.id);
      continue;
    }
    // Stok yalnızca defter üzerinden değişir: açılış bakiyesi bir ADJUSTMENT hareketidir.
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.ingredient.create({
        data: {
          tenantId: tenant.id,
          name: ing.name,
          unit: ing.unit,
          currentStock: ing.stock,
          criticalThreshold: ing.critical,
          costPerUnit: ing.costPerUnit,
          wasteFactorPercent: ing.waste,
        },
      });
      await tx.stockMovement.create({
        data: {
          tenantId: tenant.id,
          ingredientId: row.id,
          type: StockMovementType.ADJUSTMENT,
          quantity: ing.stock,
          balanceAfter: ing.stock,
          unitCost: ing.costPerUnit,
          reason: 'Açılış stoğu (seed)',
        },
      });
      return row;
    });
    ingredientIdByKey.set(ing.key, created.id);
  }

  for (const [productCode, items] of Object.entries(RECIPES)) {
    const productId = productIdByCode.get(productCode);
    if (!productId) continue;
    const recipe = await prisma.recipe.upsert({
      where: { productId },
      create: { tenantId: tenant.id, productId },
      update: {},
    });
    for (const it of items) {
      const ingredientId = ingredientIdByKey.get(it.ing)!;
      await prisma.recipeItem.upsert({
        where: { recipeId_ingredientId: { recipeId: recipe.id, ingredientId } },
        create: { recipeId: recipe.id, ingredientId, netAmount: it.net, wastePercent: it.waste },
        update: { netAmount: it.net, wastePercent: it.waste },
      });
    }
  }

  // 6. Masalar + dolu masalar için aktif oturum & açılış adisyonu
  const productByName = new Map(QUICK_MENU_ITEMS.map((p) => [p.name.toLocaleLowerCase('tr-TR'), p.id]));
  let orderNumber = (await prisma.order.aggregate({ where: { branchId: branch.id }, _max: { orderNumber: true } }))._max.orderNumber ?? 0;

  for (let idx = 0; idx < INITIAL_TABLES.length; idx++) {
    const t = INITIAL_TABLES[idx];
    const table = await prisma.table.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: t.id } },
      create: {
        tenantId: tenant.id,
        branchId: branch.id,
        code: t.id,
        name: t.name,
        section: SECTION_MAP[t.section] ?? 'SALON',
        capacity: t.capacity,
        status: STATUS_MAP[t.status] ?? 'EMPTY',
        posX: idx % 4,
        posY: Math.floor(idx / 4),
      },
      update: { name: t.name, capacity: t.capacity },
    });

    const occupied = !['empty', 'cleaning'].includes(t.status);
    if (!occupied) continue;

    const hasSession = await prisma.tableSession.findFirst({ where: { tableId: table.id, status: 'ACTIVE' } });
    if (hasSession) continue;

    const waiterId = t.waiterName ? usersByName.get(t.waiterName) : undefined;
    const total = t.items.reduce((s: number, i: { price: number; quantity: number }) => s + i.price * i.quantity, 0);

    await prisma.$transaction(async (tx) => {
      const session = await tx.tableSession.create({
        data: {
          tenantId: tenant.id,
          tableId: table.id,
          token: `mst_${crypto.randomBytes(16).toString('hex')}`,
          waiterId,
          totalAmount: total,
          openedAt: new Date(Date.now() - (t.durationMinutes || 0) * 60_000),
        },
      });
      if (!t.items.length) return;

      await tx.order.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          tableId: table.id,
          sessionId: session.id,
          orderNumber: ++orderNumber,
          source: OrderSource.WAITER,
          status: t.status === 'preparing' ? OrderStatus.PREPARING : OrderStatus.SERVED,
          subtotal: total,
          total,
          createdById: waiterId,
          items: {
            create: t.items.map((i: any) => {
              const code = productByName.get(i.name.toLocaleLowerCase('tr-TR'));
              return {
                tenantId: tenant.id,
                productId: code ? productIdByCode.get(code) : undefined,
                productName: i.name,
                unitPrice: i.price,
                quantity: i.quantity,
                lineTotal: i.price * i.quantity,
                guestTag: i.guestTag,
                status: t.status === 'preparing' ? 'PREPARING' : 'SERVED',
              };
            }),
          },
        },
      });
    });
  }

  const counts = {
    users: await prisma.user.count({ where: { tenantId: tenant.id } }),
    products: await prisma.product.count({ where: { tenantId: tenant.id } }),
    tables: await prisma.table.count({ where: { tenantId: tenant.id } }),
    activeSessions: await prisma.tableSession.count({ where: { tenantId: tenant.id, status: 'ACTIVE' } }),
    orders: await prisma.order.count({ where: { tenantId: tenant.id } }),
    ingredients: await prisma.ingredient.count({ where: { tenantId: tenant.id } }),
  };
  console.log('✅ Seed tamamlandı:', counts);
}

main()
  .catch((e) => {
    console.error('❌ Seed hatası:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
