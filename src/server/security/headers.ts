import { NextResponse } from 'next/server';

/**
 * MasaLink Güvenlik Başlıkları (HTTP Security Headers)
 * 
 * Next.js 14 mimarisine uygun olarak hem next.config.js hem de Edge Middleware
 * katmanında iki kademeli (Defense-in-Depth) olarak enjekte edilir.
 * 
 * CSP Allow-List:
 * - Uygulamanın çalışmasını bozmadan (Tailwind, Next.js hydration, Framer Motion, Canvas Confetti)
 * - Mutfak/Kasa yerel termal yazıcı köprüsü (Print Bridge: 28443)
 * - Türkiye regülasyonlarına tabi online ödeme ağ geçitleri (Iyzico & PayTR iframeleri)
 * için minimum gerekli kaynakları titizlikle izinlendirir.
 */

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://static.iyzipay.com https://www.paytr.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: blob:",
  "font-src 'self' data: https:",
  "connect-src 'self' https: wss: http://127.0.0.1:28443 https://local.masalink.com:28443 https://*.iyzipay.com https://www.paytr.com",
  "frame-src 'self' https://www.paytr.com https://*.iyzipay.com https://sandbox-api.iyzipay.com",
  "frame-ancestors 'none'",
  "form-action 'self' https://*.iyzipay.com https://www.paytr.com",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), browsing-topics=()',
};

/**
 * Verilen NextResponse nesnesine tüm güvenlik başlıklarını eksiksiz enjekte eder.
 */
export function applySecurityHeaders(res: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(key, value);
  }
  return res;
}
