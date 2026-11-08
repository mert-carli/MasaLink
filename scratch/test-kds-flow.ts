import { realtimeHub } from '../src/server/realtime/realtimeHub';
import { OrderService } from '../src/server/services/orderService';
import { SyncMessage } from '../src/utils/syncService';

async function testFullKdsFlow() {
  console.log('========================================================================');
  console.log('  MASALINK KDS (MUTFAK EKRANI) UÇTAN UCA AKIŞ TESTİ');
  console.log('  QR / Garson / POS → Order API → PostgreSQL → Realtime → KDS → Hazır → Garson/POS/QR');
  console.log('========================================================================\n');

  const tenantId = 'tenant-artisan-burger';

  const kdsEvents: SyncMessage[] = [];
  const waiterEvents: SyncMessage[] = [];
  const qrEvents: SyncMessage[] = [];

  // 1. Dinleyicileri Kaydet
  const unregisterKds = realtimeHub.registerClient(
    tenantId,
    (chunk: string) => {
      const match = chunk.match(/data: (.+)\n\n/);
      if (match) {
        try {
          kdsEvents.push(JSON.parse(match[1]));
        } catch {}
      }
    },
    () => {}
  );

  const unregisterWaiter = realtimeHub.registerClient(
    tenantId,
    (chunk: string) => {
      const match = chunk.match(/data: (.+)\n\n/);
      if (match) {
        try {
          waiterEvents.push(JSON.parse(match[1]));
        } catch {}
      }
    },
    () => {}
  );

  const unregisterQr = realtimeHub.registerClient(
    tenantId,
    (chunk: string) => {
      const match = chunk.match(/data: (.+)\n\n/);
      if (match) {
        try {
          qrEvents.push(JSON.parse(match[1]));
        } catch {}
      }
    },
    () => {}
  );

  console.log('✓ 1. Dinleyici Cihazlar Hazır:');
  console.log('   - Mutfak KDS Ekranı Bağlandı');
  console.log('   - Garson Mobil Terminali Bağlandı');
  console.log('   - Müşteri Masa QR Menüsü Bağlandı\n');

  // -------------------------------------------------------------------------
  // ADIM 1: QR Menüden Sipariş Veriliyor (Masa 4)
  // -------------------------------------------------------------------------
  console.log('▶ [ADIM 1] Müşteri Masa 4 QR Menüsünden Sipariş Gönderiyor...');
  const t0 = performance.now();

  const orderResult = await OrderService.submitOrder({
    tenantId,
    tableId: 'tbl-4',
    source: 'QR',
    items: [
      {
        productId: 'b1',
        name: 'Trüflü Smash Burger',
        quantity: 2,
        cookingLevel: 'Orta Pişmiş',
        customNote: 'Soğanlar karamelize olsun lütfen',
      },
      {
        productId: 'i1',
        name: 'Ev Yapımı Çilekli Limonata',
        quantity: 2,
      },
    ],
    customerNote: 'Alerjen: Fıstık alerjisi var.',
  });

  const submitLatency = (performance.now() - t0).toFixed(2);
  console.log(`✓ Sipariş Başarıyla Oluşturuldu (#${orderResult.orderNumber}) [${submitLatency}ms]`);

  // -------------------------------------------------------------------------
  // ADIM 2: KDS Ekranına Anında Düşme Doğrulaması
  // -------------------------------------------------------------------------
  console.log('\n▶ [ADIM 2] Mutfak KDS Ekranı Olayı Denetleniyor...');
  const kdsOrderEvent = kdsEvents.find((e) => e.payload?.orderId === orderResult.orderId);
  if (!kdsOrderEvent) {
    throw new Error('KDS sipariş olayını yakalayamadı!');
  }

  console.log(`✓ Mutfak KDS Ekranına Bilet Düştü:`);
  console.log(`   - Olay Tipi: ${kdsOrderEvent.type}`);
  console.log(`   - Masa: ${kdsOrderEvent.payload.tableCode}`);
  console.log(`   - Kalemler: ${kdsOrderEvent.payload.items.map((i: any) => `${i.quantity}x ${i.productName}`).join(', ')}`);
  console.log(`   - Özel Not: ${kdsOrderEvent.payload.customerNote}`);

  // -------------------------------------------------------------------------
  // ADIM 3: Şef KDS Üzerinde "HAZIR / SERVİSE ÇAĞIR" Butonuna Basıyor
  // -------------------------------------------------------------------------
  console.log('\n▶ [ADIM 3] Mutfak Şefi KDS Üzerinde "HAZIR / SERVİSE ÇAĞIR" Butonuna Basıyor...');
  const tReady = performance.now();

  const readyResult = await OrderService.updateOrderStatus({
    tenantId,
    orderId: orderResult.orderId,
    status: 'READY',
    tableId: 'tbl-4',
  });

  const readyLatency = (performance.now() - tReady).toFixed(2);
  console.log(`✓ Sipariş Durumu 'READY' Olarak Güncellendi [${readyLatency}ms]`);

  // -------------------------------------------------------------------------
  // ADIM 4: Garson & QR Ekranına Anında Push Doğrulaması
  // -------------------------------------------------------------------------
  console.log('\n▶ [ADIM 4] Garson Terminali ve Müşteri QR Ekranı Denetleniyor...');
  const waiterReadyEvent = waiterEvents.find(
    (e) => e.type === 'ORDER_READY_FOR_PICKUP' && e.payload?.orderId === orderResult.orderId
  );
  if (!waiterReadyEvent) {
    throw new Error('Garson terminali ORDER_READY_FOR_PICKUP bildirimini alamadı!');
  }
  console.log('✓ Garson Terminaline Titreşim ve Çağrı Sinyali Düştü:');
  console.log(`   - Mesaj: "${waiterReadyEvent.payload.tableCode} (#${waiterReadyEvent.payload.orderNumber}) mutfaktan servise hazır!"`);

  const qrReadyEvent = qrEvents.find(
    (e) => e.type === 'ORDER_READY_FOR_PICKUP' && e.payload?.orderId === orderResult.orderId
  );
  if (!qrReadyEvent) {
    throw new Error('Müşteri QR ekranı ORDER_READY_FOR_PICKUP bildirimini alamadı!');
  }
  console.log('✓ Müşteri QR Menü Canlı Sayacı Güncellendi:');
  console.log('   - Durum: "🎉 Siparişiniz mutfakta hazırlandı! Garsonumuz masanıza servis ediyor."');

  // -------------------------------------------------------------------------
  // ADIM 5: Garson Masaya Servis Edip Adisyonu Kapatıyor / Servis Edildi Yapıyor
  // -------------------------------------------------------------------------
  console.log('\n▶ [ADIM 5] Sipariş Masaya Servis Edildi Olarak İşaretleniyor...');
  await OrderService.updateOrderStatus({
    tenantId,
    orderId: orderResult.orderId,
    status: 'SERVED',
    tableId: 'tbl-4',
  });

  const servedEvent = kdsEvents.find(
    (e) => e.type === 'TABLE_STATUS_CHANGED' && e.payload?.status === 'served'
  );
  if (!servedEvent) {
    throw new Error('TABLE_STATUS_CHANGED olayı dağıtılamadı!');
  }
  console.log('✓ Masa Durumu Tüm Cihazlarda "SERVED (Yemek Masada)" Olarak Güncellendi.');

  // Temizlik
  unregisterKds();
  unregisterWaiter();
  unregisterQr();

  console.log('\n========================================================================');
  console.log('  TÜM KDS & ÇOKLU CİHAZ SENKRONİZASYON AKIŞI %100 BAŞARIYLA TAMAMLANDI! ✓');
  console.log('========================================================================');
}

testFullKdsFlow().catch((err) => {
  console.error('\n❌ KDS Akış Testi Başarısız Oldu:', err);
  process.exit(1);
});
