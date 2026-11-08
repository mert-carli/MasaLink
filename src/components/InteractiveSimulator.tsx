'use client';

import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  ChefHat, 
  LayoutDashboard, 
  Plus, 
  Minus, 
  Trash2, 
  Send, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  TrendingUp, 
  DollarSign, 
  ShoppingBag, 
  CreditCard, 
  Sparkles, 
  Boxes, 
  RefreshCw, 
  Bell, 
  Utensils,
  Camera,
  Radio,
  Eye,
  Scan,
  Users,
  Activity,
  AlertTriangle,
  Zap,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { MasaLink3DLogo } from '@/components/MasaLink3DLogo';
import { 
  INITIAL_MENU_ITEMS, 
  INITIAL_ORDERS, 
  INITIAL_VISION_ALERTS, 
  MenuItem, 
  SimulationOrder, 
  VisionAiAlert 
} from '@/data/mockData';
import { formatCurrency, triggerConfetti } from '@/utils/helpers';
import { 
  getStoredDemoState, 
  saveStoredDemoState, 
  resetStoredDemoState 
} from '@/utils/demoStorage';

interface InteractiveSimulatorProps {
  isStandalone?: boolean;
}

export const InteractiveSimulator: React.FC<InteractiveSimulatorProps> = ({ isStandalone = false }) => {
  // Active role tab: 'customer' | 'kitchen' | 'admin'
  const [activeTab, setActiveTab] = useState<'customer' | 'kitchen' | 'admin'>('customer');

  // Client hydration flag for localStorage
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  // Mobile single-focus sub-views
  const [customerMobileView, setCustomerMobileView] = useState<'menu' | 'cart'>('menu');
  const [adminMobileView, setAdminMobileView] = useState<'kpi' | 'radar'>('kpi');
  const [orderSuccessBanner, setOrderSuccessBanner] = useState<boolean>(false);

  // Touch Swipe Gesture Tracking
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (touchStartX === null || touchEndX === null) return;
    const distance = touchStartX - touchEndX;
    const isLeftSwipe = distance > 55;
    const isRightSwipe = distance < -55;

    if (isLeftSwipe) {
      if (activeTab === 'customer') setActiveTab('kitchen');
      else if (activeTab === 'kitchen') setActiveTab('admin');
    } else if (isRightSwipe) {
      if (activeTab === 'admin') setActiveTab('kitchen');
      else if (activeTab === 'kitchen') setActiveTab('customer');
    }

    setTouchStartX(null);
    setTouchEndX(null);
  };

  // Simulator shared state
  const [menuItems] = useState<MenuItem[]>(INITIAL_MENU_ITEMS);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cart, setCart] = useState<{ item: MenuItem; quantity: number; notes: string }[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('Masa 04');
  
  // Kitchen orders
  const [orders, setOrders] = useState<SimulationOrder[]>(INITIAL_ORDERS);
  const [selectedStation, setSelectedStation] = useState<string>('Tümü');

  // Admin stats
  const [totalRevenue, setTotalRevenue] = useState<number>(14850);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Vision AI Camera Live Alerts State
  const [visionAlerts, setVisionAlerts] = useState<VisionAiAlert[]>(INITIAL_VISION_ALERTS);

  // Hydrate from localStorage once on client mount
  useEffect(() => {
    const stored = getStoredDemoState();
    setOrders(stored.orders);
    setTotalRevenue(stored.totalRevenue);
    setVisionAlerts(stored.visionAlerts);
    setCart(stored.cart);
    setIsHydrated(true);
  }, []);

  // Sync back to localStorage whenever orders, revenue, visionAlerts, or cart change
  useEffect(() => {
    if (!isHydrated) return;
    saveStoredDemoState({
      orders,
      totalRevenue,
      visionAlerts,
      cart,
    });
  }, [orders, totalRevenue, visionAlerts, cart, isHydrated]);

  const handleResetDemoState = () => {
    const fresh = resetStoredDemoState();
    setOrders(fresh.orders);
    setTotalRevenue(fresh.totalRevenue);
    setVisionAlerts(fresh.visionAlerts);
    setCart(fresh.cart);
    showNotification('🔄 Demo verileri fabrika ayarlarına sıfırlandı!');
  };

  const handleVisionAction = (alertId: string) => {
    const alert = visionAlerts.find((a) => a.id === alertId);
    if (!alert) return;

    if (alert.type === 'waiting_delay') {
      showNotification(`🔔 Garson ${alert.tableNumber}'ya yönlendirildi! Bekleme alarmı durduruldu.`);
    } else if (alert.type === 'occupancy') {
      showNotification(`📋 ${alert.tableNumber} için dijital karşılama ve QR menü yönlendirmesi aktif.`);
    } else if (alert.type === 'cleared') {
      showNotification(`✓ ${alert.tableNumber} komi tarafından temizlendi ve sisteme hazır işaretlendi.`);
    }

    setVisionAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, handled: true } : a))
    );
  };

  const triggerVisionEvent = () => {
    const sampleTables = ['Masa 11', 'Masa 14', 'Bahçe 04', 'Teras 02'];
    const chosenTable = sampleTables[Math.floor(Math.random() * sampleTables.length)];
    const newAlert: VisionAiAlert = {
      id: `va-${Date.now()}`,
      tableNumber: chosenTable,
      type: 'waiting_delay',
      title: 'Vision AI: Yeni Bekleme Alarmı',
      message: `${chosenTable} masasına misafir oturdu ancak 02:30 dakikadır sipariş alınmadı!`,
      time: 'Şimdi',
      severity: 'warning',
      actionLabel: 'Garson Gönder',
      camId: 'CAM-01 (Salon)',
      handled: false,
    };
    setVisionAlerts((prev) => [newAlert, ...prev]);
    showNotification(`📷 Vision AI: ${chosenTable} için kamera tespiti yapıldı!`);
  };

  // Live timer tick for all active orders
  useEffect(() => {
    const timer = setInterval(() => {
      setOrders((prevOrders) =>
        prevOrders.map((ord) => {
          if (ord.status === 'tamamlandi') return ord;
          return { ...ord, elapsedSeconds: ord.elapsedSeconds + 1 };
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Cart operations
  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.item.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { item, quantity: 1, notes: 'Standart Porsiyon' }];
    });
    showNotification(`"${item.name}" sepete eklendi!`);
  };

  const updateCartQuantity = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.item.id === itemId) {
            const newQty = i.quantity + delta;
            return newQty > 0 ? { ...i, quantity: newQty } : null;
          }
          return i;
        })
        .filter(Boolean) as { item: MenuItem; quantity: number; notes: string }[]
    );
  };

  const cartTotal = cart.reduce((acc, curr) => acc + curr.item.price * curr.quantity, 0);

  // Submit order from QR Menu -> rings into KDS & Admin
  const handleSendOrder = () => {
    if (cart.length === 0) return;

    const newOrderId = `ORD-${Math.floor(100 + Math.random() * 900)}`;
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;

    const newOrder: SimulationOrder = {
      id: newOrderId,
      tableNumber: selectedTable,
      items: cart.map((c) => ({
        name: c.item.name,
        quantity: c.quantity,
        notes: c.notes,
        price: c.item.price * c.quantity,
      })),
      totalPrice: cartTotal,
      status: 'bekliyor',
      station: cart[0]?.item.station || 'Izgara & Sıcak',
      orderTime: timeString,
      elapsedSeconds: 0,
    };

    setOrders([newOrder, ...orders]);
    setTotalRevenue((prev) => prev + cartTotal);
    setCart([]);
    setCustomerMobileView('menu');
    setOrderSuccessBanner(true);
    triggerConfetti();

    showNotification(
      `🎉 ${selectedTable} siparişi (${formatCurrency(cartTotal)}) mutfak KDS ekranına düşürüldü!`
    );
  };

  // Kitchen status updater
  const updateOrderStatus = (orderId: string, nextStatus: SimulationOrder['status']) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
    );
    if (nextStatus === 'hazir') {
      showNotification(`🔔 Sipariş #${orderId} servise hazır! Garsona bildirim gitti.`);
    } else if (nextStatus === 'tamamlandi') {
      showNotification(`✓ Sipariş #${orderId} masaya teslim edildi.`);
    }
  };

  // Format seconds to mm:ss
  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Filtered menu items
  const filteredMenuItems =
    selectedCategory === 'all'
      ? menuItems
      : menuItems.filter((i) => i.category === selectedCategory);

  // Filtered orders for KDS
  const filteredOrders =
    selectedStation === 'Tümü'
      ? orders
      : orders.filter((o) => o.station === selectedStation);

  return (
    <section id="simulator" className="py-20 md:py-28 relative bg-[#0a0a0e] border-y border-white/[0.06]">
      {/* Toast alert popup */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-orange-600 text-white font-semibold text-xs shadow-2xl shadow-orange-900/50 border border-orange-400/30 animate-bounce">
          <Bell className="w-4 h-4 text-amber-200" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-semibold mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Etkileşimli Rol Simülatörü</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white">
            Masalink'i şimdi{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-300">
              canlı test edin
            </span>.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-zinc-300">
            Aşağıdaki sekmeleri kullanarak Müşteri olarak sipariş verin; mutfak KDS ekranına düşüşünü ve yönetici kasasındaki canlı ciro artışını anlık izleyin.
          </p>

          {/* Persistent State Bar & Reset Button */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900 border border-white/[0.08] text-xs font-mono text-zinc-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Oturum Arabelleği: Kaydediliyor</span>
            </span>

            <button
              onClick={handleResetDemoState}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 hover:text-white border border-white/[0.08] transition-all active:scale-95 shadow-sm"
              title="Siparişleri ve ciroyu başlangıç mock verilerine döndürür"
            >
              <RefreshCw className="w-3 h-3 text-orange-400" />
              <span>Verileri Sıfırla</span>
            </button>

            {!isStandalone && (
              <a
                href="/demo"
                className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-gradient-to-r from-orange-500/20 to-amber-500/20 hover:from-orange-500/30 hover:to-amber-500/30 border border-orange-500/35 text-xs font-bold text-orange-300 hover:text-white transition-all shadow-md active:scale-95"
              >
                <span>🚀 Tam Ekran Demo (/demo)</span>
                <ArrowRight className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* Mobile Step Navigator Bar (One-touch Prev/Next) */}
          <div className="sm:hidden w-full mt-6 mb-2">
            <div className="flex items-center justify-between p-2 rounded-2xl bg-zinc-900/95 border border-white/[0.1] text-xs font-bold shadow-xl">
              <button
                disabled={activeTab === 'customer'}
                onClick={() => setActiveTab(activeTab === 'admin' ? 'kitchen' : 'customer')}
                className="px-2.5 py-1.5 rounded-xl text-orange-400 disabled:opacity-25 disabled:text-zinc-600 hover:bg-white/[0.05] transition-all flex items-center gap-1 active:scale-95"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Önceki Rol</span>
              </button>

              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.05]">
                <span className={`w-2 h-2 rounded-full animate-ping ${
                  activeTab === 'customer' ? 'bg-orange-400' : activeTab === 'kitchen' ? 'bg-amber-400' : 'bg-emerald-400'
                }`} />
                <span className="text-white text-[11px] font-black uppercase tracking-wider">
                  {activeTab === 'customer' && '1/3: Müşteri'}
                  {activeTab === 'kitchen' && '2/3: Mutfak'}
                  {activeTab === 'admin' && '3/3: Kasa'}
                </span>
              </div>

              <button
                disabled={activeTab === 'admin'}
                onClick={() => setActiveTab(activeTab === 'customer' ? 'kitchen' : 'admin')}
                className="px-2.5 py-1.5 rounded-xl text-orange-400 disabled:opacity-25 disabled:text-zinc-600 hover:bg-white/[0.05] transition-all flex items-center gap-1 active:scale-95"
              >
                <span>Sonraki Rol</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 text-center mt-2 flex items-center justify-center gap-1.5 font-medium">
              <span>👆 Parmağınızla sağa / sola kaydırarak rolleri gezebilirsiniz</span>
            </p>
          </div>

          {/* Role switcher buttons */}
          <div className="mt-4 sm:mt-8 p-1.5 rounded-2xl bg-zinc-900/90 border border-white/[0.08] flex items-center justify-between sm:inline-flex sm:justify-center gap-1 sm:gap-1.5 shadow-2xl w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('customer')}
              className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex-1 sm:flex-initial ${
                activeTab === 'customer'
                  ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/25 scale-[1.02]'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">1. Müşteri</span>
              {cart.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-white text-orange-600 text-[10px] font-black">
                  {cart.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('kitchen')}
              className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex-1 sm:flex-initial ${
                activeTab === 'kitchen'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/25 scale-[1.02]'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <ChefHat className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">2. Mutfak</span>
              <span className="px-1.5 py-0.2 rounded-full bg-amber-400/20 text-amber-300 text-[10px] font-bold">
                {orders.filter((o) => o.status !== 'tamamlandi').length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('admin')}
              className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex-1 sm:flex-initial ${
                activeTab === 'admin'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25 scale-[1.02]'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">3. Kasa</span>
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-400/20 text-emerald-300 text-[10px]">
                Canlı
              </span>
            </button>
          </div>
        </div>

        {/* Playground Frame with Touch Gestures */}
        <div 
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="rounded-3xl bg-[#111116] border border-white/[0.08] p-3.5 sm:p-7 shadow-2xl relative overflow-hidden min-h-[640px]"
        >
          {/* Order Success Interactive Guidance Banner */}
          {orderSuccessBanner && (
            <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-orange-500/20 via-amber-500/20 to-emerald-500/20 border border-orange-500/40 flex flex-col sm:flex-row items-center justify-between gap-3 animate-fadeIn">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-orange-500 text-white font-black text-sm">🎉</span>
                <div>
                  <h4 className="text-sm font-bold text-white">Siparişiniz Başarıyla Mutfak KDS'e İletildi!</h4>
                  <p className="text-xs text-zinc-300">Şimdi 2. mutfak ekranına geçip fişin pişirme durumunu canlı izleyin.</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setActiveTab('kitchen');
                  setOrderSuccessBanner(false);
                }}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 shrink-0 active:scale-95"
              >
                <ChefHat className="w-4 h-4" />
                <span>2. Mutfak Ekranını Aç</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          
          {/* TAB 1: CUSTOMER QR MENU */}
          {activeTab === 'customer' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left Column: Menu Items Showcase */}
              <div className={`lg:col-span-7 ${customerMobileView === 'cart' ? 'hidden lg:block' : 'block'}`}>
                {/* Mobile restaurant banner */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-white/[0.08] gap-3">
                  <div className="flex items-center gap-3">
                    <MasaLink3DLogo size="sm" showText={false} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <h3 className="text-base font-bold text-white">MasaLink Gastro Lounge</h3>
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Temassız QR Menü • 3D Restoran Ekosistemi
                      </p>
                    </div>
                  </div>

                  {/* Table selector */}
                  <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-lg border border-white/[0.08]">
                    <span className="text-xs text-zinc-400">Masa:</span>
                    <select
                      value={selectedTable}
                      onChange={(e) => setSelectedTable(e.target.value)}
                      className="bg-transparent text-xs font-bold text-orange-400 focus:outline-none cursor-pointer"
                    >
                      <option value="Masa 04" className="bg-zinc-900 text-white">Masa 04 (İç Alan)</option>
                      <option value="Masa 07" className="bg-zinc-900 text-white">Masa 07 (Pencere)</option>
                      <option value="Bahçe 02" className="bg-zinc-900 text-white">Bahçe 02 (Teras)</option>
                      <option value="Bar 01" className="bg-zinc-900 text-white">Bar 01 (Hızlı)</option>
                    </select>
                  </div>
                </div>

                {/* Mobile View Switcher (Menü vs Sepet) */}
                <div className="lg:hidden flex items-center p-1 rounded-xl bg-zinc-900 border border-white/[0.08] my-3">
                  <button
                    onClick={() => setCustomerMobileView('menu')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      customerMobileView === 'menu'
                        ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Utensils className="w-3.5 h-3.5" />
                    <span>Menü Listesi</span>
                  </button>

                  <button
                    onClick={() => setCustomerMobileView('cart')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      customerMobileView === 'cart'
                        ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>Sepetim</span>
                    {cart.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-white text-orange-600 text-[10px] font-black">
                        {cart.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* Categories */}
                <div className="flex items-center gap-2 py-4 overflow-x-auto no-scrollbar">
                  {[
                    { id: 'all', label: 'Tüm Menü' },
                    { id: 'burger', label: '🍔 Burger & Atıştırmalık' },
                    { id: 'pizza', label: '🍕 Taş Fırın Pizza' },
                    { id: 'drink', label: '🍹 İçecekler' },
                    { id: 'dessert', label: '🍰 Tatlılar' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                        selectedCategory === cat.id
                          ? 'bg-orange-500 text-white font-bold shadow-md shadow-orange-500/30'
                          : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Products Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-2 max-h-[460px] overflow-y-auto pr-1">
                  {filteredMenuItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-zinc-900/70 border border-white/[0.06] hover:border-orange-500/30 rounded-xl p-3.5 flex flex-col justify-between transition-all group"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{item.image}</span>
                            <span className="text-xs font-bold text-white group-hover:text-orange-400 transition-colors">
                              {item.name}
                            </span>
                          </div>
                          {item.popular && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 font-bold">
                              Popüler
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-zinc-400 line-clamp-2 mt-1 leading-relaxed">
                          {item.description}
                        </p>
                      </div>

                      <div className="mt-3 pt-2 border-t border-white/[0.04] flex items-center justify-between">
                        <span className="text-xs font-black text-white">
                          {formatCurrency(item.price)}
                        </span>
                        <button
                          onClick={() => addToCart(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition-all active:scale-95 shadow-md shadow-orange-500/20"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Sepete Ekle
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Mobile Sticky Floating Quick Cart Action Bar */}
                {cart.length > 0 && customerMobileView === 'menu' && (
                  <div className="lg:hidden sticky bottom-1 z-30 mt-4 p-3 rounded-2xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-600 text-white shadow-2xl shadow-black/80 flex items-center justify-between border border-white/20 animate-fadeIn">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-black/30">
                        <ShoppingBag className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="text-xs font-black">{cart.length} Kalem • {formatCurrency(cartTotal)}</div>
                        <button 
                          onClick={() => setCustomerMobileView('cart')}
                          className="text-[10px] text-amber-100 underline font-medium text-left"
                        >
                          Sepeti Düzenle ›
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={handleSendOrder}
                      className="px-4 py-2 bg-white text-orange-600 hover:bg-zinc-100 font-extrabold rounded-xl text-xs shadow-lg active:scale-95 transition-all flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Siparişi Gönder ⚡</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Right Column: Customer Phone Mockup Cart */}
              <div className={`lg:col-span-5 bg-gradient-to-b from-[#181820] to-[#121218] rounded-2xl p-4 sm:p-5 border border-white/[0.08] shadow-xl flex flex-col justify-between ${customerMobileView === 'menu' ? 'hidden lg:flex' : 'flex'}`}>
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-orange-400" />
                      <h4 className="text-sm font-bold text-white">Masa Adisyon Sepeti</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">
                        {selectedTable}
                      </span>
                      {customerMobileView === 'cart' && (
                        <button
                          onClick={() => setCustomerMobileView('menu')}
                          className="lg:hidden text-[10px] px-2 py-1 rounded bg-zinc-800 text-zinc-300 font-semibold hover:text-white"
                        >
                          ← Menüye Dön
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Cart Items List */}
                  <div className="mt-4 space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {cart.length === 0 ? (
                      <div className="py-12 text-center text-zinc-500">
                        <ShoppingBag className="w-10 h-10 mx-auto opacity-30 mb-2" />
                        <p className="text-xs">Henüz ürün eklemediniz.</p>
                        <p className="text-[11px] text-zinc-600 mt-0.5">
                          Soldaki menüden ürün seçip masanıza sipariş verin.
                        </p>
                      </div>
                    ) : (
                      cart.map((cartItem) => (
                        <div
                          key={cartItem.item.id}
                          className="bg-zinc-950/70 p-2.5 rounded-xl border border-white/[0.05] flex items-center justify-between"
                        >
                          <div>
                            <div className="text-xs font-bold text-zinc-200">
                              {cartItem.item.name}
                            </div>
                            <div className="text-[10px] text-zinc-400">
                              {formatCurrency(cartItem.item.price)} × {cartItem.quantity}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateCartQuantity(cartItem.item.id, -1)}
                              className="p-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-xs font-bold text-white w-4 text-center">
                              {cartItem.quantity}
                            </span>
                            <button
                              onClick={() => updateCartQuantity(cartItem.item.id, 1)}
                              className="p-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Cart Footer */}
                <div className="mt-6 pt-4 border-t border-white/[0.08] space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-400">Ara Toplam (KDV Dahil):</span>
                    <span className="text-base font-black text-white">
                      {formatCurrency(cartTotal)}
                    </span>
                  </div>

                  <button
                    disabled={cart.length === 0}
                    onClick={handleSendOrder}
                    className={`w-full py-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                      cart.length > 0
                        ? 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-xl shadow-orange-500/25 active:scale-95'
                        : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    }`}
                  >
                    <Send className="w-4 h-4" />
                    Siparişi Mutfak & Kasaya Gönder
                  </button>

                  <p className="text-[10px] text-center text-zinc-500">
                    ⚡ Butona tıkladığınızda sipariş anında KDS ekranına düşer ve ciro güncellenir.
                  </p>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: KITCHEN KDS DISPLAY */}
          {activeTab === 'kitchen' && (
            <div>
              {/* KDS Header bar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-white/[0.08] gap-3">
                <div className="flex items-center gap-3">
                  <MasaLink3DLogo size="sm" showText={false} />
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Mutfak Ekranı (KDS) İstasyonu
                      <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono">
                        3D İstasyon Akışı
                      </span>
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Siparişleri hazırlama durumlarına göre ilerletin; gecikenleri tek bakışta görün.
                    </p>
                  </div>
                </div>

                {/* Station Filters */}
                <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-lg border border-white/[0.06] overflow-x-auto max-w-full no-scrollbar shrink-0">
                  {['Tümü', 'Izgara & Sıcak', 'Fırın & Pizza', 'Bar'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setSelectedStation(st)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold whitespace-nowrap transition-all ${
                        selectedStation === st
                          ? 'bg-amber-500 text-black'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* KDS Columns / Tickets Grid */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredOrders.length === 0 ? (
                  <div className="col-span-full py-16 text-center text-zinc-500">
                    <ChefHat className="w-12 h-12 mx-auto opacity-30 mb-2" />
                    <p className="text-sm">Bu istasyonda bekleyen sipariş yok.</p>
                    <button
                      onClick={() => setActiveTab('customer')}
                      className="mt-3 text-xs font-bold text-orange-400 underline underline-offset-4"
                    >
                      Müşteri menüsünden yeni sipariş gönder &rarr;
                    </button>
                  </div>
                ) : (
                  filteredOrders.map((order) => {
                    // Status badge colors
                    const isPending = order.status === 'bekliyor';
                    const isCooking = order.status === 'hazirlaniyor';
                    const isReady = order.status === 'hazir';
                    const isDone = order.status === 'tamamlandi';

                    const isDelayed = order.elapsedSeconds > 480;

                    return (
                      <div
                        key={order.id}
                        className={`rounded-2xl p-4 border flex flex-col justify-between transition-all ${
                          isDone
                            ? 'bg-zinc-900/30 border-white/[0.04] opacity-60'
                            : isDelayed
                            ? 'bg-red-950/20 border-red-500/40 shadow-lg shadow-red-950/30'
                            : 'bg-zinc-900/80 border-white/[0.08] hover:border-amber-500/40'
                        }`}
                      >
                        <div>
                          {/* Ticket Top bar */}
                          <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06]">
                            <div>
                              <span className="text-xs font-black text-white">{order.tableNumber}</span>
                              <span className="text-[10px] text-zinc-400 ml-2">#{order.id}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                                  isDelayed
                                    ? 'bg-red-500/20 text-red-400 animate-pulse'
                                    : 'bg-zinc-800 text-amber-300'
                                }`}
                              >
                                <Clock className="w-3 h-3" />
                                {formatSeconds(order.elapsedSeconds)}
                              </span>
                            </div>
                          </div>

                          {/* Station label */}
                          <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-400">
                            <span>İstasyon: {order.station}</span>
                            <span>{order.orderTime}</span>
                          </div>

                          {/* Order Items list */}
                          <div className="mt-3 space-y-2">
                            {order.items.map((it, idx) => (
                              <div
                                key={idx}
                                className="bg-zinc-950/60 p-2 rounded-lg border border-white/[0.03] text-xs flex justify-between"
                              >
                                <div>
                                  <span className="font-bold text-zinc-200">
                                    {it.quantity}x {it.name}
                                  </span>
                                  {it.notes && (
                                    <div className="text-[10px] text-zinc-400 mt-0.5">
                                      Not: {it.notes}
                                    </div>
                                  )}
                                </div>
                                <span className="font-mono text-zinc-400">
                                  {formatCurrency(it.price)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Status action button */}
                        <div className="mt-4 pt-3 border-t border-white/[0.06]">
                          {isPending && (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'hazirlaniyor')}
                              className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold transition-all"
                            >
                              👨‍🍳 Hazırlamaya Başla
                            </button>
                          )}
                          {isCooking && (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'hazir')}
                              className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow-md shadow-emerald-500/20"
                            >
                              ✓ Hazır - Garsona Bildir
                            </button>
                          )}
                          {isReady && (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'tamamlandi')}
                              className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all"
                            >
                              🍽️ Masaya Teslim Edildi
                            </button>
                          )}
                          {isDone && (
                            <div className="text-center text-xs font-semibold text-emerald-400 py-1 flex items-center justify-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Teslim Edildi
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {/* Bottom Next-Step Guidance Bar */}
              <div className="mt-8 p-3.5 sm:p-4 rounded-2xl bg-zinc-900/80 border border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 text-zinc-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span>Mutfakta siparişi hazırladınız mı? Şimdi ciro ve Vision AI radarındaki canlı etkisini görün:</span>
                </div>
                <button
                  onClick={() => setActiveTab('admin')}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-xs shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5 shrink-0 active:scale-95 transition-all"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>3. Kasa & Yönetici Paneline Geç</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: ADMIN / POS DASHBOARD */}
          {activeTab === 'admin' && (
            <div>
              {/* Cockpit Top Bar with Vision AI Badge */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 mb-5 border-b border-white/[0.08] gap-3">
                <div className="flex items-center gap-3">
                  <MasaLink3DLogo size="sm" badge="POS Cockpit" />
                  <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-mono">
                    <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                    Vision AI Radar Aktif (4 IP Kamera)
                  </span>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                  <button
                    onClick={triggerVisionEvent}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition-all active:scale-95"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>+ Vision AI Alarmı Tetikle</span>
                  </button>
                  <span className="text-xs text-zinc-400 font-mono">
                    Şube: Kadıköy
                  </span>
                </div>
              </div>

              {/* Mobile Sub-View Switcher for Single-Focus (KPIs vs Vision AI Radar) */}
              <div className="lg:hidden flex items-center p-1 rounded-xl bg-zinc-900 border border-white/[0.08] mb-5">
                <button
                  onClick={() => setAdminMobileView('kpi')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    adminMobileView === 'kpi'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>1. Ciro & Adisyonlar</span>
                </button>
                <button
                  onClick={() => setAdminMobileView('radar')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    adminMobileView === 'radar'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5 text-emerald-300" />
                  <span>2. Vision AI Radar</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px] font-mono">
                    {visionAlerts.filter((a) => !a.handled).length}
                  </span>
                </button>
              </div>

              {/* Dashboard Top KPIs */}
              <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 ${adminMobileView === 'radar' ? 'hidden lg:grid' : 'grid'}`}>
                <div className="bg-zinc-900/80 p-4 rounded-2xl border border-white/[0.06]">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                    <span>Canlı Günlük Ciro</span>
                    <span className="p-1 rounded bg-emerald-500/20 text-emerald-400">
                      <TrendingUp className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="text-2xl font-black text-white">
                    {formatCurrency(totalRevenue)}
                  </div>
                  <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                    <span>+%24.8</span>
                    <span className="text-zinc-500">düne kıyasla</span>
                  </div>
                </div>

                <div className="bg-zinc-900/80 p-4 rounded-2xl border border-white/[0.06]">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                    <span>Aktif Masalar</span>
                    <span className="p-1 rounded bg-orange-500/20 text-orange-400">
                      <Utensils className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="text-2xl font-black text-white">
                    18 / 24 <span className="text-xs font-normal text-zinc-400">(%75 Dolu)</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-1">Ort. Masa Süresi: 34 dk</div>
                </div>

                <div className="bg-zinc-900/80 p-4 rounded-2xl border border-white/[0.06]">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                    <span>Ortalama Hazırlık Süresi</span>
                    <span className="p-1 rounded bg-amber-500/20 text-amber-400">
                      <Clock className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="text-2xl font-black text-white">6 dk 42 sn</div>
                  <div className="text-[10px] text-emerald-400 mt-1">Hedef: &lt; 9 dk (Mükemmel)</div>
                </div>

                <div className="bg-zinc-900/80 p-4 rounded-2xl border border-white/[0.06]">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                    <span>Net Kâr Marjı (Reçete)</span>
                    <span className="p-1 rounded bg-purple-500/20 text-purple-400">
                      <DollarSign className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="text-2xl font-black text-purple-300">%68.4</div>
                  <div className="text-[10px] text-zinc-400 mt-1">Hammadde kaçağı: %0.2</div>
                </div>
              </div>

              {/* Vision AI Radar / Canlı Kamera Akışı */}
              <div className={`mb-6 rounded-2xl bg-[#0e0e14] border border-emerald-500/30 p-4 sm:p-5 shadow-xl relative overflow-hidden ${adminMobileView === 'kpi' ? 'hidden lg:block' : 'block'}`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 mb-3 border-b border-white/[0.06] gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <Camera className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        Vision AI Radar: Canlı Kamera Bildirim Akışı
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono animate-pulse">
                          Otomatik Görüntü İşleme
                        </span>
                      </h4>
                      <p className="text-[11px] text-zinc-400">
                        Restoran güvenlik kameralarından gelen otomatik müşteri oturumu, bekleme alarmları ve temizlik çağrıları.
                      </p>
                    </div>
                  </div>
                  <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>RTSP 1080p • YOLO-v9 Canlı</span>
                  </div>
                </div>

                {/* Alert Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {visionAlerts.map((alert) => {
                    const isHandled = alert.handled;
                    const isWarning = alert.type === 'waiting_delay';
                    const isOccupancy = alert.type === 'occupancy';
                    const isCleared = alert.type === 'cleared';

                    return (
                      <div
                        key={alert.id}
                        className={`rounded-xl p-3 border flex flex-col justify-between transition-all ${
                          isHandled
                            ? 'bg-zinc-900/30 border-white/[0.04] opacity-50'
                            : isWarning
                            ? 'bg-amber-950/20 border-amber-500/50 shadow-md shadow-amber-950/20'
                            : isOccupancy
                            ? 'bg-emerald-950/20 border-emerald-500/40'
                            : isCleared
                            ? 'bg-cyan-950/20 border-cyan-500/40'
                            : 'bg-zinc-900/70 border-white/[0.08]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/[0.04]">
                            <span className="text-xs font-black text-white flex items-center gap-1.5">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  isWarning
                                    ? 'bg-amber-400 animate-ping'
                                    : isOccupancy
                                    ? 'bg-emerald-400'
                                    : isCleared
                                    ? 'bg-cyan-400'
                                    : 'bg-purple-400'
                                }`}
                              />
                              {alert.tableNumber}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-400">{alert.time}</span>
                          </div>

                          <span className="text-[11px] font-bold text-zinc-200 block mb-1">
                            {alert.title}
                          </span>
                          <p className="text-[11px] text-zinc-400 leading-snug">
                            {alert.message}
                          </p>
                        </div>

                        {alert.actionLabel && (
                          <div className="mt-3 pt-2 border-t border-white/[0.04]">
                            {isHandled ? (
                              <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> İşlem Tamamlandı
                              </span>
                            ) : (
                              <button
                                onClick={() => handleVisionAction(alert.id)}
                                className={`w-full py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                                  isWarning
                                    ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-md shadow-amber-500/20'
                                    : isOccupancy
                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                    : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                                }`}
                              >
                                {alert.actionLabel}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Middle Section: Live Tables & Stock Recipe Watch */}
              <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6 ${adminMobileView === 'radar' ? 'hidden lg:grid' : 'grid'}`}>
                
                {/* Active Tables Adisyon list */}
                <div className="lg:col-span-7 bg-zinc-900/60 p-5 rounded-2xl border border-white/[0.06]">
                  <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-4">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-emerald-400" />
                      Açık Masalar & Adisyon Kapatma
                    </h4>
                    <span className="text-xs text-zinc-400">Hızlı Tahsilat</span>
                  </div>

                  <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {orders.map((o) => (
                      <div
                        key={o.id}
                        className="bg-zinc-950/70 p-3 rounded-xl border border-white/[0.04] flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{o.tableNumber}</span>
                            <span className="text-[10px] text-zinc-500">#{o.id}</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">
                              {o.items.length} Kalem
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-400 mt-0.5">
                            {o.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black text-white">
                            {formatCurrency(o.totalPrice)}
                          </span>
                          <button
                            onClick={() => {
                              showNotification(`${o.tableNumber} hesabı kapatıldı (${formatCurrency(o.totalPrice)} tahsil edildi).`);
                              setOrders((prev) => prev.filter((ord) => ord.id !== o.id));
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all shadow-md shadow-emerald-600/20"
                          >
                            Hesabı Kapat
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stock Recipe Tracker Widget */}
                <div className="lg:col-span-5 bg-zinc-900/60 p-5 rounded-2xl border border-white/[0.06] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-4">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Boxes className="w-4 h-4 text-orange-400" />
                        Canlı Reçete & Stok Düşümü
                      </h4>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 font-bold">
                        Otomatik
                      </span>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <div className="flex justify-between text-zinc-300 mb-1">
                          <span>Dana Antrikot & Kıyma:</span>
                          <span className="font-mono text-emerald-400 font-bold">14.2 kg kaldı</span>
                        </div>
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-emerald-500 h-full w-[68%]" />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-zinc-300 mb-1">
                          <span>Brioche Burger Ekmeği:</span>
                          <span className="font-mono text-amber-400 font-bold">42 adet kaldı</span>
                        </div>
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-amber-500 h-full w-[45%]" />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-zinc-300 mb-1">
                          <span>Manda Mozzarella:</span>
                          <span className="font-mono text-emerald-400 font-bold">8.5 kg kaldı</span>
                        </div>
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-emerald-500 h-full w-[82%]" />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-zinc-300 mb-1">
                          <span>Bodrum Limonu (Taze):</span>
                          <span className="font-mono text-emerald-400 font-bold">22 kg kaldı</span>
                        </div>
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-emerald-500 h-full w-[75%]" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-[11px] text-zinc-300">
                    💡 Satılan her ürün için hammadde stoğu otomatik düşer; tedarikçiye tek tıkla sipariş listesi oluşturur.
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>

      </div>
    </section>
  );
};
