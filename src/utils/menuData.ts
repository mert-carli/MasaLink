export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: 'Burgerler' | 'Yanlar' | 'İçecekler' | 'Tatlılar' | 'Soslar';
  description?: string;
  popular?: boolean;
}

export const MENU_CATEGORIES = [
  'Tümü',
  'Burgerler',
  'Yanlar',
  'İçecekler',
  'Tatlılar',
] as const;

export const QUICK_ORDER_NOTES = [
  'Az Pişmiş',
  'Orta Pişmiş',
  'Çok Pişmiş',
  'Buzsuz',
  'Acısız',
  'Sos Ayrı',
  'Soğansız',
  'Alerjen Uyarısı',
  'Hızlı Servis',
];

export const QUICK_MENU_ITEMS: MenuItem[] = [
  // Burgerler
  {
    id: 'b1',
    name: 'Trüflü Smash Burger',
    price: 295,
    category: 'Burgerler',
    description: '160g dana köfte, trüflü mayonez, karamelize soğan',
    popular: true,
  },
  {
    id: 'b2',
    name: 'Double Cheddar Bacon',
    price: 340,
    category: 'Burgerler',
    description: '2x120g smash köfte, çifte cheddar, çıtır dana bacon',
    popular: true,
  },
  {
    id: 'b3',
    name: 'Klasik Artisan Burger',
    price: 260,
    category: 'Burgerler',
    description: '160g köfte, marul, domates, turşu, artisan sos',
  },
  {
    id: 'b4',
    name: 'Crispy Tavuk Burger',
    price: 240,
    category: 'Burgerler',
    description: 'Marine çıtır tavuk fileto, coleslaw, acı-tatlı sos',
  },
  {
    id: 'b5',
    name: 'Vegan Portobello Burger',
    price: 280,
    category: 'Burgerler',
    description: 'Izgara dev portobello mantarı, vegan pesto mayo',
  },

  // Yan Ürünler
  {
    id: 'y1',
    name: 'Baharatlı Patates',
    price: 110,
    category: 'Yanlar',
    description: 'Özel baharat karışımlı çıtır patates kızartması',
    popular: true,
  },
  {
    id: 'y2',
    name: 'Mozzarella Sticks (6x)',
    price: 160,
    category: 'Yanlar',
    description: 'Marinara sos eşliğinde uzayan mozzarella çubukları',
  },
  {
    id: 'y3',
    name: 'Soğan Halkası (8x)',
    price: 120,
    category: 'Yanlar',
    description: 'Bira hamurunda pane edilmiş çıtır soğan halkaları',
  },
  {
    id: 'y4',
    name: 'Çıtır Tavuk Parçaları',
    price: 180,
    category: 'Yanlar',
    description: 'Özel panelenmiş kemiksiz tavuk parçaları (6 adet)',
  },

  // İçecekler
  {
    id: 'i1',
    name: 'Ev Yapımı Çilekli Limonata',
    price: 85,
    category: 'İçecekler',
    description: 'Taze nane ve çilek püresiyle ferahlatıcı',
    popular: true,
  },
  {
    id: 'i2',
    name: 'Kola / Meşrubat 330ml',
    price: 65,
    category: 'İçecekler',
    description: 'Kutu soğuk meşrubat seçenekleri',
  },
  {
    id: 'i3',
    name: 'Soda / Maden Suyu',
    price: 40,
    category: 'İçecekler',
    description: 'Doğal mineralli cam şişe soda',
  },
  {
    id: 'i4',
    name: 'Su 330ml Cam Şişe',
    price: 25,
    category: 'İçecekler',
    description: 'Soğuk kaynak suyu',
  },
  {
    id: 'i5',
    name: 'Craft IPA Bira 33cl',
    price: 190,
    category: 'İçecekler',
    description: 'Yerel butik üretim IPA bira',
  },

  // Tatlılar
  {
    id: 't1',
    name: 'San Sebastian Cheesecake',
    price: 195,
    category: 'Tatlılar',
    description: 'Belçika çikolatası sosu ile sıcak servis',
    popular: true,
  },
  {
    id: 't2',
    name: 'Sıcak Çikolatalı Sufle',
    price: 185,
    category: 'Tatlılar',
    description: 'Akışkan dolgulu sıcak sufle, dondurma eşliğinde',
  },
];

// Server-side authoritative alias
export const MENU_ITEMS = QUICK_MENU_ITEMS;

export interface MenuExtraOption {
  id: string;
  name: string;
  extraPrice: number;
}

export const MENU_EXTRAS: MenuExtraOption[] = [
  { id: 'ex-1', name: 'Ekstra Eritilmiş Cheddar', extraPrice: 35 },
  { id: 'ex-2', name: 'Çıtır Dana Füme Bacon', extraPrice: 55 },
  { id: 'ex-3', name: 'Trüflü Mayonez Sosu', extraPrice: 30 },
  { id: 'ex-4', name: 'Karamelize Çıtır Soğan', extraPrice: 25 },
  { id: 'ex-5', name: 'Jalapeno Acı Biber Turşusu', extraPrice: 20 },
];
