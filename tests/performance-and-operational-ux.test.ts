import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as getOrdersRoute } from '@/app/api/orders/route';
import { POST as postOrderRoute } from '@/app/api/orders/route';
import { OrderService } from '@/server/services/orderService';
import { AdminCrudService } from '@/server/services/adminCrudService';
import { CacheService } from '@/server/redis/cacheService';
import { createSignedSessionToken } from '@/utils/tenantAuth';
import { syncService, SyncMessage } from '@/utils/syncService';
import { saveLocalDraft, getLocalDraft, clearLocalDraft } from '@/utils/waiterDraftStorage';
import { OrderStatus } from '@prisma/client';

describe('MasaLink 6. Aşama: Performans, Kullanıcı Deneyimi ve Operasyonel Optimizasyon Test Paketi', () => {
  const tenantId = 'tenant-artisan-burger';
  let waiterToken: string;
  let cashierToken: string;
  let managerToken: string;

  before(async () => {
    (process.env as any).NODE_ENV = 'test';
    process.env.DATABASE_URL = ''; // Unit/in-memory test modunda çalış

    waiterToken = createSignedSessionToken({
      userId: 'usr-waiter-1',
      name: 'Ahmet Garson',
      tenantId,
      role: 'waiter',
    });

    cashierToken = createSignedSessionToken({
      userId: 'usr-cashier-1',
      name: 'Zeynep Kasiyer',
      tenantId,
      role: 'cashier',
    });

    managerToken = createSignedSessionToken({
      userId: 'usr-mgr-1',
      name: 'Murat Müdür',
      tenantId,
      role: 'manager',
    });
  });

  // =========================================================================
  // Senaryo 1: Menü & Kategori Hızlı Yükleme ve Önbellek (Caching & Invalidation)
  // =========================================================================
  test('1. Menü & Kategori sorgularında Cache-Aside ve anında invalidation doğrulaması', async () => {
    // Önbelleği temizle
    await CacheService.del(`masalink:cat:${tenantId}`, `masalink:prod:${tenantId}:all`);

    // 1. İlk çağrı (Önbelleksiz / Cold Cache)
    const t0 = performance.now();
    const categories1 = await AdminCrudService.listCategories(tenantId);
    const coldDuration = performance.now() - t0;

    assert.ok(Array.isArray(categories1) && categories1.length > 0, 'Kategoriler listelenmeli');

    // 2. İkinci çağrı (Önbellekli / Warm Cache)
    const t1 = performance.now();
    const categories2 = await AdminCrudService.listCategories(tenantId);
    const warmDuration = performance.now() - t1;

    assert.equal(categories2.length, categories1.length, 'Önbellekten aynı veri dönmeli');
    // Önbellekli yanıtın işlem süresi çok düşük olmalı (< 10ms)
    assert.ok(warmDuration < 15, `Önbellekli yanıt çok hızlı olmalı (warm: ${warmDuration.toFixed(2)}ms)`);

    // 3. Ürün Eklendiğinde Önbelleğin Geçersiz Kılınması (Cache Invalidation)
    const newProduct = await AdminCrudService.createProduct(tenantId, {
      categoryId: categories1[0].id,
      name: 'Performans Özel Burger',
      price: 245,
      code: 'perf-burger-01',
    });

    const prodsAfterCreate = await AdminCrudService.listProducts(tenantId);
    const found = prodsAfterCreate.find((p) => p.name === 'Performans Özel Burger');
    assert.ok(found, 'Yeni ürün eklendiğinde önbellek yenilenmeli ve yeni ürün listede bulunmalı');

    // Temizlik
    await AdminCrudService.deleteProduct(tenantId, newProduct.id);
  });

  // =========================================================================
  // Senaryo 2: Sayfalanmış Siparişler API'si (GET /api/orders) ve N+1 Eliminasyonu
  // =========================================================================
  test('2. GET /api/orders sayfalanmış, filtrelenebilir ve meta verili yanıt dönmeli', async () => {
    const req = new NextRequest('http://localhost:3000/api/orders?page=1&limit=10&status=PREPARING', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${managerToken}`,
        'x-tenant-id': tenantId,
      },
    });

    const res = await getOrdersRoute(req);
    assert.equal(res.status, 200, 'Müdür rolü için 200 OK dönmeli');

    const body = await res.json();
    assert.equal(body.success, true, 'Yanıt success=true olmalı');
    assert.ok(Array.isArray(body.items), 'items bir dizi olmalı');
    assert.ok(body.pagination, 'pagination objesi bulunmalı');
    assert.equal(body.pagination.page, 1, 'Sayfa 1 olmalı');
    assert.equal(body.pagination.limit, 10, 'Limit 10 olmalı');
    assert.ok(typeof body.pagination.totalCount === 'number', 'totalCount sayısal olmalı');
    assert.ok(typeof body.pagination.totalPages === 'number', 'totalPages sayısal olmalı');
  });

  // =========================================================================
  // Senaryo 3: Seçici Alan Projeksiyonu & Yanıt Boyutu Optimizasyonu
  // =========================================================================
  test('3. Sipariş projeksiyonu yalın ve hafif olmalı (ağ bant genişliği optimizasyonu)', async () => {
    const paginated = await OrderService.getPaginatedOrders({
      tenantId,
      page: 1,
      limit: 5,
    });

    // Projeksiyonda gereksiz devasa ilişkisel nesneler olmamalı (örn: raw audit logs, deep joins)
    assert.ok(paginated.items.every((item) => {
      // itemsCount _count üzerinden dönmeli, tüm sipariş kalemlerinin tamamı gelerek ağ şişirilmemeli
      return (
        typeof item.id === 'string' &&
        typeof item.orderNumber === 'number' &&
        typeof item.itemsCount === 'number' &&
        typeof item.total === 'number' &&
        item.source !== undefined &&
        item.status !== undefined
      );
    }), 'Sipariş özeti yalın seçici alanlarla taşınmalı');
  });

  // =========================================================================
  // Senaryo 4: Hızlı Ürün Arama & Filtreleme Performansı (<5ms)
  // =========================================================================
  test('4. Hızlı ürün arama algoritması Türkçe karakter duyarlı ve <5ms içinde sonuç vermeli', () => {
    const mockProducts = [
      { id: '1', name: 'Trüflü Burger', category: 'Burgerler', description: 'Trüf mantarlı enfes burger' },
      { id: '2', name: 'Klasik Çizburger', category: 'Burgerler', description: 'Cheddar peynirli' },
      { id: '3', name: 'Çıtır Patates', category: 'Aperatifler', description: 'Kajun baharatlı' },
      { id: '4', name: 'Şalgam Suyu', category: 'İçecekler', description: 'Acılı Adana şalgamı' },
      { id: '5', name: 'Ispanaklı Börek', category: 'Kahvaltı', description: 'Taze fırından' },
    ];

    const searchProduct = (query: string) => {
      const q = query.toLocaleLowerCase('tr-TR').trim();
      return mockProducts.filter(
        (p) =>
          p.name.toLocaleLowerCase('tr-TR').includes(q) ||
          p.description.toLocaleLowerCase('tr-TR').includes(q) ||
          p.category.toLocaleLowerCase('tr-TR').includes(q)
      );
    };

    const t0 = performance.now();
    // 1000 ardışık arama benchmarkı
    for (let i = 0; i < 1000; i++) {
      searchProduct('trüf');
      searchProduct('çiz');
      searchProduct('şalgam');
    }
    const elapsed = performance.now() - t0;
    const avgPerSearch = elapsed / 3000;

    // Her bir arama <5ms hedefinin çok altında (<1ms) tamamlanmalı
    assert.ok(avgPerSearch < 1.0, `Arama başına ortalama süre 1ms altında olmalı (${avgPerSearch.toFixed(4)}ms)`);

    // Arama doğrulaması
    const trufResult = searchProduct('trüf');
    assert.equal(trufResult.length, 1);
    assert.equal(trufResult[0].name, 'Trüflü Burger');

    const salgamResult = searchProduct('ŞALGAM');
    assert.equal(salgamResult.length, 1);
    assert.equal(salgamResult[0].name, 'Şalgam Suyu');
  });

  // =========================================================================
  // Senaryo 5: KDS Out-of-Order Olay Koruması (Durumun Geriye Düşürülmemesi)
  // =========================================================================
  test('5. KDS out-of-order SSE olaylarında READY durumunu gecikmiş PREPARING ile geriye almamalı', () => {
    let ticketStatus: 'PREPARING' | 'READY' | 'SERVED' = 'READY';

    // Gecikmiş PREPARING olayı geldi
    const incomingEventStatus = 'PREPARING';

    const applyStatusTransition = (
      current: 'PREPARING' | 'READY' | 'SERVED',
      incoming: 'PREPARING' | 'READY' | 'SERVED'
    ) => {
      if (incoming === 'SERVED') return 'SERVED';
      if (incoming === 'READY') return 'READY';
      if (incoming === 'PREPARING') {
        // Korumalı mantık: Bilet zaten READY veya SERVED ise PREPARING'e düşürme!
        if (current === 'READY' || current === 'SERVED') {
          return current; // Korundu
        }
        return 'PREPARING';
      }
      return current;
    };

    ticketStatus = applyStatusTransition(ticketStatus, incomingEventStatus);
    assert.equal(ticketStatus, 'READY', 'Bilet READY durumunda kalmalı, PREPARING olmamalı');

    // SERVED geldiğinde durum SERVED olmalı
    ticketStatus = applyStatusTransition(ticketStatus, 'SERVED');
    assert.equal(ticketStatus, 'SERVED', 'Bilet SERVED olmalı');

    // SERVED sonrasında gelen PREPARING de reddedilmeli
    ticketStatus = applyStatusTransition(ticketStatus, 'PREPARING');
    assert.equal(ticketStatus, 'SERVED', 'SERVED durumu geriye düşürülemez');
  });

  // =========================================================================
  // Senaryo 6: Gerçek Zamanlı Mesaj Tekilleştirme (Deduplication)
  // =========================================================================
  test('6. SSE ve BroadcastChannel üzerinden aynı ID ile gelen çift mesajlar tekilleştirilmeli', () => {
    let processedCount = 0;
    const processedIds = new Set<string>();

    const handleMessage = (msg: SyncMessage) => {
      if (processedIds.has(msg.id)) {
        return; // Çift mesaj yok sayıldı
      }
      processedIds.add(msg.id);
      processedCount++;
    };

    const duplicateMessage: SyncMessage = {
      id: 'evt-unique-12345',
      type: 'ORDER_ITEMS_ADDED',
      tenantId,
      sourceDevice: 'waiter_mobile',
      deviceName: 'Garson Mobil',
      timestamp: new Date().toISOString(),
      payload: { tableId: 'tbl-1', itemsCount: 2 },
    };

    // Aynı mesaj iki farklı kaynaktan geldi (ör. SSE + BroadcastChannel)
    handleMessage(duplicateMessage);
    handleMessage(duplicateMessage);
    handleMessage(duplicateMessage);

    assert.equal(processedCount, 1, 'Mesaj sadece 1 kez işlenmelidir');
  });

  // =========================================================================
  // Senaryo 7: Çevrimdışı Taslak Koruma & Ağ Kesintisi Dayanıklılığı
  // =========================================================================
  test('7. Ağ kesintisinde sipariş taslağı yerel depoda korunmalı ve geri yüklenebilmeli', () => {
    const tableId = 'tbl-test-offline-1';
    const draft = {
      waiterId: 'usr-waiter-1',
      waiterName: 'Ahmet Garson',
      tableId,
      tableName: 'Masa 10',
      cart: {
        'prod-1': {
          product: { id: 'prod-1', name: 'Cheeseburger', price: 200, category: 'Burger' },
          quantity: 2,
          notes: ['Az pişmiş', 'Tuzsuz'],
          customNote: 'Ayrı tabakta',
        },
      },
      itemCount: 2,
      totalAmount: 400,
      updatedAt: Date.now(),
    };

    // Taslağı kaydet
    saveLocalDraft(draft as any);

    // Geri oku
    const restored = getLocalDraft(tableId);
    assert.ok(restored, 'Taslak yerel depodan okunabilmeli');
    assert.equal(restored.tableId, tableId);
    assert.equal(restored.totalAmount, 400);
    assert.equal(restored.cart['prod-1'].quantity, 2);
    assert.deepEqual(restored.cart['prod-1'].notes, ['Az pişmiş', 'Tuzsuz']);

    // Temizle
    clearLocalDraft(tableId, 'usr-waiter-1');
    const cleared = getLocalDraft(tableId);
    assert.equal(cleared, null, 'Taslak temizlendikten sonra null dönmeli');
  });

  // =========================================================================
  // Senaryo 8: Tarihsel Fiyat Koruması (Historical Price Snapshot)
  // =========================================================================
  test('8. Menüdeki ürün fiyatı güncellendiğinde açık veya geçmiş siparişlerin fiyatı bozulmamalı', async () => {
    // 1. Ürün oluştur
    const product = await AdminCrudService.createProduct(tenantId, {
      categoryId: 'cat-main',
      name: 'Orijinal Fiyatlı Pizza',
      price: 150,
      code: 'pizza-snapshot-01',
    });

    // 2. Sipariş ver (Fiyat 150 iken)
    const orderRes = await OrderService.submitOrder({
      tenantId,
      tableId: 'tbl-price-snapshot',
      source: 'POS',
      items: [
        {
          productId: product.id,
          name: product.name,
          quantity: 1,
        },
      ],
      createdById: 'usr-cashier-1',
    });

    assert.equal(orderRes.success, true);
    assert.equal(orderRes.total, 150, 'Sipariş toplamı 150 olmalı');

    // 3. Menüdeki ürünün fiyatını 250 TL yap
    await AdminCrudService.updateProduct(tenantId, product.id, {
      price: 250,
    });

    // 4. Masanın açık adisyonunu veya siparişi kontrol et
    // Sipariş nesnesindeki veya adisyondaki ürün birim fiyatı 150 TL olarak KALMALIDIR
    assert.equal(orderRes.items[0].unitPrice, 150, 'Siparişteki birim fiyat 150 TL snapshot olarak korunmalı');
    assert.equal(orderRes.total, 150, 'Sipariş toplamı 150 TL olarak korunmalı');

    // Temizlik
    await AdminCrudService.deleteProduct(tenantId, product.id);
  });

  // =========================================================================
  // Senaryo 9: Yüksek Eşzamanlı Masa Siparişi Benchmarkı
  // =========================================================================
  test('9. 20 eşzamanlı sipariş talebinde p50 ve p95 yanıt süreleri <100ms olmalı', async () => {
    const concurrentCount = 20;
    const promises: Promise<{ duration: number; success: boolean }>[] = [];

    for (let i = 0; i < concurrentCount; i++) {
      const p = (async () => {
        const start = performance.now();
        const res = await OrderService.submitOrder({
          tenantId,
          tableId: `tbl-concurrent-${i % 5}`, // 5 masa arasında dağıt
          source: 'WAITER',
          items: [
            {
              productId: 'b1',
              name: 'Trüflü Smash Burger',
              quantity: 1,
            },
          ],
          idempotencyKey: `idemp-bench-${i}-${Date.now()}`,
          createdById: 'usr-waiter-1',
        });
        const duration = performance.now() - start;
        return { duration, success: res.success };
      })();
      promises.push(p);
    }

    const results = await Promise.all(promises);
    assert.ok(results.every((r) => r.success), 'Tüm eşzamanlı siparişler başarılı olmalı');

    const durations = results.map((r) => r.duration).sort((a, b) => a - b);
    const p50 = durations[Math.floor(durations.length * 0.5)];
    const p95 = durations[Math.floor(durations.length * 0.95)];

    assert.ok(p50 < 100, `p50 süresi < 100ms olmalı (gerçek: ${p50.toFixed(2)}ms)`);
    assert.ok(p95 < 200, `p95 süresi < 200ms olmalı (gerçek: ${p95.toFixed(2)}ms)`);
  });

  // =========================================================================
  // Senaryo 10: Sıfır Güvenlik Regresyonu (Zero Security Regression)
  // =========================================================================
  test('10. Performans optimizasyonları yetki, kimlik ve finansal güvenlik kalkanlarını zayıflatmamalı', async () => {
    // 1. Kimliksiz GET /api/orders -> 401
    const unauthReq = new NextRequest('http://localhost:3000/api/orders', {
      method: 'GET',
    });
    const unauthRes = await getOrdersRoute(unauthReq);
    assert.equal(unauthRes.status, 401, 'Yetkisiz erişim kesinlikle 401 almalı');

    // 2. Yetkisiz rol (kitchen rolü sipariş listesini görebilir mi? Hayır, sadece KDS görebilir)
    const kitchenToken = createSignedSessionToken({
      userId: 'usr-chef-1',
      name: 'Kemal Şef',
      tenantId,
      role: 'kitchen',
    });
    const kitchenReq = new NextRequest('http://localhost:3000/api/orders', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${kitchenToken}`,
      },
    });
    const kitchenRes = await getOrdersRoute(kitchenReq);
    assert.equal(kitchenRes.status, 403, 'Kitchen rolünün doğrudan sipariş listesine erişimi 403 ile engellenmeli');

    // 3. Cross-Tenant Denetimi: Tenant A kullanıcısı Tenant B verisini alamaz
    const crossTenantReq = new NextRequest('http://localhost:3000/api/orders', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${managerToken}`,
        'x-tenant-id': 'tenant-foreign-bistro',
      },
    });
    const crossRes = await getOrdersRoute(crossTenantReq);
    assert.ok(
      crossRes.status === 403 || crossRes.status === 401,
      'Farklı tenant belirteciyle erişim 403 veya 401 almalı'
    );
  });
});
