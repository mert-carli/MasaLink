import { NextRequest, NextResponse } from 'next/server';
import { PaymentService } from '@/server/payment/paymentService';

async function handleCallback(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const searchParams = url.searchParams;

    // Iyzico veya PayTR'dan dönen parametreler
    const token = searchParams.get('token') || '';
    const status = searchParams.get('status') || 'success';
    const orderId = searchParams.get('orderId') || searchParams.get('merchant_oid') || '';
    const isSuccess = status === 'success' || status === 'SUCCESS';

    if (isSuccess && orderId) {
      // Ödemeyi sonlandır (Eğer webhook henüz yetişmediyse)
      const record = PaymentService.getPaymentRecord(orderId);
      const paidAmount = record ? record.amount : 0;
      const provider = record ? record.provider : 'IYZICO';

      await PaymentService.finalizeSettlement({
        merchantOrderId: orderId,
        paidAmount,
        provider,
        providerTransactionId: token || orderId,
      });
    }

    // Kullanıcıya şık bir dekont ve masaya dönüş sayfası göster
    const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MasaLink - Ödeme Sonucu</title>
  <style>
    body {
      background: #070a12;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 16px;
    }
    .card {
      background: #0e1526;
      border: 1px solid #1e293b;
      border-radius: 20px;
      padding: 32px 24px;
      max-width: 400px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    .icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      margin-bottom: 20px;
    }
    .success { background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
    .fail { background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
    h2 { margin: 0 0 8px; font-size: 20px; font-weight: 800; }
    p { color: #94a3b8; font-size: 14px; margin: 0 0 24px; line-height: 1.5; }
    .btn {
      display: block;
      background: #f59e0b;
      color: #000;
      text-decoration: none;
      padding: 12px 20px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 14px;
      transition: all 0.2s;
    }
    .btn:hover { background: #d97706; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon ${isSuccess ? 'success' : 'fail'}">${isSuccess ? '✓' : '✕'}</div>
    <h2>${isSuccess ? 'Ödemeniz Başarıyla Alındı!' : 'Ödeme Gerçekleştirilemedi'}</h2>
    <p>${isSuccess ? 'İşleminiz güvenle onaylandı. Masanızın adisyonu kapandı, afiyet olsun!' : 'Ödeme sırasında bir hata oluştu veya işlem iptal edildi. Lütfen tekrar deneyin.'}</p>
    <a href="javascript:window.history.go(-2)" class="btn">Masaya Geri Dön</a>
  </div>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Callback işlenirken hata oluştu' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleCallback(req);
}

export async function POST(req: NextRequest) {
  return handleCallback(req);
}
