import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { structuredLogger } from '@/server/observability/logger';
import { ValidationError } from '@/server/validation/adminSchemas';
import { OrderDomainError } from '@/server/services/orderService';
import { PaymentDomainError } from '@/server/payment/paymentService';
import { TableVersionConflictError } from '@/server/db/tableRepository';
import { TenantUnauthorizedError } from '@/server/db/tenantContext';
import { applySecurityHeaders } from '@/server/security/headers';

/**
 * MasaLink Güvenli Hata Yönetimi & Bilgi Sızıntısı Kalkanı (Error Sanitization)
 * 
 * Production ortamında istemciye asla:
 * - Stack trace (hata yığın izi)
 * - Prisma / Veri tabanı hata mesajı
 * - SQL sorgusu veya iç tablo/sütun modelleri
 * - Sunucu dosya yolları (C:\..., /Users/..., node_modules)
 * - Ortam değişkenleri ve gizli anahtarlar
 * sızdırılamaz.
 * 
 * Bunun yerine istemciye standart `correlationId` ve genel (generic) bir hata mesajı
 * döner; hatanın tüm teknik ayrıntıları ve yığın izi yalnızca sunucu tarafında
 * aynı `correlationId` ile yapısal JSON formatında loglanır.
 */

const SENSITIVE_PATTERNS = [
  /prisma/i,
  /select\s+.*\s+from/i,
  /insert\s+into/i,
  /update\s+.*\s+set/i,
  /delete\s+from/i,
  /postgresql:\/\//i,
  /mysql:\/\//i,
  /sqlite:\/\//i,
  /node_modules/i,
  /[a-z]:\\[a-z0-9_\-\\]+/i, // Windows path
  /\/users\/[a-z0-9_\-\/]+/i,  // Unix user path
  /\.ts:\d+:\d+/i,
  /\.js:\d+:\d+/i,
  /connection\s+refused/i,
  /syntax\s+error/i,
  /secret/i,
  /password/i,
  /database/i,
  /table\s+.*does\s+not\s+exist/i,
  /column\s+.*does\s+not\s+exist/i,
  /unique\s+constraint/i,
];

function containsSensitiveData(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

export function extractOrGenerateCorrelationId(req?: NextRequest): string {
  if (req) {
    const fromHeader = req.headers.get('x-correlation-id') || req.headers.get('x-request-id');
    if (fromHeader && fromHeader.trim().length > 0) {
      return fromHeader.trim();
    }
  }
  return `trc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

export interface ErrorResponseOptions {
  fallbackMessage?: string;
  defaultStatus?: number;
  tenantId?: string;
  tableId?: string;
}

export function safeErrorResponse(
  err: unknown,
  req?: NextRequest,
  options: ErrorResponseOptions = {}
): NextResponse {
  const correlationId = extractOrGenerateCorrelationId(req);
  const isProd = process.env.NODE_ENV === 'production';
  const defaultFallback = 'İşlem sırasında bir hata oluştu. Lütfen daha sonra tekrar deneyiniz.';
  const fallbackMessage = options.fallbackMessage || defaultFallback;

  // 1. Sunucu tarafında tam teknik hatayı correlationId ile yapısal logla
  structuredLogger.error(
    `[ApiError: ${options.fallbackMessage || 'Request Failed'}]`,
    err,
    {
      correlationId,
      tenantId: options.tenantId,
      tableId: options.tableId,
      event: 'api_unhandled_or_domain_error',
    }
  );

  // 2. Güvenli Alan Doğrulama Hatası (Client Validation Error - 400)
  if (err instanceof ValidationError) {
    const safeMsg = containsSensitiveData(err.message) ? 'Geçersiz parametre biçimi.' : err.message;
    const response = NextResponse.json(
      {
        success: false,
        errorCode: 'VALIDATION_ERROR',
        error: safeMsg,
        field: err.field,
        correlationId,
      },
      { status: 400 }
    );
    return applySecurityHeaders(response);
  }

  // 3. İyimser Kilit Çakışması (Optimistic Concurrency Conflict - 409)
  if (err instanceof TableVersionConflictError) {
    const response = NextResponse.json(
      {
        success: false,
        errorCode: 'RACE_CONDITION_CONFLICT',
        error: 'Masa sipariş sürümü güncel değil. Lütfen masayı yenileyip tekrar deneyiniz.',
        currentVersion: err.currentVersion,
        correlationId,
      },
      { status: 409 }
    );
    return applySecurityHeaders(response);
  }

  // 4. Kiracı Yetkilendirme Hatası (Tenant Unauthorized - 401)
  if (err instanceof TenantUnauthorizedError) {
    const response = NextResponse.json(
      {
        success: false,
        errorCode: 'TENANT_UNAUTHORIZED',
        error: 'Erişim engellendi: Geçerli kiracı oturumu veya kimliği bulunamadı.',
        correlationId,
      },
      { status: 401 }
    );
    return applySecurityHeaders(response);
  }

  // 5. Bilinen İş Alanı (Domain) Hataları (OrderDomainError / PaymentDomainError)
  if (err instanceof OrderDomainError) {
    const safeMsg = containsSensitiveData(err.message) && isProd
      ? 'Sipariş işlenirken bir sorun oluştu.'
      : err.message;

    const response = NextResponse.json(
      {
        success: false,
        errorCode: err.code || 'ORDER_DOMAIN_ERROR',
        error: safeMsg,
        correlationId,
      },
      { status: 400 }
    );
    return applySecurityHeaders(response);
  }

  if (err instanceof PaymentDomainError) {
    const safeMsg = containsSensitiveData(err.message) && isProd
      ? 'Ödeme işlemi sırasında bir hata oluştu.'
      : err.message;

    const response = NextResponse.json(
      {
        success: false,
        errorCode: err.code || 'PAYMENT_DOMAIN_ERROR',
        error: safeMsg,
        correlationId,
      },
      { status: 400 }
    );
    return applySecurityHeaders(response);
  }

  // 6. Payload Too Large (HTTP 413)
  if (
    (err as any)?.status === 413 ||
    (err as any)?.name === 'PayloadTooLargeError' ||
    (err as any)?.errorCode === 'PAYLOAD_TOO_LARGE'
  ) {
    const response = NextResponse.json(
      {
        success: false,
        errorCode: 'PAYLOAD_TOO_LARGE',
        error: (err as any).message || 'İstek gövdesi izin verilen boyuttan büyüktür.',
        correlationId,
      },
      { status: 413 }
    );
    return applySecurityHeaders(response);
  }

  // 6. Bilinmeyen, Prisma, Veritabanı veya Altyapı Hataları (500)
  // Production ortamında kesinlikle generic hata dönülür ve iç detaylar gizlenir.
  const rawMessage = (err as any)?.message || '';
  const isPrismaOrDb =
    (err as any)?.name?.startsWith('Prisma') ||
    (err as any)?.code?.startsWith('P20') ||
    containsSensitiveData(rawMessage);

  const statusCode = (err as any)?.statusCode || options.defaultStatus || 500;

  let publicMessage = fallbackMessage;
  if (!isProd && !isPrismaOrDb && rawMessage) {
    // Sadece development ortamında ve veri tabanı hatası değilse ham mesaj gösterilir
    publicMessage = rawMessage;
  }

  const response = NextResponse.json(
    {
      success: false,
      errorCode: statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'API_ERROR',
      error: publicMessage,
      correlationId,
    },
    { status: statusCode }
  );

  return applySecurityHeaders(response);
}
