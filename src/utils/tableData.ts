import { AdminTable } from '@/components/admin/TableDetailDrawer';
export type { AdminTable };

export const INITIAL_TABLES: AdminTable[] = [
  // Salon
  {
    id: 'tbl-1',
    name: 'Masa 1',
    section: 'salon',
    capacity: 2,
    status: 'preparing',
    durationMinutes: 18,
    totalAmount: 675,
    items: [
      { name: 'Trüflü Smash Burger (160g)', quantity: 2, price: 295 },
      { name: 'Kola / Meşrubat', quantity: 1, price: 65 },
      { name: 'Su 330ml', quantity: 1, price: 20 },
    ],
    waiterName: 'Ahmet Yılmaz',
    lastActivity: '12 dk önce mutfağa iletildi (Hazırlanıyor)',
  },
  {
    id: 'tbl-2',
    name: 'Masa 2',
    section: 'salon',
    capacity: 4,
    status: 'served',
    durationMinutes: 28,
    totalAmount: 1140,
    items: [
      { name: 'Double Cheddar Bacon Burger', quantity: 2, price: 340, guestTag: 'Ali (Misafir 1)' },
      { name: 'Klasik Artisan Burger', quantity: 1, price: 260, guestTag: 'Ayşe (Misafir 2)' },
      { name: 'Baharatlı Patates', quantity: 1, price: 110, guestTag: 'Ali (Misafir 1)' },
      { name: 'Ev Yapımı Çilekli Limonata', quantity: 2, price: 85, guestTag: 'Ayşe (Misafir 2)' },
    ],
    waiterName: 'Ahmet Yılmaz',
    lastActivity: '6 dk önce servis yapıldı (Yemek Masada)',
  },
  {
    id: 'tbl-3',
    name: 'Masa 3',
    section: 'salon',
    capacity: 2,
    status: 'cleaning',
    durationMinutes: 42,
    totalAmount: 0,
    items: [],
    waiterName: 'Ahmet Yılmaz',
    lastActivity: 'Vision AI: Misafir az önce kalktı (Temizlik Bekliyor)',
  },
  {
    id: 'tbl-4',
    name: 'Masa 4',
    section: 'salon',
    capacity: 4,
    status: 'bill_requested',
    durationMinutes: 39,
    totalAmount: 890,
    items: [
      { name: 'Trüflü Smash Burger (160g)', quantity: 2, price: 295, guestTag: 'Can (Misafir 1)' },
      { name: 'San Sebastian Cheesecake', quantity: 1, price: 195, guestTag: 'Can (Misafir 1)' },
      { name: 'Craft IPA Bira 33cl', quantity: 1, price: 190, guestTag: 'Mert (Misafir 2)' },
      { name: 'Soda / Maden Suyu', quantity: 1, price: 40, guestTag: 'Mert (Misafir 2)' },
    ],
    waiterName: 'Ahmet Yılmaz',
    lastActivity: '2 dk önce QR üzerinden hesap istendi (Kilitli)',
  },
  {
    id: 'tbl-5',
    name: 'Masa 5',
    section: 'salon',
    capacity: 6,
    status: 'waiting_menu',
    durationMinutes: 3,
    totalAmount: 0,
    items: [],
    waiterName: 'Ahmet Yılmaz',
    lastActivity: 'Vision AI: Misafir yeni oturdu (Menü Bekliyor)',
  },
  {
    id: 'tbl-6',
    name: 'Masa 6',
    section: 'salon',
    capacity: 2,
    status: 'waiting_menu',
    durationMinutes: 4,
    totalAmount: 0,
    items: [],
    waiterName: 'Ahmet Yılmaz',
    lastActivity: 'Vision AI: 02:45 dakikadır sipariş alınmadı!',
    delayAlert: true,
  },
  {
    id: 'tbl-7',
    name: 'Masa 7',
    section: 'salon',
    capacity: 4,
    status: 'empty',
    durationMinutes: 0,
    totalAmount: 0,
    items: [],
    lastActivity: 'Temiz & Hazır',
  },
  {
    id: 'tbl-8',
    name: 'Masa 8',
    section: 'salon',
    capacity: 2,
    status: 'empty',
    durationMinutes: 0,
    totalAmount: 0,
    items: [],
    lastActivity: 'Temiz & Hazır',
  },

  // Bahçe
  {
    id: 'tbl-9',
    name: 'Masa 9 (Bahçe)',
    section: 'bahce',
    capacity: 4,
    status: 'preparing',
    durationMinutes: 22,
    totalAmount: 780,
    items: [
      { name: 'Crispy Tavuk Burger', quantity: 2, price: 240 },
      { name: 'Mozzarella Sticks (6x)', quantity: 1, price: 160 },
      { name: 'Kola / Meşrubat', quantity: 2, price: 70 },
    ],
    waiterName: 'Mehmet Demir',
    lastActivity: 'Sipariş mutfakta hazırlanıyor',
  },
  {
    id: 'tbl-10',
    name: 'Masa 10 (Bahçe)',
    section: 'bahce',
    capacity: 6,
    status: 'served',
    durationMinutes: 31,
    totalAmount: 1420,
    items: [
      { name: 'Double Cheddar Bacon Burger', quantity: 3, price: 340 },
      { name: 'Baharatlı Patates', quantity: 2, price: 110 },
      { name: 'Craft IPA Bira 33cl', quantity: 2, price: 190 },
    ],
    waiterName: 'Mehmet Demir',
    lastActivity: 'Servis tamamlandı • Masada',
  },
  {
    id: 'tbl-11',
    name: 'Masa 11 (Bahçe)',
    section: 'bahce',
    capacity: 2,
    status: 'empty',
    durationMinutes: 0,
    totalAmount: 0,
    items: [],
    lastActivity: 'Temiz & Hazır',
  },
  {
    id: 'tbl-12',
    name: 'Masa 12 (Bahçe)',
    section: 'bahce',
    capacity: 4,
    status: 'empty',
    durationMinutes: 0,
    totalAmount: 0,
    items: [],
    lastActivity: 'Temiz & Hazır',
  },

  // Teras
  {
    id: 'tbl-13',
    name: 'Masa 13 (Teras)',
    section: 'teras',
    capacity: 4,
    status: 'served',
    durationMinutes: 15,
    totalAmount: 855,
    items: [
      { name: 'Vegan Portobello Burger', quantity: 1, price: 280 },
      { name: 'Trüflü Smash Burger (160g)', quantity: 1, price: 295 },
      { name: 'San Sebastian Cheesecake', quantity: 1, price: 195 },
      { name: 'Ev Yapımı Çilekli Limonata', quantity: 1, price: 85 },
    ],
    waiterName: 'Selin Yıldız',
    lastActivity: 'Servis tamamlandı',
  },
  {
    id: 'tbl-14',
    name: 'Masa 14 (Teras)',
    section: 'teras',
    capacity: 4,
    status: 'empty',
    durationMinutes: 0,
    totalAmount: 0,
    items: [],
    lastActivity: 'Temiz & Hazır',
  },

  // Bar
  {
    id: 'tbl-15',
    name: 'Bar Sandalye 1-2',
    section: 'bar',
    capacity: 2,
    status: 'served',
    durationMinutes: 12,
    totalAmount: 380,
    items: [
      { name: 'Craft IPA Bira 33cl', quantity: 2, price: 190 },
    ],
    waiterName: 'Selin Yıldız',
    lastActivity: 'Bara servis edildi',
  },
  {
    id: 'tbl-16',
    name: 'Bar Sandalye 3-4',
    section: 'bar',
    capacity: 2,
    status: 'empty',
    durationMinutes: 0,
    totalAmount: 0,
    items: [],
    lastActivity: 'Temiz & Hazır',
  },
];

const TABLES_STORAGE_KEY = 'masalink_tables_state';
let serverMemoryTables: AdminTable[] = [...INITIAL_TABLES];

export function getStoredTables(): AdminTable[] {
  if (typeof window === 'undefined') return serverMemoryTables;
  try {
    const raw = localStorage.getItem(TABLES_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(TABLES_STORAGE_KEY, JSON.stringify(INITIAL_TABLES));
      return INITIAL_TABLES;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Masalar localStorage üzerinden okunamadı, varsayılanlar dönülüyor:', err);
    return INITIAL_TABLES;
  }
}

export function saveStoredTables(tables: AdminTable[]): void {
  if (typeof window === 'undefined') {
    serverMemoryTables = tables;
    return;
  }
  try {
    localStorage.setItem(TABLES_STORAGE_KEY, JSON.stringify(tables));
  } catch (err) {
    console.warn('Masalar kaydedilemedi:', err);
  }
}
