'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { 
  QUICK_MENU_ITEMS, 
  MENU_CATEGORIES, 
  MenuItem 
} from '@/utils/menuData';
import { 
  getStoredTables, 
  saveStoredTables, 
  INITIAL_TABLES 
} from '@/utils/tableData';
import { AdminTable } from '@/components/admin/TableDetailDrawer';
import { formatCurrency } from '@/utils/helpers';
import { syncService, SyncMessage } from '@/utils/syncService';
import { 
  evaluateQrOrderSecurity, 
  checkClientRateLimit, 
  recordClientAttempt 
} from '@/utils/qrSecurityEngine';
import { 
  ShoppingBag, 
  Plus, 
  Minus, 
  Check, 
  ChefHat, 
  Sparkles, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  Bell, 
  Receipt, 
  X, 
  ShieldCheck, 
  Flame, 
  Utensils, 
  Send, 
  Info,
  CreditCard,
  Banknote,
  ArrowRight
} from 'lucide-react';

interface SelectedExtra {
  id: string;
  name: string;
  price: number;
}

interface CartItem {
  id: string;
  product: MenuItem;
  quantity: number;
  cookingLevel?: 'Az Pişmiş' | 'Orta Pişmiş' | 'İyi Pişmiş';
  extras: SelectedExtra[];
  customNote?: string;
  totalPrice: number;
  guestTag?: string;
}

const AVAILABLE_EXTRAS: SelectedExtra[] = [
  { id: 'ex-1', name: 'Ekstra Eritilmiş Cheddar', price: 35 },
  { id: 'ex-2', name: 'Çıtır Dana Füme Bacon', price: 55 },
  { id: 'ex-3', name: 'Trüflü Mayonez Sosu', price: 30 },
  { id: 'ex-4', name: 'Karamelize Çıtır Soğan', price: 25 },
  { id: 'ex-5', name: 'Jalapeno Acı Biber Turşusu', price: 20 },
];

const ALLERGEN_MAP: Record<string, string[]> = {
  Burgerler: ['Gluten', 'Süt / Laktoz', 'Susam'],
  Yanlar: ['Gluten', 'Süt'],
  Tatlılar: ['Gluten', 'Yumurta', 'Süt'],
  İçecekler: [],
};

export default function CustomerQrMenuPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const tenantSlug = (params?.tenantSlug as string) || 'artisan-burger';
  const tableId = (params?.tableId as string) || 'tbl-1';
  const sessionToken = searchParams?.get('token') || undefined;

  // Table State
  const [table, setTable] = useState<AdminTable | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('Tümü');
  
  // Customization Modal State
  const [selectedProduct, setSelectedProduct] = useState<MenuItem | null>(null);
  const [modalCookingLevel, setModalCookingLevel] = useState<'Az Pişmiş' | 'Orta Pişmiş' | 'İyi Pişmiş'>('Orta Pişmiş');
  const [modalSelectedExtras, setModalSelectedExtras] = useState<SelectedExtra[]>([]);
  const [modalQuantity, setModalQuantity] = useState<number>(1);
  const [modalNote, setModalNote] = useState<string>('');

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartModalOpen, setIsCartModalOpen] = useState<boolean>(false);
  const [customerOrderNote, setCustomerOrderNote] = useState<string>('');

  // Rate Limiting & Security State
  const [securityBlockNotice, setSecurityBlockNotice] = useState<string | null>(null);
  const [rateLimitCountdown, setRateLimitCountdown] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Live Order Status Stepper
  const [liveOrderStatus, setLiveOrderStatus] = useState<'none' | 'pending_approval' | 'preparing' | 'ready' | 'served'>('none');
  const [lastSubmittedOrderId, setLastSubmittedOrderId] = useState<string | null>(null);

  // Call Waiter & Bill Request Modals
  const [callNotice, setCallNotice] = useState<string | null>(null);
  const [billModalOpen, setBillModalOpen] = useState<boolean>(false);
  const [billRequestedNotice, setBillRequestedNotice] = useState<string | null>(null);

  // Multi-Guest QR Session Tagging State (Çoklu QR Oturum & Kişi Bazlı Bölme)
  const [guestName, setGuestName] = useState<string>('Misafir 1');
  const [isGuestNameModalOpen, setIsGuestNameModalOpen] = useState<boolean>(false);
  const [tempGuestInput, setTempGuestInput] = useState<string>('');
  const [billPaymentScope, setBillPaymentScope] = useState<'my_share' | 'full_table'>('my_share');

  // Online Payment State (Iyzico / PayTR 3D Secure Masadan Ödeme)
  const [selectedGateway, setSelectedGateway] = useState<'IYZICO' | 'PAYTR'>('IYZICO');
  const [isInitiatingPayment, setIsInitiatingPayment] = useState<boolean>(false);
  const [onlinePaymentData, setOnlinePaymentData] = useState<{
    provider: 'IYZICO' | 'PAYTR';
    checkoutFormContent?: string;
    iframeUrl?: string;
    paymentUrl?: string;
    orderId?: string;
  } | null>(null);

  // Load Table on Mount & Subscribe to multi-device sync
  useEffect(() => {
    const loadedTables = getStoredTables();
    const currentTable = loadedTables.find((t) => t.id === tableId) || INITIAL_TABLES.find((t) => t.id === tableId);
    if (currentTable) {
      setTable(currentTable);
      if (currentTable.status === 'preparing') setLiveOrderStatus('preparing');
      if (currentTable.status === 'served') setLiveOrderStatus('served');

      // Cihaz bazında misafir oturum etiketini yükle / üret
      if (typeof window !== 'undefined') {
        const savedGuest = sessionStorage.getItem(`masalink_guest_tag_${tableId}`);
        if (savedGuest) {
          setGuestName(savedGuest);
        } else {
          // Masadaki mevcut misafir etiketlerini tara
          const existingTags = new Set(currentTable.items?.map((i: any) => i.guestTag).filter(Boolean));
          let count = 1;
          while (existingTags.has(`Misafir ${count}`)) {
            count++;
          }
          const generatedTag = `Misafir ${count}`;
          setGuestName(generatedTag);
          sessionStorage.setItem(`masalink_guest_tag_${tableId}`, generatedTag);
        }
      }
    }

    // Subscribe to multi-device sync
    const unsubscribe = syncService.subscribe((msg: SyncMessage) => {
      if (msg.payload?.tableId === tableId) {
        if (msg.type === 'TABLE_STATUS_CHANGED' || msg.type === 'GHOST_TABLE_RESET') {
          if (msg.payload.status === 'preparing') setLiveOrderStatus('preparing');
          if (msg.payload.status === 'served') setLiveOrderStatus('served');
          if (msg.payload.status === 'bill_requested') setBillRequestedNotice('Hesap istendi olarak işaretlendi.');
          if (msg.payload.status === 'cleaning' || msg.payload.status === 'empty' || msg.type === 'GHOST_TABLE_RESET') {
            setLiveOrderStatus('none');
            setCart([]);
            setTable((prev) => prev ? { ...prev, status: 'cleaning', items: [], totalAmount: 0 } : null);
          }
        }
        if (msg.type === 'QR_ORDER_APPROVED') {
          setLiveOrderStatus('preparing');
          setCallNotice('Siparişiniz garson tarafından onaylandı ve mutfağa fırlatıldı!');
          setTimeout(() => setCallNotice(null), 4000);
        }
        if (msg.type === 'ORDER_READY_FOR_PICKUP') {
          setLiveOrderStatus('ready');
          setCallNotice('🎉 Siparişiniz mutfakta hazırlandı! Garsonumuz masanıza servis ediyor.');
          setTimeout(() => setCallNotice(null), 7000);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [tableId]);

  // Rate limit countdown effect
  useEffect(() => {
    if (rateLimitCountdown <= 0) return;
    const interval = setInterval(() => {
      setRateLimitCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setSecurityBlockNotice(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [rateLimitCountdown]);

  // Filtered Menu Items
  const filteredProducts = useMemo(() => {
    if (activeCategory === 'Tümü') return QUICK_MENU_ITEMS;
    return QUICK_MENU_ITEMS.filter((i) => i.category === activeCategory);
  }, [activeCategory]);

  // Modal Open Handlers
  const handleOpenProductModal = (product: MenuItem) => {
    setSelectedProduct(product);
    setModalCookingLevel('Orta Pişmiş');
    setModalSelectedExtras([]);
    setModalQuantity(1);
    setModalNote('');
  };

  const handleToggleExtra = (extra: SelectedExtra) => {
    setModalSelectedExtras((prev) => {
      const exists = prev.some((e) => e.id === extra.id);
      if (exists) return prev.filter((e) => e.id !== extra.id);
      return [...prev, extra];
    });
  };

  const calculateModalUnitPrice = () => {
    if (!selectedProduct) return 0;
    const extrasTotal = modalSelectedExtras.reduce((sum, e) => sum + e.price, 0);
    return selectedProduct.price + extrasTotal;
  };

  // Add Item to Cart
  const handleAddToCart = () => {
    if (!selectedProduct) return;
    const unitPrice = calculateModalUnitPrice();
    const newItem: CartItem = {
      id: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      product: selectedProduct,
      quantity: modalQuantity,
      cookingLevel: selectedProduct.category === 'Burgerler' ? modalCookingLevel : undefined,
      extras: modalSelectedExtras,
      customNote: modalNote.trim() || undefined,
      totalPrice: unitPrice * modalQuantity,
      guestTag: guestName,
    };

    setCart((prev) => [...prev, newItem]);
    setSelectedProduct(null);

    // Haptic feedback
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(30);
      } catch (_) {}
    }
  };

  const handleRemoveCartItem = (itemId: string) => {
    setCart((prev) => prev.filter((i) => i.id !== itemId));
  };

  // Totals
  const totalCartCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const totalCartAmount = cart.reduce((sum, i) => sum + i.totalPrice, 0);

  // Submit QR Order Flow with 3-Tier Security Checks
  const handleSubmitQrOrder = async () => {
    if (cart.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setSecurityBlockNotice(null);

    // Unique client device fingerprint in sessionStorage
    let fingerprint = 'guest_fp_device';
    if (typeof window !== 'undefined') {
      fingerprint = sessionStorage.getItem('masalink_client_fp') || '';
      if (!fingerprint) {
        fingerprint = `fp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        sessionStorage.setItem('masalink_client_fp', fingerprint);
      }
    }

    // 1. Sunucu API üzerinden Fiyat Doğrulama & 3 Kademeli Güvenlik Kontrolü
    let apiData: any = null;
    try {
      const apiRes = await fetch('/api/qr-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug,
          tableId,
          clientFingerprint: fingerprint,
          sessionToken,
          customerNote: customerOrderNote,
          guestName,
          items: cart.map((ci) => ({
            productId: ci.product.id,
            name: ci.product.name,
            quantity: ci.quantity,
            cookingLevel: ci.cookingLevel,
            extras: ci.extras,
            customNote: ci.customNote,
            guestTag: ci.guestTag || guestName,
          })),
        }),
      });

      apiData = await apiRes.json();
      if (!apiRes.ok || !apiData.success) {
        setIsSubmitting(false);
        setSecurityBlockNotice(apiData.message || apiData.error || 'Sipariş iletilemedi.');
        if (apiData.retryAfterSeconds) {
          setRateLimitCountdown(apiData.retryAfterSeconds);
        }
        return;
      }
    } catch {
      // Çevrimdışı yerel fallback kontrolü
      const securityCheck = evaluateQrOrderSecurity({
        tenantSlug,
        tableId,
        clientFingerprint: fingerprint,
        sessionToken,
        table,
      });

      if (!securityCheck.allowed) {
        setIsSubmitting(false);
        setSecurityBlockNotice(securityCheck.userMessage);
        return;
      }
    }

    // Sunucunun onayladığı kalemler ve kesin hesaplanan tutar
    const newItems = apiData?.items ? apiData.items.map((vi: any) => ({
      name: vi.name,
      quantity: vi.quantity,
      price: vi.unitPrice,
      notes: vi.notes,
      guestTag: vi.guestTag || guestName,
    })) : cart.map((ci) => {
      const notesParts: string[] = [];
      if (ci.cookingLevel) notesParts.push(ci.cookingLevel);
      if (ci.extras.length > 0) notesParts.push(`Ekstra: ${ci.extras.map((e) => e.name).join(', ')}`);
      if (ci.customNote) notesParts.push(ci.customNote);

      return {
        name: ci.product.name,
        quantity: ci.quantity,
        price: ci.totalPrice / ci.quantity,
        notes: notesParts.length > 0 ? notesParts.join(' • ') : undefined,
        guestTag: ci.guestTag || guestName,
      };
    });

    const orderId = apiData?.orderId || `QR-${Date.now().toString().slice(-6)}`;
    const addedAmount = apiData?.totalAmount ?? totalCartAmount;
    const isPendingApproval = apiData ? apiData.requiresWaiterApproval : (table?.status === 'empty' || table?.status === 'waiting_menu');

    // 2. State & Storage Update
    const allTables = getStoredTables();
    const updatedTables = allTables.map((t) => {
      if (t.id === tableId) {
        return {
          ...t,
          status: isPendingApproval ? ('waiting_menu' as const) : ('preparing' as const),
          items: [...t.items, ...newItems],
          totalAmount: (t.totalAmount || 0) + addedAmount,
          lastActivity: isPendingApproval
            ? `QR İlk Sipariş (${totalCartCount} Kalem) - Garson Onayı Bekliyor`
            : `QR Doğrudan Sipariş (${totalCartCount} Kalem) - Mutfağa İletildi`,
        };
      }
      return t;
    });

    saveStoredTables(updatedTables);
    setTable(updatedTables.find((t) => t.id === tableId) || null);

    // 3. Multi-Device Realtime Broadcast
    if (isPendingApproval) {
      // Soft-Lock: Broadcast to Waiter Terminal & Cashier for one-tap verification
      syncService.broadcast('QR_ORDER_PENDING_APPROVAL', {
        orderId,
        tableId,
        tableName: table?.name || 'Masa',
        section: table?.section || 'salon',
        items: newItems,
        totalAmount: addedAmount,
        customerNote: customerOrderNote,
        timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      });
      setLiveOrderStatus('pending_approval');
    } else {
      // Verified Session: Direct to kitchen
      syncService.broadcast('ORDER_ITEMS_ADDED', {
        tableId,
        tableName: table?.name || 'Masa',
        waiterName: 'QR Misafir Siparişi',
        newItems,
        addedAmount,
        totalAmount: (table?.totalAmount || 0) + addedAmount,
        status: 'preparing',
      });
      setLiveOrderStatus('preparing');
    }

    setLastSubmittedOrderId(orderId);
    setCart([]);
    setIsCartModalOpen(false);
    setIsSubmitting(false);

    // Haptic vibration
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([60, 40, 100]);
      } catch (_) {}
    }
  };

  // Call Waiter Action
  const handleCallWaiter = () => {
    syncService.broadcast('CALL_WAITER_REQUESTED', {
      tableId,
      tableName: table?.name || 'Masa',
      section: table?.section || 'salon',
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    });

    setCallNotice('Garsonunuza çağrı iletildi. Birkaç dakika içinde masanızda olacaktır.');
    setTimeout(() => setCallNotice(null), 4000);

    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(50);
      } catch (_) {}
    }
  };

  // Request Bill Action (Kişi Bazlı veya Tüm Masa)
  const handleRequestBill = (method: 'Kredi Kartı' | 'Nakit' | 'Masaya Gel') => {
    const isPersonal = billPaymentScope === 'my_share';
    const myItems = table?.items?.filter((i: any) => (i.guestTag || 'Misafir 1').toLowerCase() === guestName.toLowerCase()) || [];
    const myTotal = myItems.reduce((acc: number, i: any) => acc + (i.price * i.quantity), 0);
    const requestedAmount = isPersonal && myTotal > 0 ? myTotal : (table?.totalAmount || 0);

    syncService.broadcast('BILL_REQUESTED', {
      tableId,
      tableName: table?.name || 'Masa',
      section: table?.section || 'salon',
      paymentMethod: method,
      guestName,
      isPersonal,
      personalAmount: myTotal,
      totalAmount: requestedAmount,
    });

    const allTables = getStoredTables();
    const updated = allTables.map((t) => (t.id === tableId ? { ...t, status: 'bill_requested' as const } : t));
    saveStoredTables(updated);
    setTable(updated.find((t) => t.id === tableId) || null);

    setBillModalOpen(false);
    setBillRequestedNotice(`Hesap talebiniz (${method}) kasaya iletildi.`);
    setTimeout(() => setBillRequestedNotice(null), 5000);

    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([40, 40, 60]);
      } catch (_) {}
    }
  };

  // Masadan Çevrimiçi Ödeme Başlatma (Iyzico / PayTR)
  const handleStartOnlinePayment = async (amount: number) => {
    setIsInitiatingPayment(true);
    try {
      const res = await fetch('/api/payment/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'tenant-artisan-burger',
          tableId,
          tableCode: table?.name || tableId,
          amount,
          provider: selectedGateway,
          customerName: guestName,
          isPartialPayment: billPaymentScope === 'my_share',
          guestName,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setOnlinePaymentData({
          provider: selectedGateway,
          checkoutFormContent: data.checkoutFormContent,
          iframeUrl: data.iframeUrl,
          paymentUrl: data.paymentUrl,
          orderId: data.merchantOrderId,
        });
        setBillModalOpen(false);
      } else {
        alert(data.error || 'Ödeme başlatılamadı.');
      }
    } catch (err) {
      alert('Ödeme sunucusuna bağlanırken hata oluştu.');
    } finally {
      setIsInitiatingPayment(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-[#070a12] text-slate-100 flex justify-center selection:bg-amber-500/30 selection:text-amber-200">
      <div className="w-full max-w-md min-h-[100dvh] flex flex-col relative bg-[#0a0e19] shadow-2xl border-x border-slate-800/40 select-none pb-28">
        
        {/* Top Restaurant & Table Welcome Banner */}
        <header className="sticky top-0 z-30 bg-[#0a0e19]/95 backdrop-blur-md border-b border-slate-800 px-4 py-3.5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-base font-black text-white tracking-tight">
                {table?.name || 'Masa 12'}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {table?.section === 'salon' ? 'İç Salon' : table?.section === 'bahce' ? 'Açık Bahçe' : 'Teras Kat'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              Artisan Burger Bar • Masadan QR Sipariş
            </p>
          </div>

          {/* Quick Waiter Call & Bill Actions */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCallWaiter}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 active:scale-95 transition-all text-xs font-bold border border-slate-700 flex items-center gap-1"
              title="Garson Çağır"
            >
              <Bell className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Garson</span>
            </button>

            <button
              onClick={() => setBillModalOpen(true)}
              disabled={!table || table.totalAmount === 0}
              className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${
                table && table.totalAmount > 0
                  ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 active:scale-95'
                  : 'bg-slate-800/40 text-slate-600 border border-slate-800 cursor-not-allowed'
              }`}
              title="Hesap İste"
            >
              <Receipt className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Hesap</span>
            </button>
          </div>
        </header>

        {/* Multi-Guest Session Pill (Çoklu QR Oturum & Kişi Etiketi) */}
        <div className="mx-4 mt-2.5 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-slate-900 to-[#0e1424] border border-slate-800 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center text-xs border border-blue-500/30">
              👤
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-medium block">Sipariş Veren Misafir:</span>
              <span className="text-xs font-black text-amber-300">{guestName}</span>
            </div>
          </div>
          <button
            onClick={() => {
              setTempGuestInput(guestName);
              setIsGuestNameModalOpen(true);
            }}
            className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold border border-slate-700 transition-colors flex items-center gap-1"
          >
            <span>İsmi Değiştir</span>
            <span className="text-amber-400">✎</span>
          </button>
        </div>

        {/* Call Waiter & Bill Request Toasts */}
        {callNotice && (
          <div className="bg-amber-500/20 border-b border-amber-500/40 px-4 py-2.5 text-xs text-amber-200 flex items-center gap-2 animate-fadeIn font-semibold">
            <Bell className="w-4 h-4 text-amber-400 animate-bounce shrink-0" />
            <span>{callNotice}</span>
          </div>
        )}

        {billRequestedNotice && (
          <div className="bg-purple-500/20 border-b border-purple-500/40 px-4 py-2.5 text-xs text-purple-200 flex items-center gap-2 animate-fadeIn font-semibold">
            <Receipt className="w-4 h-4 text-purple-400 animate-pulse shrink-0" />
            <span>{billRequestedNotice}</span>
          </div>
        )}

        {/* Security / Rate Limit Block Banner */}
        {securityBlockNotice && (
          <div className="m-4 p-3 rounded-2xl bg-rose-500/20 border-2 border-rose-500/50 text-rose-200 text-xs flex items-start gap-2.5 animate-fadeIn">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-extrabold block text-rose-100">Güvenlik Denetimi</span>
              <p className="mt-0.5 leading-snug">{securityBlockNotice}</p>
              {rateLimitCountdown > 0 && (
                <div className="mt-2 flex items-center gap-1.5 font-mono text-[11px] font-bold text-amber-300 bg-rose-950/60 px-2 py-1 rounded-lg w-max border border-rose-500/30">
                  <Clock className="w-3 h-3 text-amber-400 animate-spin" />
                  <span>Kalan Bekleme: {rateLimitCountdown} sn</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live Order Status Stepper (If an order has been submitted) */}
        {liveOrderStatus !== 'none' && (
          <div className="mx-4 mt-3 mb-1 p-3.5 rounded-2xl bg-gradient-to-r from-slate-900 to-[#0e1424] border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <ChefHat className="w-3.5 h-3.5 text-amber-400" />
                Masa Sipariş Durumu
              </span>
              <span className="text-[10px] font-mono text-amber-400 font-bold">
                {lastSubmittedOrderId || 'Canlı Sipariş'}
              </span>
            </div>

            {/* Stepper Progress */}
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <div className={`p-2 rounded-xl text-center border text-[10px] font-bold ${
                liveOrderStatus === 'pending_approval'
                  ? 'bg-amber-500/20 border-amber-400 text-amber-300 animate-pulse'
                  : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              }`}>
                <div className="flex justify-center mb-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <span>{liveOrderStatus === 'pending_approval' ? 'Garson Onayında' : 'İletildi ✓'}</span>
              </div>

              <div className={`p-2 rounded-xl text-center border text-[10px] font-bold ${
                liveOrderStatus === 'preparing'
                  ? 'bg-orange-500/25 border-orange-400 text-orange-300 animate-pulse'
                  : liveOrderStatus === 'ready' || liveOrderStatus === 'served'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}>
                <div className="flex justify-center mb-0.5">
                  <Flame className="w-3.5 h-3.5" />
                </div>
                <span>{liveOrderStatus === 'ready' || liveOrderStatus === 'served' ? 'Hazırlandı ✓' : 'Hazırlanıyor'}</span>
              </div>

              <div className={`p-2 rounded-xl text-center border text-[10px] font-bold ${
                liveOrderStatus === 'ready'
                  ? 'bg-emerald-500/30 border-emerald-400 text-emerald-300 animate-pulse ring-1 ring-emerald-400'
                  : liveOrderStatus === 'served'
                  ? 'bg-blue-500/25 border-blue-400 text-blue-300'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}>
                <div className="flex justify-center mb-0.5">
                  <Utensils className="w-3.5 h-3.5" />
                </div>
                <span>{liveOrderStatus === 'ready' ? '🍽️ Servise Geliyor!' : liveOrderStatus === 'served' ? 'Servis Edildi' : 'Masaya Servis'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Existing Open Bill Summary Badge */}
        {table && table.items.length > 0 && (
          <div className="mx-4 mt-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              Masanızdaki Açık Adisyon:
            </span>
            <span className="font-extrabold text-amber-400 font-mono">
              {formatCurrency(table.totalAmount)} ({table.items.reduce((a, b) => a + b.quantity, 0)} kalem)
            </span>
          </div>
        )}

        {/* Horizontal Category Filter Pills */}
        <div className="sticky top-[61px] z-20 bg-[#070a12]/95 backdrop-blur-md px-4 py-2.5 overflow-x-auto no-scrollbar flex items-center gap-2 border-b border-slate-800/80 mt-1">
          {MENU_CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/25 ring-1 ring-amber-400'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Menu Product Grid */}
        <div className="p-4 space-y-3">
          {filteredProducts.map((product) => {
            const allergens = ALLERGEN_MAP[product.category] || [];

            return (
              <div
                key={product.id}
                onClick={() => handleOpenProductModal(product)}
                className="p-3.5 rounded-2xl bg-gradient-to-b from-[#0f1523] to-[#0c101c] border border-slate-800/80 hover:border-amber-500/40 active:scale-[0.99] transition-all cursor-pointer shadow-lg flex items-start justify-between gap-3 group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">
                      {product.name}
                    </span>
                    {product.popular && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                        Şefin Favorisi
                      </span>
                    )}
                  </div>

                  {product.description && (
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                      {product.description}
                    </p>
                  )}

                  {/* Allergen Chips */}
                  {allergens.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                      {allergens.map((alg) => (
                        <span key={alg} className="text-[9px] text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                          {alg}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="text-sm font-extrabold text-amber-400 font-mono mt-2">
                    {formatCurrency(product.price)}
                  </div>
                </div>

                {/* Add to table button */}
                <button
                  type="button"
                  className="w-9 h-9 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0 group-hover:bg-amber-500 group-hover:text-slate-950 transition-all shadow-sm"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Product Customization Modal (Item Detail Bottom Sheet) */}
        {selectedProduct && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
            <div className="w-full max-w-md bg-[#0c101c] border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
              
              {/* Modal Header */}
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-white">{selectedProduct.name}</h3>
                  <p className="text-xs font-mono text-amber-400 font-bold mt-0.5">
                    Başlangıç Fiyatı: {formatCurrency(selectedProduct.price)}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 overflow-y-auto space-y-4 no-scrollbar">
                {selectedProduct.description && (
                  <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
                    {selectedProduct.description}
                  </p>
                )}

                {/* Cooking Level Selector (For Burgers) */}
                {selectedProduct.category === 'Burgerler' && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                      Pişme Derecesi
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['Az Pişmiş', 'Orta Pişmiş', 'İyi Pişmiş'] as const).map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setModalCookingLevel(level)}
                          className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                            modalCookingLevel === level
                              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                              : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                          }`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Extras / Add-ons Selector */}
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Ekstra Malzemeler
                  </label>
                  <div className="space-y-2">
                    {AVAILABLE_EXTRAS.map((extra) => {
                      const isSelected = modalSelectedExtras.some((e) => e.id === extra.id);
                      return (
                        <button
                          key={extra.id}
                          type="button"
                          onClick={() => handleToggleExtra(extra)}
                          className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between text-xs transition-all ${
                            isSelected
                              ? 'bg-amber-500/15 border-amber-400/60 text-white'
                              : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                              isSelected ? 'bg-amber-500 border-amber-400 text-slate-950' : 'border-slate-700'
                            }`}>
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <span className="font-semibold">{extra.name}</span>
                          </div>
                          <span className="font-mono text-amber-400 font-bold">+{formatCurrency(extra.price)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Freeform Kitchen Note */}
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Özel Mutfak Notu
                  </label>
                  <input
                    type="text"
                    placeholder="Örn: Turşu ve soğan olmasın lütfen"
                    value={modalNote}
                    onChange={(e) => setModalNote(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {/* Modal Footer (Quantity Stepper & Add Button) */}
              <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalQuantity(Math.max(1, modalQuantity - 1))}
                    className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center justify-center active:scale-95"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-6 text-center font-extrabold font-mono text-base text-white">
                    {modalQuantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setModalQuantity(modalQuantity + 1)}
                    className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center justify-center active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/25 flex items-center justify-between active:scale-95 transition-all"
                >
                  <span>Masaya Ekle</span>
                  <span className="font-mono">{formatCurrency(calculateModalUnitPrice() * modalQuantity)}</span>
                </button>
              </div>

            </div>
          </div>
        )}

        {/* Floating Bottom Cart Bar */}
        {cart.length > 0 && !isCartModalOpen && (
          <div className="fixed bottom-0 left-0 right-0 z-40 p-3 bg-gradient-to-t from-black via-[#0a0e19] to-transparent">
            <div className="max-w-md mx-auto">
              <button
                type="button"
                onClick={() => setIsCartModalOpen(true)}
                className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-orange-500 text-slate-950 shadow-2xl shadow-amber-500/40 flex items-center justify-between font-black text-sm active:scale-[0.98] transition-all"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-slate-950/20 flex items-center justify-center">
                    <ShoppingBag className="w-4 h-4 text-slate-950" />
                  </div>
                  <span>{totalCartCount} Kalem Masada Bekliyor</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono tracking-tight">{formatCurrency(totalCartAmount)}</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Cart Review & Final Order Dispatch Modal */}
        {isCartModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
            <div className="w-full max-w-md bg-[#0c101c] border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
              
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-white">Siparişinizi Onaylayın</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-amber-400 font-bold">
                      {table?.name} • Toplam {totalCartCount} Kalem
                    </p>
                    <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/35 px-1.5 py-0.2 rounded-md font-bold">
                      👤 {guestName}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setIsCartModalOpen(false)}
                  className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Items List */}
              <div className="p-4 overflow-y-auto space-y-2.5 max-h-64 no-scrollbar">
                {cart.map((item) => (
                  <div key={item.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-white">
                        <span className="w-4 h-4 rounded bg-amber-500/20 text-amber-400 text-[10px] inline-flex items-center justify-center">
                          {item.quantity}x
                        </span>
                        <span>{item.product.name}</span>
                      </div>
                      {item.cookingLevel && (
                        <div className="text-[10px] text-amber-300/80 mt-0.5">
                          Pişme: {item.cookingLevel}
                        </div>
                      )}
                      {item.extras.length > 0 && (
                        <div className="text-[10px] text-slate-400">
                          {item.extras.map((e) => e.name).join(', ')}
                        </div>
                      )}
                      {item.customNote && (
                        <div className="text-[10px] text-slate-400 italic">
                          Not: {item.customNote}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className="font-mono text-xs font-bold text-amber-400">
                        {formatCurrency(item.totalPrice)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCartItem(item.id)}
                        className="text-[10px] text-rose-400 hover:underline"
                      >
                        Kaldır
                      </button>
                    </div>
                  </div>
                ))}

                {/* Additional Table Note */}
                <div className="pt-2">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Sipariş Genel Notu
                  </label>
                  <input
                    type="text"
                    placeholder="Örn: Masaya 2 ekstra bardak rica ediyoruz"
                    value={customerOrderNote}
                    onChange={(e) => setCustomerOrderNote(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {/* Security Engine Disclaimer */}
              <div className="px-4 py-2 bg-slate-900/60 border-t border-slate-800/80 flex items-center gap-2 text-[10px] text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>3 Kademeli Sahte Sipariş Güvenlik Motoru devrededir.</span>
              </div>

              {/* Action Buttons */}
              <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] text-slate-400 block">Ödenecek Tutar</span>
                  <span className="text-lg font-black text-amber-400 font-mono leading-none">
                    {formatCurrency(totalCartAmount)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleSubmitQrOrder}
                  disabled={isSubmitting}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 text-slate-950 font-black text-xs shadow-xl shadow-amber-500/30 flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  {isSubmitting ? (
                    <span>Doğrulanıyor...</span>
                  ) : (
                    <>
                      <Send className="w-4 h-4 fill-current" />
                      <span>⚡ Masaya Sipariş Ver</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>
        )}

        {/* Bill Request Modal (Kişi Bazlı veya Tüm Masa Hesap İste) */}
        {billModalOpen && (() => {
          const myItems = table?.items?.filter((i: any) => (i.guestTag || 'Misafir 1').toLowerCase() === guestName.toLowerCase()) || [];
          const myTotal = myItems.reduce((acc: number, i: any) => acc + (i.price * i.quantity), 0);
          const effectiveAmount = billPaymentScope === 'my_share' && myTotal > 0 ? myTotal : (table?.totalAmount || 0);

          // Masadaki tüm misafir grupları
          const guestBreakdown: { [tag: string]: { count: number; total: number; items: string[] } } = {};
          table?.items?.forEach((i: any) => {
            const tag = i.guestTag || 'Misafir 1';
            if (!guestBreakdown[tag]) guestBreakdown[tag] = { count: 0, total: 0, items: [] };
            guestBreakdown[tag].count += i.quantity;
            guestBreakdown[tag].total += i.price * i.quantity;
            guestBreakdown[tag].items.push(`${i.quantity}x ${i.name}`);
          });

          return (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4 animate-fadeIn">
              <div className="w-full max-w-sm bg-[#0e1320] border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
                      <Receipt className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-extrabold text-white">Hesap İste</h3>
                      <p className="text-[10px] text-slate-400">{table?.name} • Toplam: {formatCurrency(table?.totalAmount || 0)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setBillModalOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Hesap Bölme Kapsamı Seçimi */}
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1.5">
                    Ödeme Kapsamı Seçin:
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-2xl">
                    <button
                      type="button"
                      onClick={() => setBillPaymentScope('my_share')}
                      className={`py-2 px-2 rounded-xl text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${
                        billPaymentScope === 'my_share'
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>👤 Sadece Benim</span>
                      <span className="text-[10px] font-mono opacity-90">{formatCurrency(myTotal)}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setBillPaymentScope('full_table')}
                      className={`py-2 px-2 rounded-xl text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${
                        billPaymentScope === 'full_table'
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>👥 Tüm Masa</span>
                      <span className="text-[10px] font-mono opacity-90">{formatCurrency(table?.totalAmount || 0)}</span>
                    </button>
                  </div>
                </div>

                {/* Masadaki Kişi Bazlı Dağılım Kartları */}
                <div className="p-2.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Masadaki Sipariş Dağılımı ({Object.keys(guestBreakdown).length} Kişi):
                  </span>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto no-scrollbar pr-1">
                    {Object.entries(guestBreakdown).map(([tag, data]) => {
                      const isMe = tag.toLowerCase() === guestName.toLowerCase();
                      return (
                        <div
                          key={tag}
                          className={`p-2 rounded-xl text-xs flex justify-between items-center border ${
                            isMe
                              ? 'bg-blue-500/15 border-blue-500/35 text-blue-200 font-bold'
                              : 'bg-slate-900/60 border-slate-800 text-slate-400'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <span>👤 {tag}</span>
                            {isMe && <span className="text-[9px] bg-blue-500/30 text-blue-300 px-1 rounded font-semibold">(Sen)</span>}
                          </span>
                          <span className="font-mono text-amber-400 font-bold">{formatCurrency(data.total)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Masadan Hemen Çevrimiçi Ödeme (Iyzico / PayTR 3D Secure) */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-500/15 via-blue-500/10 to-purple-500/15 border border-amber-500/40 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">⚡</span>
                      <span className="text-[11px] font-black uppercase text-amber-300 tracking-wide">
                        Garson Beklemeden Masadan Öde
                      </span>
                    </div>
                    <div className="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded-lg border border-slate-700">
                      <button
                        type="button"
                        onClick={() => setSelectedGateway('IYZICO')}
                        className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${
                          selectedGateway === 'IYZICO' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Iyzico
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedGateway('PAYTR')}
                        className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${
                          selectedGateway === 'PAYTR' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        PayTR
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isInitiatingPayment}
                    onClick={() => handleStartOnlinePayment(effectiveAmount)}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-95 text-black font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>
                      {isInitiatingPayment
                        ? 'Güvenli Sayfa Yükleniyor...'
                        : `${selectedGateway} ile Güvenli Öde (${formatCurrency(effectiveAmount)})`}
                    </span>
                  </button>
                  <p className="text-[9px] text-center text-slate-400 font-medium">
                    🔒 256-bit SSL ve BDDK onaylı 3D Secure güvencesiyle anında tahsilat
                  </p>
                </div>

                <div className="flex items-center gap-2 my-1">
                  <div className="h-px flex-1 bg-slate-800"></div>
                  <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">veya garson çağır</span>
                  <div className="h-px flex-1 bg-slate-800"></div>
                </div>

                {/* Ödeme Yöntemi Butonları */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => handleRequestBill('Kredi Kartı')}
                    className="w-full p-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-purple-400 text-white font-bold text-xs flex items-center justify-between transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-purple-400" />
                      <span>Kredi / Banka Kartı ({formatCurrency(effectiveAmount)})</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRequestBill('Nakit')}
                    className="w-full p-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-emerald-400 text-white font-bold text-xs flex items-center justify-between transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-emerald-400" />
                      <span>Nakit Ödeme ({formatCurrency(effectiveAmount)})</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setBillModalOpen(false)}
                  className="w-full py-2.5 rounded-xl bg-slate-800 text-xs font-bold text-slate-400 hover:text-white"
                >
                  Vazgeç
                </button>
              </div>
            </div>
          );
        })()}

        {/* Online Payment Modal (Iyzico / PayTR Checkout Form) */}
        {onlinePaymentData && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-3 sm:p-4 animate-fadeIn">
            <div className="w-full max-w-sm bg-[#0e1320] border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                    onlinePaymentData.provider === 'IYZICO' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    💳
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-white">
                      {onlinePaymentData.provider === 'IYZICO' ? 'Iyzico 3D Secure' : 'PayTR iFrame'}
                    </h3>
                    <p className="text-[10px] text-slate-400">Güvenli Masadan Ödeme Ekranı</p>
                  </div>
                </div>
                <button
                  onClick={() => setOnlinePaymentData(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {onlinePaymentData.checkoutFormContent ? (
                <div
                  dangerouslySetInnerHTML={{ __html: onlinePaymentData.checkoutFormContent }}
                  className="overflow-hidden rounded-xl border border-slate-800"
                />
              ) : onlinePaymentData.iframeUrl ? (
                <iframe
                  src={onlinePaymentData.iframeUrl}
                  title="PayTR Payment Frame"
                  className="w-full h-80 rounded-xl border border-slate-800 bg-white"
                />
              ) : onlinePaymentData.paymentUrl ? (
                <div className="space-y-3 text-center py-4">
                  <p className="text-xs text-slate-300">Ödemenizi tamamlamak için güvenli sayfaya yönlendiriliyorsunuz:</p>
                  <a
                    href={onlinePaymentData.paymentUrl}
                    className="inline-block py-2.5 px-5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl shadow-lg transition-all"
                  >
                    Ödeme Sayfasına Git
                  </a>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => setOnlinePaymentData(null)}
                className="w-full py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-400 hover:text-white transition-all"
              >
                Kapat / Masaya Dön
              </button>
            </div>
          </div>
        )}

        {/* Guest Name Edit Modal (Misafir İsmi / Oturum Değiştir) */}
        {isGuestNameModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
            <div className="w-full max-w-xs bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4 animate-scaleUp">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                    👤
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white">Misafir İsminiz</h3>
                    <p className="text-[10px] text-slate-400">Adisyon ve hesap bölmede görünür</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsGuestNameModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Adınız veya Etiket:
                </label>
                <input
                  type="text"
                  value={tempGuestInput}
                  onChange={(e) => setTempGuestInput(e.target.value)}
                  placeholder="Örn: Ali, Ayşe, Misafir 1"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Hızlı Öneriler */}
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1.5">
                  Hızlı Seçim:
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {['Ali', 'Ayşe', 'Mehmet', 'Zeynep', 'Misafir 1', 'Misafir 2'].map((sugg) => (
                    <button
                      key={sugg}
                      type="button"
                      onClick={() => setTempGuestInput(sugg)}
                      className={`py-1.5 rounded-lg border text-[10px] font-bold transition-colors ${
                        tempGuestInput === sugg
                          ? 'bg-amber-500/25 border-amber-400 text-amber-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      {sugg}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsGuestNameModalOpen(false)}
                  className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const finalName = tempGuestInput.trim() || 'Misafir 1';
                    setGuestName(finalName);
                    if (typeof window !== 'undefined') {
                      sessionStorage.setItem(`masalink_guest_tag_${tableId}`, finalName);
                    }
                    setIsGuestNameModalOpen(false);
                  }}
                  className="py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-lg"
                >
                  Kaydet ✓
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
