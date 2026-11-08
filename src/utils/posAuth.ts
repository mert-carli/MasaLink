/**
 * MasaLink Kasa & Hızlı Tahsilat Terminali - Kasiyer Yetkilendirme & Vardiya Yönetimi
 */

export interface CashierUser {
  id: string;
  name: string;
  role: 'Baş Kasiyer' | 'Kasiyer' | 'Kasa Şefi';
  pin?: string;
  avatar: string;
}

export interface PosShiftSession {
  cashierId: string;
  cashierName: string;
  role: string;
  shiftStartTime: string;
  floatCash: number; // Açılış Kasası (Nakit ₺)
  closedAt?: string;
}

// Yalnızca yerel test ve geliştirme ortamı için mock kasiyerler
export const REGISTERED_CASHIERS: CashierUser[] = process.env.NODE_ENV === 'production' ? [] : [
  {
    id: 'csh-1',
    name: 'Zeynep Kaya',
    role: 'Baş Kasiyer',
    avatar: 'ZK',
  },
  {
    id: 'csh-2',
    name: 'Caner Öztürk',
    role: 'Kasiyer',
    avatar: 'CÖ',
  },
  {
    id: 'csh-3',
    name: 'Emre Şahin',
    role: 'Kasa Şefi',
    avatar: 'EŞ',
  },
];

const POS_SHIFT_STORAGE_KEY = 'masalink_pos_shift_session';

export function getCashierByPin(pin: string): CashierUser | null {
  // 🛡️ Production Güvenlik Kalkanı: Üretimde istemci taraflı sabit PIN araması yasaktır
  if (process.env.NODE_ENV === 'production') {
    return null;
  }
  return REGISTERED_CASHIERS.find((c) => (c as any).pin === pin) || null;
}

export function getPosShiftSession(): PosShiftSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(POS_SHIFT_STORAGE_KEY) || localStorage.getItem(POS_SHIFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error('POS vardiya oturumu okunamadı:', err);
    return null;
  }
}

export function savePosShiftSession(session: PosShiftSession): void {
  if (typeof window === 'undefined') return;
  try {
    // 🛡️ PIN Temizleme Kalkanı: Hassas kimlik bilgisi oturum kaydına sızamaz
    const safeSession: PosShiftSession = {
      cashierId: session.cashierId,
      cashierName: session.cashierName,
      role: session.role,
      shiftStartTime: session.shiftStartTime,
      floatCash: session.floatCash,
      closedAt: session.closedAt,
    };
    const data = JSON.stringify(safeSession);
    sessionStorage.setItem(POS_SHIFT_STORAGE_KEY, data);
    localStorage.setItem(POS_SHIFT_STORAGE_KEY, data);
  } catch (err) {
    console.error('POS vardiya oturumu kaydedilemedi:', err);
  }
}

export function clearPosShiftSession(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(POS_SHIFT_STORAGE_KEY);
    localStorage.removeItem(POS_SHIFT_STORAGE_KEY);
  } catch (err) {
    console.error('POS vardiya oturumu silinemedi:', err);
  }
}
