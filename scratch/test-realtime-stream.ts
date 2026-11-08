import { realtimeHub } from '../src/server/realtime/realtimeHub';
import { OrderService } from '../src/server/services/orderService';
import { SyncMessage } from '../src/utils/syncService';

async function runRealtimeTest() {
  console.log('===============================================================');
  console.log('  MASALINK REAL-TIME (SSE & EVENT BUS) OTOMASYON TESTİ');
  console.log('===============================================================');

  const tenantA = 'tenant-artisan-burger';
  const tenantB = 'tenant-other-bistro';

  const tenantAReceived: SyncMessage[] = [];
  const tenantBReceived: SyncMessage[] = [];

  // 1. Tenant A için sahte SSE istemcisi kaydet
  const unregisterA = realtimeHub.registerClient(
    tenantA,
    (chunk: string) => {
      // Chunk format: "event: message\ndata: { ... }\n\n"
      const match = chunk.match(/data: (.+)\n\n/);
      if (match) {
        try {
          const msg = JSON.parse(match[1]);
          tenantAReceived.push(msg);
        } catch {}
      }
    },
    () => {}
  );

  // 2. Tenant B için sahte SSE istemcisi kaydet (İzolasyon testi)
  const unregisterB = realtimeHub.registerClient(
    tenantB,
    (chunk: string) => {
      const match = chunk.match(/data: (.+)\n\n/);
      if (match) {
        try {
          const msg = JSON.parse(match[1]);
          tenantBReceived.push(msg);
        } catch {}
      }
    },
    () => {}
  );

  console.log('✓ 1. Restoran A ve Restoran B SSE dinleyicileri başarıyla kaydedildi.');
  console.log(`   Restoran A Aktif Dinleyici: ${realtimeHub.getConnectedCount(tenantA)}`);
  console.log(`   Restoran B Aktif Dinleyici: ${realtimeHub.getConnectedCount(tenantB)}`);

  // 3. OrderService üzerinden Restoran A için sipariş gönder
  console.log('\n2. Restoran A (Artisan Burger) için Masa 4 üzerinden QR siparişi iletiliyor...');
  const t0 = performance.now();
  
  const orderResult = await OrderService.submitOrder({
    tenantId: tenantA,
    tableId: 'tbl-4',
    source: 'QR',
    items: [
      {
        productId: 'b1',
        name: 'Trüflü Smash Burger',
        quantity: 2,
        cookingLevel: 'Orta Pişmiş',
        customNote: 'Soğansız lütfen',
      },
      {
        productId: 'i1',
        name: 'Ev Yapımı Çilekli Limonata',
        quantity: 2,
      },
    ],
  });

  const latency = (performance.now() - t0).toFixed(2);
  console.log(`✓ Sipariş işlendi (#${orderResult.orderNumber}) ve RealtimeHub'a aktarıldı (Süre: ${latency}ms).`);

  // 4. Doğrulamalar
  if (tenantAReceived.length !== 1) {
    throw new Error(`Restoran A olay alamadı! Alınan: ${tenantAReceived.length}`);
  }

  const receivedEvent = tenantAReceived[0];
  console.log('\n✓ 3. Restoran A Kasa & Garson SSE Akışına Olay Düştü:');
  console.log(`   - Olay Tipi: ${receivedEvent.type}`);
  console.log(`   - Kaynak Cihaz: ${receivedEvent.deviceName} (${receivedEvent.sourceDevice})`);
  console.log(`   - Masa: ${receivedEvent.payload.tableCode}`);
  console.log(`   - Toplam Tutar: ${receivedEvent.payload.total} TL`);
  console.log(`   - Ürünler: ${receivedEvent.payload.items.map((i: any) => `${i.quantity}x ${i.productName}`).join(', ')}`);

  // 5. Çoklu Kiracı İzolasyon Testi (Tenant B Restoran A'nın siparişini gördü mü?)
  if (tenantBReceived.length !== 0) {
    throw new Error(`GÜVENLİK İHLALİ! Restoran B, Restoran A'nın sipariş olayını aldı!`);
  }
  console.log('\n✓ 4. ÇOKLU KİRACI İZOLASYON DOĞRULAMASI:');
  console.log(`   Restoran B'ye sızan olay sayısı: ${tenantBReceived.length} (TAM KORUMA SAĞLANDI ✓)`);

  // 6. Replay Buffer Testi (Yeni bağlanan bir garson son siparişi yakalayabiliyor mu?)
  console.log('\n5. Replay Buffer Testi: Yeni bağlanan garson telefonu denetleniyor...');
  let replayedEvent: SyncMessage | null = null;
  const unregisterLate = realtimeHub.registerClient(
    tenantA,
    (chunk: string) => {
      const match = chunk.match(/data: (.+)\n\n/);
      if (match) {
        try {
          replayedEvent = JSON.parse(match[1]);
        } catch {}
      }
    },
    () => {}
  );

  // Kısa bir bekleme (replay setTimeout ile fırlatılır)
  await new Promise((r) => setTimeout(r, 100));

  if (!replayedEvent || (replayedEvent as any).payload.orderId !== orderResult.orderId) {
    throw new Error('Replay tamponu son olayı yeni istemciye teslim edemedi!');
  }
  console.log(`✓ Replay tamponu çalışıyor! Yeni bağlanan cihaza son olay (#${(replayedEvent as any).payload.orderNumber}) anında replay edildi.`);

  // Temizlik
  unregisterA();
  unregisterB();
  unregisterLate();

  console.log('\n===============================================================');
  console.log('  TÜM GERÇEK ZAMANLI (REAL-TIME SSE) TESTLERİ BAŞARIYLA GEÇTİ! ✓');
  console.log('===============================================================');
}

runRealtimeTest().catch((err) => {
  console.error('\n❌ Test Başarısız Oldu:', err);
  process.exit(1);
});
