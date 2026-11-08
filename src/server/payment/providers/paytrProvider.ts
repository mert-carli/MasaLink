import crypto from 'crypto';
import {
  IPaymentGateway,
  InitiatePaymentParams,
  InitiatePaymentResult,
  PaymentProviderType,
  WebhookVerificationResult,
} from '../types';

/**
 * MasaLink PayTR Ödeme Sağlayıcı Adaptörü (PayTR iFrame / Direct API)
 * 
 * Türkiye regülasyonlarına ve BDDK/TCMB standartlarına tam uyumlu PayTR entegrasyonu.
 * SHA-256 HMAC imzalama, iFrame token üretimi ve geri bildirim doğrulama.
 */
export class PayTRProvider implements IPaymentGateway {
  public readonly providerName: PaymentProviderType = 'PAYTR';

  private merchantId: string;
  private merchantKey: string;
  private merchantSalt: string;
  private isTestMode: boolean;

  constructor() {
    this.merchantId = process.env.PAYTR_MERCHANT_ID || 'sandbox_merchant_id';
    this.merchantKey = process.env.PAYTR_MERCHANT_KEY || 'sandbox_merchant_key';
    this.merchantSalt = process.env.PAYTR_MERCHANT_SALT || 'sandbox_merchant_salt';
    this.isTestMode = process.env.NODE_ENV !== 'production' || process.env.PAYTR_TEST_MODE === '1';
  }

  /**
   * 1. PayTR iFrame Token Edinme
   */
  public async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    const merchantOrderId = params.idempotencyKey || `ptr_${params.tenantId}_${params.tableId}_${Date.now()}`;
    const paymentAmountKurus = Math.round(params.amount * 100); // PayTR kuruş formatı (100 TL -> 10000)

    const basketItems = (params.items.length > 0 ? params.items : [{ id: 'menu-bill', name: 'Restoran Adisyonu', price: params.amount, quantity: 1 }]).map((i) => [
      i.name || 'Menü Ürünü',
      (i.price * i.quantity).toFixed(2),
      i.quantity || 1,
    ]);
    const userBasketBase64 = Buffer.from(JSON.stringify(basketItems)).toString('base64');

    const userIp = params.customer.ip || '127.0.0.1';
    const userEmail = params.customer.email || 'misafir@masalink.com';
    const userName = params.customer.name || 'Masa Misafiri';
    const userPhone = params.customer.phone || '05555555555';
    const userAddress = params.customer.address || `Masa: ${params.tableCode || params.tableId}`;
    const testModeStr = this.isTestMode ? '1' : '0';
    const noInstallment = '1'; // Restoran ödemelerinde taksit genelde 0/1
    const maxInstallment = '1';
    const currency = 'TL';

    // PayTR Token Hash Hesaplama:
    // SHA256 HMAC (merchant_id + user_ip + merchant_oid + email + payment_amount + user_basket + no_installment + max_installment + currency + test_mode + merchant_salt)
    const hashString = `${this.merchantId}${userIp}${merchantOrderId}${userEmail}${paymentAmountKurus}${userBasketBase64}${noInstallment}${maxInstallment}${currency}${testModeStr}${this.merchantSalt}`;
    const paytrToken = crypto
      .createHmac('sha256', this.merchantKey)
      .update(hashString)
      .digest('base64');

    // Canlı / Sandbox PayTR API İsteği
    if (this.merchantId !== 'sandbox_merchant_id' && process.env.NODE_ENV !== 'test') {
      try {
        const formData = new URLSearchParams();
        formData.append('merchant_id', this.merchantId);
        formData.append('user_ip', userIp);
        formData.append('merchant_oid', merchantOrderId);
        formData.append('email', userEmail);
        formData.append('payment_amount', String(paymentAmountKurus));
        formData.append('paytr_token', paytrToken);
        formData.append('user_basket', userBasketBase64);
        formData.append('user_name', userName);
        formData.append('user_address', userAddress);
        formData.append('user_phone', userPhone);
        formData.append('merchant_ok_url', params.callbackUrl);
        formData.append('merchant_fail_url', `${params.callbackUrl}?status=fail`);
        formData.append('timeout_limit', '30');
        formData.append('currency', currency);
        formData.append('test_mode', testModeStr);
        formData.append('no_installment', noInstallment);
        formData.append('max_installment', maxInstallment);

        const res = await fetch('https://www.paytr.com/odeme/api/get-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
        });

        if (res.ok) {
          const json = await res.json();
          if (json.status === 'success') {
            const token = json.token;
            return {
              success: true,
              provider: 'PAYTR',
              transactionId: token,
              merchantOrderId,
              amount: params.amount,
              currency: 'TRY',
              token,
              iframeUrl: `https://www.paytr.com/odeme/guvenli/${token}`,
            };
          }
        }
      } catch (err) {
        console.warn('[PayTRProvider] API isteği başarısız, simülasyon moduna dönülüyor:', err);
      }
    }

    // Geliştirme ve Test Ortamı Simülasyonu (Production Ortamında KESİNLİKLE Engellenir)
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[GÜVENLİK KRİTİK] Production ortamında PayTR sağlayıcısı simülasyon moduna geçemez (Fail-Closed). Geçerli canlı kimlik bilgileri zorunludur.'
      );
    }

    const mockToken = `paytr_tok_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const mockCallbackUrl = `${params.callbackUrl}?merchant_oid=${merchantOrderId}&status=success&total_amount=${paymentAmountKurus}`;

    return {
      success: true,
      provider: 'PAYTR',
      transactionId: mockToken,
      merchantOrderId,
      amount: params.amount,
      currency: 'TRY',
      token: mockToken,
      iframeUrl: mockCallbackUrl,
      checkoutFormContent: `<!-- PayTR iFrame Simülatörü -->
<div style="background:#0f172a;border:1px solid #334155;border-radius:12px;padding:20px;text-align:center;color:#f8fafc;">
  <div style="font-size:24px;margin-bottom:8px;">💳</div>
  <h4 style="margin:0 0 8px;font-size:15px;color:#38bdf8;">PayTR 3D Secure Doğrulama</h4>
  <p style="font-size:12px;color:#94a3b8;margin:0 0 16px;">Toplam Ödenecek: ₺${params.amount.toFixed(2)}</p>
  <a href="${mockCallbackUrl}" style="background:#059669;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;display:inline-block;">PayTR ile Onayla ve Öde</a>
</div>`,
    };
  }

  /**
   * 2. PayTR Webhook Doğrulama (Bildirim URL'si Kontrolü)
   * 
   * PayTR POST parametreleri:
   * merchant_oid, status ('success' | 'failed'), total_amount (kuruş), hash
   * 
   * İmzalanan dize: merchant_oid + merchant_salt + status + total_amount
   * HMAC-SHA256 (merchant_key)
   */
  public async verifyWebhook(
    rawBody: string | Record<string, any>
  ): Promise<WebhookVerificationResult> {
    const params = typeof rawBody === 'string' ? new URLSearchParams(rawBody) : rawBody;
    const getVal = (key: string): string => {
      if (params instanceof URLSearchParams) return params.get(key) || '';
      return String(params[key] || '');
    };

    const merchantOid = getVal('merchant_oid');
    const status = getVal('status');
    const totalAmount = getVal('total_amount');
    const incomingHash = getVal('hash');

    // Beklenen Hash Hesapla
    const expectedHashString = `${merchantOid}${this.merchantSalt}${status}${totalAmount}`;
    const calculatedHash = crypto
      .createHmac('sha256', this.merchantKey)
      .update(expectedHashString)
      .digest('base64');

    const isValid = this.merchantKey === 'sandbox_merchant_key' || incomingHash === calculatedHash;
    const isSuccess = status === 'success';
    const amountInLira = Number(totalAmount) / 100;

    return {
      isValid,
      provider: 'PAYTR',
      merchantOrderId: merchantOid,
      providerTransactionId: merchantOid,
      status: isSuccess ? 'SUCCESS' : 'FAILED',
      paidAmount: isNaN(amountInLira) ? 0 : amountInLira,
      currency: 'TRY',
      rawPayload: params instanceof URLSearchParams ? Object.fromEntries(params) : params,
      errorMessage: isValid ? undefined : 'PayTR HMAC-SHA256 imza doğrulaması başarısız!',
    };
  }
}
