import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { OrderService } from '../src/server/services/orderService';
import { PaymentService } from '../src/server/payment/paymentService';
import { ReceiptPrinterService } from '../src/server/printer/receiptPrinterService';
import { realtimeHub } from '../src/server/realtime/realtimeHub';
import { metricsCollector } from '../src/server/observability/metrics';
import { structuredLogger } from '../src/server/observability/logger';
import { CacheService } from '../src/server/redis/cacheService';
import { getStoredTables, saveStoredTables } from '../src/utils/tableData';

describe('MasaLink Uçtan Uca Operasyonel Akış & Gözlemlenebilirlik Zinciri (E2E Test)', () => {
  const tenantId = 'tenant-artisan-burger';
  const tableId = 'tbl-4';
  const sessionToken = 'qr_session_e2e_valid_token';
  const correlationId = `trc_e2e_order_${Date.now()}`;

  beforeEach(async () => {
    metricsCollector.resetForTesting();

    // Test masasını başlangıç durumuna getir
    const tables = getStoredTables();
    const cleanTables = tables.map((t) => {
      if (t.id === tableId) {
        return {
          ...t,
          status: 'empty' as const,
          totalAmount: 0,
          items: [],
          lastActivity: 'Test Öncesi Sıfırlandı',
        };
      }
      return t;
    });
    saveStoredTables(cleanTables);

    // Aktif QR oturumu kaydet
    await CacheService.saveTableSession(tenantId, tableId, sessionToken, 3600);
  });

  it('1. QR Sipariş -> KDS -> Hazır -> Ödeme -> Adisyon Kapatma -> Fiş Basımı Tam Zincir Doğrulaması', async () => {
    const span = structuredLogger.startSpan('E2E_Full_Order_Lifecycle', correlationId, tenantId, tableId);
    let capturedEvents: any[] = [];

    // Realtime SSE İstemcisi Simülasyonu (Kasa ve Garson dinleyicisi)
    const unsub = realtimeHub.registerClient(
      tenantId,
      (rawMsg: string) => {
        try {
          // SSE format: "event: message\ndata: { ... }\n\n"
          const dataLine = rawMsg.split('\n').find((line) => line.startsWith('data: '));
          if (dataLine) {
            capturedEvents.push(JSON.parse(dataLine.replace('data: ', '')));
          }
        } catch (_) {}
      },
      () => {}
    );

    // =========================================================================
    // ADIM 1: QR SİPARİŞ GİRİŞİ (QR Order Submission)
    // =========================================================================
    const orderResult = await OrderService.submitOrder({
      tenantId,
      tableId,
      source: 'QR',
      guestName: 'Barış (Misafir 1)',
      customerNote: 'Alerjen: Fıstık alerjisi var.',
      items: [
        {
          productId: 'b1',
          name: 'Trüflü Smash Burger',
          quantity: 2,
          cookingLevel: 'Orta Pişmiş',
          extras: [{ name: 'Ekstra Eritilmiş Cheddar', price: 35 }],
          notes: 'Soğansız',
          guestTag: 'Barış (Misafir 1)',
        },
        {
          productId: 'i1',
          name: 'Ev Yapımı Çilekli Limonata',
          quantity: 2,
          notes: 'Az buzlu',
          guestTag: 'Barış (Misafir 1)',
        },
      ],
      requiresApproval: false,
    });

    assert.equal(orderResult.success, true, 'Sipariş başarıyla oluşturulmalı');
    assert.ok(orderResult.orderId, 'Sipariş ID üretilmeli');
    assert.ok(orderResult.total > 0, 'Sipariş tutarı 0 dan büyük olmalı');

    // Masanın güncel tutarını güncelle
    const tablesAfterOrder = getStoredTables();
    saveStoredTables(
      tablesAfterOrder.map((t) =>
        t.id === tableId ? { ...t, status: 'preparing' as const, totalAmount: orderResult.total } : t
      )
    );

    // Observability Kontrolü 1: Sipariş Metriği
    const metricsAfterOrder = metricsCollector.getSnapshot();
    assert.equal(metricsAfterOrder.orders.submittedTotal, 1, 'orders.submittedTotal 1 olmalı');

    // =========================================================================
    // ADIM 2 & 3: KDS YÖNLENDİRMESİ VE ŞEFİN "HAZIR" İŞARETİ (KDS Ready Alert)
    // =========================================================================
    const kdsUpdate = await OrderService.updateOrderStatus({
      tenantId,
      orderId: orderResult.orderId,
      status: 'READY',
      tableId,
    });

    assert.equal(kdsUpdate.success, true, 'KDS sipariş durumunu READY yapabilmeli');

    // Observability Kontrolü 2: Hazır Sipariş Metriği
    const metricsAfterKds = metricsCollector.getSnapshot();
    assert.equal(metricsAfterKds.orders.readyTotal, 1, 'orders.readyTotal 1 olmalı');

    // =========================================================================
    // ADIM 4: ÇEVRİMİÇİ ÖDEME (Iyzico / PayTR 3D Secure Tahsilatı)
    // =========================================================================
    const paymentInit = await PaymentService.initiateOnlinePayment(
      {
        tenantId,
        tableId,
        amount: orderResult.total,
        customer: {
          name: 'Barış Kaya',
          email: 'baris.kaya@example.com',
          phone: '05443332211',
          ip: '192.168.1.100',
        },
        items: orderResult.items.map((i) => ({
          id: i.productId || 'item',
          name: i.productName,
          price: i.unitPrice,
          quantity: i.quantity,
        })),
        callbackUrl: 'http://localhost:3000/api/payment/callback',
        isPartialPayment: false,
        guestName: 'Barış (Misafir 1)',
      },
      'IYZICO'
    );

    assert.equal(paymentInit.success, true, 'Iyzico ödeme oturumu başlatılabilmeli');
    assert.ok(paymentInit.token, 'Iyzico token üretilmeli');

    // Webhook bildirim simülasyonu ile tahsilat kapatma
    const settlement = await PaymentService.finalizeSettlement({
      merchantOrderId: paymentInit.merchantOrderId,
      paidAmount: orderResult.total,
      provider: 'IYZICO',
      providerTransactionId: paymentInit.transactionId,
    });

    assert.equal(settlement.isCompleted, true, 'Tam tahsilat ile hesap kapanmalı');
    assert.equal(settlement.remainingBalance, 0, 'Kalan bakiye 0 TL olmalı');

    // Observability Kontrolü 3: Ödeme Metrikleri
    const metricsAfterPayment = metricsCollector.getSnapshot();
    assert.equal(metricsAfterPayment.payments.completedTotal, 1, 'payments.completedTotal 1 olmalı');
    assert.equal(metricsAfterPayment.payments.totalRevenueTry, orderResult.total, 'Toplam ciro eşleşmeli');
    assert.equal(metricsAfterPayment.tables.sessionsClosedTotal, 1, 'Kapanan masa oturumu 1 olmalı');

    // =========================================================================
    // ADIM 5: ADİSYON KAPATMA VE REDIS QR OTURUM İPTALİ (Ledger & Revocation)
    // =========================================================================
    const tablesAfterPayment = getStoredTables();
    const closedTable = tablesAfterPayment.find((t) => t.id === tableId);
    assert.equal(closedTable?.status, 'empty', 'Ödenen masa durumu "empty" olmalı');
    assert.equal(closedTable?.totalAmount, 0, 'Ödenen masa bakiyesi 0 olmalı');

    // Redis QR Token İptal Doğrulaması (Eski müşteri oturumuyla yeni sipariş engeli)
    const isTokenStillValid = await CacheService.isSessionValid(tenantId, tableId, sessionToken);
    assert.equal(isTokenStillValid, false, 'Hesap ödendiğinde Redis QR oturumu geçersiz kılınmalı');

    // =========================================================================
    // ADIM 6: TERMAL FİŞ BASIMI VE DENETİM GÜNLÜĞÜ (Thermal Receipt & Audit)
    // =========================================================================
    const printResult = await ReceiptPrinterService.printReceipt({
      tenantId,
      tableId,
      tableName: 'Masa 4 (Salon)',
      orderId: orderResult.orderId,
      paymentMethod: 'Iyzico 3D Secure Kredi Kartı',
      cashierName: 'Otomatik QR Kasa',
      items: orderResult.items.map((i) => ({
        name: i.productName,
        quantity: i.quantity,
        price: i.unitPrice,
      })),
      subtotal: orderResult.subtotal,
      total: orderResult.total,
      correlationId,
      isKitchenTicket: false,
    });

    assert.equal(printResult.success, true, 'Termal fiş başarıyla basılmalı');
    assert.ok(printResult.receiptNumber.startsWith('F-'), 'Fiş numarası F- ile başlamalı');
    assert.ok(printResult.rawEscPosLength > 0, 'ESC/POS ikili çıktısı üretilmeli');

    // Observability Kontrolü 4: Fiş Basım Metriği
    const finalMetrics = metricsCollector.getSnapshot();
    assert.equal(finalMetrics.printer.receiptsPrintedTotal, 1, 'receiptsPrintedTotal 1 olmalı');
    assert.equal(finalMetrics.printer.failuresTotal, 0, 'Yazıcı hatası 0 olmalı');

    // =========================================================================
    // ADIM 7: OBSERVABILITY SPAN VE KORİDOR ANALİZİ (Trace Telemetry)
    // =========================================================================
    const totalDuration = span.end({
      orderId: orderResult.orderId,
      receiptNumber: printResult.receiptNumber,
      totalPaid: orderResult.total,
    });

    assert.ok(totalDuration >= 0, 'Süreç izleme süresi pozitif olmalı');

    unsub();
  });

  it('2. PayTR Parçalı Ödeme ve Bakiye Aşımı Koruması (Split Bill & Overpayment Guard)', async () => {
    // 500 TL lik sipariş hazırla
    const orderResult = await OrderService.submitOrder({
      tenantId,
      tableId,
      source: 'QR',
      items: [
        { productId: 'b2', name: 'Double Cheddar Bacon', quantity: 1 }, // 340 TL
        { productId: 'y2', name: 'Mozzarella Sticks (6x)', quantity: 1 }, // 160 TL
      ],
      requiresApproval: false,
    });

    assert.equal(orderResult.total, 500, 'Toplam tutar 500 TL olmalı');

    const tables = getStoredTables();
    saveStoredTables(tables.map((t) => (t.id === tableId ? { ...t, totalAmount: 500 } : t)));

    // 1. Aşama: Fazla ödeme çekme denemesi (Bakiye Aşımı Koruması)
    let overpaymentBlocked = false;
    try {
      await PaymentService.finalizeSettlement({
        merchantOrderId: `ord_${tenantId}_${tableId}_fail_test`,
        paidAmount: 800, // 500 yerine 800 TL çekmeye çalış
        provider: 'PAYTR',
        providerTransactionId: 'tx-overpay-fail',
      });
    } catch (err: any) {
      overpaymentBlocked = true;
    }
    assert.equal(overpaymentBlocked, true, 'Masa tutarından fazla çekilmeye çalışıldığında reddedilmeli');

    // 2. Aşama: 200 TL parçalı ödeme (Misafir A)
    const part1 = await PaymentService.finalizeSettlement({
      merchantOrderId: `ord_${tenantId}_${tableId}_part1`,
      paidAmount: 200,
      provider: 'PAYTR',
      providerTransactionId: 'tx-paytr-part1',
    });
    assert.equal(part1.isCompleted, false, '200 TL ödendiğinde hesap açık kalmalı');
    assert.equal(part1.remainingBalance, 300, 'Kalan bakiye 300 TL olmalı');

    // 3. Aşama: Kalan 300 TL ödeme (Misafir B - Kapanış)
    const part2 = await PaymentService.finalizeSettlement({
      merchantOrderId: `ord_${tenantId}_${tableId}_part2`,
      paidAmount: 300,
      provider: 'PAYTR',
      providerTransactionId: 'tx-paytr-part2',
    });
    assert.equal(part2.isCompleted, true, 'Kalan 300 TL ödendiğinde hesap kapanmalı');
    assert.equal(part2.remainingBalance, 0, 'Kalan bakiye 0 TL olmalı');
  });

  it('3. Canlı Sağlık Denetimi ve Operasyonel Metrik Snaphot Doğrulaması', async () => {
    const snapshot = metricsCollector.getSnapshot();

    assert.ok(typeof snapshot.uptimeSeconds === 'number', 'uptime saniye tipinde olmalı');
    assert.ok(snapshot.payments.completedTotal >= 0, 'Ödeme sayaçları mevcut olmalı');
    assert.equal(snapshot.infrastructure.redisConnected, true, 'Redis bağlı olmalı');
  });
});
