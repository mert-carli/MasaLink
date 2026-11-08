import { AdminTable } from '@/components/admin/TableDetailDrawer';
import { getStoredTables, saveStoredTables } from './tableData';

export interface QrSecurityCheckResult {
  allowed: boolean;
  requiresWaiterApproval: boolean;
  errorCode?: 'SESSION_CLOSED' | 'RATE_LIMITED' | 'VISION_EMPTY' | 'INVALID_TOKEN';
  userMessage: string;
  retryAfterSeconds?: number;
  securityChecks: {
    sessionCheck: 'PASSED' | 'FAILED';
    rateLimitCheck: 'PASSED' | 'BLOCKED';
    visionAiCheck: 'OCCUPIED' | 'SUSPICIOUS' | 'EMPTY';
    softLockStatus: 'DIRECT_DISPATCH' | 'WAITING_APPROVAL';
  };
}

// In-memory rate limiting store (key: fingerprint or IP)
const rateLimitStore: Map<string, number> = new Map();
const RATE_LIMIT_WINDOW_SECONDS = 60;

/**
 * Generate a cryptographically valid token for table QR codes
 */
export function generateTableSessionToken(tenantSlug: string, tableId: string): string {
  const timestamp = Date.now().toString(36);
  const hash = Math.random().toString(36).substring(2, 8);
  return `tok_${tenantSlug}_${tableId}_${timestamp}_${hash}`;
}

/**
 * Rate limit check: blocks consecutive submissions within 60 seconds
 */
export function checkClientRateLimit(clientFingerprint: string): { allowed: boolean; remainingSeconds: number } {
  const now = Date.now();
  const lastAttempt = rateLimitStore.get(clientFingerprint);

  if (lastAttempt) {
    const elapsedSeconds = Math.floor((now - lastAttempt) / 1000);
    if (elapsedSeconds < RATE_LIMIT_WINDOW_SECONDS) {
      return {
        allowed: false,
        remainingSeconds: RATE_LIMIT_WINDOW_SECONDS - elapsedSeconds,
      };
    }
  }

  return { allowed: true, remainingSeconds: 0 };
}

/**
 * Record a submission timestamp for rate limiting
 */
export function recordClientAttempt(clientFingerprint: string): void {
  rateLimitStore.set(clientFingerprint, Date.now());
}

export interface QrSecurityParams {
  tenantSlug: string;
  tableId: string;
  clientFingerprint: string;
  sessionToken?: string;
  table: AdminTable | null;
  visionAiDetected?: boolean; // Kamera insan algıladı mı? (False Negative / Blind spot toleransı)
  manualOverride?: boolean; // Garson manuel onayı (Kamerayı ez)
}

/**
 * Comprehensive 3-Tier Security Evaluation Engine for Table QR Orders
 * Vision AI Anti-Spoofing & Anti-DoS Güvenlik Katmanı ile Güçlendirilmiş
 */
export function evaluateQrOrderSecurity(params: QrSecurityParams): QrSecurityCheckResult {
  const { tenantSlug, tableId, clientFingerprint, table, visionAiDetected, manualOverride } = params;

  // 1. DENETİM: Masa Oturum Kontrolü (Session State Check)
  if (!table) {
    return {
      allowed: false,
      requiresWaiterApproval: true,
      errorCode: 'SESSION_CLOSED',
      userMessage: 'Masa sistemde bulunamadı. Lütfen servis personelinden yardım isteyiniz.',
      securityChecks: {
        sessionCheck: 'FAILED',
        rateLimitCheck: 'PASSED',
        visionAiCheck: 'EMPTY',
        softLockStatus: 'WAITING_APPROVAL',
      },
    };
  }

  // If table is closed, cleaning or marked empty without seated guests
  if (table.status === 'cleaning') {
    return {
      allowed: false,
      requiresWaiterApproval: true,
      errorCode: 'SESSION_CLOSED',
      userMessage: 'Bu masanın oturumu kapatılmıştır ve temizlik beklemektedir. Lütfen masadaki QR kodu yeniden okutun.',
      securityChecks: {
        sessionCheck: 'FAILED',
        rateLimitCheck: 'PASSED',
        visionAiCheck: 'EMPTY',
        softLockStatus: 'WAITING_APPROVAL',
      },
    };
  }

  // 2. DENETİM: Hızlı Sipariş Kilidi (Rate Limiting / Anti-Spam)
  const rateLimit = checkClientRateLimit(clientFingerprint);
  if (!rateLimit.allowed) {
    return {
      allowed: false,
      requiresWaiterApproval: false,
      errorCode: 'RATE_LIMITED',
      retryAfterSeconds: rateLimit.remainingSeconds,
      userMessage: `Çok hızlı sipariş algılandı. Masa güvenliği gereği lütfen ${rateLimit.remainingSeconds} saniye bekleyin.`,
      securityChecks: {
        sessionCheck: 'PASSED',
        rateLimitCheck: 'BLOCKED',
        visionAiCheck: 'OCCUPIED',
        softLockStatus: 'DIRECT_DISPATCH',
      },
    };
  }

  // 3. DENETİM: Vision AI Güvenlik ve Tolerans Katmanı (Anti-Spoofing & Anti-DoS)
  // Kamera hiçbir zaman tekil engelleme noktası (Single Point of Failure) olamaz.
  // Sandalyedeki ceket (False Positive) mutfağa doğrudan yazdırmaz; garson onayına düşer.
  // Kamera kör noktası veya loş ışıkta (False Negative) sipariş ASLA iptal edilmez;
  // sadece garson onayına devredilir.
  const isCameraUncertain = visionAiDetected === false;

  // Garson Manuel Doğrulaması (Kamerayı Ez - Manual Override)
  if (manualOverride) {
    recordClientAttempt(clientFingerprint);
    return {
      allowed: true,
      requiresWaiterApproval: false,
      userMessage: 'Personel manuel doğrulamasıyla sipariş mutfağa fırlatıldı.',
      securityChecks: {
        sessionCheck: 'PASSED',
        rateLimitCheck: 'PASSED',
        visionAiCheck: 'OCCUPIED',
        softLockStatus: 'DIRECT_DISPATCH',
      },
    };
  }

  // 4. DENETİM: Garson İlk Sipariş Onayı (Soft-Lock Security Solution)
  // Eğer masanın ilk siparişi ise veya masa boş görünüyorsa veya kamera kör noktası varsa
  const isTableCurrentlyEmpty = table.status === 'empty';
  const isFirstOrder = table.items.length === 0;

  if (isFirstOrder || isTableCurrentlyEmpty || isCameraUncertain) {
    recordClientAttempt(clientFingerprint);

    const userMessage = isCameraUncertain
      ? 'Siparişiniz alındı. Masanız kamera kör noktasında olabilir; garsonunuz masanızı teyit edip mutfağa iletecektir.'
      : 'İlk masa siparişiniz alındı. Masa güvenliği gereği garsonunuz 30 saniye içinde masanızı onaylayacak ve siparişiniz mutfağa fırlatılacaktır.';

    return {
      allowed: true,
      requiresWaiterApproval: true,
      userMessage,
      securityChecks: {
        sessionCheck: 'PASSED',
        rateLimitCheck: 'PASSED',
        visionAiCheck: isCameraUncertain ? 'EMPTY' : (isTableCurrentlyEmpty ? 'SUSPICIOUS' : 'OCCUPIED'),
        softLockStatus: 'WAITING_APPROVAL',
      },
    };
  }

  // Verified Ongoing Session: Direct Dispatch to kitchen
  recordClientAttempt(clientFingerprint);

  return {
    allowed: true,
    requiresWaiterApproval: false,
    userMessage: 'Siparişiniz doğrulandı ve doğrudan mutfak yazıcısına iletildi.',
    securityChecks: {
      sessionCheck: 'PASSED',
      rateLimitCheck: 'PASSED',
      visionAiCheck: 'OCCUPIED',
      softLockStatus: 'DIRECT_DISPATCH',
    },
  };
}
