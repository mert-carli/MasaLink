export interface MenuItem {
  id: string;
  name: string;
  category: 'burger' | 'pizza' | 'drink' | 'dessert';
  price: number;
  description: string;
  prepTime: string;
  station: 'Izgara & Sıcak' | 'Fırın & Pizza' | 'Bar' | 'Tatlı & Soğuk';
  image: string;
  popular?: boolean;
  options?: {
    cooking?: string[];
    extras?: { name: string; price: number }[];
  };
}

export interface SimulationOrder {
  id: string;
  tableNumber: string;
  items: {
    name: string;
    quantity: number;
    notes?: string;
    price: number;
  }[];
  totalPrice: number;
  status: 'bekliyor' | 'hazirlaniyor' | 'hazir' | 'tamamlandi';
  station: string;
  orderTime: string;
  elapsedSeconds: number;
}

export interface VisionAiAlert {
  id: string;
  tableNumber: string;
  type: 'occupancy' | 'waiting_delay' | 'cleared' | 'turnover';
  title: string;
  message: string;
  time: string;
  severity: 'info' | 'warning' | 'success' | 'alert';
  actionLabel?: string;
  handled?: boolean;
  camId?: string;
}

export const INITIAL_VISION_ALERTS: VisionAiAlert[] = [
  {
    id: 'va-1',
    tableNumber: 'Masa 06',
    type: 'waiting_delay',
    title: 'Bekleme Süresi Uyarısı',
    message: 'Müşteri 02:45 dakikadır bekliyor. Garson henüz masaya uğramadı!',
    time: 'Az önce',
    severity: 'warning',
    actionLabel: 'Garson Çağır',
    camId: 'CAM-02 (Salon Doğu)',
  },
  {
    id: 'va-2',
    tableNumber: 'Masa 08',
    type: 'occupancy',
    title: 'Yeni Müşteri Oturumu',
    message: 'Masa 8\'e 3 kişi oturdu. (Durum: Menü Bekliyor / Henüz sipariş verilmedi)',
    time: '1 dk önce',
    severity: 'info',
    actionLabel: 'Menü Gönder',
    camId: 'CAM-01 (Ana Salon)',
  },
  {
    id: 'va-3',
    tableNumber: 'Masa 03',
    type: 'cleared',
    title: 'Masa Boşaldı / Temizlik Çağrısı',
    message: 'Masa 3 hesabı ödedi ve kalktı. Masa temizliğe & yeni misafirlere hazır bekliyor.',
    time: '3 dk önce',
    severity: 'success',
    actionLabel: 'Temizlendi Olarak İşaretle',
    camId: 'CAM-03 (Pencere Kenarı)',
  },
  {
    id: 'va-4',
    tableNumber: 'Bahçe 02',
    type: 'turnover',
    title: 'Optimum Devir Hızı',
    message: 'Masa devir süresi: 38 dk (Ortalamadan %15 daha hızlı devir sağlandı).',
    time: '6 dk önce',
    severity: 'info',
    camId: 'CAM-04 (Teras)',
  },
];

export const INITIAL_MENU_ITEMS: MenuItem[] = [
  {
    id: 'm1',
    name: 'Smash Trüflü Burger',
    category: 'burger',
    price: 360,
    description: '160g çift kat dana köfte, trüflü mayonez, karamelize soğan, eritilmiş cheddar ve çıtır brioche ekmek.',
    prepTime: '8-10 dk',
    station: 'Izgara & Sıcak',
    image: '🍔',
    popular: true,
    options: {
      cooking: ['Orta Pişmiş', 'Çok Pişmiş'],
      extras: [
        { name: 'Ekstra Dana Füme', price: 45 },
        { name: 'Çıtır Soğan Halkası', price: 30 },
        { name: 'Trüf Sos', price: 25 },
      ],
    },
  },
  {
    id: 'm2',
    name: 'Napoliten Margherita Pizza',
    category: 'pizza',
    price: 320,
    description: '48 saat fermente hamur, San Marzano domates sosu, manda mozzarella, taze fesleğen ve sızma zeytinyağı.',
    prepTime: '6-8 dk',
    station: 'Fırın & Pizza',
    image: '🍕',
    popular: true,
    options: {
      extras: [
        { name: 'Ekstra Manda Mozzarella', price: 50 },
        { name: 'Kurutulmuş Domates', price: 30 },
      ],
    },
  },
  {
    id: 'm3',
    name: 'BBQ Bacon Burger',
    category: 'burger',
    price: 380,
    description: '180g sulu dana antrikot köftesi, çıtır dana bacon, ev yapımı meşe füme barbekü sos ve kornişon.',
    prepTime: '9-11 dk',
    station: 'Izgara & Sıcak',
    image: '🥓',
    popular: false,
    options: {
      cooking: ['Orta', 'İyi Pişmiş'],
      extras: [
        { name: 'Çift Peynir', price: 35 },
        { name: 'Jalapeno Biber', price: 20 },
      ],
    },
  },
  {
    id: 'm4',
    name: 'Acılı Buffalo Kanat (8 Adet)',
    category: 'burger',
    price: 270,
    description: 'Özel baharat karışımıyla kızartılmış çıtır kanatlar, blue cheese sos ve kereviz sapları ile.',
    prepTime: '7-9 dk',
    station: 'Izgara & Sıcak',
    image: '🍗',
    popular: false,
  },
  {
    id: 'm5',
    name: 'Ev Yapımı Zencefilli Limonata',
    category: 'drink',
    price: 95,
    description: 'Taze sıkılmış Bodrum limonları, taze zencefil suyu, nane yaprakları ve bal özü ile.',
    prepTime: '2-3 dk',
    station: 'Bar',
    image: '🍋',
    popular: true,
  },
  {
    id: 'm6',
    name: 'Cold Brew Kahve & Yulaf Sütü',
    category: 'drink',
    price: 110,
    description: '18 saat soğuk demlenmiş Etiyopya Yirgacheffe çekirdekleri, buz ve kremsi yulaf sütü.',
    prepTime: '1-2 dk',
    station: 'Bar',
    image: '☕',
    popular: false,
  },
  {
    id: 'm7',
    name: 'San Sebastian Cheesecake',
    category: 'dessert',
    price: 210,
    description: 'İçi ipeksi akışkan, karamelize yanık üst kabuk ve sıcak Belçika çikolatası sosu ile servis.',
    prepTime: '3-4 dk',
    station: 'Tatlı & Soğuk',
    image: '🍰',
    popular: true,
  },
];

export const INITIAL_ORDERS: SimulationOrder[] = [
  {
    id: 'ORD-104',
    tableNumber: 'Masa 04',
    items: [
      { name: 'Smash Trüflü Burger (Orta)', quantity: 2, price: 720 },
      { name: 'Ev Yapımı Zencefilli Limonata', quantity: 2, price: 190 },
    ],
    totalPrice: 910,
    status: 'hazirlaniyor',
    station: 'Izgara & Sıcak',
    orderTime: '18:14',
    elapsedSeconds: 245,
  },
  {
    id: 'ORD-103',
    tableNumber: 'Masa 09',
    items: [
      { name: 'Napoliten Margherita Pizza', quantity: 1, price: 320 },
      { name: 'San Sebastian Cheesecake', quantity: 1, price: 210 },
    ],
    totalPrice: 530,
    status: 'hazir',
    station: 'Fırın & Pizza',
    orderTime: '18:09',
    elapsedSeconds: 540,
  },
  {
    id: 'ORD-102',
    tableNumber: 'Bahçe 02',
    items: [
      { name: 'BBQ Bacon Burger', quantity: 1, price: 380 },
      { name: 'Acılı Buffalo Kanat', quantity: 1, price: 270 },
      { name: 'Cold Brew Kahve', quantity: 1, price: 110 },
    ],
    totalPrice: 760,
    status: 'tamamlandi',
    station: 'Izgara & Sıcak',
    orderTime: '17:52',
    elapsedSeconds: 1560,
  },
];

export const PRICING_PLANS = [
  {
    id: 'starter',
    name: 'Başlangıç',
    badge: 'Butik Mekanlar',
    description: 'Tek şubeli kafe ve butik işletmeler için temassız QR sipariş ve temel POS altyapısı.',
    monthlyPrice: 1490,
    annualPrice: 1190,
    popular: false,
    features: [
      '1 Şube ve Sınırsız Masa Tanımlama',
      'Dinamik QR Menü & Masadan Sipariş',
      'Temel Kasa & Adisyon Paneli',
      'Standart Gün Sonu Raporları',
      'Müşteri Alerjen ve İçerik Filtresi',
      '%0 Komisyon Garantisi',
      'E-posta & Bilet Desteği',
    ],
    notIncluded: [
      'Vision AI Kamera Entegre Masa Analitiği',
      'Gelişmiş KDS Mutfak Ekranı',
      'Otomatik Reçete & Gramaj Stok Takibi',
      'Garson Terminali & Masa Taşıma',
      'Merkezi Çoklu Şube Konsolidasyonu',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    badge: 'En Çok Tercih Edilen',
    description: 'Yoğun restoranlar, publar ve bistro işletmeleri için uçtan uca mutfak ve servis orkestrasyonu.',
    monthlyPrice: 2890,
    annualPrice: 2310,
    popular: true,
    features: [
      'Tüm Başlangıç Özellikleri Dahil',
      'Vision AI Kamera Entegrasyonu (RTSP / ONVIF IP Kamera Desteği)',
      'Otomatik Masa Doluluk & Bekleme Süresi Algılama',
      'İnteraktif KDS (Mutfak Ekranı Sistemi)',
      'İstasyon Bazlı Sipariş Dağıtımı (Sıcak/Bar/Fırın)',
      'Garson Mobil Terminali & Adisyon Bölme',
      'Otomatik Reçete & Gramajlı Stok Düşümü',
      'Gerçek Zamanlı WebSocket Senkronizasyonu (<400ms)',
      'Masa Birleştirme, Taşıma & Rezervasyon Krokisi',
      'Öncelikli 7/24 WhatsApp & Telefon Desteği',
    ],
    notIncluded: [
      'ERP (Logo/Mikro/SAP) Entegrasyonları',
      'Franchise & Çoklu Şube Merkezi Raporlama',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    badge: 'Zincir & Franchise',
    description: 'Çok şubeli zincir restoranlar, büyük operasyonlar ve franchise ağları için sınırsız ölçeklenebilirlik.',
    monthlyPrice: 5490,
    annualPrice: 4390,
    popular: false,
    features: [
      'Tüm Pro Özellikleri Sınırsız Şube ile Dahil',
      'Çok Kameralı Vision AI Salon & Teras Analitiği (Kayıp Zaman Ölçümü)',
      'Merkezi Şube ve Menü Fiyat Konsolidasyonu',
      'Özel REST & Webhook API Erişimi',
      'ERP (Logo, Mikro, Netsis, SAP) Çift Yönlü Entegrasyon',
      'Yemeksepeti / Getir / Trendyol Sipariş Havuzu',
      'Özel Sunucu Mimarisi & %99.99 SLA',
      'Dedike Müşteri Başarı Yöneticisi',
      'Yerinde Kurulum ve Personel Eğitimi',
    ],
    notIncluded: [],
  },
];

export const FAQ_ITEMS = [
  {
    question: 'Geleneksel POS cihazları veya Simpra yerine neden Masalink seçmeliyim?',
    answer:
      'Geleneksel POS sistemleri pahalı donanım terminalleri (dokunmatik ekranlar, özel kablolamalar) ve yüksek lisans ücretleri gerektirir. Masalink tamamen bulut tabanlıdır; herhangi bir tablet, telefon veya bilgisayarda tarayıcı üzerinden saniyeler içinde çalışır. Sıfır donanım maliyeti, masadan doğrudan QR sipariş hızı ve anlık KDS mutfak entegrasyonu ile masa devir süresini ortalama %18 hızlandırır.',
  },
  {
    question: 'İnternet bağlantısı kesilirse restoran operasyonu durur mu?',
    answer:
      'Hayır! Masalink, çevrimdışı öncelikli (Offline-First Local Sync) PWA mimarisiyle çalışır. İnternet kesilse dahi lokal Wi-Fi ağı üzerinden garson terminalleri, masa QR siparişleri ve mutfak KDS ekranı kesintisiz haberleşmeye devam eder. İnternet geri geldiğinde tüm veriler otomatik olarak bulut sunucularla çift yönlü eşitlenir.',
  },
  {
    question: 'Müşterilerin sipariş verebilmesi için bir uygulama indirmesi gerekir mi?',
    answer:
      'Asla. Müşteriler masadaki QR kodu telefon kameralarıyla okuttukları anda doğrudan ultra hızlı mobil web menüsüne ulaşırlar. Herhangi bir uygulama indirme veya üyelik zorunluluğu olmadan sepet oluşturup doğrudan mutfağa sipariş iletebilirler.',
  },
  {
    question: 'Verilen siparişlerden herhangi bir komisyon alıyor musunuz?',
    answer:
      'Hayır, kesinlikle %0 komisyon! Masalink şeffaf, sabit bir SaaS abonelik modeli uygular. Cironuz ister 100 bin TL ister 10 milyon TL olsun, siparişlerinizden tek kuruş işlem komisyonu kesilmez.',
  },
  {
    question: 'Stok ve reçete takibi tam olarak nasıl işliyor?',
    answer:
      'Örneğin menünüzdeki Trüflü Burger için reçete tanımlarsınız (160g kıyma, 1 adet brioche ekmek, 20g trüf sos). Masa veya garson üzerinden her burger satıldığında bu hammaddeler ana depo stoğunuzdan gramajına kadar anında düşer. Kritik stok seviyesine inildiğinde sistem mutfak şefine ve yöneticiye uyarı bildirimi gönderir.',
  },
  {
    question: 'Mevcut menümüzü ve masalarımızı sisteme aktarmak ne kadar sürer?',
    answer:
      'Akıllı menü içe aktarıcımız sayesinde mevcut PDF veya Excel menünüzü dakikalar içinde dijital menüye dönüştürebilirsiniz. Ortalama bir restoranın Masalink ile canlıya geçişi 1 saatten kısa sürmektedir.',
  },
];
