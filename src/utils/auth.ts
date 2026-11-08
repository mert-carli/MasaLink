export interface AuthUser {
  id: string;
  name?: string;
  tenantId: string;
  restaurantName: string;
  branchName: string;
  email: string;
  role: 'owner' | 'manager' | 'cashier';
  plan: 'starter' | 'pro' | 'enterprise';
  token: string;
}

const AUTH_KEY = 'masalink_auth_user_v1';

export const DEMO_ADMIN_USER: AuthUser = {
  id: 'usr-9042',
  name: 'Murat Yılmaz',
  tenantId: 'tenant-artisan-burger',
  restaurantName: 'Artisan Burger Bar',
  branchName: 'Kadıköy Merkez Şube',
  email: 'admin@masalink.com',
  role: 'owner',
  plan: 'pro',
  token: 'jwt-masalink-demo-session-token-998',
};

export const getStoredAuthUser = (): AuthUser | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read auth user from localStorage:', err);
    return null;
  }
};

export const setStoredAuthUser = (user: AuthUser): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    window.dispatchEvent(new Event('masalink_auth_change'));
  } catch (err) {
    console.error('Failed to save auth user to localStorage:', err);
  }
};

export const clearStoredAuthUser = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(AUTH_KEY);
    window.dispatchEvent(new Event('masalink_auth_change'));
  } catch (err) {
    console.error('Failed to clear auth user from localStorage:', err);
  }
};

export const loginWithCredentials = async (
  email: string,
  pass: string
): Promise<{ success: boolean; user?: AuthUser; error?: string }> => {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'Giriş başarısız. Lütfen bilgilerinizi kontrol edin.',
      };
    }

    if (data.user) {
      setStoredAuthUser(data.user);
      return { success: true, user: data.user };
    }

    return { success: false, error: 'Kullanıcı bilgisi alınamadı.' };
  } catch (err: any) {
    return { success: false, error: 'Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.' };
  }
};
