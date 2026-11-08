import { NextRequest, NextResponse } from 'next/server';
import { PaymentService, PaymentDomainError } from '@/server/payment/paymentService';
import { PaymentProviderType, PaymentBasketItem } from '@/server/payment/types';
import { getClientIp } from '@/utils/pinRateLimiter';
import { requireTenant } from '@/server/security/authGuard';
import { validateInitiatePayment } from '@/server/validation/adminSchemas';
import { readJsonBodyWithLimit } from '@/server/security/bodyLimit';
import { RateLimitEngine } from '@/server/security/rateLimitEngine';
import { safeErrorResponse } from '@/server/security/errorHandler';

export async function POST(req: NextRequest) {
  try {
    const tenantRes = requireTenant(req);
    if (!tenantRes.ok) return tenantRes.errorResponse;
    const tenantId = tenantRes.data.tenantId;

    const rawBody = await readJsonBodyWithLimit(req);
    const validated = validateInitiatePayment(rawBody);

    const clientIp = getClientIp(req);

    const {
      branchId,
      tableId,
      tableCode,
      sessionId,
      amount,
      currency = 'TRY',
      provider, // 'IYZICO' | 'PAYTR'
      customerName = 'Masa Misafiri',
      customerEmail = 'misafir@masalink.com',
      customerPhone,
      items = [],
      isPartialPayment = false,
      guestName,
      callbackUrl,
    } = validated;

    // Çok Boyutlu Ödeme Başlatma Hız Sınırı (Masa + IP)
    const rateCheck = await RateLimitEngine.evaluate(req, { tableId, tenantId });
    if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;

    const basketItems: PaymentBasketItem[] = (items || []).map((it: any, idx: number) => ({
      id: it.id || `item-${idx + 1}`,
      name: it.name,
      price: it.price,
      quantity: it.quantity,
      category: it.category,
    }));

    // Default Callback URL
    const origin = req.nextUrl.origin || 'http://localhost:3000';
    const finalCallbackUrl = callbackUrl || `${origin}/api/payment/callback`;

    const result = await PaymentService.initiateOnlinePayment(
      {
        tenantId,
        branchId,
        tableId,
        tableCode: tableCode || tableId,
        sessionId,
        amount,
        currency,
        customer: {
          name: customerName,
          email: customerEmail,
          phone: customerPhone,
          ip: clientIp,
        },
        items: basketItems,
        callbackUrl: finalCallbackUrl,
        isPartialPayment,
        guestName,
      },
      provider as PaymentProviderType
    );

    return NextResponse.json({
      success: true,
      provider: result.provider,
      transactionId: result.transactionId,
      merchantOrderId: result.merchantOrderId,
      amount: result.amount,
      currency: result.currency,
      paymentUrl: result.paymentUrl,
      token: result.token,
      checkoutFormContent: result.checkoutFormContent,
      iframeUrl: result.iframeUrl,
    });
  } catch (error: any) {
    return safeErrorResponse(error, req, {
      fallbackMessage: 'Ödeme başlatılırken bir sunucu hatası oluştu.',
    });
  }
}
