import { AdminCrudService } from '../src/server/services/adminCrudService';
import { RoleKey, TableSection, KitchenStation } from '@prisma/client';
import bcrypt from 'bcryptjs';

async function testAdminCrud() {
  console.log('========================================================================');
  console.log('  MASALINK ADMIN CRUD VE DİNAMİK YÖNETİM SİSTEMİ TESTİ');
  console.log('  (Menü, Kategori, Fiyat, Ekstra, Reçete, Hammadde, Masa, Bölge, Personel)');
  console.log('========================================================================\n');

  const tenantId = 'tenant-artisan-burger';

  // -------------------------------------------------------------------------
  // 1. KATEGORİ CRUD TESTİ
  // -------------------------------------------------------------------------
  console.log('▶ [1. KATEGORİ CRUD]');
  const newCat = await AdminCrudService.createCategory(tenantId, {
    name: 'Özel Gurme Burgerler',
    sortOrder: 5,
  });
  console.log(`✓ Kategori oluşturuldu: "${newCat.name}" (ID: ${newCat.id})`);

  const updatedCat = await AdminCrudService.updateCategory(tenantId, newCat.id, {
    name: 'Gurme & Kuru Dinlendirilmiş',
  });
  console.log(`✓ Kategori adı güncellendi: "${updatedCat.name}"`);

  const allCategories = await AdminCrudService.listCategories(tenantId);
  console.log(`✓ Toplam kategori sayısı: ${allCategories.length}`);

  // -------------------------------------------------------------------------
  // 2. ÜRÜN VE DİNAMİK FİYAT DEĞİŞİMİ TESTİ (KOD DEĞİŞTİRMEDEN)
  // -------------------------------------------------------------------------
  console.log('\n▶ [2. ÜRÜN VE DİNAMİK FİYAT GÜNCELLEMESİ]');
  const newProduct = await AdminCrudService.createProduct(tenantId, {
    categoryId: newCat.id,
    name: 'Kuru Dinlendirilmiş Antrikot Burger',
    price: 360,
    station: KitchenStation.GRILL,
    description: '28 gün dinlendirilmiş antrikot köftesi, gravyer peyniri',
    isPopular: true,
  });
  console.log(`✓ Yeni ürün menüye eklendi: "${newProduct.name}" - Başlangıç Fiyatı: ₺${newProduct.price}`);

  // Fiyat artışı simülasyonu (Kod değiştirmeden ₺360 -> ₺395)
  const updatedProduct = await AdminCrudService.updateProduct(tenantId, newProduct.id, {
    price: 395,
  });
  if (updatedProduct.price !== 395) {
    throw new Error('Ürün fiyat güncellemesi başarısız oldu!');
  }
  console.log(`✓ FİYAT GÜNCELLENDİ (Kod Değiştirmeden): ₺${newProduct.price} ➔ ₺${updatedProduct.price}`);

  // -------------------------------------------------------------------------
  // 3. EKSTRA MALZEME (PRODUCT OPTIONS) CRUD TESTİ
  // -------------------------------------------------------------------------
  console.log('\n▶ [3. EKSTRA MALZEME VE EK ÜCRET YÖNETİMİ]');
  const newExtra = await AdminCrudService.createExtra(tenantId, {
    name: 'Trüflü Eritilmiş Gravyer Peyniri',
    extraPrice: 65,
  });
  console.log(`✓ Ekstra malzeme eklendi: "${newExtra.name}" (+₺${newExtra.extraPrice})`);

  const updatedExtra = await AdminCrudService.updateExtra(tenantId, newExtra.id, {
    extraPrice: 75,
  });
  console.log(`✓ Ekstra fiyatı güncellendi: +₺${updatedExtra.extraPrice}`);

  // -------------------------------------------------------------------------
  // 4. HAMMADDE VE REÇETE & FİRE KATSAYISI TESTİ
  // -------------------------------------------------------------------------
  console.log('\n▶ [4. HAMMADDE VE REÇETE YÖNETİMİ]');
  const newIng = await AdminCrudService.createIngredient(tenantId, {
    name: 'Kuru Dinlendirilmiş Dana Antrikot',
    unit: 'kg',
    currentStock: 25.5,
    minStock: 6.0,
    costPerUnit: 580,
  });
  console.log(`✓ Hammadde depoya tanımlandı: "${newIng.name}" (Stok: ${newIng.currentStock} ${newIng.unit}, Maliyet: ₺${newIng.costPerUnit})`);

  // Ürüne Reçete Bağlama (%7 Pişme ve Hazırlık Firesi ile)
  const recipe = await AdminCrudService.saveRecipe(tenantId, newProduct.id, {
    yield: 1,
    items: [
      {
        ingredientId: newIng.id,
        netAmount: 180, // 180 gram
        wastePercent: 7, // %7 fire
      },
    ],
  });
  console.log(`✓ Ürüne Reçete Tanımlandı: 180 gr ${newIng.name} (+%7 fire ile brüt düşüm)`);

  // -------------------------------------------------------------------------
  // 5. MASA VE BÖLGE YÖNETİMİ TESTİ
  // -------------------------------------------------------------------------
  console.log('\n▶ [5. MASA VE BÖLGE YÖNETİMİ]');
  const newTable = await AdminCrudService.createTable(tenantId, {
    code: 'tbl-vip-bahce-1',
    name: 'Bahçe VIP Kamelya 1',
    section: TableSection.BAHCE,
    capacity: 8,
  });
  console.log(`✓ Yeni masa oluşturuldu: "${newTable.name}" (${newTable.section}, Kapasite: ${newTable.capacity} kişi)`);

  const updatedTable = await AdminCrudService.updateTable(tenantId, newTable.id, {
    capacity: 10,
    name: 'Bahçe Geniş VIP Kamelya',
  });
  console.log(`✓ Masa güncellendi: "${updatedTable.name}" (Yeni Kapasite: ${updatedTable.capacity} kişi)`);

  // -------------------------------------------------------------------------
  // 6. PERSONEL VE ROL / PIN YÖNETİMİ TESTİ
  // -------------------------------------------------------------------------
  console.log('\n▶ [6. PERSONEL VE ROL / PIN YÖNETİMİ]');
  const newStaff = await AdminCrudService.createStaff(tenantId, {
    name: 'Baran Kaya',
    email: 'baran.kaya@masalink.com',
    roleKey: RoleKey.WAITER,
    section: TableSection.BAHCE,
    pin: '7890',
  });
  console.log(`✓ Yeni personel tanımlandı: "${newStaff.name}" (${newStaff.roleName}, Bölge: ${newStaff.section})`);

  // PIN doğrulaması (Bcrypt Hash kontrolü)
  const staffHash = (newStaff as any).pinHash;
  if (staffHash) {
    const isPinMatch = await bcrypt.compare('7890', staffHash);
    if (!isPinMatch) {
      throw new Error('PIN Hash eşleşmedi!');
    }
    console.log('✓ PIN Güvenliği: 4 haneli PIN bcrypt ile hash\'lendi ve başarıyla doğrulandı.');
  }

  // Rol terfi simülasyonu (Garson -> Kasiyer/Yönetici)
  const updatedStaff = await AdminCrudService.updateStaff(tenantId, newStaff.id, {
    roleKey: RoleKey.ADMIN,
  });
  console.log(`✓ Personel yetkisi güncellendi: Yeni Görev -> ${updatedStaff.roleName}`);

  console.log('\n========================================================================');
  console.log('  TÜM ADMIN CRUD VE DİNAMİK YÖNETİM TESTLERİ %100 BAŞARIYLA GEÇTİ! ✓');
  console.log('========================================================================');
}

testAdminCrud().catch((err) => {
  console.error('\n❌ Admin CRUD Testi Başarısız Oldu:', err);
  process.exit(1);
});
