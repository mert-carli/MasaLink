import { OrderService } from '../../src/server/services/orderService';

async function testOrderService() {
  console.log('================================================================');
  console.log('   MASALINK - MERKEZİ SİPARİŞ MOTORU (ORDERSERVICE) TESTİ       ');
  console.log('================================================================\n');

  // TEST 1: QR Kaynaklı Sipariş (Yetkili fiyat hesaplama & Ekstra malzeme)
  console.log('[TEST 1] QR sipariş simülasyonu çalıştırılıyor...');
  const qrOrder = await OrderService.submitOrder({
    tenantId: 'tenant-artisan-burger',
    tableId: 'tbl-4',
    source: 'QR',
    items: [
      {
        productCode: 'b1', // Trüflü Smash Burger (295 TL)
        quantity: 2,
        cookingLevel: 'Orta Pişmiş',
        extras: [
          { name: 'Ekstra Eritilmiş Cheddar' }, // +35 TL
        ],
        guestTag: 'Can (Misafir 1)',
      },
    ],
  });

  // Beklenen: (295 + 35) * 2 = 660 TL
  if (qrOrder.total !== 660) {
    throw new Error(`Fiyat hesaplama hatası! Beklenen: 660, Alınan: ${qrOrder.total}`);
  }
  console.log('✅ BAŞARILI: QR siparişi başarıyla hesaplandı.');
  console.log(`   Sipariş ID: ${qrOrder.orderId}, Toplam: ₺${qrOrder.total}, Versiyon: v${qrOrder.tableVersion}`);

  // TEST 2: Garson Kaynaklı Sipariş (Mobil Terminal)
  console.log('\n[TEST 2] Garson terminali sipariş simülasyonu...');
  const waiterOrder = await OrderService.submitOrder({
    tenantId: 'tenant-artisan-burger',
    tableId: 'tbl-4',
    source: 'WAITER',
    createdById: 'w-1',
    items: [
      {
        productCode: 'y1', // Baharatlı Patates (110 TL)
        quantity: 1,
        customNote: 'Az tuzlu olsun',
      },
      {
        productCode: 'i1', // Çilekli Limonata (85 TL)
        quantity: 2,
      },
    ],
  });

  // Beklenen: 110 + (85 * 2) = 280 TL
  if (waiterOrder.total !== 280) {
    throw new Error(`Garson sipariş fiyat hatası! Beklenen: 280, Alınan: ${waiterOrder.total}`);
  }
  console.log('✅ BAŞARILI: Garson siparişi başarıyla işlendi.');
  console.log(`   Sipariş ID: ${waiterOrder.orderId}, Toplam: ₺${waiterOrder.total}, Versiyon: v${waiterOrder.tableVersion}`);

  // TEST 3: Kasa POS Terminalinden Hızlı Ürün Ekleme
  console.log('\n[TEST 3] Kasa POS terminali sipariş simülasyonu...');
  const posOrder = await OrderService.submitOrder({
    tenantId: 'tenant-artisan-burger',
    tableId: 'tbl-4',
    source: 'POS',
    createdById: 'c-1',
    items: [
      {
        productCode: 'i4', // Su 330ml (25 TL)
        quantity: 3,
      },
    ],
  });

  // Beklenen: 25 * 3 = 75 TL
  if (posOrder.total !== 75) {
    throw new Error(`POS sipariş fiyat hatası! Beklenen: 75, Alınan: ${posOrder.total}`);
  }
  console.log('✅ BAŞARILI: POS siparişi başarıyla işlendi.');
  console.log(`   Sipariş ID: ${posOrder.orderId}, Toplam: ₺${posOrder.total}, Versiyon: v${posOrder.tableVersion}`);

  console.log('\n================================================================');
  console.log('   TÜM MERKEZİ SİPARİŞ TESTLERİ BAŞARIYLA GEÇTİ! 🚀             ');
  console.log('================================================================');
}

testOrderService().catch((e) => {
  console.error('Test hatası:', e);
  process.exit(1);
});
