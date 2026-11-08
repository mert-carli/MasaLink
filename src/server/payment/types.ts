/**
 * MasaLink Ödeme Alt Sistemi - Tip Tanımları (Payment System Types)
 * 
 * Iyzico, PayTR ve Kasa Fiziksel Ödemeleri (Nakit, POS, Yemek Kartı)
 * için birleşik mimari ve sağlayıcı adaptör arayüzleri.
 */

export type PaymentProviderType = 'IYZICO' | 'PAYTR' | 'MOCK';

export type PaymentMethodType = 'CASH' | 'CARD' | 'MEAL_CARD' | 'ONLINE' | 'OTHER';

export type PaymentStatusType = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED' | 'VOIDED' | 'PARTIAL';

export interface CustomerInfo {
  name: string;
  email: string;
  phone?: string;
  ip: string;
  identityNumber?: string;
  address?: string;
  city?: string;
  country?: string;
}

export interface PaymentBasketItem {
  id: string;
  name: string;
  category?: string;
  price: number;
  quantity: number;
}

export interface InitiatePaymentParams {
  tenantId: string;
  branchId?: string;
  tableId: string;
  tableCode?: string;
  sessionId?: string;
  orderId?: string;
  amount: number;
  currency?: string; // Default: 'TRY'
  customer: CustomerInfo;
  items: PaymentBasketItem[];
  callbackUrl: string;
  isPartialPayment?: boolean;
  guestName?: string;
  idempotencyKey?: string;
}

export interface InitiatePaymentResult {
  success: boolean;
  provider: PaymentProviderType;
  transactionId: string;
  merchantOrderId: string;
  amount: number;
  currency: string;
  paymentUrl?: string;
  token?: string;
  checkoutFormContent?: string;
  iframeUrl?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  provider: PaymentProviderType;
  merchantOrderId: string;
  providerTransactionId: string;
  status: 'SUCCESS' | 'FAILED';
  paidAmount: number;
  currency: string;
  rawPayload: any;
  errorMessage?: string;
}

export interface PaymentRecord {
  id: string;
  tenantId: string;
  tableId: string;
  sessionId?: string;
  provider: PaymentProviderType;
  method: PaymentMethodType;
  status: PaymentStatusType;
  amount: number;
  currency: string;
  merchantOrderId: string;
  providerTransactionId?: string;
  isPartial: boolean;
  guestName?: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export interface IPaymentGateway {
  readonly providerName: PaymentProviderType;
  initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult>;
  verifyWebhook(rawBody: string | Record<string, any>, headers?: Record<string, string>): Promise<WebhookVerificationResult>;
  retrievePaymentResult?(token: string): Promise<{ success: boolean; status: PaymentStatusType; amount: number; raw: any }>;
  refundPayment?(transactionId: string, amount: number, reason?: string): Promise<{ success: boolean; refundId?: string; error?: string }>;
}
