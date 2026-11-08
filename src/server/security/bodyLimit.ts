import { NextRequest, NextResponse } from 'next/server';
import { applySecurityHeaders } from '@/server/security/headers';

export class PayloadTooLargeError extends Error {
  public status = 413;
  public errorCode = 'PAYLOAD_TOO_LARGE';
  public maxBytes: number;
  public receivedBytes?: number;

  constructor(maxBytes: number, receivedBytes?: number) {
    const maxKb = Math.round(maxBytes / 1024);
    const receivedMsg = receivedBytes ? ` (Gönderilen: ~${Math.round(receivedBytes / 1024)} KB)` : '';
    super(`İstek gövdesi izin verilen boyuttan büyüktür. Maksimum: ${maxKb} KB${receivedMsg}.`);
    this.name = 'PayloadTooLargeError';
    this.maxBytes = maxBytes;
    this.receivedBytes = receivedBytes;
  }
}

/**
 * Rota bazlı maksimum gövde (body) boyut limitleri (Bytes)
 */
export const ROUTE_BODY_LIMITS: { prefix: string; maxBytes: number }[] = [
  { prefix: '/api/auth', maxBytes: 64 * 1024 }, // 64 KB (Login / PIN)
  { prefix: '/api/payment/initiate', maxBytes: 256 * 1024 }, // 256 KB
  { prefix: '/api/kds', maxBytes: 128 * 1024 }, // 128 KB
  { prefix: '/api/qr-order', maxBytes: 256 * 1024 }, // 256 KB
  { prefix: '/api/orders', maxBytes: 256 * 1024 }, // 256 KB
  { prefix: '/api/waiter', maxBytes: 256 * 1024 }, // 256 KB
  { prefix: '/api/admin', maxBytes: 1024 * 1024 }, // 1 MB (Toplu menü/reçete)
];

export const DEFAULT_API_BODY_LIMIT = 512 * 1024; // 512 KB

export function getRouteBodyLimit(pathname: string): number {
  for (const rule of ROUTE_BODY_LIMITS) {
    if (pathname.startsWith(rule.prefix)) {
      return rule.maxBytes;
    }
  }
  return DEFAULT_API_BODY_LIMIT;
}

/**
 * Middleware seviyesinde Content-Length başlığı üzerinden erken DoS kalkanı
 */
export function checkRequestContentLength(req: NextRequest): {
  allowed: boolean;
  maxBytes: number;
  contentLength?: number;
  errorResponse?: NextResponse;
} {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();

  // Yalnızca gövde (body) içeren mutasyon metotlarını denetle
  if (!['POST', 'PUT', 'PATCH'].includes(method)) {
    return { allowed: true, maxBytes: DEFAULT_API_BODY_LIMIT };
  }

  const maxBytes = getRouteBodyLimit(pathname);
  const rawLength = req.headers.get('content-length');

  if (rawLength) {
    const bytes = parseInt(rawLength, 10);
    if (!isNaN(bytes) && bytes > maxBytes) {
      const err = new PayloadTooLargeError(maxBytes, bytes);
      const resp = NextResponse.json(
        {
          success: false,
          errorCode: err.errorCode,
          error: err.message,
          maxBytes,
          receivedBytes: bytes,
        },
        { status: 413 }
      );
      return {
        allowed: false,
        maxBytes,
        contentLength: bytes,
        errorResponse: applySecurityHeaders(resp),
      };
    }
  }

  return { allowed: true, maxBytes };
}

/**
 * Route handler içinde gövdeyi belleğe almadan streaming olarak okur ve sınırı denetler.
 * Chunked transfer veya eksik/yanıltıcı Content-Length başlıklarında da 50MB gibi devasa
 * yüklerin belleği (Heap) şişirmesini erkenden reader.cancel() ile engeller.
 */
export async function readJsonBodyWithLimit<T = any>(
  req: NextRequest,
  customMaxBytes?: number
): Promise<T> {
  const maxBytes = customMaxBytes || getRouteBodyLimit(req.nextUrl.pathname);

  // 1. Erken Content-Length başlık kontrolü (Sıfır bellek tüketimi)
  const headerCheck = checkRequestContentLength(req);
  if (!headerCheck.allowed && headerCheck.errorResponse) {
    throw new PayloadTooLargeError(maxBytes, headerCheck.contentLength);
  }

  // 2. Akış (Streaming) Seviyesinde Erken İptal Denetimi
  if (!req.body) {
    return {} as T;
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        totalBytes += value.length;
        if (totalBytes > maxBytes) {
          // ⚠️ Kritik DoS Kalkanı: Maksimum boyut aşıldığı an akışı anında kes ve çöpe at!
          await reader.cancel();
          throw new PayloadTooLargeError(maxBytes, totalBytes);
        }
        chunks.push(value);
      }
    }
  } catch (err) {
    if (err instanceof PayloadTooLargeError) throw err;
    throw err;
  }

  // 3. Güvenli JSON Ayrıştırma
  const fullBuffer = Buffer.concat(chunks);
  if (fullBuffer.length === 0) return {} as T;

  const text = fullBuffer.toString('utf8');
  return JSON.parse(text) as T;
}
