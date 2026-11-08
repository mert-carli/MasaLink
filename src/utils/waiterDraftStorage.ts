export interface DraftCartItem {
  product: {
    id: string;
    name: string;
    price: number;
    category: string;
    description?: string;
  };
  quantity: number;
  notes: string[];
  customNote?: string;
}

export interface WaiterOrderDraft {
  waiterId: string;
  waiterName: string;
  tableId: string;
  tableName: string;
  cart: { [productId: string]: DraftCartItem };
  itemCount: number;
  totalAmount: number;
  updatedAt: number;
}

const LOCAL_DRAFT_PREFIX = 'masalink_draft_table_';
const memoryDraftStore = new Map<string, string>();

/**
 * Taslağı yerel tarayıcı belleğine (IndexedDB / localStorage) anlık yazar.
 * Telefon kapanırsa / sayfa yenilenirse anında buradan okunur.
 */
export function saveLocalDraft(draft: WaiterOrderDraft): void {
  if (typeof window === 'undefined') {
    memoryDraftStore.set(`${LOCAL_DRAFT_PREFIX}${draft.tableId}`, JSON.stringify(draft));
    memoryDraftStore.set(`masalink_waiter_last_draft_${draft.waiterId}`, JSON.stringify(draft));
    return;
  }
  try {
    localStorage.setItem(`${LOCAL_DRAFT_PREFIX}${draft.tableId}`, JSON.stringify(draft));
    localStorage.setItem(`masalink_waiter_last_draft_${draft.waiterId}`, JSON.stringify(draft));
  } catch (e) {
    console.warn('[Draft Storage] Yerel taslak yazılamadı:', e);
  }
}

export function getLocalDraft(tableId: string): WaiterOrderDraft | null {
  try {
    const raw =
      typeof window !== 'undefined'
        ? localStorage.getItem(`${LOCAL_DRAFT_PREFIX}${tableId}`)
        : memoryDraftStore.get(`${LOCAL_DRAFT_PREFIX}${tableId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WaiterOrderDraft;
    // 45 dakikadan eski taslakları otomatik temizle
    if (Date.now() - parsed.updatedAt > 45 * 60 * 1000) {
      clearLocalDraft(tableId);
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

export function clearLocalDraft(tableId: string, waiterId?: string): void {
  if (typeof window === 'undefined') {
    memoryDraftStore.delete(`${LOCAL_DRAFT_PREFIX}${tableId}`);
    if (waiterId) {
      memoryDraftStore.delete(`masalink_waiter_last_draft_${waiterId}`);
    }
    return;
  }
  try {
    localStorage.removeItem(`${LOCAL_DRAFT_PREFIX}${tableId}`);
    if (waiterId) {
      localStorage.removeItem(`masalink_waiter_last_draft_${waiterId}`);
    }
  } catch (_) {}
}

/**
 * Taslağı arka planda sunucuya (Cloud Sync) aktarır.
 * Garsonun telefonu kırıldığında veya şarjı bittiğinde başka bir cihazdan
 * PIN girdiğinde bu taslak sunucudan otomatik çekilir.
 */
export async function syncDraftToServer(draft: WaiterOrderDraft): Promise<void> {
  try {
    await fetch('/api/waiter/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
  } catch (err) {
    console.warn('[Draft Sync] Sunucuya taslak eşitlenemedi (offline fallback):', err);
  }
}

export async function fetchActiveDraftFromServer(waiterId: string): Promise<WaiterOrderDraft | null> {
  try {
    const res = await fetch(`/api/waiter/draft?waiterId=${encodeURIComponent(waiterId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.draft || null;
  } catch (_) {
    return null;
  }
}

export async function clearServerDraft(waiterId: string, tableId?: string): Promise<void> {
  try {
    await fetch(`/api/waiter/draft?waiterId=${encodeURIComponent(waiterId)}${tableId ? `&tableId=${encodeURIComponent(tableId)}` : ''}`, {
      method: 'DELETE',
    });
  } catch (_) {}
}
