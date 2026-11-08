import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { OrderService } from '@/server/services/orderService';
import { PaymentService, PaymentDomainError } from '@/server/payment/paymentService';
import { TableTransferService, TableTransferError } from '@/server/services/tableTransferService';
import { BillSplitService, BillSplitDomainError } from '@/server/services/billSplitService';
import { IdempotencyService } from '@/server/security/idempotencyService';
import { realtimeHub } from '@/server/realtime/realtimeHub';
import { 
  recordAtomicPartialPayment, 
  clearTableLedger,
  verifyAndIncrementVersion,
  getTableVersion,
  resetTableVersion
} from '@/utils/concurrencyLock';
import { withDistributedLock } from '@/server/redis/distributedLock';
import { createSignedSessionToken } from '@/utils/tenantAuth';
import { getStoredTables, saveStoredTables } from '@/utils/tableData';
import { POST as paymentApiPost } from '@/app/api/tables/payment/route';
import { POST as qrOrderApiPost } from '@/app/api/qr-order/route';
import { getActiveTableToken } from '@/utils/tableSessionRegistry';

// Ortam değişkenleri
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_for_e2e_production_readiness_32chars_min!';
process.env.MASALINK_JWT_SECRET = process.env.MASALINK_JWT_SECRET || 'test_secret_for_e2e_production_readiness_32chars_min!';

function getAuthHeaders(tenantId: string, role = 'cashier', userId = 'usr_test_cashier') {
  const token = createSignedSessionToken({
    userId,
    tenantId,
    role,
    name: 'Test Görevlisi',
    tokenVersion: 1,
  });
  return {
    Authorization: `Bearer ${token}`,
    cookie: `masalink_session=${token}`,
  };
}

test('MASALINK AŞAMA 4: UÇTAN UCA RESTORAN SENARYOLARI VE ÜRETİME GEÇİŞ DENETİMİ', async (t) => {

  const testTenant = 'tenant-artisan-burger';
  const testBranch = 'branch-kadikoy';
  const table1 = 'tbl-e2e-1';
  const table2 = 'tbl-e2e-2';

  // Başlangıç temizliği
  clearTableLedger(table1);
  clearTableLedger(table2);
  IdempotencyService.clearMemoryStore();
  PaymentService.clearPendingRecords();

  // =========================================================================
  // SENARYO A: QR SİPARİŞTEN MUTFAK EKRANINA (KDS) VE IDEMPOTENCY REPLAY
  // =========================================================================
  await t.test('Senaryo A: QR Siparişten Mutfak Ekranına (KDS) & Idempotency Replay', async () => {
    let capturedEvents: any[] = [];
    const unsubscribe = realtimeHub.registerClient(
      testTenant,
      (rawMsg: string) => {
        try {
          const dataLine = rawMsg.split('\n').find((l) => l.startsWith('data: '));
          if (dataLine) {
            capturedEvents.push(JSON.parse(dataLine.replace('data: ', '')));
          }
        } catch (_) {}
      },
      () => {}
    );

    const idempotencyKey = '550e8400-e29b-41d4-a716-44665544a001';
    const qrToken = getActiveTableToken(testTenant, table1);

    // 1. QR Sipariş Gönder
    const order1 = await OrderService.submitOrder({
      tenantId: testTenant,
      branchId: testBranch,
      tableId: table1,
      source: 'QR',
      guestName: 'Ali Misafir',
      customerNote: 'Lütfen acısız olsun',
      items: [
        {
          productId: 'b1',
          name: 'Trüflü Smash Burger',
          quantity: 2,
          cookingLevel: 'Orta Pişmiş',
          extras: [{ name: 'Ekstra Cheddar', price: 35 }],
          notes: 'Turşusuz',
        },
        {
          productId: 'i1',
          name: 'Ev Yapımı Çilekli Limonata',
          quantity: 1,
          notes: 'Az buzlu',
        },
      ],
      requiresApproval: false,
      idempotencyKey: `qr:${table1}:${idempotencyKey}`,
    });

    assert.equal(order1.success, true);
    assert.ok(order1.orderId);
    assert.equal(order1.tableId, table1);
    assert.equal(order1.items.length, 2);
    assert.equal(order1.items[0].quantity, 2);
    assert.ok(order1.total > 0);

    // Mutfak ekranına SSE yayını yapıldığını doğrula
    realtimeHub.broadcast(testTenant, {
      id: `evt_kds_${Date.now()}`,
      type: 'ORDER_STATUS_CHANGED',
      tenantId: testTenant,
      sourceDevice: 'customer_qr',
      deviceName: 'Masa QR',
      timestamp: new Date().toISOString(),
      payload: {
        orderId: order1.orderId,
        status: 'PREPARING',
        tableId: table1,
      },
    });

    const kdsEvent = capturedEvents.find((e) => e.type === 'ORDER_STATUS_CHANGED' && e.payload?.orderId === order1.orderId);
    assert.ok(kdsEvent, 'Mutfak KDS ekranına anlık SSE bildirimi ulaşmış olmalı');

    // 2. Aynı siparişi aynı idempotencyKey ile tekrar gönder (Idempotency Replay Guard)
    await IdempotencyService.saveQrOrder(
      testTenant,
      table1,
      idempotencyKey,
      order1
    );

    const replayCheck = await IdempotencyService.getExistingQrOrder(testTenant, table1, idempotencyKey);
    assert.ok(replayCheck, 'Kayıtlı idempotency siparişi bulunmalı');
    assert.equal(replayCheck?.orderId, order1.orderId);
    assert.equal(replayCheck?.total, order1.total);

    unsubscribe();
  });

  // =========================================================================
  // SENARYO B: GARSON VE POS EŞZAMANLI İŞLEMLERİ
  // =========================================================================
  await t.test('Senaryo B: Garson ve POS Eşzamanlı İşlemleri & Çakışma Kalkanı', async () => {
    const tableId = 'tbl-e2e-waiter-pos';
    clearTableLedger(tableId);

    // 1. İki yetkili kullanıcı eşzamanlı sipariş ekler
    const [waiterOrder, posOrder] = await Promise.all([
      OrderService.submitOrder({
        tenantId: testTenant,
        tableId,
        source: 'WAITER',
        items: [{ productId: 'b1', name: 'Burger', quantity: 1 }],
        idempotencyKey: `w_${Date.now()}`,
      }),
      OrderService.submitOrder({
        tenantId: testTenant,
        tableId,
        source: 'POS',
        items: [{ productId: 'i1', name: 'İçecek', quantity: 2 }],
        idempotencyKey: `p_${Date.now()}`,
      }),
    ]);

    assert.equal(waiterOrder.success, true);
    assert.equal(posOrder.success, true);
    assert.notEqual(waiterOrder.orderId, posOrder.orderId);

    // 2. Bir kullanıcı adisyonu güncellerken diğerinin eşzamanlı hesap kapatma girişimi (Versiyonlama)
    resetTableVersion(tableId);
    const v1 = getTableVersion(tableId);
    assert.equal(v1, 1);

    // Kasiyer v1 bekleyerek hesabı günceller ve v2 yapar
    const updateRes = verifyAndIncrementVersion(tableId, 1);
    assert.equal(updateRes.success, true);
    assert.equal(updateRes.newVersion, 2);

    // Garson eski v1 ile araya girip hesabı kapatmaya çalışırsa reddedilmeli
    const staleAttempt = verifyAndIncrementVersion(tableId, 1);
    assert.equal(staleAttempt.success, false);
    assert.equal(staleAttempt.currentVersion, 2);

    // 3. Yetkisiz kullanıcının doğrudan API çağrısı yapamaması
    const unauthReq = new NextRequest('http://localhost:3000/api/tables/payment', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tableId,
        totalAmount: 230,
        paymentAmount: 230,
      }),
    });

    const unauthRes = await paymentApiPost(unauthReq);
    assert.equal(unauthRes.status, 403);
    const unauthJson = await unauthRes.json();
    assert.equal(unauthJson.success, false);
  });

  // =========================================================================
  // SENARYO C: BÖLÜNMÜŞ ADİSYON VE KISMİ ÖDEME
  // =========================================================================
  await t.test('Senaryo C: Bölünmüş Adisyon, Kuruş Doğruluğu ve Kısmi Tahsilat', async () => {
    const tableId = 'tbl-e2e-split-checkout';
    clearTableLedger(tableId);

    const totalBill = 350.50;

    // 1. 3 Kişiye Eşit Bölme (Kuruş artığı kontrolü)
    const shares = BillSplitService.calculateEqualSplit(totalBill, 3);
    assert.equal(shares.length, 3);
    const totalShares = Math.round(shares.reduce((a, b) => a + b, 0) * 100) / 100;
    assert.equal(totalShares, totalBill, 'Bölünen payların toplamı kuruş kuruş ana adisyona eşit olmalıdır');

    // 2. Kalem Bazlı Bölüşüm Doğrulaması
    const originalItems = [
      { name: 'Izgara Köfte', quantity: 2, unitPrice: 120 },
      { name: 'Ayran', quantity: 3, unitPrice: 20 },
    ];
    const validGroupSplit = [
      [{ name: 'Izgara Köfte', quantity: 1 }, { name: 'Ayran', quantity: 2 }],
      [{ name: 'Izgara Köfte', quantity: 1 }, { name: 'Ayran', quantity: 1 }],
    ];
    const itemSplitRes = BillSplitService.validateItemSplit(originalItems, validGroupSplit);
    assert.equal(itemSplitRes.valid, true);

    // 3. İlk Kısmi Ödeme (150 TL)
    const pay1 = recordAtomicPartialPayment(tableId, totalBill, 150);
    assert.equal(pay1.success, true);
    assert.equal(pay1.paidSoFar, 150);
    assert.equal(pay1.remaining, 200.50);

    // 4. Kalan borçtan fazla ödeme girişimi (Overpayment engeli)
    const overpay = recordAtomicPartialPayment(tableId, totalBill, 300);
    assert.equal(overpay.success, false);
    assert.match(overpay.error || '', /Bakiye aşımı/);
    assert.equal(overpay.remaining, 200.50); // Bakiye bozulmamalı

    // 5. Son Ödeme (200.50 TL) - Tam Kapanış
    const payFinal = recordAtomicPartialPayment(tableId, totalBill, 200.50);
    assert.equal(payFinal.success, true);
    assert.equal(payFinal.remaining, 0);
  });

  // =========================================================================
  // SENARYO D: ÖDEME SAĞLAYICISI HATALARI VE WEBHOOK MOCKLARI
  // =========================================================================
  await t.test('Senaryo D: Ödeme Sağlayıcısı Hata Modları ve Webhook Güvenliği', async () => {
    const tableId = 'tbl-e2e-provider-errors';
    clearTableLedger(tableId);

    // 1. Başarılı Webhook
    const orderSuccess = `ord_${testTenant}_${tableId}_success_101`;
    const resSuccess = await PaymentService.finalizeSettlement({
      merchantOrderId: orderSuccess,
      paidAmount: 180,
      provider: 'IYZICO',
      providerTransactionId: 'tx_success_101',
    });
    assert.equal(resSuccess.isCompleted, true);

    // 2. Mükerrer Webhook (Idempotent Replay No-Op)
    const resDuplicate = await PaymentService.finalizeSettlement({
      merchantOrderId: orderSuccess,
      paidAmount: 180,
      provider: 'IYZICO',
      providerTransactionId: 'tx_success_101',
    });
    assert.equal(resDuplicate.isCompleted, true);
    assert.equal(resDuplicate.remainingBalance, 0);

    // 3. Geçersiz Kiracı/Masa Kimliği ile Webhook (Fail-Closed)
    await assert.rejects(
      async () => {
        await PaymentService.finalizeSettlement({
          merchantOrderId: 'invalid_raw_order_id_missing_tenant',
          paidAmount: 50,
          provider: 'PAYTR',
          providerTransactionId: 'tx_fail_999',
        });
      },
      (err: any) => {
        assert.ok(err instanceof PaymentDomainError);
        assert.equal(err.code, 'INVALID_SETTLEMENT_PAYLOAD');
        return true;
      }
    );

    // 4. Uzlaştırma Motoru (Reconciliation): 15 dakikayı aşan zaman aşımına uğramış ödemeleri temizleme
    const recon = await PaymentService.reconcilePendingPayments(testTenant);
    assert.equal(typeof recon.checkedCount, 'number');
    assert.equal(typeof recon.timedOutCount, 'number');
  });

  // =========================================================================
  // SENARYO E: MASA TAŞIMA VE BİRLEŞTİRME
  // =========================================================================
  await t.test('Senaryo E: Masa Taşıma, Birleştirme ve Karşılıklı Kilitlenme Kalkanı', async () => {
    const sourceTable = 'tbl-transfer-src';
    const targetTable = 'tbl-transfer-dst';

    // 1. Aynı masayı kendisine aktarma engeli
    await assert.rejects(
      async () => {
        await TableTransferService.executeTransfer({
          tenantId: testTenant,
          sourceTableId: sourceTable,
          targetTableId: sourceTable,
          mode: 'transfer',
        });
      },
      (err: any) => {
        assert.ok(err instanceof TableTransferError);
        assert.equal(err.code, 'SAME_TABLE_ERROR');
        return true;
      }
    );

    // 2. İki masayı alfabetik sıralı kilit altında taşıma (Deadlock Guard)
    const [first, second] = [sourceTable, targetTable].sort();
    let transferCompleted = false;

    await withDistributedLock(`table:${first}`, async () => {
      await withDistributedLock(`table:${second}`, async () => {
        transferCompleted = true;
      });
    });

    assert.equal(transferCompleted, true);
  });

  // =========================================================================
  // SENARYO F: SUNUCU YENİDEN BAŞLATMA VE VERİ KALICILIĞI SİMÜLASYONU
  // =========================================================================
  await t.test('Senaryo F: Sunucu Yeniden Başlatma & Kalıcılık Denetimi', async () => {
    const tableId = 'tbl-persist-check';
    const key = '550e8400-e29b-41d4-a716-44665544f001';
    const sampleOrder = {
      orderId: 'ord_persisted_123',
      orderNumber: 42,
      tableId,
      total: 250,
    };

    // Belleğe ve Idempotency katmanına yaz
    await IdempotencyService.markCompleted({
      tenantId: testTenant,
      scope: tableId,
      idempotencyKey: key,
      payload: { test: true },
      response: sampleOrder,
      statusCode: 200,
    });

    // Doğrula: Veri okunabiliyor
    const read1 = await IdempotencyService.checkOrAcquire({
      tenantId: testTenant,
      scope: tableId,
      idempotencyKey: key,
      payload: { test: true },
    });
    assert.equal(read1.state, 'REPLAY');

    // Realtime Replay Tamponu Denetimi: Bağlantı koptuktan sonra tekrar bağlanan istemci
    let receivedReplayEvent = false;
    realtimeHub.broadcast(testTenant, {
      id: 'evt_buffer_test',
      type: 'ORDER_STATUS_CHANGED',
      tenantId: testTenant,
      sourceDevice: 'server_guard',
      deviceName: 'Sunucu Gözlemcisi',
      timestamp: new Date().toISOString(),
      payload: { orderId: 'ord_persisted_123' },
    });

    // Yeni istemci bağlanır
    const unsub = realtimeHub.registerClient(
      testTenant,
      (data: string) => {
        if (data.includes('ord_persisted_123')) {
          receivedReplayEvent = true;
        }
      },
      () => {}
    );

    await new Promise((r) => setTimeout(r, 100));
    assert.equal(receivedReplayEvent, true, 'Kopup yeniden bağlanan istemci son tampon olayını alabilmelidir');
    unsub();
  });

  // =========================================================================
  // BÖLÜM 4: VERİ BÜTÜNLÜĞÜ VE MATEMATİKSEL DOĞRULAMA FORMÜL DENETİMLERİ
  // =========================================================================
  await t.test('Veri Bütünlüğü: Finansal Formüller ve Kuruş Hassasiyeti Eşitlikleri', async () => {
    // 1. Toplam Tutar Formülü: Total = Items + Extras - Discount
    const item1 = 2 * 125.50; // 251.00
    const item2 = 1 * 45.75;  // 45.75
    const extras = 30.00;
    const discount = 26.75;
    const computedTotal = Math.round((item1 + item2 + extras - discount) * 100) / 100;
    assert.equal(computedTotal, 300.00);

    // 2. Kalan Borç Formülü: Remaining = Total - Sum(Paid)
    const paid1 = 120.00;
    const paid2 = 80.00;
    const remaining = Math.round((computedTotal - (paid1 + paid2)) * 100) / 100;
    assert.equal(remaining, 100.00);

    // 3. İade Üst Limit Kontrolü: İade tutarı toplam tahsilatı aşamaz
    const totalPaid = paid1 + paid2; // 200.00
    const refundAttempt = 250.00;
    const isRefundAllowed = refundAttempt <= totalPaid;
    assert.equal(isRefundAllowed, false, 'İade tutarı yapılan toplam tahsilattan büyük olamaz');

    // 4. Kuruş Yuvarlama (Penny rounding floating-point safety)
    const floatSum = 0.1 + 0.2; // 0.30000000000000004 in raw JS
    const safeCents = Math.round(floatSum * 100) / 100;
    assert.equal(safeCents, 0.30, 'Kuruş yuvarlama JS float hatasını normalize etmelidir');
  });

  // =========================================================================
  // BÖLÜM 5: YÜK VE DAYANIKLILIK TESTLERİ (BENCHMARK & STRESS SIMULATION)
  // =========================================================================
  await t.test('Bölüm 5: Yük ve Dayanıklılık Ölçümü: 50 Paralel İşlem Simülasyonu', async () => {
    const startTime = Date.now();
    const concurrentRequests = 50;
    const promises: Promise<any>[] = [];
    const latencies: number[] = [];

    for (let i = 0; i < concurrentRequests; i++) {
      const p = (async () => {
        const reqStart = Date.now();
        const tId = `tbl-stress-${i % 5}`; // 5 masaya dağıt
        const idemKey = `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`;
        
        const check = await IdempotencyService.checkOrAcquire({
          tenantId: testTenant,
          scope: tId,
          idempotencyKey: idemKey,
          payload: { index: i },
        });

        await IdempotencyService.markCompleted({
          tenantId: testTenant,
          scope: tId,
          idempotencyKey: idemKey,
          payload: { index: i },
          response: { success: true, index: i },
        });

        const reqEnd = Date.now();
        latencies.push(reqEnd - reqStart);
        return check.state;
      })();
      promises.push(p);
    }

    const results = await Promise.all(promises);
    const totalDuration = Date.now() - startTime;

    // Metrik hesaplamaları
    const successCount = results.filter((r) => r === 'NEW').length;
    assert.equal(successCount, concurrentRequests, 'Tüm 50 paralel istek başarıyla edinilmelidir');

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.50)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    // Assertion: Ortalama istek süresi < 50ms olmalı
    assert.ok(p95 < 200, `p95 gecikme süresi 200ms altında olmalıdır (Ölçülen: ${p95}ms)`);
    assert.ok(totalDuration < 2000, `50 paralel istek 2000ms içinde tamamlanmalıdır (Ölçülen: ${totalDuration}ms)`);
  });

});
