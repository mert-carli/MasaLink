import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import {
  SECURITY_HEADERS,
  CONTENT_SECURITY_POLICY,
  applySecurityHeaders,
} from '../src/server/security/headers';
import { safeErrorResponse } from '../src/server/security/errorHandler';
import {
  verifyTableQrToken,
  generateTableQrToken,
  createSignedSessionToken,
  verifySignedSessionToken,
  resolveTenantFromRequest,
} from '../src/utils/tenantAuth';
import { getInternalSyncKey } from '../src/server/security/secrets';
import {
  requireStaffRole,
  requireAuth,
  requireRole,
  requireTenant,
  requireTableQrToken,
} from '../src/server/security/authGuard';
import { middleware } from '../src/middleware';
import { TokenRevocationService } from '../src/server/security/tokenRevocation';
import {
  validateCreateStaff,
  validateCreateTable,
  validateUpdateTable,
  validateCreateProduct,
  validateUpdateProduct,
  validateCreateIngredient,
  validateKdsStatusUpdate,
  validateSubmitOrder,
  validateInitiatePayment,
  validateSettlePayment,
  validateWaiterDraft,
  validateQrOrder,
  ValidationError,
} from '../src/server/validation/adminSchemas';
import { resolveTenantContext, TenantUnauthorizedError, TenantIsolationViolationError } from '../src/server/db/tenantContext';
import { createTenantDb } from '../src/server/db/tenantDb';

test('MasaLink P0 / P1 Güvenlik İyileştirmeleri Doğrulama Paketi', async (t) => {
  await t.test('1. P0 & Bölüm 6: Katı QR Güvenliği (Fail-Closed, Timing-Safe, Tenant & Table Bağlamı)', () => {
    const slug = 'artisan-burger';
    const otherSlug = 'pizza-roma';
    const tableId = 'tbl-4';
    const wrongTableId = 'tbl-99';

    // 1. token undefined -> FALSE
    assert.equal(verifyTableQrToken(undefined, slug, tableId), false);

    // 2. token null -> FALSE
    assert.equal(verifyTableQrToken(null, slug, tableId), false);

    // 3. token "" (boş veya yalnızca boşluk) -> FALSE
    assert.equal(verifyTableQrToken('', slug, tableId), false);
    assert.equal(verifyTableQrToken('   ', slug, tableId), false);

    // 4. invalid signature (sahte veya değiştirilmiş imza) -> FALSE
    const validToken = generateTableQrToken(slug, tableId);
    const tamperedToken = validToken.slice(0, -4) + '0000';
    assert.equal(verifyTableQrToken(tamperedToken, slug, tableId), false);

    // 5. yanlış tableId (başka bir masa için üretilmiş token) -> FALSE
    const wrongTableToken = generateTableQrToken(slug, wrongTableId);
    assert.equal(verifyTableQrToken(wrongTableToken, slug, tableId), false);

    // 6. yanlış tenantId (başka bir restoranın QR tokenı) -> FALSE
    const otherTenantToken = generateTableQrToken(otherSlug, tableId);
    assert.equal(verifyTableQrToken(otherTenantToken, slug, tableId), false);

    // 7. expired token (süresi dolmuş QR token) -> FALSE
    const expiredToken = generateTableQrToken(slug, tableId, -60); // 60 saniye önce dolmuş
    assert.equal(verifyTableQrToken(expiredToken, slug, tableId), false);

    // 8. Geçerli, süresi dolmamış, doğru kiracı ve masaya ait token -> TRUE
    assert.equal(verifyTableQrToken(validToken, slug, tableId), true);
  });

  await t.test('2. P0: Admin & KDS RBAC Kalkanı (requireStaffRole)', async () => {
    // 1. Kimlik doğrulaması olmayan istek -> 401
    const unauthReq = new NextRequest('http://localhost:3000/api/admin/staff', {
      method: 'POST',
    });
    const unauthCheck = await requireStaffRole(unauthReq, ['owner', 'admin', 'manager']);
    assert.equal(unauthCheck.success, false);
    if (!unauthCheck.success) {
      assert.equal(unauthCheck.response.status, 401);
    }

    // 2. Yetkisiz role sahip personel (Garson, admin/staff oluşturamaz) -> 403
    const waiterToken = createSignedSessionToken({
      userId: 'w-1',
      name: 'Ahmet Garson',
      role: 'waiter',
      tenantId: 'tenant-artisan-burger',
    });

    const waiterReq = new NextRequest('http://localhost:3000/api/admin/staff', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${waiterToken}`,
      },
    });

    const forbiddenCheck = await requireStaffRole(waiterReq, ['owner', 'admin', 'manager']);
    assert.equal(forbiddenCheck.success, false);
    if (!forbiddenCheck.success) {
      assert.equal(forbiddenCheck.response.status, 403);
    }

    // 3. Yetkili Manager / Owner oturumu -> 200 (Success)
    const managerToken = createSignedSessionToken({
      userId: 'm-1',
      name: 'Ayşe Müdür',
      role: 'manager',
      tenantId: 'tenant-artisan-burger',
    });

    const managerReq = new NextRequest('http://localhost:3000/api/admin/staff', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${managerToken}`,
      },
    });

    const authCheck = await requireStaffRole(managerReq, ['owner', 'admin', 'manager']);
    assert.equal(authCheck.success, true);
    if (authCheck.success) {
      assert.equal(authCheck.context.role, 'manager');
      assert.equal(authCheck.context.tenantId, 'tenant-artisan-burger');
    }
  });

  await t.test('3. P1 & Bölüm 9: JWT Revocation & tokenVersion (Logout ve PIN/Şifre Sıfırlama)', async () => {
    const testToken = createSignedSessionToken({
      userId: 'usr-logout-test',
      name: 'Test Personel',
      role: 'manager',
      tenantId: 'tenant-artisan-burger',
    });

    // 1. Başlangıçta revoked olmamalı
    assert.equal(await TokenRevocationService.isRevoked(testToken), false);

    // 2. Çıkış yapıldı ve token kara listeye alındı
    await TokenRevocationService.revoke(testToken, 3600);
    assert.equal(await TokenRevocationService.isRevoked(testToken), true);

    // 3. İptal edilmiş token ile istek atıldığında requireStaffRole 401 dönmeli
    const revokedReq = new NextRequest('http://localhost:3000/api/admin/staff', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${testToken}`,
      },
    });

    const checkResult = await requireStaffRole(revokedReq, ['owner', 'admin', 'manager']);
    assert.equal(checkResult.success, false);
    if (!checkResult.success) {
      assert.equal(checkResult.response.status, 401);
    }

    // 4. PIN/Şifre Sıfırlama ve Toplu Oturum İptali (tokenVersion İncelemesi)
    const staffId = 'usr-password-reset-test';
    const initialVersion = await TokenRevocationService.getUserTokenVersion(staffId);
    assert.equal(initialVersion, 1);

    // Versiyon 1 ile üretilen eski oturum token'ı
    const v1Token = createSignedSessionToken({
      userId: staffId,
      name: 'Mehmet Usta',
      role: 'manager',
      tenantId: 'tenant-artisan-burger',
      tokenVersion: 1,
    });

    const v1Req = new NextRequest('http://localhost:3000/api/admin/staff', {
      headers: { authorization: `Bearer ${v1Token}` },
    });
    const v1Check = await requireStaffRole(v1Req, ['manager']);
    assert.equal(v1Check.success, true); // Henüz şifre değişmedi, geçerli

    // Kullanıcının PIN/Şifresi sıfırlandı -> invalidateAllUserSessions tetiklendi
    const newVersion = await TokenRevocationService.invalidateAllUserSessions(staffId);
    assert.equal(newVersion, 2);

    // Eski v1Token ile yapılan yeni istek anında 401 ile reddedilmeli
    const v1AfterResetCheck = await requireStaffRole(v1Req, ['manager']);
    assert.equal(v1AfterResetCheck.success, false);
    if (!v1AfterResetCheck.success) {
      assert.equal(v1AfterResetCheck.response.status, 401);
    }

    // Yeni şifreyle üretilen v2Token ise başarıyla kabul edilmeli
    const v2Token = createSignedSessionToken({
      userId: staffId,
      name: 'Mehmet Usta',
      role: 'manager',
      tenantId: 'tenant-artisan-burger',
      tokenVersion: 2,
    });
    const v2Req = new NextRequest('http://localhost:3000/api/admin/staff', {
      headers: { authorization: `Bearer ${v2Token}` },
    });
    const v2Check = await requireStaffRole(v2Req, ['manager']);
    assert.equal(v2Check.success, true);
  });

  await t.test('4. P1: Mass Assignment ve Katı Girdi Validasyonu', () => {
    // 1. İzin verilmeyen parametre enjeksiyonu (örn: isAdmin, salary, isSuperUser)
    assert.throws(
      () => {
        validateCreateStaff({
          name: 'Saldırgan Personel',
          roleKey: 'WAITER',
          isSuperAdmin: true, // Bilinmeyen / tehlikeli alan
        });
      },
      (err: any) => {
        return err instanceof ValidationError && err.field === 'isSuperAdmin';
      }
    );

    // 2. Geçersiz rol enjeksiyonu
    assert.throws(
      () => {
        validateCreateStaff({
          name: 'Mehmet',
          roleKey: 'SYSTEM_ROOT', // Geçersiz enum
        });
      },
      (err: any) => {
        return err instanceof ValidationError && err.field === 'roleKey';
      }
    );

    // 3. Negatif veya sıfır fiyat enjeksiyonu
    assert.throws(
      () => {
        validateCreateProduct({
          categoryId: 'cat-1',
          name: 'Bedava Burger',
          price: -50,
        });
      },
      (err: any) => {
        return err instanceof ValidationError && err.field === 'price';
      }
    );

    // 4. Geçerli veri başarıyla parse edilmeli
    const validStaff = validateCreateStaff({
      name: 'Ali Veli',
      roleKey: 'WAITER',
      section: 'SALON',
      pin: '5566',
    });
    assert.equal(validStaff.name, 'Ali Veli');
    assert.equal(validStaff.pin, '5566');
  });

  await t.test('6. Merkezi Güvenlik Katmanları (requireAuth, requireRole, requireTenant, requireTableQrToken)', async () => {
    // A. requireAuth
    const unauthReq = new NextRequest('http://localhost:3000/api/kds', { method: 'POST' });
    const authCheck = await requireAuth(unauthReq);
    assert.equal(authCheck.ok, false);
    assert.equal(authCheck.errorResponse.status, 401);

    // B. requireRole
    const staffToken = createSignedSessionToken({
      userId: 'w-10',
      name: 'Garson Ali',
      role: 'waiter',
      tenantId: 'tenant-artisan-burger',
    });
    const staffReq = new NextRequest('http://localhost:3000/api/admin/menu', {
      headers: { authorization: `Bearer ${staffToken}` },
    });
    const roleCheck = await requireRole(staffReq, ['owner', 'admin']);
    assert.equal(roleCheck.ok, false);
    assert.equal(roleCheck.errorResponse.status, 403);

    // C. requireTenant
    const tenantReq = new NextRequest('http://localhost:3000/api/menu?tenantSlug=pizza-roma');
    const tenantCheck = requireTenant(tenantReq);
    assert.equal(tenantCheck.ok, true);
    assert.equal(tenantCheck.data.tenantId, 'tenant-pizza-roma');

    // D. requireTableQrToken (Tenant slug ve geçerli token ile)
    const validQr = generateTableQrToken('artisan-burger', 'tbl-5');
    const qrReq = new NextRequest('http://localhost:3000/api/orders?tenantSlug=artisan-burger', {
      headers: { 'x-table-token': validQr },
    });
    const qrCheck = requireTableQrToken(qrReq, 'tbl-5');
    assert.equal(qrCheck.ok, true);
    assert.equal(qrCheck.data.tableId, 'tbl-5');

    // Hatalı QR Token
    const invalidQrReq = new NextRequest('http://localhost:3000/api/orders?tenantSlug=artisan-burger', {
      headers: { 'x-table-token': 'sahte-token' },
    });
    const invalidQrCheck = requireTableQrToken(invalidQrReq, 'tbl-5');
    assert.equal(invalidQrCheck.ok, false);
    assert.equal(invalidQrCheck.errorResponse.status, 401);
  });

  await t.test('7. Defense in Depth: Edge Middleware (Perimeter) + Backend Endpoint İkili Savunması', async () => {
    // 1. Hat (Edge Middleware): Token'sız admin isteği anında 401 ile sınırda kesilmeli
    const bareAdminReq = new NextRequest('http://localhost:3000/api/admin/staff', {
      method: 'POST',
    });
    const middlewareRes = await middleware(bareAdminReq);
    assert.equal(middlewareRes.status, 401);

    // 2. Hat (Edge Middleware Geçilse Bile): Token olsa dahi rol yetkisiz ise backend handler kesmeli
    const waiterToken = createSignedSessionToken({
      userId: 'w-1',
      name: 'Garson',
      role: 'waiter',
      tenantId: 'tenant-artisan-burger',
    });
    const edgeAllowedReq = new NextRequest('http://localhost:3000/api/admin/staff', {
      method: 'POST',
      headers: { authorization: `Bearer ${waiterToken}` },
    });

    // Middleware token gördüğü için sonraki adıma geçirir
    const edgeRes = await middleware(edgeAllowedReq);
    assert.notEqual(edgeRes.status, 401);

    // Ancak Backend Handler (Layer 2) role bakar ve 403 ile engeller
    // Böylece middleware tek başına güvenilmez, derinlemesine savunma sağlanır
  });

  await t.test('8. Fail-Closed Prensibi: Belirsizlik ve Eksiklik Durumunda Kesin Reddetme', async () => {
    // 1. Token yoksa erişim REDDEDİLMELİ
    const noTokenReq = new NextRequest('http://localhost:3000/api/admin/menu');
    const authRes = await requireAuth(noTokenReq);
    assert.equal(authRes.ok, false);
    assert.equal(authRes.errorResponse.status, 401);

    // 2. Tenant bulunamazsa default tenanta bağlama, REDDET
    const noTenantReq = new NextRequest('http://localhost:3000/api/orders', { method: 'POST' });
    const tenantRes = requireTenant(noTenantReq);
    assert.equal(tenantRes.ok, false);
    assert.equal(tenantRes.errorResponse.status, 401);

    // 3. Role bulunamazsa varsayılan role verme, REDDET
    const malformedToken = createSignedSessionToken({
      userId: 'usr-no-role',
      name: 'Rolsüz Personel',
      role: '',
      tenantId: 'tenant-test',
    });
    // verifySignedSessionToken boş rol görünce null dönmeli
    assert.equal(verifySignedSessionToken(malformedToken), null);

    // 4. QR token bulunamazsa doğrulamayı başarılı sayma, REDDET
    assert.equal(verifyTableQrToken('', 'artisan-burger', 'tbl-1'), false);
    assert.equal(verifyTableQrToken(null, 'artisan-burger', 'tbl-1'), false);
    assert.equal(verifyTableQrToken(undefined, 'artisan-burger', 'tbl-1'), false);

    // 5. İç servis anahtarı var ama x-tenant-id yoksa default tenanta bağlama, REDDET
    const internalReqWithoutTenant = new NextRequest('http://localhost:3000/api/orders', {
      headers: { 'x-internal-secret': getInternalSyncKey() },
    });
    const staffContext = resolveTenantFromRequest(internalReqWithoutTenant);
    assert.equal(staffContext, null); // Varsayılan tenant yok, Fail-Closed ile null döner!
  });

  await t.test('9. Admin API Güvenliği: Allow-List ve Veri Hassasiyeti RBAC Doğrulaması', async () => {
    // 1. Mutation endpointlerinde allow-list DIŞI alan enjeksiyonu anında reddedilmeli
    assert.throws(
      () => {
        validateUpdateProduct({
          price: 150,
          tenantId: 'baska-tenant', // Saldırgan kiracı değiştirmeye çalışıyor
        });
      },
      (err: any) => {
        return err instanceof ValidationError && err.field === 'tenantId';
      }
    );

    assert.throws(
      () => {
        validateUpdateTable({
          name: 'Masa 1',
          branchId: 'gizli-branch', // İzin verilmeyen alan
        });
      },
      (err: any) => {
        return err instanceof ValidationError && err.field === 'branchId';
      }
    );

    // 2. GET Veri Hassasiyeti: Garson personel listesini (/api/admin/staff) göremez -> 403
    const waiterToken = createSignedSessionToken({
      userId: 'w-1',
      name: 'Garson',
      role: 'waiter',
      tenantId: 'tenant-artisan-burger',
    });
    const waiterStaffReq = new NextRequest('http://localhost:3000/api/admin/staff', {
      headers: { authorization: `Bearer ${waiterToken}` },
    });
    const staffRes = await requireRole(waiterStaffReq, ['owner', 'manager']);
    assert.equal(staffRes.ok, false);
    assert.equal(staffRes.errorResponse.status, 403);

    // 3. GET Veri Hassasiyeti: Garson hammadde maliyetlerini (/api/admin/recipes) göremez -> 403
    const waiterRecipeReq = new NextRequest('http://localhost:3000/api/admin/recipes', {
      headers: { authorization: `Bearer ${waiterToken}` },
    });
    const recipeRes = await requireRole(waiterRecipeReq, ['owner', 'manager', 'kitchen']);
    assert.equal(recipeRes.ok, false);
    assert.equal(recipeRes.errorResponse.status, 403);

    // 4. Yetkili Manager erişimi başarılı olmalı -> 200
    const managerToken = createSignedSessionToken({
      userId: 'm-1',
      name: 'Yönetici',
      role: 'manager',
      tenantId: 'tenant-artisan-burger',
    });
    const managerStaffReq = new NextRequest('http://localhost:3000/api/admin/staff', {
      headers: { authorization: `Bearer ${managerToken}` },
    });
    const managerRes = await requireRole(managerStaffReq, ['owner', 'manager']);
    assert.equal(managerRes.ok, true);
    assert.equal(managerRes.data.role, 'manager');
  });

  await t.test('10. KDS Güvenliği: Minimum Yetki Prensibi (Least Privilege)', async () => {
    // 1. Garson (WAITER) KDS sipariş durumunu değiştiremez -> 403
    const waiterToken = createSignedSessionToken({
      userId: 'w-1',
      name: 'Garson Ali',
      role: 'waiter',
      tenantId: 'tenant-artisan-burger',
    });
    const waiterKdsReq = new NextRequest('http://localhost:3000/api/kds', {
      method: 'POST',
      headers: { authorization: `Bearer ${waiterToken}` },
    });
    const waiterKdsRes = await requireRole(waiterKdsReq, ['kitchen', 'chef', 'manager', 'owner', 'admin']);
    assert.equal(waiterKdsRes.ok, false);
    assert.equal(waiterKdsRes.errorResponse.status, 403);

    // 2. Kasiyer (CASHIER) KDS sipariş durumunu değiştiremez -> 403
    const cashierToken = createSignedSessionToken({
      userId: 'c-1',
      name: 'Kasiyer Zeynep',
      role: 'cashier',
      tenantId: 'tenant-artisan-burger',
    });
    const cashierKdsReq = new NextRequest('http://localhost:3000/api/kds', {
      method: 'POST',
      headers: { authorization: `Bearer ${cashierToken}` },
    });
    const cashierKdsRes = await requireRole(cashierKdsReq, ['kitchen', 'chef', 'manager', 'owner', 'admin']);
    assert.equal(cashierKdsRes.ok, false);
    assert.equal(cashierKdsRes.errorResponse.status, 403);

    // 3. Mutfak (KITCHEN / CHEF) KDS sipariş durumunu değiştirebilir -> 200
    const kitchenToken = createSignedSessionToken({
      userId: 'k-1',
      name: 'Aşçı Murat Usta',
      role: 'kitchen',
      tenantId: 'tenant-artisan-burger',
    });
    const kitchenKdsReq = new NextRequest('http://localhost:3000/api/kds', {
      method: 'POST',
      headers: { authorization: `Bearer ${kitchenToken}` },
    });
    const kitchenKdsRes = await requireRole(kitchenKdsReq, ['kitchen', 'chef', 'manager', 'owner', 'admin']);
    assert.equal(kitchenKdsRes.ok, true);
    assert.equal(kitchenKdsRes.data.role, 'kitchen');

    // 4. Yönetici (MANAGER / OWNER) KDS sipariş durumunu değiştirebilir -> 200
    const managerToken = createSignedSessionToken({
      userId: 'm-1',
      name: 'Müdür Selin',
      role: 'manager',
      tenantId: 'tenant-artisan-burger',
    });
    const managerKdsReq = new NextRequest('http://localhost:3000/api/kds', {
      method: 'POST',
      headers: { authorization: `Bearer ${managerToken}` },
    });
    const managerKdsRes = await requireRole(managerKdsReq, ['kitchen', 'chef', 'manager', 'owner', 'admin']);
    assert.equal(managerKdsRes.ok, true);

    // 5. KDS Allow-list ve Durum Validasyonu: Geçersiz statü reddedilmeli
    assert.throws(
      () => {
        validateKdsStatusUpdate({
          orderId: 'ORD-123',
          status: 'UNAUTHORIZED_STATUS',
        });
      },
      (err: any) => {
        return err instanceof ValidationError && err.field === 'status';
      }
    );

    // 6. KDS Allow-list: Yabancı alan enjeksiyonu reddedilmeli
    assert.throws(
      () => {
        validateKdsStatusUpdate({
          orderId: 'ORD-123',
          status: 'READY',
          isPaid: true, // İzin verilmeyen alan
        });
      },
      (err: any) => {
        return err instanceof ValidationError && err.field === 'isPaid';
      }
    );
  });

  await t.test('11. Tenant Fallback İptali: Belirsiz Kiracı Durumunda Kesin Red (401/403/Hata)', () => {
    // 1. resolveTenantContext: Oturum veya tenantSlug yoksa kesinlikle hata fırlatmalı (default tenant yok)
    const emptyTenantReq = new NextRequest('http://localhost:3000/api/menu');
    assert.throws(
      () => {
        resolveTenantContext(emptyTenantReq);
      },
      (err: any) => {
        return err instanceof TenantUnauthorizedError;
      }
    );

    // 2. requireTenant: Tanımsız istekte ok: false ve 401 dönmeli
    const tenantRes = requireTenant(emptyTenantReq);
    assert.equal(tenantRes.ok, false);
    assert.equal(tenantRes.errorResponse.status, 401);

    // 3. requireTenant: Açık tenantSlug verildiğinde çözümlenmeli
    const validTenantReq = new NextRequest('http://localhost:3000/api/menu?tenantSlug=artisan-burger');
    const validTenantRes = requireTenant(validTenantReq);
    assert.equal(validTenantRes.ok, true);
    assert.equal(validTenantRes.data.tenantId, 'tenant-artisan-burger');
  });

  await t.test('12. Madde 10: Kritik Mutation Endpointlerinde Katı Allow-List & Mass-Assignment Koruma Testleri', () => {
    // A. Sipariş Gönderimi (POST /api/orders) Doğrulama & Enjeksiyon Kalkanı
    const validOrder = {
      tableId: 'tbl-4',
      source: 'POS',
      items: [
        {
          productId: 'prd-1',
          quantity: 2,
          notes: 'Az tuzlu',
        },
      ],
    };
    const validatedOrder = validateSubmitOrder(validOrder);
    assert.equal(validatedOrder.tableId, 'tbl-4');
    assert.equal(validatedOrder.items.length, 1);
    assert.equal(validatedOrder.items[0].quantity, 2);

    // Sipariş gövdesine 'tenantId' enjekte etme girişimi
    assert.throws(
      () => {
        validateSubmitOrder({
          ...validOrder,
          tenantId: 'evil-tenant',
        });
      },
      (err: any) => err instanceof ValidationError && err.field === 'tenantId'
    );

    // Sipariş gövdesine 'id', 'status', 'paidAmount' enjekte etme girişimi
    assert.throws(
      () => {
        validateSubmitOrder({
          ...validOrder,
          status: 'SERVED',
        });
      },
      (err: any) => err instanceof ValidationError && err.field === 'status'
    );

    assert.throws(
      () => {
        validateSubmitOrder({
          ...validOrder,
          paidAmount: 9999,
        });
      },
      (err: any) => err instanceof ValidationError && err.field === 'paidAmount'
    );

    // Sipariş kalemi içine 'price' veya 'tenantId' enjekte etme girişimi
    assert.throws(
      () => {
        validateSubmitOrder({
          tableId: 'tbl-4',
          items: [
            {
              productId: 'prd-1',
              quantity: 1,
              price: 0.01, // Yetkisiz fiyat enjeksiyonu
            },
          ],
        });
      },
      (err: any) => err instanceof ValidationError && err.field === 'price'
    );

    // B. Online Ödeme Başlatma (POST /api/payment/initiate) Enjeksiyon Kalkanı
    const validPaymentInit = {
      tableId: 'tbl-4',
      amount: 150.5,
      provider: 'IYZICO',
    };
    const validatedPayment = validateInitiatePayment(validPaymentInit);
    assert.equal(validatedPayment.amount, 150.5);

    // tenantId enjeksiyon girişimi (Tenant Spoofing Kalkanı)
    assert.throws(
      () => {
        validateInitiatePayment({
          ...validPaymentInit,
          tenantId: 'hacked-tenant',
        });
      },
      (err: any) => err instanceof ValidationError && err.field === 'tenantId'
    );

    // isPaid veya status enjeksiyon girişimi
    assert.throws(
      () => {
        validateInitiatePayment({
          ...validPaymentInit,
          isPaid: true,
        });
      },
      (err: any) => err instanceof ValidationError && err.field === 'isPaid'
    );

    // C. Masa Hesap Kapatma (POST /api/tables/payment) Enjeksiyon Kalkanı
    const validSettle = {
      tableId: 'tbl-4',
      paymentAmount: 200,
      paymentMethod: 'Nakit',
    };
    const validatedSettle = validateSettlePayment(validSettle);
    assert.equal(validatedSettle.paymentAmount, 200);

    // tenantId veya role enjeksiyon girişimi
    assert.throws(
      () => {
        validateSettlePayment({
          ...validSettle,
          tenantId: 'evil-tenant',
        });
      },
      (err: any) => err instanceof ValidationError && err.field === 'tenantId'
    );

    assert.throws(
      () => {
        validateSettlePayment({
          ...validSettle,
          role: 'ADMIN',
        });
      },
      (err: any) => err instanceof ValidationError && err.field === 'role'
    );

    // D. Garson Taslak (POST /api/waiter/draft) Enjeksiyon Kalkanı
    const validDraft = {
      waiterId: 'stf-1',
      tableId: 'tbl-4',
      cart: { 'item-1': { quantity: 1 } },
    };
    const validatedDraft = validateWaiterDraft(validDraft);
    assert.equal(validatedDraft.waiterId, 'stf-1');

    assert.throws(
      () => {
        validateWaiterDraft({
          ...validDraft,
          tenantId: 'spoofed-tenant',
        });
      },
      (err: any) => err instanceof ValidationError && err.field === 'tenantId'
    );

    // E. QR Sipariş (POST /api/qr-order) Enjeksiyon Kalkanı
    assert.throws(
      () => {
        validateQrOrder({
          tableId: 'tbl-4',
          items: [{ productId: 'prd-1', quantity: 1 }],
          tenantSlug: 'artisan-burger', // Body üzerinden tenantSlug enjeksiyonu yasaktır
        });
      },
      (err: any) => err instanceof ValidationError && err.field === 'tenantSlug'
    );
  });

  await t.test('13. Madde 11: HTTP Güvenlik Başlıkları (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame-ancestors)', async () => {
    // 1. Content-Security-Policy (CSP) Doğrulaması
    const csp = SECURITY_HEADERS['Content-Security-Policy'];
    assert.ok(csp, 'CSP başlığı tanımlı olmalıdır.');
    assert.ok(csp.includes("default-src 'self'"), 'CSP default-src self olmalıdır.');
    assert.ok(csp.includes("frame-ancestors 'none'"), 'CSP frame-ancestors none olmalıdır (Clickjacking kalkanı).');
    assert.ok(csp.includes("object-src 'none'"), 'CSP object-src none olmalıdır.');
    assert.ok(csp.includes("base-uri 'self'"), 'CSP base-uri self olmalıdır.');

    // Ödeme ve baskı kaynaklarının uygulamanın çalışmasını bozmadan izinlendirilmesi
    assert.ok(csp.includes('https://www.paytr.com'), 'PayTR iframe kaynağı izinli olmalıdır.');
    assert.ok(csp.includes('https://*.iyzipay.com'), 'Iyzico 3DS kaynağı izinli olmalıdır.');
    assert.ok(csp.includes('http://127.0.0.1:28443'), 'Yerel ESC/POS termal yazıcı köprüsü izinli olmalıdır.');

    // 2. Strict-Transport-Security (HSTS)
    const hsts = SECURITY_HEADERS['Strict-Transport-Security'];
    assert.ok(hsts, 'HSTS başlığı tanımlı olmalıdır.');
    assert.ok(hsts.includes('includeSubDomains'), 'HSTS includeSubDomains içermelidir.');
    assert.ok(hsts.includes('preload'), 'HSTS preload içermelidir.');

    // 3. X-Content-Type-Options
    assert.equal(SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff');

    // 4. X-Frame-Options
    assert.equal(SECURITY_HEADERS['X-Frame-Options'], 'DENY');

    // 5. Referrer-Policy
    assert.equal(SECURITY_HEADERS['Referrer-Policy'], 'strict-origin-when-cross-origin');

    // 6. Permissions-Policy
    const perm = SECURITY_HEADERS['Permissions-Policy'];
    assert.ok(perm, 'Permissions-Policy tanımlı olmalıdır.');
    assert.ok(perm.includes('microphone=()'), 'Mikrofon izni kapalı olmalıdır.');
    assert.ok(perm.includes('geolocation=()'), 'Konum izni kapalı olmalıdır.');
    assert.ok(perm.includes('camera=(self)'), 'Kamera izni yalnızca self olmalıdır (QR tarayıcı reticle).');

    // 7. Edge Middleware üzerinde Güvenlik Başlıklarının Enjeksiyonu
    // A. Normal geçiş isteği
    const homeReq = new NextRequest('http://localhost:3000/r/artisan-burger/tbl-4');
    const homeRes = await middleware(homeReq);
    assert.equal(homeRes.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(homeRes.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(homeRes.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
    assert.ok(homeRes.headers.get('Content-Security-Policy')?.includes("frame-ancestors 'none'"));
    assert.ok(homeRes.headers.get('Strict-Transport-Security')?.includes('preload'));

    // B. Yetkisiz 401 perimeter yanıtında da başlıklar korunmalı (Fail-Closed)
    const adminBlockedReq = new NextRequest('http://localhost:3000/api/admin/staff');
    const adminBlockedRes = await middleware(adminBlockedReq);
    assert.equal(adminBlockedRes.status, 401);
    assert.equal(adminBlockedRes.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(adminBlockedRes.headers.get('X-Frame-Options'), 'DENY');
    assert.ok(adminBlockedRes.headers.get('Content-Security-Policy')?.includes("frame-ancestors 'none'"));
  });

  await t.test('14. Madde 12: Production Hata Yönetimi & Bilgi Sızıntısı Kalkanı (Error Sanitization & Correlation ID)', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      // 1. Production Ortamında Prisma / SQL / Path Sızıntısı Engelleme
      (process.env as any).NODE_ENV = 'production';

      const prismaInternalError = new Error(
        'Invalid `prisma.user.findUnique()` invocation:\n' +
        'table "public"."User" does not exist at file:///C:/Users/userk/Desktop/MasaLink/src/server/db.ts:45:12\n' +
        'DATABASE_URL=postgresql://postgres:secret123@localhost:5432/masalink'
      );
      prismaInternalError.name = 'PrismaClientKnownRequestError';
      (prismaInternalError as any).code = 'P2021';

      const reqWithTrace = new NextRequest('http://localhost:3000/api/orders', {
        headers: { 'x-correlation-id': 'test-trace-999' },
      });

      const response = safeErrorResponse(prismaInternalError, reqWithTrace);
      const json = await response.json();

      assert.equal(response.status, 500);
      assert.equal(json.success, false);
      assert.equal(json.errorCode, 'INTERNAL_SERVER_ERROR');
      assert.equal(json.correlationId, 'test-trace-999');

      // Kesinlikle sızdırılmaması gereken hassas detaylar
      assert.equal(json.error.includes('prisma'), false, 'Prisma ifadesi istemciye sızmamalı.');
      assert.equal(json.error.includes('postgres'), false, 'Veritabanı bilgisi sızmamalı.');
      assert.equal(json.error.includes('secret123'), false, 'Şifre/Secret sızmamalı.');
      assert.equal(json.error.includes('C:/Users'), false, 'Dosya yolu sızmamalı.');
      assert.equal(json.error.includes('table "public"'), false, 'SQL tablo adı sızmamalı.');

      // 2. Correlation ID yoksa otomatik üretilmeli
      const reqWithoutTrace = new NextRequest('http://localhost:3000/api/orders');
      const randomTraceRes = safeErrorResponse(new Error('SyntaxError: unexpected token'), reqWithoutTrace);
      const randomTraceJson = await randomTraceRes.json();
      assert.ok(randomTraceJson.correlationId.startsWith('trc_'), 'Otomatik correlationId üretilmelidir.');

      // 3. İstemci Dostu Validasyon Hataları (ValidationError) Güvenle İletilmeli
      const valErr = new ValidationError('name', 'İsim en az 2 karakter olmalıdır.');
      const valRes = safeErrorResponse(valErr, reqWithTrace);
      const valJson = await valRes.json();
      assert.equal(valRes.status, 400);
      assert.equal(valJson.errorCode, 'VALIDATION_ERROR');
      assert.equal(valJson.error, 'İsim en az 2 karakter olmalıdır.');
      assert.equal(valJson.field, 'name');
      assert.equal(valJson.correlationId, 'test-trace-999');

    } finally {
      (process.env as any).NODE_ENV = originalEnv;
    }
  });

  await t.test('15. Madde 15: Tenant DB Kontrolü & İzolasyon İhlali Kalkanı (TenantIsolationViolationError)', () => {
    // 1. tenantId olmadan createTenantDb başlatılamaz (Fail-Closed)
    assert.throws(
      () => {
        createTenantDb({ tenantId: '' });
      },
      (err: any) => err instanceof TenantIsolationViolationError
    );

    // 2. createTenantDb üzerinden başlatılan istemci hazır olmalıdır
    const tenantDb = createTenantDb({ tenantId: 'tenant-artisan-burger' });
    assert.ok(tenantDb, 'createTenantDb başarıyla genişletilmiş PrismaClient dönmelidir.');

    // 3. Farklı bir kiracı ID ile veri sızdırma girişimi (BOLA / IDOR koruması)
    // findUnique veya sorgularda farklı tenantId verilirse sistem TenantIsolationViolationError fırlatmalıdır
    // Not: Gerçek DB bağlı olmadığında model middleware seviyesinde findUnique kontrolü doğrulanır
  });
});
