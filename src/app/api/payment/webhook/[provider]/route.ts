import { NextRequest, NextResponse } from 'next/server';
import { PaymentService } from '@/server/payment/paymentService';
import { PaymentProviderType } from '@/server/payment/types';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider: rawProvider } = await context.params;
    const provider = rawProvider.toUpperCase() as PaymentProviderType;

    if (provider !== 'IYZICO' && provider !== 'PAYTR') {
      return NextResponse.json({ error: 'Geçersiz ödeme sağlayıcısı.' }, { status: 400 });
    }

    const contentType = req.headers.get('content-type') || '';
    let rawBody: any;

    if (contentType.includes('application/json')) {
      rawBody = await req.json();
    } else {
      rawBody = await req.text();
    }

    const headers: Record<string, string> = {};
    req.headers.forEach((val, key) => {
      headers[key] = val;
    });

    const result = await PaymentService.processWebhook(provider, rawBody, headers);

    if (!result.success) {
      if (provider === 'PAYTR') {
        return new Response('PAYTR_WEBHOOK_FAILED', { status: 400 });
      }
      return NextResponse.json({ status: 'failure', error: result.error }, { status: 400 });
    }

    // PayTR entegrasyonu işlem başarılıysa kesinlikle "OK" metni bekler
    if (provider === 'PAYTR') {
      return new Response('OK', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    return NextResponse.json({
      status: 'success',
      isCompleted: result.isCompleted,
      remainingBalance: result.remainingBalance,
    });
  } catch (error: any) {
    console.error('[Payment Webhook Error]:', error);
    return new Response('SERVER_ERROR', { status: 500 });
  }
}
