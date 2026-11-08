import crypto from 'crypto';
import { getJwtSecret } from '@/server/security/secrets';
import { timingSafeStringEqual } from '@/utils/tenantAuth';

export interface ManagerRecord {
  id: string;
  name: string;
  role: 'manager' | 'admin';
  title: string;
  pinHash: string;
  tenantId: string;
}

// Server-side hashed Manager/Admin PINs (SHA-256) - Yalnızca test ve geliştirme amaçlıdır!
export const AUTHORIZED_MANAGERS: ManagerRecord[] = [
  {
    id: 'm-1',
    name: 'Ali Demir',
    role: 'manager',
    title: 'Restoran Müdürü',
    tenantId: 'tenant-artisan-burger',
    pinHash: crypto.createHash('sha256').update('8765').digest('hex'),
  },
  {
    id: 'm-2',
    name: 'Mehmet Kaya',
    role: 'admin',
    title: 'Genel Müdür & İşletmeci',
    tenantId: 'tenant-artisan-burger',
    pinHash: crypto.createHash('sha256').update('9999').digest('hex'),
  },
  {
    id: 'c-3',
    name: 'Emre Şahin',
    role: 'manager',
    title: 'Kasa Şefi / Vardiya Amiri',
    tenantId: 'tenant-artisan-burger',
    pinHash: crypto.createHash('sha256').update('1122').digest('hex'),
  },
];

export interface CompedItem {
  name: string;
  price: number;
  quantity: number;
}

export interface DiscountValidationParams {
  subtotal: number;
  discountType?: 'none' | 'percent' | 'amount';
  discountValue?: number;
  discountReason?: string;
  compedItems?: CompedItem[];
  cancelledItems?: CompedItem[];
  currentUserRole?: string;
  currentUserId?: string;
  currentUserName?: string;
  managerPin?: string;
  managerAuthToken?: string;
  tenantId?: string;
  resourceId?: string;
}

export interface DiscountValidationResult {
  allowed: boolean;
  requiresManagerPin?: boolean;
  errorCode?: 'MANAGER_PIN_REQUIRED' | 'INVALID_MANAGER_PIN' | 'LIMIT_EXCEEDED' | 'INVALID_APPROVAL_TOKEN' | 'APPROVAL_EXPIRED';
  error?: string;
  manager?: {
    id: string;
    name: string;
    role: string;
    title: string;
  };
  effectivePercentage: number;
  totalDiscountAmount: number;
  compedAmount: number;
  netPayable: number;
}

// -----------------------------------------------------------------------------
// TEK KULLANIMLIK KRİPTOGRAFİK YÖNETİCİ ONAY TOKEN'I (Single-Use Manager Token)
// -----------------------------------------------------------------------------

export interface ManagerApprovalPayload {
  managerId: string;
  managerName: string;
  role: string;
  title: string;
  tenantId: string;
  action: 'DISCOUNT' | 'COMP' | 'VOID' | 'TABLE_TRANSFER' | 'GENERAL';
  resourceId?: string; // örn: tableId ("tbl-4")
  maxDiscountPct?: number;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

// Replay Attack kalkanı: Tüketilmiş token nonce defteri (5 dakika TTL)
const CONSUMED_NONCES = new Map<string, number>();

function cleanExpiredNonces(): void {
  const now = Date.now();
  CONSUMED_NONCES.forEach((exp, nonce) => {
    if (now > exp) {
      CONSUMED_NONCES.delete(nonce);
    }
  });
}

/**
 * Yönetici PIN'i doğrulandıktan sonra yalnızca belirli bir işlem ve kaynak için
 * geçerli olan imzalı, tek kullanımlık onay token'ı üretir.
 */
export function createManagerApprovalToken(
  payload: Omit<ManagerApprovalPayload, 'issuedAt' | 'expiresAt' | 'nonce'>,
  ttlSeconds = 300 // 5 dakika geçerli
): string {
  const secret = getJwtSecret();
  const nonce = `mgn_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const fullPayload: ManagerApprovalPayload = {
    ...payload,
    nonce,
    issuedAt: Date.now(),
    expiresAt: Date.now() + ttlSeconds * 1000,
  };

  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`mga.${encoded}`).digest('base64url');
  return `mga.${encoded}.${signature}`;
}

/**
 * Yönetici onay token'ını doğrular: İmza, süre, tenant ve işlem/kaynak eşleşmesi kontrol edilir.
 */
export function verifyManagerApprovalToken(
  tokenString: string | undefined | null,
  options?: {
    expectedTenantId?: string;
    expectedAction?: string;
    expectedResourceId?: string;
  }
): { valid: boolean; payload?: ManagerApprovalPayload; error?: string } {
  if (!tokenString || typeof tokenString !== 'string') {
    return { valid: false, error: 'Yönetici onay belirteci (token) eksik.' };
  }

  const parts = tokenString.split('.');
  if (parts.length !== 3 || parts[0] !== 'mga') {
    return { valid: false, error: 'Geçersiz onay belirteci formatı.' };
  }

  const [, encodedPayload, clientSig] = parts;
  const secret = getJwtSecret();
  const expectedSig = crypto.createHmac('sha256', secret).update(`mga.${encodedPayload}`).digest('base64url');

  if (!timingSafeStringEqual(clientSig, expectedSig)) {
    return { valid: false, error: 'Tahrif edilmiş veya geçersiz onay belirteci.' };
  }

  cleanExpiredNonces();

  try {
    const payload: ManagerApprovalPayload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));

    // Süre kontrolü
    if (Date.now() > payload.expiresAt) {
      return { valid: false, error: 'Yönetici onayı süresi dolmuştur (5 dakika).' };
    }

    // Tek kullanım denetimi (Replay Attack koruması)
    if (CONSUMED_NONCES.has(payload.nonce)) {
      return { valid: false, error: 'Bu yönetici onayı daha önce kullanılmıştır (tek kullanımlık).' };
    }

    // Kiracı izolasyonu
    if (options?.expectedTenantId && payload.tenantId !== options.expectedTenantId) {
      return { valid: false, error: 'Bu onay başka bir restorana aittir (Cross-Tenant ihlali).' };
    }

    // Kaynak eşleşmesi
    if (options?.expectedResourceId && payload.resourceId && payload.resourceId !== options.expectedResourceId) {
      return { valid: false, error: 'Bu onay başka bir masa veya kaynak için verilmiştir.' };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, error: 'Onay belirteci okunamadı.' };
  }
}

/**
 * Onay token'ını tüketir (tekrar kullanılmasını engeller).
 */
export function consumeManagerApprovalToken(tokenString: string): boolean {
  const parts = tokenString.split('.');
  if (parts.length !== 3 || parts[0] !== 'mga') return false;

  try {
    const payload: ManagerApprovalPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    CONSUMED_NONCES.set(payload.nonce, payload.expiresAt);
    return true;
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------------
// YÖNETİCİ PIN DOĞRULAMA (Senkron ve Asenkron)
// -----------------------------------------------------------------------------

/**
 * Verilen PIN kodunu yöneticiler listesinde SHA-256 ile doğrular.
 * NOT: Üretim ortamında sabit PIN'ler tamamen devre dışıdır.
 */
export function verifyManagerPin(
  pin: string,
  tenantId?: string
): { valid: boolean; manager?: ManagerRecord } {
  if (!pin || typeof pin !== 'string') {
    return { valid: false };
  }

  // 🛡️ Production Güvenlik Kalkanı: Sabit/Hardcoded demo yönetici PIN'leri üretimde KESİNLİKLE kabul edilemez!
  if (process.env.NODE_ENV === 'production') {
    return { valid: false };
  }

  const hash = crypto.createHash('sha256').update(pin).digest('hex');
  const found = AUTHORIZED_MANAGERS.find((m) => {
    if (m.pinHash !== hash) return false;
    if (tenantId && m.tenantId !== tenantId && m.tenantId !== `tenant-${tenantId}`) {
      return false; // Cross-tenant manager erişimi engellendi
    }
    return true;
  });

  if (!found) {
    return { valid: false };
  }

  return { valid: true, manager: found };
}

/**
 * Veritabanı destekli asenkron Yönetici PIN Doğrulaması (Bcrypt + Production Güvenliği)
 */
export async function verifyManagerPinAsync(
  pin: string,
  tenantId?: string
): Promise<{ valid: boolean; manager?: { id: string; name: string; role: string; title: string; tenantId: string } }> {
  if (!pin || typeof pin !== 'string') {
    return { valid: false };
  }

  if (process.env.DATABASE_URL && tenantId) {
    try {
      const bcrypt = (await import('bcryptjs')).default;
      const { prisma } = await import('@/server/db/prisma');
      const managers = await prisma.user.findMany({
        where: {
          tenantId,
          isActive: true,
          role: {
            key: { in: ['OWNER', 'ADMIN', 'MANAGER'] },
          },
        },
        include: { role: true },
      });

      for (const m of managers) {
        if (!m.pinHash) continue;
        const matches = await bcrypt.compare(pin, m.pinHash);
        if (matches) {
          return {
            valid: true,
            manager: {
              id: m.id,
              name: m.name,
              role: m.role.key.toLowerCase(),
              title: m.role.name,
              tenantId: m.tenantId,
            },
          };
        }
      }
    } catch (err) {
      console.warn('[verifyManagerPinAsync] DB sorgu hatası:', err);
    }
  }

  // Fallback (Yalnızca geliştirme/test ortamında)
  if (process.env.NODE_ENV !== 'production') {
    const syncRes = verifyManagerPin(pin, tenantId);
    if (syncRes.valid && syncRes.manager) {
      return {
        valid: true,
        manager: {
          id: syncRes.manager.id,
          name: syncRes.manager.name,
          role: syncRes.manager.role,
          title: syncRes.manager.title,
          tenantId: syncRes.manager.tenantId,
        },
      };
    }
  }

  return { valid: false };
}

// -----------------------------------------------------------------------------
// DENETİM KAYITLARI (Audit Trail)
// -----------------------------------------------------------------------------

export interface DiscountAuditRecord {
  id: string;
  timestamp: string;
  tableId: string;
  cashierName: string;
  managerName?: string;
  managerRole?: string;
  originalSubtotal: number;
  discountAmount: number;
  compedAmount: number;
  netPayable: number;
  effectivePercentage: number;
  reason: string;
  compedItems: CompedItem[];
}

const DISCOUNT_AUDIT_LOGS: DiscountAuditRecord[] = [];

export function recordDiscountAudit(record: Omit<DiscountAuditRecord, 'id' | 'timestamp'>): DiscountAuditRecord {
  const audit: DiscountAuditRecord = {
    ...record,
    id: `AUDIT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
  };
  DISCOUNT_AUDIT_LOGS.unshift(audit);
  if (DISCOUNT_AUDIT_LOGS.length > 500) {
    DISCOUNT_AUDIT_LOGS.pop();
  }
  return audit;
}

export function getDiscountAuditLogs(): DiscountAuditRecord[] {
  return [...DISCOUNT_AUDIT_LOGS];
}

// -----------------------------------------------------------------------------
// İNDİRİM & İKRAM YETKİ KONTROLÜ
// -----------------------------------------------------------------------------

function calculateDiscountMetrics(params: DiscountValidationParams) {
  const {
    subtotal,
    discountType = 'none',
    discountValue = 0,
    compedItems = [],
  } = params;

  let discountAmount = 0;
  if (discountType === 'percent') {
    discountAmount = (subtotal * Math.min(100, Math.max(0, discountValue))) / 100;
  } else if (discountType === 'amount') {
    discountAmount = Math.min(subtotal, Math.max(0, discountValue));
  }

  const compedAmount = compedItems.reduce((acc, curr) => acc + (curr.price * curr.quantity), 0);
  const totalDeduction = discountAmount + compedAmount;
  const effectivePercentage = subtotal > 0 ? (totalDeduction / subtotal) * 100 : 0;
  const netPayable = Math.max(0, subtotal - totalDeduction);

  return {
    discountAmount,
    compedAmount,
    totalDeduction,
    effectivePercentage,
    netPayable,
    hasComps: compedItems.length > 0,
    hasCancellations: (params.cancelledItems || []).length > 0,
    isHighDiscount: effectivePercentage > 10.01,
  };
}

/**
 * Asenkron İndirim ve İkram Güvenlik Motoru (Production ve Token Destekli)
 */
export async function validateDiscountSecurityAsync(
  params: DiscountValidationParams
): Promise<DiscountValidationResult> {
  const {
    subtotal,
    currentUserRole = 'cashier',
    managerPin,
    managerAuthToken,
    tenantId,
    resourceId,
  } = params;

  const metrics = calculateDiscountMetrics(params);

  // İndirim veya ikram yoksa direkt izin ver
  if (metrics.totalDeduction <= 0 && !metrics.hasCancellations) {
    return {
      allowed: true,
      effectivePercentage: 0,
      totalDiscountAmount: 0,
      compedAmount: 0,
      netPayable: subtotal,
    };
  }

  // Kullanıcı zaten Yönetici veya Admin rolünde ise doğrudan izin ver
  if (currentUserRole === 'manager' || currentUserRole === 'admin' || currentUserRole === 'owner') {
    return {
      allowed: true,
      effectivePercentage: Math.round(metrics.effectivePercentage * 10) / 10,
      totalDiscountAmount: metrics.discountAmount,
      compedAmount: metrics.compedAmount,
      netPayable: metrics.netPayable,
      manager: {
        id: params.currentUserId || 'admin-auto',
        name: params.currentUserName || 'Yönetici Oturumu',
        role: currentUserRole,
        title: currentUserRole === 'admin' || currentUserRole === 'owner' ? 'İşletmeci / Admin' : 'Restoran Müdürü',
      },
    };
  }

  // Kasiyer Yetki Sınırı: En fazla %10 indirim yapabilir. İkram veya iptal yapamaz.
  if (!metrics.isHighDiscount && !metrics.hasComps && !metrics.hasCancellations) {
    return {
      allowed: true,
      effectivePercentage: Math.round(metrics.effectivePercentage * 10) / 10,
      totalDiscountAmount: metrics.discountAmount,
      compedAmount: 0,
      netPayable: metrics.netPayable,
    };
  }

  // YÖNETİCİ ONAYI ZORUNLU:
  // 1. Yol: Önceden alınmış tek kullanımlık managerAuthToken
  if (managerAuthToken) {
    const tokenCheck = verifyManagerApprovalToken(managerAuthToken, {
      expectedTenantId: tenantId,
      expectedResourceId: resourceId,
    });

    if (!tokenCheck.valid || !tokenCheck.payload) {
      return {
        allowed: false,
        requiresManagerPin: true,
        errorCode: 'INVALID_APPROVAL_TOKEN',
        error: tokenCheck.error || 'Geçersiz veya süresi dolmuş yönetici onayı!',
        effectivePercentage: Math.round(metrics.effectivePercentage * 10) / 10,
        totalDiscountAmount: metrics.discountAmount,
        compedAmount: metrics.compedAmount,
        netPayable: metrics.netPayable,
      };
    }

    // Token geçerli, tüketelim (tek kullanımlık)
    consumeManagerApprovalToken(managerAuthToken);

    return {
      allowed: true,
      effectivePercentage: Math.round(metrics.effectivePercentage * 10) / 10,
      totalDiscountAmount: metrics.discountAmount,
      compedAmount: metrics.compedAmount,
      netPayable: metrics.netPayable,
      manager: {
        id: tokenCheck.payload.managerId,
        name: tokenCheck.payload.managerName,
        role: tokenCheck.payload.role,
        title: tokenCheck.payload.title,
      },
    };
  }

  // 2. Yol: Doğrudan gönderilen Yönetici PIN'i
  if (!managerPin) {
    const reasonText = metrics.hasComps
      ? 'İkram (₺0 yapma)'
      : metrics.hasCancellations
      ? 'Ürün iptali'
      : `%${params.discountValue || Math.round(metrics.effectivePercentage)} indirim`;

    return {
      allowed: false,
      requiresManagerPin: true,
      errorCode: 'MANAGER_PIN_REQUIRED',
      error: `Yetkisiz işlem engellendi! ${reasonText} işlemi kasa yetkisini aşıyor. %10 üzeri indirim ve ikramlar için Yönetici PIN onayı zorunludur.`,
      effectivePercentage: Math.round(metrics.effectivePercentage * 10) / 10,
      totalDiscountAmount: metrics.discountAmount,
      compedAmount: metrics.compedAmount,
      netPayable: metrics.netPayable,
    };
  }

  const verification = await verifyManagerPinAsync(managerPin, tenantId);
  if (!verification.valid || !verification.manager) {
    return {
      allowed: false,
      requiresManagerPin: true,
      errorCode: 'INVALID_MANAGER_PIN',
      error: 'Geçersiz veya yetkisiz Yönetici PIN kodu! İndirim/ikram işlemi reddedildi.',
      effectivePercentage: Math.round(metrics.effectivePercentage * 10) / 10,
      totalDiscountAmount: metrics.discountAmount,
      compedAmount: metrics.compedAmount,
      netPayable: metrics.netPayable,
    };
  }

  return {
    allowed: true,
    effectivePercentage: Math.round(metrics.effectivePercentage * 10) / 10,
    totalDiscountAmount: metrics.discountAmount,
    compedAmount: metrics.compedAmount,
    netPayable: metrics.netPayable,
    manager: {
      id: verification.manager.id,
      name: verification.manager.name,
      role: verification.manager.role,
      title: verification.manager.title,
    },
  };
}

/**
 * Geriye dönük uyumluluk için senkron doğrulama fonksiyonu.
 */
export function validateDiscountSecurity(
  params: DiscountValidationParams
): DiscountValidationResult {
  const {
    subtotal,
    currentUserRole = 'cashier',
    managerPin,
    managerAuthToken,
    tenantId,
    resourceId,
  } = params;

  const metrics = calculateDiscountMetrics(params);

  if (metrics.totalDeduction <= 0 && !metrics.hasCancellations) {
    return {
      allowed: true,
      effectivePercentage: 0,
      totalDiscountAmount: 0,
      compedAmount: 0,
      netPayable: subtotal,
    };
  }

  if (currentUserRole === 'manager' || currentUserRole === 'admin' || currentUserRole === 'owner') {
    return {
      allowed: true,
      effectivePercentage: Math.round(metrics.effectivePercentage * 10) / 10,
      totalDiscountAmount: metrics.discountAmount,
      compedAmount: metrics.compedAmount,
      netPayable: metrics.netPayable,
      manager: {
        id: params.currentUserId || 'admin-auto',
        name: params.currentUserName || 'Yönetici Oturumu',
        role: currentUserRole,
        title: currentUserRole === 'admin' || currentUserRole === 'owner' ? 'İşletmeci / Admin' : 'Restoran Müdürü',
      },
    };
  }

  if (!metrics.isHighDiscount && !metrics.hasComps && !metrics.hasCancellations) {
    return {
      allowed: true,
      effectivePercentage: Math.round(metrics.effectivePercentage * 10) / 10,
      totalDiscountAmount: metrics.discountAmount,
      compedAmount: 0,
      netPayable: metrics.netPayable,
    };
  }

  if (managerAuthToken) {
    const tokenCheck = verifyManagerApprovalToken(managerAuthToken, {
      expectedTenantId: tenantId,
      expectedResourceId: resourceId,
    });
    if (tokenCheck.valid && tokenCheck.payload) {
      consumeManagerApprovalToken(managerAuthToken);
      return {
        allowed: true,
        effectivePercentage: Math.round(metrics.effectivePercentage * 10) / 10,
        totalDiscountAmount: metrics.discountAmount,
        compedAmount: metrics.compedAmount,
        netPayable: metrics.netPayable,
        manager: {
          id: tokenCheck.payload.managerId,
          name: tokenCheck.payload.managerName,
          role: tokenCheck.payload.role,
          title: tokenCheck.payload.title,
        },
      };
    }
  }

  if (!managerPin) {
    const reasonText = metrics.hasComps
      ? 'İkram (₺0 yapma)'
      : metrics.hasCancellations
      ? 'Ürün iptali'
      : `%${params.discountValue || Math.round(metrics.effectivePercentage)} indirim`;

    return {
      allowed: false,
      requiresManagerPin: true,
      errorCode: 'MANAGER_PIN_REQUIRED',
      error: `Yetkisiz işlem engellendi! ${reasonText} işlemi kasa yetkisini aşıyor. %10 üzeri indirim ve ikramlar için Yönetici PIN onayı zorunludur.`,
      effectivePercentage: Math.round(metrics.effectivePercentage * 10) / 10,
      totalDiscountAmount: metrics.discountAmount,
      compedAmount: metrics.compedAmount,
      netPayable: metrics.netPayable,
    };
  }

  const verification = verifyManagerPin(managerPin, tenantId);
  if (!verification.valid || !verification.manager) {
    return {
      allowed: false,
      requiresManagerPin: true,
      errorCode: 'INVALID_MANAGER_PIN',
      error: 'Geçersiz veya yetkisiz Yönetici PIN kodu! İndirim/ikram işlemi reddedildi.',
      effectivePercentage: Math.round(metrics.effectivePercentage * 10) / 10,
      totalDiscountAmount: metrics.discountAmount,
      compedAmount: metrics.compedAmount,
      netPayable: metrics.netPayable,
    };
  }

  return {
    allowed: true,
    effectivePercentage: Math.round(metrics.effectivePercentage * 10) / 10,
    totalDiscountAmount: metrics.discountAmount,
    compedAmount: metrics.compedAmount,
    netPayable: metrics.netPayable,
    manager: {
      id: verification.manager.id,
      name: verification.manager.name,
      role: verification.manager.role,
      title: verification.manager.title,
    },
  };
}
