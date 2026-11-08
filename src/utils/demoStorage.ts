import { 
  INITIAL_MENU_ITEMS, 
  INITIAL_ORDERS, 
  INITIAL_VISION_ALERTS, 
  MenuItem, 
  SimulationOrder, 
  VisionAiAlert 
} from '@/data/mockData';

export interface DemoStorageState {
  orders: SimulationOrder[];
  totalRevenue: number;
  visionAlerts: VisionAiAlert[];
  cart: { item: MenuItem; quantity: number; notes: string }[];
  lastUpdated: string;
}

const STORAGE_KEY = 'masalink_demo_state_v1';

export const getInitialDemoState = (): DemoStorageState => ({
  orders: INITIAL_ORDERS,
  totalRevenue: 14850,
  visionAlerts: INITIAL_VISION_ALERTS,
  cart: [],
  lastUpdated: new Date().toISOString(),
});

export const getStoredDemoState = (): DemoStorageState => {
  if (typeof window === 'undefined') {
    return getInitialDemoState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getInitialDemoState();
    const parsed = JSON.parse(raw);
    return {
      orders: parsed.orders || INITIAL_ORDERS,
      totalRevenue: typeof parsed.totalRevenue === 'number' ? parsed.totalRevenue : 14850,
      visionAlerts: parsed.visionAlerts || INITIAL_VISION_ALERTS,
      cart: parsed.cart || [],
      lastUpdated: parsed.lastUpdated || new Date().toISOString(),
    };
  } catch (err) {
    console.error('Failed to read demo state from localStorage:', err);
    return getInitialDemoState();
  }
};

export const saveStoredDemoState = (partialState: Partial<DemoStorageState>): void => {
  if (typeof window === 'undefined') return;

  try {
    const current = getStoredDemoState();
    const updated: DemoStorageState = {
      ...current,
      ...partialState,
      lastUpdated: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    // Dispatch custom event so listeners can react
    window.dispatchEvent(new Event('masalink_demo_updated'));
  } catch (err) {
    console.error('Failed to save demo state to localStorage:', err);
  }
};

export const resetStoredDemoState = (): DemoStorageState => {
  if (typeof window === 'undefined') return getInitialDemoState();

  try {
    window.localStorage.removeItem(STORAGE_KEY);
    const fresh = getInitialDemoState();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    window.dispatchEvent(new Event('masalink_demo_updated'));
    return fresh;
  } catch (err) {
    console.error('Failed to reset demo state in localStorage:', err);
    return getInitialDemoState();
  }
};
