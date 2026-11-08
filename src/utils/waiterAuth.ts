export interface WaiterUser {
  id: string;
  name: string;
  pin?: string;
  role: string;
  section: string;
  avatar: string;
  loginTime?: string;
}

// Yalnızca yerel geliştirme ve demo arayüzü için sembolik personel listesi
export const DEFAULT_WAITERS: WaiterUser[] = process.env.NODE_ENV === 'production' ? [] : [
  {
    id: 'w-1',
    name: 'Ahmet Yılmaz',
    role: 'Salon Garsonu',
    section: 'İç Salon',
    avatar: '👨‍🍳',
  },
  {
    id: 'w-2',
    name: 'Mehmet Demir',
    role: 'Bahçe Garsonu',
    section: 'Bahçe',
    avatar: '🧑‍🌾',
  },
  {
    id: 'w-3',
    name: 'Selin Yıldız',
    role: 'Teras & Bar',
    section: 'Teras',
    avatar: '👩‍🍳',
  },
];

const WAITER_SESSION_KEY = 'masalink_waiter_session';

export function getStoredWaiterSession(): WaiterUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(WAITER_SESSION_KEY) || localStorage.getItem(WAITER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Güvenlik: Asla hafızadaki PIN'i geriye döndürme
    delete parsed.pin;
    return parsed;
  } catch (err) {
    console.warn('Garson oturum verisi okunamadı:', err);
    return null;
  }
}

export function setStoredWaiterSession(user: WaiterUser): void {
  if (typeof window === 'undefined') return;
  try {
    // 🛡️ PIN Temizleme Kalkanı: Personel PIN'i ASLA localStorage veya sessionStorage'a yazılamaz!
    const { pin: _pin, ...safeUser } = user;
    const payload = {
      ...safeUser,
      loginTime: new Date().toISOString(),
    };
    sessionStorage.setItem(WAITER_SESSION_KEY, JSON.stringify(payload));
    localStorage.setItem(WAITER_SESSION_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Garson oturum verisi yazılamadı:', err);
  }
}

export function clearStoredWaiterSession(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(WAITER_SESSION_KEY);
    localStorage.removeItem(WAITER_SESSION_KEY);
  } catch (err) {
    console.warn('Garson oturum verisi silinemedi:', err);
  }
}
