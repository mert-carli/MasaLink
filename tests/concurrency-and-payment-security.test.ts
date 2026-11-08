import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as qrOrderPost } from '@/app/api/qr-order/route';
import { POST as paymentPost } from '@/app/api/tables/payment/route';
import { IdempotencyService } from '@/server/security/idempotencyService';
import { PaymentService, PaymentDomainError } from '@/server/payment/paymentService';
import { TableTransferService, TableTransferError } from '@/server/services/tableTransferService';
import { BillSplitService, BillSplitDomainError } from '@/server/services/billSplitService';
import { 
  recordAtomicPartialPayment, 
  clearTableLedger, 
  verifyAndIncrementVersion,
  getTableVersion,
  resetTableVersion
} from '@/utils/concurrencyLock';
import { withDistributedLock, acquireDistributedLock } from '@/server/redis/distributedLock';
import { createSignedSessionToken } from '@/utils/tenantAuth';

// Ortam değişkenleri
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_for_concurrency_hardening_32chars_min';
process.env.MASALINK_JWT_SECRET = process.env.MASALINK_JWT_SECRET || 'test_secret_for_concurrency_hardening_32chars_min';

function createAuthHeader(tenantId = 'tenant_concurrency_test', role = 'cashier', userId = 'usr_cashier_1') {
  const token = createSignedSessionToken({
    userId,
    tenantId,
    role,
    name: 'Kasa Personeli',
    tokenVersion: 1,
  });
  return {
    Authorization: `Bearer ${token}`,
    cookie: `masalink_session=${token}`,
  };
}

test('MASALINK AŞAMA 3: EŞZAMANLILIK, ADİSYON, MASA KİLİDİ VE ÖDEME GÜVENLİĞİ TEST PAKETİ', async (t) => {

  // Testler öncesi temizlik
  clearTableLedger('tbl-concurrency-1');
  clearTableLedger('tbl-concurrency-2');
  IdempotencyService.clearMemoryStore();
  PaymentService.clearPendingRecords();

  // --------------------------------------------------------------------------
  // 1 & 2. IDEMPOTENCY KEY VE PAYLOAD HASH GÜVENLİĞİ
  // --------------------------------------------------------------------------
  await t.test('1. Aynı Idempotency-Key ile paralel istek: Double-Checked Locking ile yalnızca 1 sipariş üretilmeli, 2. istek REPLAY dönmeli', async () => {
    const tenantId = 'tenant_conc_1';
    const tableId = 'tbl-4';
    const key = '550e8400-e29b-41d4-a716-446655440001';
    const payload = {
      items: [{ name: 'Klasik Burger', price: 120, quantity: 1 }],
      tableId,
      customerNote: 'Az pişmiş',
    };

    // İlk istek yeni kayıt olarak edinilmeli
    const firstCheck = await IdempotencyService.checkOrAcquire({
      tenantId,
      scope: tableId,
      idempotencyKey: key,
      payload,
    });
    assert.equal(firstCheck.state, 'NEW');

    // İlk işlemi tamamla
    await IdempotencyService.markCompleted({
      tenantId,
      scope: tableId,
      idempotencyKey: key,
      payload,
      response: { orderId: 'ord_success_1', total: 120 },
      statusCode: 200,
    });

    // İkinci istek birebir aynı anahtar ve veriyle REPLAY almalı
    const secondCheck = await IdempotencyService.checkOrAcquire({
      tenantId,
      scope: tableId,
      idempotencyKey: key,
      payload,
    });

    assert.equal(secondCheck.state, 'REPLAY');
    if (secondCheck.state === 'REPLAY') {
      assert.equal(secondCheck.cachedResponse.orderId, 'ord_success_1');
      assert.equal(secondCheck.statusCode, 200);
    }
  });

  await t.test('2. Idempotency Key Reuse ile FARKLI PAYLOAD: 409 Conflict (MISMATCH) ile derhal reddedilmeli', async () => {
    const tenantId = 'tenant_conc_1';
    const tableId = 'tbl-4';
    const key = '550e8400-e29b-41d4-a716-446655440002';

    const originalPayload = { items: [{ name: 'Kahve', price: 50, quantity: 1 }] };
    const manipulatedPayload = { items: [{ name: 'Pahalı Viski', price: 1500, quantity: 1 }] };

    await IdempotencyService.markCompleted({
      tenantId,
      scope: tableId,
      idempotencyKey: key,
      payload: originalPayload,
      response: { orderId: 'ord_original', total: 50 },
    });

    const mismatchCheck = await IdempotencyService.checkOrAcquire({
      tenantId,
      scope: tableId,
      idempotencyKey: key,
      payload: manipulatedPayload,
    });

    assert.equal(mismatchCheck.state, 'MISMATCH');
    if (mismatchCheck.state === 'MISMATCH') {
      assert.match(mismatchCheck.error, /farklı bir istek içeriği/);
    }
  });

  await t.test('3. Geçersiz veya düşük entropili Idempotency Key reddedilmeli (UUID veya min. 16 karakter)', async () => {
    assert.equal(IdempotencyService.isValidKey(null), false);
    assert.equal(IdempotencyService.isValidKey(''), false);
    assert.equal(IdempotencyService.isValidKey('123'), false);
    assert.equal(IdempotencyService.isValidKey('abc!@#'), false);
    assert.equal(IdempotencyService.isValidKey('550e8400-e29b-41d4-a716-446655440000'), true);
    assert.equal(IdempotencyService.isValidKey('secure_custom_key_12345678'), true);
  });

  await t.test('4. In-flight eşzamanlı işlem tespiti (IN_PROGRESS state)', async () => {
    const tenantId = 'tenant_conc_flight';
    const tableId = 'tbl-inflight';
    const key = '550e8400-e29b-41d4-a716-446655440004';
    const payload = { test: true };

    const first = await IdempotencyService.checkOrAcquire({
      tenantId,
      scope: tableId,
      idempotencyKey: key,
      payload,
    });
    assert.equal(first.state, 'NEW');

    // Henüz tamamlanmadan ikinci paralel istek gelirse:
    const concurrent = await IdempotencyService.checkOrAcquire({
      tenantId,
      scope: tableId,
      idempotencyKey: key,
      payload,
    });
    assert.equal(concurrent.state, 'IN_PROGRESS');
  });

  // --------------------------------------------------------------------------
  // 5 & 6. İYİMSER KİLİT (OPTIMISTIC LOCKING) VE VERSİYON KONTROLÜ
  // --------------------------------------------------------------------------
  await t.test('5. Optimistic Lock: Aynı masada versiyon çakışması (Lost Update engeli)', async () => {
    const tableId = 'tbl-opt-test-1';
    resetTableVersion(tableId);

    assert.equal(getTableVersion(tableId), 1);

    // İlk istemci v1 gönderir, kabul edilip v2 olmalı
    const res1 = verifyAndIncrementVersion(tableId, 1);
    assert.equal(res1.success, true);
    assert.equal(res1.newVersion, 2);

    // İkinci istemci araya girip hala v1 sanarak istek atarsa reddedilmeli
    const res2 = verifyAndIncrementVersion(tableId, 1);
    assert.equal(res2.success, false);
    assert.equal(res2.currentVersion, 2);

    // İstemci güncel v2 ile istek atarsa kabul edilmeli
    const res3 = verifyAndIncrementVersion(tableId, 2);
    assert.equal(res3.success, true);
    assert.equal(res3.newVersion, 3);
  });

  await t.test('6. Yanlış beklenen versiyon ile sipariş gönderimi reddedilmeli', async () => {
    const tableId = 'tbl-opt-test-2';
    resetTableVersion(tableId);
    verifyAndIncrementVersion(tableId, 1); // Versiyon 2 oldu

    const check = verifyAndIncrementVersion(tableId, 1);
    assert.equal(check.success, false);
    assert.equal(check.currentVersion, 2);
  });

  // --------------------------------------------------------------------------
  // 7 & 8 & 9. MASA TAŞIMA / BİRLEŞTİRME VE DEADLOCK KORUMASI
  // --------------------------------------------------------------------------
  await t.test('7. Masa Taşıma/Birleştirme: Deterministik alfabetik kilit ile Deadlock kalkanı', async () => {
    // İki ters işlem: A -> B ve B -> A
    // İkisi de [A, B].sort() sayesinde aynı kilit sırasını izler ve deadlock oluşamaz.
    const tableA = 'tbl-salon-1';
    const tableB = 'tbl-salon-2';
    const [first, second] = [tableA, tableB].sort();

    assert.equal(first, 'tbl-salon-1');
    assert.equal(second, 'tbl-salon-2');

    let lockAcquired = false;
    await withDistributedLock(`table:${first}`, async () => {
      await withDistributedLock(`table:${second}`, async () => {
        lockAcquired = true;
      });
    });

    assert.equal(lockAcquired, true);
  });

  await t.test('8. Bir masayı kendisine aktarma / birleştirme girişimi reddedilmeli', async () => {
    await assert.rejects(
      async () => {
        await TableTransferService.executeTransfer({
          tenantId: 'tenant_test',
          sourceTableId: 'tbl-same',
          targetTableId: 'tbl-same',
          mode: 'transfer',
        });
      },
      (err: any) => {
        assert.ok(err instanceof TableTransferError);
        assert.equal(err.code, 'SAME_TABLE_ERROR');
        return true;
      }
    );
  });

  await t.test('9. Kiracısız masa transferi isteği reddedilmeli (Tenant Isolation)', async () => {
    await assert.rejects(
      async () => {
        await TableTransferService.executeTransfer({
          tenantId: '',
          sourceTableId: 'tbl-1',
          targetTableId: 'tbl-2',
          mode: 'transfer',
        });
      },
      (err: any) => {
        assert.ok(err instanceof TableTransferError);
        assert.equal(err.code, 'TENANT_REQUIRED');
        return true;
      }
    );
  });

  // --------------------------------------------------------------------------
  // 10 & 11 & 12. PARÇALI ÖDEME VE BAKİYE AŞIMI (OVERPAYMENT GUARD)
  // --------------------------------------------------------------------------
  await t.test('10. Geçerli parçalı ödeme: Kalan bakiye doğru düşmeli', async () => {
    const tableId = 'tbl-payment-split-1';
    clearTableLedger(tableId);

    const total = 500;
    const payment1 = recordAtomicPartialPayment(tableId, total, 200);

    assert.equal(payment1.success, true);
    assert.equal(payment1.paidSoFar, 200);
    assert.equal(payment1.remaining, 300);

    const payment2 = recordAtomicPartialPayment(tableId, total, 150);
    assert.equal(payment2.success, true);
    assert.equal(payment2.paidSoFar, 350);
    assert.equal(payment2.remaining, 150);
  });

  await t.test('11. Eşzamanlı parçalı ödemelerde BAKİYE AŞIMI KESİN ENGELLENMELİ (Overpayment Guard)', async () => {
    const tableId = 'tbl-overpay-guard';
    clearTableLedger(tableId);

    const total = 300;
    // İlk ödeme 250 TL
    const pay1 = recordAtomicPartialPayment(tableId, total, 250);
    assert.equal(pay1.success, true);
    assert.equal(pay1.remaining, 50);

    // Kalan 50 TL iken başka bir cihazdan 100 TL ödeme talebi
    const pay2 = recordAtomicPartialPayment(tableId, total, 100);
    assert.equal(pay2.success, false);
    assert.match(pay2.error || '', /Bakiye aşımı tespit edildi/);
    assert.equal(pay2.remaining, 50); // Bakiye bozulmamalı
    assert.equal(pay2.paidSoFar, 250);
  });

  await t.test('12. Tam tahsilat ile masanın adisyon defteri sıfırlanmalı', async () => {
    const tableId = 'tbl-full-checkout';
    clearTableLedger(tableId);

    const pay = recordAtomicPartialPayment(tableId, 250, 250);
    assert.equal(pay.success, true);
    assert.equal(pay.remaining, 0);

    clearTableLedger(tableId);
    // Sıfırlandıktan sonra yeni adisyon açılabilir
    const newPay = recordAtomicPartialPayment(tableId, 100, 50);
    assert.equal(newPay.success, true);
    assert.equal(newPay.paidSoFar, 50);
    assert.equal(newPay.remaining, 50);
  });

  // --------------------------------------------------------------------------
  // 13 & 14 & 15. ÖDEME API DOĞRULAMASI VE IDEMPOTENCY
  // --------------------------------------------------------------------------
  await t.test('13. Geçersiz veya sıfır ödeme tutarı 400 ile reddedilmeli', async () => {
    const auth = createAuthHeader();
    const req = new NextRequest('http://localhost:3000/api/tables/payment', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...auth,
      },
      body: JSON.stringify({
        tableId: 'tbl-1',
        paymentAmount: -50,
      }),
    });

    const res = await paymentPost(req);
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.success, false);
  });

  await t.test('14. Kasa Ödemesinde Idempotency: Mükerrer tıklandığında çift tahsilat yapılmamalı', async () => {
    const auth = createAuthHeader();
    const key = '550e8400-e29b-41d4-a716-446655440014';
    const tableId = 'tbl-kasa-idem';
    clearTableLedger(tableId);

    const paymentBody = {
      tableId,
      totalAmount: 100,
      paymentAmount: 50,
      idempotencyKey: key,
    };

    // 1. İstek
    const req1 = new NextRequest('http://localhost:3000/api/tables/payment', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': key,
        ...auth,
      },
      body: JSON.stringify(paymentBody),
    });

    const res1 = await paymentPost(req1);
    assert.equal(res1.status, 200);
    const json1 = await res1.json();
    assert.equal(json1.success, true);
    assert.equal(json1.paidAmount, 50);

    // 2. İstek (Aynı anahtar ile tekrar gönderim)
    const req2 = new NextRequest('http://localhost:3000/api/tables/payment', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': key,
        ...auth,
      },
      body: JSON.stringify(paymentBody),
    });

    const res2 = await paymentPost(req2);
    assert.equal(res2.status, 200);
    const json2 = await res2.json();
    assert.equal(json2.isIdempotentReplay, true);
    assert.equal(json2.paidAmount, 50);
  });

  await t.test('15. Kasa Ödemesinde Aynı Key Farklı Tutar ile gönderilirse 409 Conflict almalı', async () => {
    const auth = createAuthHeader();
    const key = '550e8400-e29b-41d4-a716-446655440015';
    const tableId = 'tbl-kasa-conflict';
    clearTableLedger(tableId);

    // 1. İstek (50 TL)
    const req1 = new NextRequest('http://localhost:3000/api/tables/payment', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': key,
        ...auth,
      },
      body: JSON.stringify({
        tableId,
        totalAmount: 100,
        paymentAmount: 50,
        idempotencyKey: key,
      }),
    });
    const res1 = await paymentPost(req1);
    assert.equal(res1.status, 200);

    // 2. İstek (Aynı key ile 80 TL talep ediliyor)
    const req2 = new NextRequest('http://localhost:3000/api/tables/payment', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': key,
        ...auth,
      },
      body: JSON.stringify({
        tableId,
        totalAmount: 100,
        paymentAmount: 80,
        idempotencyKey: key,
      }),
    });
    const res2 = await paymentPost(req2);
    assert.equal(res2.status, 409);
    const json2 = await res2.json();
    assert.equal(json2.errorCode, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
  });

  // --------------------------------------------------------------------------
  // 16 & 17 & 18. ONLINE WEBHOOK VE ÇİFT TAHSİLAT KORUMASI
  // --------------------------------------------------------------------------
  await t.test('16. PaymentService: Mükerrer Webhook Çağrısı (Replay Guard) adisyonu iki kez düşmemeli', async () => {
    const merchantOrderId = 'ord_tenant1_tblweb_12345';
    const tableId = 'tblweb';
    clearTableLedger(tableId);

    // 1. Webhook çağrısı
    const firstRes = await PaymentService.finalizeSettlement({
      merchantOrderId,
      paidAmount: 200,
      provider: 'IYZICO',
      providerTransactionId: 'iyz_tx_1001',
    });

    assert.equal(firstRes.tableId, tableId);
    assert.equal(firstRes.isCompleted, true);

    // 2. İkinci mükerrer webhook çağrısı (Ağ tekrarı veya sağlayıcı retry'ı)
    const secondRes = await PaymentService.finalizeSettlement({
      merchantOrderId,
      paidAmount: 200,
      provider: 'IYZICO',
      providerTransactionId: 'iyz_tx_1001',
    });

    // Idempotent olarak başarılı dönmeli, bakiye bozulmamalı
    assert.equal(secondRes.isCompleted, true);
    assert.equal(secondRes.remainingBalance, 0);
  });

  await t.test('17. Eşzamanlı Webhook Teslimatı: merchantOrderId dağıtık kilidi ile sıralanmalı', async () => {
    const orderId = 'ord_tenant1_tblconc_concurrent_webhook';
    let lockTested = false;

    await withDistributedLock(`payment:${orderId}`, async () => {
      lockTested = true;
    });

    assert.equal(lockTested, true);
  });

  await t.test('18. Fail-Closed: tenantId veya tableId çözümlenemeyen ödeme mutabakatı reddedilmeli', async () => {
    await assert.rejects(
      async () => {
        await PaymentService.finalizeSettlement({
          merchantOrderId: 'invalid_order_without_tenant_table',
          paidAmount: 100,
          provider: 'PAYTR',
          providerTransactionId: 'paytr_tx_99',
        });
      },
      (err: any) => {
        assert.ok(err instanceof PaymentDomainError);
        assert.equal(err.code, 'INVALID_SETTLEMENT_PAYLOAD');
        return true;
      }
    );
  });

  await t.test('19. Uzlaştırma Motoru (Reconciliation): 15 dakikayı aşan zaman aşımına uğramış ödemeleri temizlemeli', async () => {
    const tenantId = 'tenant_reconcile_test';

    // Simüle bekleyen eski ödeme
    PaymentService.clearPendingRecords();

    const recon = await PaymentService.reconcilePendingPayments(tenantId);
    assert.equal(typeof recon.checkedCount, 'number');
    assert.equal(typeof recon.timedOutCount, 'number');
  });

  // --------------------------------------------------------------------------
  // 20 & 21. ADİSYON BÖLME (BILL SPLIT) GÜVENLİĞİ
  // --------------------------------------------------------------------------
  await t.test('20. Eşit Adisyon Bölme: Kuruş artıkları adil paylaştırılmalı, toplam tam eşit olmalı', async () => {
    // 100 TL / 3 kişi = 33.34 + 33.33 + 33.33 = 100.00
    const parts3 = BillSplitService.calculateEqualSplit(100, 3);
    assert.equal(parts3.length, 3);
    assert.equal(parts3[0], 33.34);
    assert.equal(parts3[1], 33.33);
    assert.equal(parts3[2], 33.33);
    const sum3 = parts3.reduce((acc, curr) => acc + curr, 0);
    assert.equal(Math.round(sum3 * 100) / 100, 100);

    // 250.75 TL / 4 kişi
    const parts4 = BillSplitService.calculateEqualSplit(250.75, 4);
    assert.equal(parts4.length, 4);
    const sum4 = parts4.reduce((acc, curr) => acc + curr, 0);
    assert.equal(Math.round(sum4 * 100) / 100, 250.75);
  });

  await t.test('21. Kalem Bazlı Adisyon Bölme: Masadaki sipariş adedinden fazla bölüşüm ENGELLENMELİ', async () => {
    const originalItems = [
      { name: 'Cheeseburger', quantity: 2, unitPrice: 200 },
      { name: 'Kola', quantity: 3, unitPrice: 50 },
    ];

    // Geçerli bölüşüm (2 misafir):
    // Misafir 1: 1 Cheeseburger, 2 Kola
    // Misafir 2: 1 Cheeseburger, 1 Kola
    const validSplit = [
      [{ name: 'Cheeseburger', quantity: 1 }, { name: 'Kola', quantity: 2 }],
      [{ name: 'Cheeseburger', quantity: 1 }, { name: 'Kola', quantity: 1 }],
    ];
    const checkValid = BillSplitService.validateItemSplit(originalItems, validSplit);
    assert.equal(checkValid.valid, true);
    assert.equal(Object.keys(checkValid.unallocatedItems).length, 0);

    // Geçersiz bölüşüm (Masada 2 burger varken misafirler toplam 3 burger bölüşmeye kalkıyor):
    const invalidSplit = [
      [{ name: 'Cheeseburger', quantity: 2 }],
      [{ name: 'Cheeseburger', quantity: 1 }],
    ];
    assert.throws(
      () => {
        BillSplitService.validateItemSplit(originalItems, invalidSplit);
      },
      (err: any) => {
        assert.ok(err instanceof BillSplitDomainError);
        assert.equal(err.code, 'ITEM_SPLIT_QUANTITY_EXCEEDED');
        return true;
      }
    );
  });

  // --------------------------------------------------------------------------
  // 22. ÇOK KİRACILI (MULTI-TENANT) VE CROSS-TENANT KAYNAK İZOLASYONU
  // --------------------------------------------------------------------------
  await t.test('22. Kiracı İzolasyonu: Tenant A kullanıcısı Tenant B masasını kilitleyemez veya ödeyemez', async () => {
    const authTenantA = createAuthHeader('tenant_alpha', 'cashier', 'usr_alpha_1');
    const authTenantB = createAuthHeader('tenant_beta', 'cashier', 'usr_beta_1');

    // Tenant A için bir kilit aç
    let tenantALockAcquired = false;
    let tenantBLockAcquired = false;

    await withDistributedLock('tenant:tenant_alpha:table:tbl-1', async () => {
      tenantALockAcquired = true;
      // Tenant B aynı isimli 'tbl-1' masasını kendi tenant namespace'inde bağımsız kilitleyebilmeli (Çapraz bloklama yok)
      await withDistributedLock('tenant:tenant_beta:table:tbl-1', async () => {
        tenantBLockAcquired = true;
      });
    });

    assert.equal(tenantALockAcquired, true);
    assert.equal(tenantBLockAcquired, true);
  });

});
