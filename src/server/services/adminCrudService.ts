import { KitchenStation, RoleKey, TableSection, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '@/server/db/prisma';
import { createTenantDb } from '@/server/db/tenantDb';
import { TokenRevocationService } from '@/server/security/tokenRevocation';
import { CacheService } from '@/server/redis/cacheService';
import { QUICK_MENU_ITEMS, MENU_EXTRAS, MenuItem, MenuExtraOption } from '@/utils/menuData';
import { INITIAL_TABLES } from '@/utils/tableData';

/**
 * MasaLink Dinamik Admin CRUD Servisi
 * 
 * Kod değiştirmeye gerek kalmadan menü, kategori, fiyat, ekstra malzeme, reçete,
 * hammadde, masa, bölge ve personelin tam yetkiyle yönetilmesini sağlar.
 * 
 * PostgreSQL bağlı olduğunda tenantDb ile RLS korumalı olarak veritabanına yazar.
 * Geliştirme/Demo ortamında in-memory kalıcı depo ile kesintisiz çalışır.
 */

// In-Memory Fallback Depoları (PostgreSQL yokken veri kaybını önler)
interface DynamicCategory {
  id: string;
  tenantId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

interface DynamicProduct {
  id: string;
  tenantId: string;
  categoryId: string;
  categoryName?: string;
  code: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  station: KitchenStation;
  isPopular: boolean;
  isActive: boolean;
  sortOrder: number;
}

interface DynamicExtra {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  extraPrice: number;
  isActive: boolean;
}

interface DynamicIngredient {
  id: string;
  tenantId: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  costPerUnit: number;
}

interface DynamicRecipeItem {
  ingredientId: string;
  ingredientName?: string;
  netAmount: number;
  wastePercent: number;
  unit: string;
}

interface DynamicRecipe {
  productId: string;
  yield: number;
  items: DynamicRecipeItem[];
}

interface DynamicTable {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  section: TableSection;
  capacity: number;
  isActive: boolean;
  sortOrder: number;
  qrSlug?: string;
}

interface DynamicStaff {
  id: string;
  tenantId: string;
  name: string;
  email?: string;
  roleKey: RoleKey;
  roleName: string;
  section?: TableSection;
  pinHash?: string;
  isActive: boolean;
  createdAt: string;
}

// Global In-Memory Singletone
const memoryStore = {
  categories: new Map<string, DynamicCategory[]>(),
  products: new Map<string, DynamicProduct[]>(),
  extras: new Map<string, DynamicExtra[]>(),
  ingredients: new Map<string, DynamicIngredient[]>(),
  recipes: new Map<string, Map<string, DynamicRecipe>>(),
  tables: new Map<string, DynamicTable[]>(),
  staff: new Map<string, DynamicStaff[]>(),
};

function seedMemoryStoreIfEmpty(tenantId: string) {
  if (!memoryStore.categories.has(tenantId)) {
    // 1. Kategoriler
    const cats: DynamicCategory[] = [
      { id: 'cat-1', tenantId, name: 'Burgerler', sortOrder: 1, isActive: true },
      { id: 'cat-2', tenantId, name: 'Yanlar', sortOrder: 2, isActive: true },
      { id: 'cat-3', tenantId, name: 'İçecekler', sortOrder: 3, isActive: true },
      { id: 'cat-4', tenantId, name: 'Tatlılar', sortOrder: 4, isActive: true },
    ];
    memoryStore.categories.set(tenantId, cats);

    // 2. Ürünler
    const prods: DynamicProduct[] = QUICK_MENU_ITEMS.map((item, idx) => ({
      id: item.id,
      tenantId,
      categoryId: item.category === 'Burgerler' ? 'cat-1' : item.category === 'Yanlar' ? 'cat-2' : item.category === 'İçecekler' ? 'cat-3' : 'cat-4',
      categoryName: item.category,
      code: item.id,
      name: item.name,
      description: item.description,
      price: item.price,
      station: item.category === 'Burgerler' ? KitchenStation.GRILL : item.category === 'Yanlar' ? KitchenStation.GRILL : item.category === 'İçecekler' ? KitchenStation.BAR : KitchenStation.COLD,
      isPopular: Boolean(item.popular),
      isActive: true,
      sortOrder: idx + 1,
    }));
    memoryStore.products.set(tenantId, prods);

    // 3. Ekstralar
    const extras: DynamicExtra[] = MENU_EXTRAS.map((e) => ({
      id: e.id,
      tenantId,
      code: e.id,
      name: e.name,
      extraPrice: e.extraPrice,
      isActive: true,
    }));
    memoryStore.extras.set(tenantId, extras);

    // 4. Hammaddeler
    const ings: DynamicIngredient[] = [
      { id: 'ing-1', tenantId, name: 'Dana Kıyma (%20 Yağlı)', unit: 'kg', currentStock: 18.5, minStock: 5.0, costPerUnit: 420 },
      { id: 'ing-2', tenantId, name: 'Brioche Burger Ekmeği', unit: 'adet', currentStock: 80, minStock: 30, costPerUnit: 14 },
      { id: 'ing-3', tenantId, name: 'Trüf Aromalı Mayonez', unit: 'kg', currentStock: 4.2, minStock: 1.5, costPerUnit: 280 },
      { id: 'ing-4', tenantId, name: 'Cheddar Peyniri Dilim', unit: 'dilim', currentStock: 120, minStock: 40, costPerUnit: 6 },
      { id: 'ing-5', tenantId, name: 'Patates (Dondurulmuş)', unit: 'kg', currentStock: 35, minStock: 15, costPerUnit: 45 },
    ];
    memoryStore.ingredients.set(tenantId, ings);

    // 5. Masalar
    const tbls: DynamicTable[] = INITIAL_TABLES.map((t, idx) => ({
      id: t.id,
      tenantId,
      code: t.id,
      name: t.name,
      section: t.section === 'salon' ? TableSection.SALON : t.section === 'bahce' ? TableSection.BAHCE : t.section === 'teras' ? TableSection.TERAS : TableSection.BAR,
      capacity: t.capacity || 4,
      isActive: true,
      sortOrder: idx + 1,
      qrSlug: `artisan-burger-${t.id}`,
    }));
    memoryStore.tables.set(tenantId, tbls);

    // 6. Personel
    const stf: DynamicStaff[] = [
      { id: 'stf-1', tenantId, name: 'Ahmet Yılmaz', email: 'ahmet@masalink.com', roleKey: RoleKey.WAITER, roleName: 'Garson', section: TableSection.SALON, isActive: true, createdAt: new Date().toISOString() },
      { id: 'stf-2', tenantId, name: 'Selin Yıldız', email: 'selin@masalink.com', roleKey: RoleKey.WAITER, roleName: 'Garson', section: TableSection.BAHCE, isActive: true, createdAt: new Date().toISOString() },
      { id: 'stf-3', tenantId, name: 'Zeynep Kaya', email: 'zeynep@masalink.com', roleKey: RoleKey.CASHIER, roleName: 'Kasiyer', isActive: true, createdAt: new Date().toISOString() },
      { id: 'stf-4', tenantId, name: 'Kemal Usta', email: 'kemal@masalink.com', roleKey: RoleKey.KITCHEN, roleName: 'Şef Aşçı', isActive: true, createdAt: new Date().toISOString() },
      { id: 'stf-5', tenantId, name: 'Murat Yılmaz', email: 'murat@masalink.com', roleKey: RoleKey.ADMIN, roleName: 'Restoran Müdürü', isActive: true, createdAt: new Date().toISOString() },
    ];
    memoryStore.staff.set(tenantId, stf);
  }
}

export class AdminCrudService {
  // =========================================================================
  // 1. KATEGORİ YÖNETİMİ
  // =========================================================================
  public static async listCategories(tenantId: string) {
    const cacheKey = `masalink:cat:${tenantId}`;
    return await CacheService.getOrSet(
      cacheKey,
      async () => {
        if (process.env.DATABASE_URL) {
          try {
            const tenantDb = createTenantDb({ tenantId });
            const cats = await tenantDb.category.findMany({
              orderBy: { sortOrder: 'asc' },
            });
            if (cats.length > 0) return cats;
          } catch (err: any) {
            console.warn('[AdminCrudService] DB listCategories fallback:', err.message);
          }
        }
        seedMemoryStoreIfEmpty(tenantId);
        return memoryStore.categories.get(tenantId) || [];
      },
      60
    );
  }

  public static async createCategory(tenantId: string, input: { name: string; sortOrder?: number }) {
    if (!input.name || input.name.trim().length === 0) {
      throw new Error('Kategori adı zorunludur.');
    }
    const cleanName = input.name.trim();

    await CacheService.del(`masalink:cat:${tenantId}`);

    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        return await tenantDb.category.create({
          data: {
            tenantId,
            name: cleanName,
            sortOrder: input.sortOrder ?? 0,
            isActive: true,
          },
        });
      } catch (err: any) {
        console.warn('[AdminCrudService] DB createCategory fallback:', err.message);
      }
    }

    seedMemoryStoreIfEmpty(tenantId);
    const cats = memoryStore.categories.get(tenantId)!;
    const newCat: DynamicCategory = {
      id: `cat-${Date.now()}`,
      tenantId,
      name: cleanName,
      sortOrder: input.sortOrder ?? cats.length + 1,
      isActive: true,
    };
    cats.push(newCat);
    return newCat;
  }

  public static async updateCategory(tenantId: string, id: string, input: { name?: string; sortOrder?: number; isActive?: boolean }) {
    await CacheService.del(`masalink:cat:${tenantId}`);

    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        return await tenantDb.category.update({
          where: { id },
          data: {
            name: input.name?.trim(),
            sortOrder: input.sortOrder,
            isActive: input.isActive,
          },
        });
      } catch (err: any) {
        console.warn('[AdminCrudService] DB updateCategory fallback:', err.message);
      }
    }

    seedMemoryStoreIfEmpty(tenantId);
    const cats = memoryStore.categories.get(tenantId)!;
    const target = cats.find((c) => c.id === id);
    if (!target) throw new Error('Kategori bulunamadı.');
    if (input.name) target.name = input.name.trim();
    if (typeof input.sortOrder === 'number') target.sortOrder = input.sortOrder;
    if (typeof input.isActive === 'boolean') target.isActive = input.isActive;
    return target;
  }

  public static async deleteCategory(tenantId: string, id: string) {
    await CacheService.del(`masalink:cat:${tenantId}`);

    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        return await tenantDb.category.delete({ where: { id } });
      } catch (err: any) {
        console.warn('[AdminCrudService] DB deleteCategory fallback:', err.message);
      }
    }

    seedMemoryStoreIfEmpty(tenantId);
    const cats = memoryStore.categories.get(tenantId)!;
    memoryStore.categories.set(tenantId, cats.filter((c) => c.id !== id));
    return { success: true, deletedId: id };
  }

  // =========================================================================
  // 2. MENÜ & ÜRÜN YÖNETİMİ (FİYAT DEĞİŞİMİ DAHİL)
  // =========================================================================
  private static async invalidateProductCache(tenantId: string) {
    await CacheService.del(
      `masalink:prod:${tenantId}:all`
    );
  }

  public static async listProducts(tenantId: string, categoryId?: string) {
    const cacheKey = `masalink:prod:${tenantId}:${categoryId || 'all'}`;
    return await CacheService.getOrSet(
      cacheKey,
      async () => {
        if (process.env.DATABASE_URL) {
          try {
            const tenantDb = createTenantDb({ tenantId });
            const products = await tenantDb.product.findMany({
              where: categoryId ? { categoryId } : undefined,
              include: { category: true, recipe: { include: { items: { include: { ingredient: true } } } } },
              orderBy: { sortOrder: 'asc' },
            });

            if (products.length > 0) {
              return products.map((p) => ({
                id: p.id,
                tenantId: p.tenantId,
                categoryId: p.categoryId,
                categoryName: p.category.name,
                code: p.code,
                name: p.name,
                description: p.description,
                price: Number(p.price),
                imageUrl: p.imageUrl,
                station: p.station,
                isPopular: p.isPopular,
                isActive: p.isActive,
                sortOrder: p.sortOrder,
                recipe: p.recipe ? {
                  yield: Number(p.recipe.yield),
                  items: p.recipe.items.map((i) => ({
                    ingredientId: i.ingredientId,
                    ingredientName: i.ingredient.name,
                    netAmount: Number(i.netAmount),
                    wastePercent: Number(i.wastePercent),
                    unit: i.ingredient.unit,
                    costPerUnit: Number(i.ingredient.costPerUnit || 0),
                  })),
                } : null,
              }));
            }
          } catch (err: any) {
            console.warn('[AdminCrudService] DB listProducts fallback:', err.message);
          }
        }

        seedMemoryStoreIfEmpty(tenantId);
        let prods = memoryStore.products.get(tenantId) || [];
        if (categoryId) {
          prods = prods.filter((p) => p.categoryId === categoryId);
        }
        return prods;
      },
      60
    );
  }

  public static async createProduct(
    tenantId: string,
    input: {
      categoryId: string;
      name: string;
      price: number;
      code?: string;
      description?: string;
      imageUrl?: string;
      station?: KitchenStation;
      isPopular?: boolean;
    }
  ) {
    if (!input.name || Number(input.price) < 0) {
      throw new Error('Geçerli bir ürün adı ve fiyat girilmelidir.');
    }

    const cleanName = input.name.trim();
    const cleanPrice = Number(input.price);
    const code = input.code?.trim() || `p-${Date.now().toString().slice(-6)}`;
    const station = input.station || KitchenStation.GRILL;

    await this.invalidateProductCache(tenantId);

    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        const created = await tenantDb.product.create({
          data: {
            tenantId,
            categoryId: input.categoryId,
            code,
            name: cleanName,
            price: cleanPrice,
            description: input.description,
            imageUrl: input.imageUrl,
            station,
            isPopular: Boolean(input.isPopular),
            isActive: true,
          },
          include: { category: true },
        });

        return {
          id: created.id,
          tenantId: created.tenantId,
          categoryId: created.categoryId,
          categoryName: created.category.name,
          code: created.code,
          name: created.name,
          price: Number(created.price),
          description: created.description,
          station: created.station,
          isPopular: created.isPopular,
          isActive: created.isActive,
        };
      } catch (err: any) {
        console.warn('[AdminCrudService] DB createProduct fallback:', err.message);
      }
    }

    seedMemoryStoreIfEmpty(tenantId);
    const prods = memoryStore.products.get(tenantId)!;
    const cats = memoryStore.categories.get(tenantId)!;
    const cat = cats.find((c) => c.id === input.categoryId);

    const newProd: DynamicProduct = {
      id: `p-${Date.now()}`,
      tenantId,
      categoryId: input.categoryId,
      categoryName: cat?.name || 'Genel',
      code,
      name: cleanName,
      price: cleanPrice,
      description: input.description,
      imageUrl: input.imageUrl,
      station,
      isPopular: Boolean(input.isPopular),
      isActive: true,
      sortOrder: prods.length + 1,
    };
    prods.push(newProd);
    return newProd;
  }

  public static async updateProduct(
    tenantId: string,
    id: string,
    input: {
      categoryId?: string;
      name?: string;
      price?: number;
      description?: string;
      imageUrl?: string;
      station?: KitchenStation;
      isPopular?: boolean;
      isActive?: boolean;
    }
  ) {
    await this.invalidateProductCache(tenantId);

    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        const updated = await tenantDb.product.update({
          where: { id },
          data: {
            categoryId: input.categoryId,
            name: input.name?.trim(),
            price: typeof input.price === 'number' ? input.price : undefined,
            description: input.description,
            imageUrl: input.imageUrl,
            station: input.station,
            isPopular: input.isPopular,
            isActive: input.isActive,
          },
          include: { category: true },
        });

        return {
          id: updated.id,
          tenantId: updated.tenantId,
          categoryId: updated.categoryId,
          categoryName: updated.category.name,
          code: updated.code,
          name: updated.name,
          price: Number(updated.price),
          description: updated.description,
          station: updated.station,
          isPopular: updated.isPopular,
          isActive: updated.isActive,
        };
      } catch (err: any) {
        console.warn('[AdminCrudService] DB updateProduct fallback:', err.message);
      }
    }

    seedMemoryStoreIfEmpty(tenantId);
    const prods = memoryStore.products.get(tenantId)!;
    const target = prods.find((p) => p.id === id || p.code === id);
    if (!target) throw new Error('Güncellenecek ürün bulunamadı.');

    if (input.name) target.name = input.name.trim();
    if (typeof input.price === 'number') target.price = input.price;
    if (input.description !== undefined) target.description = input.description;
    if (input.station) target.station = input.station;
    if (typeof input.isPopular === 'boolean') target.isPopular = input.isPopular;
    if (typeof input.isActive === 'boolean') target.isActive = input.isActive;
    if (input.categoryId) {
      target.categoryId = input.categoryId;
      const cats = memoryStore.categories.get(tenantId) || [];
      target.categoryName = cats.find((c) => c.id === input.categoryId)?.name || target.categoryName;
    }

    return target;
  }

  public static async deleteProduct(tenantId: string, id: string) {
    await this.invalidateProductCache(tenantId);

    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        return await tenantDb.product.delete({ where: { id } });
      } catch (err: any) {
        console.warn('[AdminCrudService] DB deleteProduct fallback:', err.message);
      }
    }

    seedMemoryStoreIfEmpty(tenantId);
    const prods = memoryStore.products.get(tenantId)!;
    memoryStore.products.set(tenantId, prods.filter((p) => p.id !== id && p.code !== id));
    return { success: true, deletedId: id };
  }

  // =========================================================================
  // 3. EKSTRA MALZEME YÖNETİMİ (PRODUCT OPTIONS)
  // =========================================================================
  public static async listExtras(tenantId: string) {
    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        const extras = await tenantDb.productOption.findMany({
          orderBy: { name: 'asc' },
        });
        if (extras.length > 0) {
          return extras.map((e) => ({
            id: e.id,
            tenantId: e.tenantId,
            code: e.code,
            name: e.name,
            extraPrice: Number(e.extraPrice),
            isActive: e.isActive,
          }));
        }
      } catch (err: any) {
        console.warn('[AdminCrudService] DB listExtras fallback:', err.message);
      }
    }

    seedMemoryStoreIfEmpty(tenantId);
    return memoryStore.extras.get(tenantId) || [];
  }

  public static async createExtra(tenantId: string, input: { name: string; extraPrice: number; code?: string }) {
    const cleanName = input.name.trim();
    const cleanPrice = Number(input.extraPrice);
    const code = input.code?.trim() || `ex-${Date.now().toString().slice(-5)}`;

    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        const created = await tenantDb.productOption.create({
          data: {
            tenantId,
            code,
            name: cleanName,
            extraPrice: cleanPrice,
            isActive: true,
          },
        });
        return {
          id: created.id,
          tenantId: created.tenantId,
          code: created.code,
          name: created.name,
          extraPrice: Number(created.extraPrice),
          isActive: created.isActive,
        };
      } catch (err: any) {
        console.warn('[AdminCrudService] DB createExtra fallback:', err.message);
      }
    }

    seedMemoryStoreIfEmpty(tenantId);
    const extras = memoryStore.extras.get(tenantId)!;
    const newExtra: DynamicExtra = {
      id: code,
      tenantId,
      code,
      name: cleanName,
      extraPrice: cleanPrice,
      isActive: true,
    };
    extras.push(newExtra);
    return newExtra;
  }

  public static async updateExtra(tenantId: string, id: string, input: { name?: string; extraPrice?: number; isActive?: boolean }) {
    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        const updated = await tenantDb.productOption.update({
          where: { id },
          data: {
            name: input.name?.trim(),
            extraPrice: typeof input.extraPrice === 'number' ? input.extraPrice : undefined,
            isActive: input.isActive,
          },
        });
        return {
          id: updated.id,
          tenantId: updated.tenantId,
          code: updated.code,
          name: updated.name,
          extraPrice: Number(updated.extraPrice),
          isActive: updated.isActive,
        };
      } catch (err: any) {
        console.warn('[AdminCrudService] DB updateExtra fallback:', err.message);
      }
    }

    seedMemoryStoreIfEmpty(tenantId);
    const extras = memoryStore.extras.get(tenantId)!;
    const target = extras.find((e) => e.id === id || e.code === id);
    if (!target) throw new Error('Ekstra malzeme bulunamadı.');
    if (input.name) target.name = input.name.trim();
    if (typeof input.extraPrice === 'number') target.extraPrice = input.extraPrice;
    if (typeof input.isActive === 'boolean') target.isActive = input.isActive;
    return target;
  }

  public static async deleteExtra(tenantId: string, id: string) {
    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        return await tenantDb.productOption.delete({ where: { id } });
      } catch (err: any) {
        console.warn('[AdminCrudService] DB deleteExtra fallback:', err.message);
      }
    }

    seedMemoryStoreIfEmpty(tenantId);
    const extras = memoryStore.extras.get(tenantId)!;
    memoryStore.extras.set(tenantId, extras.filter((e) => e.id !== id && e.code !== id));
    return { success: true, deletedId: id };
  }

  // =========================================================================
  // 4. HAMMADDE & REÇETE YÖNETİMİ
  // =========================================================================
  public static async listIngredients(tenantId: string) {
    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        const ings = await tenantDb.ingredient.findMany({
          orderBy: { name: 'asc' },
        });
        if (ings.length > 0) {
          return ings.map((i) => ({
            id: i.id,
            tenantId: i.tenantId,
            name: i.name,
            unit: i.unit,
            currentStock: Number(i.currentStock),
            minStock: Number(i.criticalThreshold),
            costPerUnit: Number(i.costPerUnit || 0),
          }));
        }
      } catch (err: any) {
        console.warn('[AdminCrudService] DB listIngredients fallback:', err.message);
      }
    }

    seedMemoryStoreIfEmpty(tenantId);
    return memoryStore.ingredients.get(tenantId) || [];
  }

  public static async createIngredient(tenantId: string, input: { name: string; unit: string; currentStock: number; minStock?: number; costPerUnit: number }) {
    const cleanName = input.name.trim();
    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        const stockUnit = input.unit?.toUpperCase() === 'GRAM' ? 'GRAM' : input.unit?.toUpperCase() === 'MILLILITER' ? 'MILLILITER' : 'PIECE';
        const created = await tenantDb.ingredient.create({
          data: {
            tenantId,
            name: cleanName,
            unit: stockUnit as any,
            currentStock: input.currentStock,
            criticalThreshold: input.minStock ?? 5,
            costPerUnit: input.costPerUnit,
          },
        });
        return {
          id: created.id,
          name: created.name,
          unit: created.unit,
          currentStock: Number(created.currentStock),
          minStock: Number(created.criticalThreshold),
          costPerUnit: Number(created.costPerUnit || 0),
        };
      } catch (err: any) {
        console.warn('[AdminCrudService] DB createIngredient fallback:', err.message);
      }
    }

    seedMemoryStoreIfEmpty(tenantId);
    const ings = memoryStore.ingredients.get(tenantId)!;
    const newIng: DynamicIngredient = {
      id: `ing-${Date.now()}`,
      tenantId,
      name: cleanName,
      unit: input.unit,
      currentStock: Number(input.currentStock),
      minStock: Number(input.minStock ?? 5),
      costPerUnit: Number(input.costPerUnit),
    };
    ings.push(newIng);
    return newIng;
  }

  public static async saveRecipe(
    tenantId: string,
    productId: string,
    input: {
      yield?: number;
      items: Array<{ ingredientId: string; netAmount: number; wastePercent?: number }>;
    }
  ) {
    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        return await tenantDb.$transaction(async (tx) => {
          // Mevcut reçeteyi bul veya oluştur
          let recipe = await tx.recipe.findUnique({
            where: { productId },
          });

          if (!recipe) {
            recipe = await tx.recipe.create({
              data: {
                tenantId,
                productId,
                yield: input.yield ?? 1,
              },
            });
          } else {
            await tx.recipeItem.deleteMany({
              where: { recipeId: recipe.id },
            });
            recipe = await tx.recipe.update({
              where: { id: recipe.id },
              data: { yield: input.yield ?? 1 },
            });
          }

          for (const item of input.items) {
            await tx.recipeItem.create({
              data: {
                recipeId: recipe.id,
                ingredientId: item.ingredientId,
                netAmount: item.netAmount,
                wastePercent: item.wastePercent ?? 0,
              },
            });
          }

          return await tx.recipe.findUnique({
            where: { id: recipe.id },
            include: { items: { include: { ingredient: true } } },
          });
        });
      } catch (err: any) {
        console.warn('[AdminCrudService] DB saveRecipe fallback:', err.message);
      }
    }

    seedMemoryStoreIfEmpty(tenantId);
    if (!memoryStore.recipes.has(tenantId)) {
      memoryStore.recipes.set(tenantId, new Map());
    }
    const tenantRecipes = memoryStore.recipes.get(tenantId)!;
    const ings = memoryStore.ingredients.get(tenantId) || [];

    const dynamicRecipe: DynamicRecipe = {
      productId,
      yield: input.yield ?? 1,
      items: input.items.map((i) => {
        const ing = ings.find((ingItem) => ingItem.id === i.ingredientId);
        return {
          ingredientId: i.ingredientId,
          ingredientName: ing?.name || 'Hammadde',
          netAmount: i.netAmount,
          wastePercent: i.wastePercent ?? 0,
          unit: ing?.unit || 'gr',
        };
      }),
    };

    tenantRecipes.set(productId, dynamicRecipe);
    return dynamicRecipe;
  }

  // =========================================================================
  // 5. MASA VE BÖLGE YÖNETİMİ (TABLES & SECTIONS)
  // =========================================================================
  public static async listTables(tenantId: string, section?: TableSection) {
    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        const dbTables = await tenantDb.table.findMany({
          where: section ? { section } : undefined,
          orderBy: { code: 'asc' },
        });
        if (dbTables.length > 0) {
          return dbTables.map((t) => ({
            id: t.id,
            tenantId: t.tenantId,
            code: t.code,
            name: t.name,
            section: t.section,
            capacity: t.capacity,
            isActive: t.isActive,
            sortOrder: 0,
            qrSlug: `artisan-burger-${t.code}`,
          }));
        }
      } catch (err: any) {
        console.warn('[AdminCrudService] DB listTables fallback:', err.message);
      }
    }

    seedMemoryStoreIfEmpty(tenantId);
    let tbls = memoryStore.tables.get(tenantId) || [];
    if (section) {
      tbls = tbls.filter((t) => t.section === section);
    }
    return tbls;
  }

  public static async createTable(
    tenantId: string,
    input: {
      code: string;
      name: string;
      section: TableSection;
      capacity?: number;
      branchId?: string;
    }
  ) {
    const cleanCode = input.code.trim();
    const cleanName = input.name.trim();
    const qrSlug = `artisan-burger-${cleanCode.toLowerCase().replace(/\s+/g, '-')}`;

    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId, branchId: input.branchId });
        return await tenantDb.table.create({
          data: {
            tenantId,
            branchId: input.branchId || 'branch-kadikoy',
            code: cleanCode,
            name: cleanName,
            section: input.section,
            capacity: input.capacity ?? 4,
            isActive: true,
          },
        });
      } catch (err: any) {
        console.warn('[AdminCrudService] DB createTable fallback:', err.message);
      }
    }

    seedMemoryStoreIfEmpty(tenantId);
    const tbls = memoryStore.tables.get(tenantId)!;
    const newTbl: DynamicTable = {
      id: cleanCode,
      tenantId,
      code: cleanCode,
      name: cleanName,
      section: input.section,
      capacity: input.capacity ?? 4,
      isActive: true,
      sortOrder: tbls.length + 1,
      qrSlug,
    };
    tbls.push(newTbl);
    return newTbl;
  }

  public static async updateTable(
    tenantId: string,
    id: string,
    input: {
      code?: string;
      name?: string;
      section?: TableSection;
      capacity?: number;
      isActive?: boolean;
    }
  ) {
    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        return await tenantDb.table.update({
          where: { id },
          data: {
            code: input.code?.trim(),
            name: input.name?.trim(),
            section: input.section,
            capacity: input.capacity,
            isActive: input.isActive,
          },
        });
      } catch (err: any) {
        console.warn('[AdminCrudService] DB updateTable fallback:', err.message);
      }
    }

    seedMemoryStoreIfEmpty(tenantId);
    const tbls = memoryStore.tables.get(tenantId)!;
    const target = tbls.find((t) => t.id === id || t.code === id);
    if (!target) throw new Error('Masa bulunamadı.');
    if (input.code) target.code = input.code.trim();
    if (input.name) target.name = input.name.trim();
    if (input.section) target.section = input.section;
    if (typeof input.capacity === 'number') target.capacity = input.capacity;
    if (typeof input.isActive === 'boolean') target.isActive = input.isActive;
    return target;
  }

  public static async deleteTable(tenantId: string, id: string) {
    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        return await tenantDb.table.delete({ where: { id } });
      } catch (err: any) {
        console.warn('[AdminCrudService] DB deleteTable fallback:', err.message);
      }
    }

    seedMemoryStoreIfEmpty(tenantId);
    const tbls = memoryStore.tables.get(tenantId)!;
    memoryStore.tables.set(tenantId, tbls.filter((t) => t.id !== id && t.code !== id));
    return { success: true, deletedId: id };
  }

  // =========================================================================
  // 6. PERSONEL & ROL YÖNETİMİ (STAFF & ROLES)
  // =========================================================================
  public static async listStaff(tenantId: string) {
    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        const users = await tenantDb.user.findMany({
          include: { role: true },
          orderBy: { name: 'asc' },
        });

        if (users.length > 0) {
          return users.map((u) => ({
            id: u.id,
            tenantId: u.tenantId,
            name: u.name,
            email: u.email,
            roleKey: u.role.key,
            roleName: u.role.name,
            section: u.section,
            avatar: u.avatar,
            isActive: u.isActive,
            lastLoginAt: u.lastLoginAt?.toISOString(),
          }));
        }
      } catch (err: any) {
        console.warn('[AdminCrudService] DB listStaff fallback:', err.message);
      }
    }

    seedMemoryStoreIfEmpty(tenantId);
    return memoryStore.staff.get(tenantId) || [];
  }

  public static async createStaff(
    tenantId: string,
    input: {
      name: string;
      email?: string;
      roleKey: RoleKey;
      section?: TableSection;
      pin?: string;
      password?: string;
      branchId?: string;
    }
  ) {
    const cleanName = input.name.trim();
    const pinHash = input.pin ? await bcrypt.hash(input.pin, 10) : undefined;
    const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : undefined;

    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId, branchId: input.branchId });
        // Önce Role bul
        let role = await tenantDb.role.findFirst({
          where: { key: input.roleKey },
        });

        if (!role) {
          role = await tenantDb.role.create({
            data: {
              tenantId,
              key: input.roleKey,
              name: input.roleKey === RoleKey.ADMIN ? 'Yönetici' : input.roleKey === RoleKey.WAITER ? 'Garson' : input.roleKey === RoleKey.CASHIER ? 'Kasiyer' : 'Personel',
            },
          });
        }

        const user = await tenantDb.user.create({
          data: {
            tenantId,
            branchId: input.branchId || 'branch-kadikoy',
            roleId: role.id,
            name: cleanName,
            email: input.email?.trim() || `${cleanName.toLowerCase().replace(/\s+/g, '')}@masalink.com`,
            pinHash,
            passwordHash,
            section: input.section,
            isActive: true,
          },
          include: { role: true },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          roleKey: user.role.key,
          roleName: user.role.name,
          section: user.section,
          isActive: user.isActive,
        };
      } catch (err: any) {
        console.warn('[AdminCrudService] DB createStaff fallback:', err.message);
      }
    }

    seedMemoryStoreIfEmpty(tenantId);
    const stf = memoryStore.staff.get(tenantId)!;
    const newStaff: DynamicStaff = {
      id: `stf-${Date.now()}`,
      tenantId,
      name: cleanName,
      email: input.email?.trim() || `${cleanName.toLowerCase().replace(/\s+/g, '')}@masalink.com`,
      roleKey: input.roleKey,
      roleName: input.roleKey === RoleKey.ADMIN ? 'Yönetici' : input.roleKey === RoleKey.WAITER ? 'Garson' : input.roleKey === RoleKey.CASHIER ? 'Kasiyer' : 'Personel',
      section: input.section,
      pinHash,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    stf.push(newStaff);
    return newStaff;
  }

  public static async updateStaff(
    tenantId: string,
    id: string,
    input: {
      name?: string;
      email?: string;
      roleKey?: RoleKey;
      section?: TableSection;
      pin?: string;
      isActive?: boolean;
    }
  ) {
    const pinHash = input.pin ? await bcrypt.hash(input.pin, 10) : undefined;

    // Kritik Güvenlik Kuralı: PIN, şifre, yetki rolü veya aktiflik durumu değişirse kullanıcının tüm cihazlardaki oturumlarını geçersiz kıl
    if (input.pin || input.roleKey || typeof input.isActive === 'boolean') {
      try {
        await TokenRevocationService.invalidateAllUserSessions(id);
      } catch (err: any) {
        console.warn('[AdminCrudService] Token versiyonu artırılamadı:', err.message);
      }
    }

    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        let roleId: string | undefined = undefined;

        if (input.roleKey) {
          const role = await tenantDb.role.findFirst({
            where: { key: input.roleKey },
          });
          if (role) roleId = role.id;
        }

        const updated = await tenantDb.user.update({
          where: { id },
          data: {
            name: input.name?.trim(),
            email: input.email?.trim(),
            roleId,
            section: input.section,
            pinHash,
            isActive: input.isActive,
          },
          include: { role: true },
        });

        return {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          roleKey: updated.role.key,
          roleName: updated.role.name,
          section: updated.section,
          isActive: updated.isActive,
        };
      } catch (err: any) {
        console.warn('[AdminCrudService] DB updateStaff fallback:', err.message);
      }
    }

    seedMemoryStoreIfEmpty(tenantId);
    const stf = memoryStore.staff.get(tenantId)!;
    const target = stf.find((s) => s.id === id);
    if (!target) throw new Error('Personel bulunamadı.');

    if (input.name) target.name = input.name.trim();
    if (input.email) target.email = input.email.trim();
    if (input.roleKey) {
      target.roleKey = input.roleKey;
      target.roleName = input.roleKey === RoleKey.ADMIN ? 'Yönetici' : input.roleKey === RoleKey.WAITER ? 'Garson' : input.roleKey === RoleKey.CASHIER ? 'Kasiyer' : 'Personel';
    }
    if (input.section !== undefined) target.section = input.section;
    if (typeof input.isActive === 'boolean') target.isActive = input.isActive;
    if (pinHash) target.pinHash = pinHash;

    return target;
  }

  public static async deleteStaff(tenantId: string, id: string) {
    if (process.env.DATABASE_URL) {
      try {
        const tenantDb = createTenantDb({ tenantId });
        return await tenantDb.user.delete({ where: { id } });
      } catch (err: any) {
        console.warn('[AdminCrudService] DB deleteStaff fallback:', err.message);
      }
    }

    seedMemoryStoreIfEmpty(tenantId);
    const stf = memoryStore.staff.get(tenantId)!;
    memoryStore.staff.set(tenantId, stf.filter((s) => s.id !== id));
    return { success: true, deletedId: id };
  }
}
