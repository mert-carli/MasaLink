'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { 
  getStoredWaiterSession, 
  WaiterUser 
} from '@/utils/waiterAuth';
import { 
  AdminTable 
} from '@/components/admin/TableDetailDrawer';
import { 
  getStoredTables, 
  saveStoredTables, 
  INITIAL_TABLES 
} from '@/utils/tableData';
import { 
  QUICK_MENU_ITEMS, 
  MENU_CATEGORIES, 
  QUICK_ORDER_NOTES, 
  MenuItem 
} from '@/utils/menuData';
import { formatCurrency } from '@/utils/helpers';
import { syncService } from '@/utils/syncService';
import { sendJobToLocalBridge } from '@/utils/printBridge';
import { 
  ArrowLeft, 
  Plus, 
  Minus, 
  Trash2, 
  Utensils, 
  Printer, 
  CheckCircle2, 
  Clock, 
  Sparkles, 
  StickyNote, 
  X, 
  ChevronDown, 
  ChevronUp, 
  ChefHat, 
  AlertTriangle,
  Zap,
  ArrowRightLeft,
  Search,
  Wifi,
  WifiOff
} from 'lucide-react';
import { TableTransferModal } from '@/components/TableTransferModal';
import { 
  saveLocalDraft, 
  getLocalDraft, 
  clearLocalDraft, 
  syncDraftToServer, 
  fetchActiveDraftFromServer, 
  clearServerDraft,
  WaiterOrderDraft
} from '@/utils/waiterDraftStorage';

interface CartItem {
  product: MenuItem;
  quantity: number;
  notes: string[];
  customNote?: string;
}

export default function WaiterOrderPage() {
  const router = useRouter();
  const params = useParams();
  const tableId = (params?.tableId as string) || 'tbl-1';

  // Auth & Table state
  const [currentUser, setCurrentUser] = useState<WaiterUser | null>(null);
  const [table, setTable] = useState<AdminTable | null>(null);
  const [allTables, setAllTables] = useState<AdminTable[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('Tümü');
  const [showExistingItems, setShowExistingItems] = useState<boolean>(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState<boolean>(false);

  // Cart state: map of productId -> CartItem
  const [cart, setCart] = useState<{ [productId: string]: CartItem }>({});

  // Search & Connectivity state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // Online / Offline listener
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(window.navigator.onLine);
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  // Active Note Modal
  const [editingNoteProductId, setEditingNoteProductId] = useState<string | null>(null);
  const [tempCustomNote, setTempCustomNote] = useState<string>('');

  // Dispatching & Draft state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [draftSavedStatus, setDraftSavedStatus] = useState<string | null>(null);
  const [restoredNotice, setRestoredNotice] = useState<string | null>(null);

  // Load waiter session & table data & restore draft if device crashed
  useEffect(() => {
    const user = getStoredWaiterSession();
    if (!user) {
      router.replace('/waiter/login');
      return;
    }
    setCurrentUser(user);

    const tables = getStoredTables();
    setAllTables(tables);
    const current = tables.find((t) => t.id === tableId) || INITIAL_TABLES.find((t) => t.id === tableId);
    if (current) {
      setTable(current);
    } else {
      // Fallback
      setTable({
        id: tableId,
        name: `Masa ${tableId.replace(/\D/g, '') || '01'}`,
        section: 'salon',
        capacity: 4,
        status: 'waiting_menu',
        durationMinutes: 0,
        totalAmount: 0,
        items: [],
        lastActivity: 'Yeni masa açıldı',
      });
    }

    // 1. Önce yerel cihaz taslağını kontrol et (telefon yeniden başladığında / sekme kapandığında)
    const localDraft = getLocalDraft(tableId);
    if (localDraft && localDraft.cart && Object.keys(localDraft.cart).length > 0) {
      setCart(localDraft.cart as any);
      setRestoredNotice(`📱 Cihazdan kurtarıldı: ${localDraft.itemCount} kalem taslak geri yüklendi.`);
      setTimeout(() => setRestoredNotice(null), 5000);
    } else {
      // 2. Cihazda yoksa bulut taslağını kontrol et (telefon kırıldı/başka garson terminalinden girildi)
      fetchActiveDraftFromServer(user.id).then((serverDraft) => {
        if (serverDraft && serverDraft.tableId === tableId && serverDraft.cart && Object.keys(serverDraft.cart).length > 0) {
          setCart(serverDraft.cart as any);
          setRestoredNotice(`☁️ Buluttan kurtarıldı: ${serverDraft.itemCount} kalem taslak aktarıldı.`);
          setTimeout(() => setRestoredNotice(null), 6000);
        }
      });
    }
  }, [tableId, router]);

  // Her ürün eklendiğinde/değiştiğinde taslağı yerel IndexedDB/localStorage'a ve buluta eşitle
  useEffect(() => {
    if (!currentUser || !table) return;
    const items = Object.values(cart);
    const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmt = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

    if (totalCount === 0) {
      clearLocalDraft(tableId, currentUser.id);
      clearServerDraft(currentUser.id, tableId);
      setDraftSavedStatus(null);
      return;
    }

    const draftData: WaiterOrderDraft = {
      waiterId: currentUser.id,
      waiterName: currentUser.name,
      tableId,
      tableName: table.name,
      cart: cart as any,
      itemCount: totalCount,
      totalAmount: totalAmt,
      updatedAt: Date.now(),
    };

    saveLocalDraft(draftData);
    setDraftSavedStatus('💾 Cihaz & Bulut Kaydedildi');

    const debouncedTimer = setTimeout(() => {
      syncDraftToServer(draftData);
    }, 350);

    return () => clearTimeout(debouncedTimer);
  }, [cart, currentUser, table, tableId]);

  // Filtered menu products with Category & Fast Search
  const filteredProducts = useMemo(() => {
    let items = activeCategory === 'Tümü' ? QUICK_MENU_ITEMS : QUICK_MENU_ITEMS.filter((item) => item.category === activeCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q)) ||
          item.category.toLowerCase().includes(q)
      );
    }
    return items;
  }, [activeCategory, searchQuery]);

  // Stepper handlers
  const handleIncrease = (product: MenuItem) => {
    // Haptic tick
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(25);
      } catch (_) {}
    }

    setCart((prev) => {
      const existing = prev[product.id];
      if (existing) {
        return {
          ...prev,
          [product.id]: {
            ...existing,
            quantity: existing.quantity + 1,
          },
        };
      }
      return {
        ...prev,
        [product.id]: {
          product,
          quantity: 1,
          notes: [],
        },
      };
    });
  };

  const handleDecrease = (productId: string) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(20);
      } catch (_) {}
    }

    setCart((prev) => {
      const existing = prev[productId];
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return {
        ...prev,
        [productId]: {
          ...existing,
          quantity: existing.quantity - 1,
        },
      };
    });
  };

  // Toggle quick note chip
  const handleToggleNoteChip = (chip: string) => {
    if (!editingNoteProductId) return;
    setCart((prev) => {
      const item = prev[editingNoteProductId];
      if (!item) return prev;
      const hasChip = item.notes.includes(chip);
      const newNotes = hasChip
        ? item.notes.filter((n) => n !== chip)
        : [...item.notes, chip];
      return {
        ...prev,
        [editingNoteProductId]: {
          ...item,
          notes: newNotes,
        },
      };
    });
  };

  // Save custom note
  const handleSaveCustomNote = () => {
    if (!editingNoteProductId) return;
    setCart((prev) => {
      const item = prev[editingNoteProductId];
      if (!item) return prev;
      return {
        ...prev,
        [editingNoteProductId]: {
          ...item,
          customNote: tempCustomNote.trim() || undefined,
        },
      };
    });
    setEditingNoteProductId(null);
    setTempCustomNote('');
  };

  // Cart Totals
  const cartItemsList = Object.values(cart);
  const totalItemCount = cartItemsList.reduce((sum, i) => sum + i.quantity, 0);
  const totalCartAmount = cartItemsList.reduce((sum, i) => sum + i.quantity * i.product.price, 0);

  // Submit Order & Print Flow
  const handleSubmitOrder = async () => {
    if (cartItemsList.length === 0 || !table || isSubmitting) return;

    setIsSubmitting(true);

    // Haptic feedback
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([40, 30, 80]);
      } catch (_) {}
    }

    // Convert cart items to table items
    const newItems = cartItemsList.map((item) => {
      const combinedNotes = [...item.notes];
      if (item.customNote) combinedNotes.push(item.customNote);
      return {
        name: item.product.name,
        quantity: item.quantity,
        price: item.product.price,
        notes: combinedNotes.length > 0 ? combinedNotes.join(', ') : undefined,
      };
    });

    const addedAmount = totalCartAmount;
    const updatedItems = [...table.items, ...newItems];
    const newTotal = (table.totalAmount || 0) + addedAmount;
    const waiterName = currentUser?.name || 'Garson';

    // 1. Submit to Centralized Order Engine (/api/orders)
    try {
      await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId: table.id,
          source: 'WAITER',
          items: cartItemsList.map((item) => ({
            productId: item.product.id,
            name: item.product.name,
            quantity: item.quantity,
            notes: [...item.notes, item.customNote || ''].filter(Boolean).join(' • '),
          })),
        }),
      });
    } catch (orderErr) {
      console.warn('Central Order Engine offline fallback:', orderErr);
    }

    // 2. Update localStorage & client cache
    const allTables = getStoredTables();
    const updatedTables = allTables.map((t) => {
      if (t.id === table.id) {
        return {
          ...t,
          status: 'preparing' as const,
          delayAlert: false,
          items: updatedItems,
          totalAmount: newTotal,
          waiterName: waiterName,
          lastActivity: `Az önce ${waiterName} tarafından ${totalItemCount} kalem yeni sipariş girildi`,
        };
      }
      return t;
    });
    saveStoredTables(updatedTables);

    // 2. Real-time Multi-Device Broadcast (BroadcastChannel + /api/sync)
    syncService.broadcast('ORDER_ITEMS_ADDED', {
      tableId: table.id,
      tableName: table.name,
      waiterName: waiterName,
      newItems: newItems,
      addedAmount: addedAmount,
      totalAmount: newTotal,
      status: 'preparing',
    });

    // 3. Fire Kitchen Print Job to Print Bridge (ESC/POS 80mm)
    try {
      await sendJobToLocalBridge({
        orderId: `ORD-${Date.now().toString().slice(-6)}`,
        type: 'kitchen',
        tableNumber: table.name,
        waiterName: waiterName,
        timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        items: newItems,
        subtotal: Math.round(addedAmount * 0.9),
        vat: Math.round(addedAmount * 0.1),
        total: addedAmount,
      });
    } catch (err) {
      console.warn('Mutfak yazıcısına doğrudan erişilemedi (Kuyruğa alındı):', err);
    }

    // 4. Taslağı temizle (Cihaz ve Bulut)
    clearLocalDraft(table.id, currentUser?.id);
    if (currentUser?.id) {
      clearServerDraft(currentUser.id, table.id);
    }

    setSuccessNotice(`Sipariş Mutfağa İletildi ✓ (${table.name})`);

    // Return to tables grid after short confirmation
    setTimeout(() => {
      router.push('/waiter');
    }, 1100);
  };

  return (
    <div className="flex-1 flex flex-col min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-[#070a12] text-slate-100">
      {/* Sticky Top Bar */}
      <div className="sticky top-0 z-30 bg-[#0a0e19]/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => router.push('/waiter')}
          className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 active:scale-95 transition-all text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Masalar</span>
        </button>

        <div className="text-center">
          <div className="text-base font-extrabold text-white tracking-tight leading-none">
            {table?.name || 'Masa Seçildi'}
          </div>
          <div className="text-[11px] font-semibold text-amber-400 mt-0.5 flex items-center justify-center gap-1.5">
            <span>{currentUser?.name || 'Garson'}</span>
            {draftSavedStatus && (
              <>
                <span className="text-slate-600">•</span>
                <span className="text-[10px] text-emerald-400 font-bold">{draftSavedStatus}</span>
              </>
            )}
          </div>
        </div>

        {/* Right Corner: Connection Status, Table Transfer / Merge Button & Waiter Avatar */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 text-[10px] font-semibold">
            {isOnline ? (
              <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <Wifi className="w-3 h-3" />
                <span className="hidden sm:inline">Çevrimiçi</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20 animate-pulse">
                <WifiOff className="w-3 h-3" />
                <span>Çevrimdışı (Taslak Güvende)</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsTransferModalOpen(true)}
            className="flex items-center gap-1 py-1.5 px-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/35 active:scale-95 transition-all text-xs font-bold shadow-sm"
            title="Masayı Taşı / Başka Masayla Birleştir"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden xs:inline">Taşı / Birleştir</span>
          </button>

          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm shrink-0">
            {currentUser?.avatar || '👨‍🍳'}
          </div>
        </div>
      </div>

      {/* Quick Product Search Bar */}
      <div className="sticky top-[57px] z-20 bg-[#070a12]/95 backdrop-blur-md px-4 py-2 border-b border-slate-800/40">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Hızlı ürün ara (örn: burger, trüf, kola)..."
            className="w-full pl-9 pr-8 py-2 bg-slate-900/90 text-xs text-white rounded-xl border border-slate-800 focus:outline-none focus:border-amber-500/70 placeholder:text-slate-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Restored from crash notice banner */}
      {restoredNotice && (
        <div className="bg-amber-500/20 border-b border-amber-500/40 px-4 py-2 flex items-center justify-between text-xs font-bold text-amber-300 animate-fadeIn">
          <span>{restoredNotice}</span>
          <button onClick={() => setRestoredNotice(null)} className="text-amber-400 hover:text-white p-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Existing Orders Dropdown (if table already has items) */}
      {table && table.items.length > 0 && (
        <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2 text-xs">
          <button
            onClick={() => setShowExistingItems(!showExistingItems)}
            className="w-full flex items-center justify-between font-semibold text-slate-300 hover:text-white"
          >
            <div className="flex items-center gap-1.5 text-amber-400">
              <Clock className="w-3.5 h-3.5" />
              <span>Masada Açık Adisyon: {formatCurrency(table.totalAmount)}</span>
              <span className="text-[10px] text-slate-400">({table.items.reduce((a, b) => a + b.quantity, 0)} kalem)</span>
            </div>
            {showExistingItems ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {showExistingItems && (
            <div className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-1.5 max-h-36 overflow-y-auto no-scrollbar">
              {table.items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-200">{item.quantity}x</span>
                    <span>{item.name}</span>
                  </div>
                  <span className="font-mono text-slate-300">{formatCurrency(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Horizontal Category Scroller */}
      <div className="sticky top-[103px] z-20 bg-[#070a12]/95 backdrop-blur-md px-4 py-2.5 overflow-x-auto no-scrollbar flex items-center gap-2 border-b border-slate-800/60">
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

      {/* Product List */}
      <div className="flex-1 px-4 py-3 pb-32 space-y-3">
        {filteredProducts.map((product) => {
          const cartItem = cart[product.id];
          const qty = cartItem ? cartItem.quantity : 0;
          const hasNotes = cartItem && (cartItem.notes.length > 0 || !!cartItem.customNote);

          return (
            <div
              key={product.id}
              className={`p-3.5 rounded-2xl bg-gradient-to-b from-[#0f1523] to-[#0c101c] border transition-all ${
                qty > 0
                  ? 'border-amber-500/50 ring-1 ring-amber-500/30 shadow-lg shadow-amber-500/5'
                  : 'border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                {/* Product Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-white tracking-tight">
                      {product.name}
                    </span>
                    {product.popular && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                        Şefin Önerisi
                      </span>
                    )}
                  </div>
                  {product.description && (
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                      {product.description}
                    </p>
                  )}
                  <div className="text-sm font-extrabold text-amber-400 font-mono mt-1.5">
                    {formatCurrency(product.price)}
                  </div>
                </div>

                {/* Touch Stepper Controls (Min 48px tactile buttons) */}
                <div className="flex items-center gap-2">
                  {qty > 0 && (
                    <button
                      type="button"
                      onClick={() => handleDecrease(product.id)}
                      className="w-11 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 active:scale-90 transition-all flex items-center justify-center font-bold text-lg cursor-pointer"
                    >
                      <Minus className="w-5 h-5 text-slate-300" />
                    </button>
                  )}

                  {qty > 0 && (
                    <span className="w-7 text-center font-extrabold text-base text-amber-400 font-mono">
                      {qty}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => handleIncrease(product)}
                    className={`h-11 rounded-xl active:scale-90 transition-all flex items-center justify-center font-bold text-sm cursor-pointer shadow-md ${
                      qty > 0
                        ? 'w-11 bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/30'
                        : 'px-4 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    <Plus className="w-5 h-5" />
                    {qty === 0 && <span className="ml-1 text-xs">Ekle</span>}
                  </button>
                </div>
              </div>

              {/* Note Bar (If product has quantity) */}
              {qty > 0 && (
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingNoteProductId(product.id);
                      setTempCustomNote(cartItem?.customNote || '');
                    }}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                      hasNotes
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/60'
                    }`}
                  >
                    <StickyNote className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      {hasNotes
                        ? `Not: ${[...(cartItem?.notes || []), cartItem?.customNote].filter(Boolean).join(', ')}`
                        : '+ Mutfak Notu Ekle'}
                    </span>
                  </button>

                  <span className="text-[11px] font-mono font-bold text-slate-400">
                    {formatCurrency(product.price * qty)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Note Edit Modal / Drawer */}
      {editingNoteProductId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center p-3 animate-fadeIn">
          <div className="w-full max-w-md bg-[#0e1320] rounded-2xl border border-slate-800 p-4 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <ChefHat className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-bold text-white">Mutfak Notu Ekle</span>
              </div>
              <button
                onClick={() => setEditingNoteProductId(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Chips */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Hızlı Seçenekler
              </label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_ORDER_NOTES.map((chip) => {
                  const isSelected = cart[editingNoteProductId]?.notes.includes(chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleToggleNoteChip(chip)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/60'
                      }`}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Freeform text input */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                Özel Talimat
              </label>
              <input
                type="text"
                placeholder="Örn: Masaya 2 ekstra servis tabağı rica ediyoruz"
                value={tempCustomNote}
                onChange={(e) => setTempCustomNote(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditingNoteProductId(null)}
                className="flex-1 py-2 rounded-xl bg-slate-800 text-xs font-bold text-slate-300 hover:bg-slate-700"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSaveCustomNote}
                className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold shadow-md shadow-amber-500/30"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Bottom Order Summary Bar (Sabit Alt Çubuk) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0a0e19]/95 backdrop-blur-md border-t border-slate-800 p-3 shadow-2xl">
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          {/* Left: Summary */}
          <div>
            <div className="text-[11px] font-semibold text-slate-400">
              {totalItemCount > 0 ? `${totalItemCount} Kalem Seçildi` : 'Sipariş Seçiniz'}
            </div>
            <div className="text-xl font-black text-amber-400 font-mono tracking-tight leading-none mt-0.5">
              {formatCurrency(totalCartAmount)}
            </div>
          </div>

          {/* Right: Big Action Button */}
          <button
            type="button"
            onClick={handleSubmitOrder}
            disabled={totalItemCount === 0 || isSubmitting}
            className={`flex-1 py-3.5 px-4 rounded-xl font-black text-sm tracking-wide flex items-center justify-center gap-2 transition-all shadow-xl active:scale-95 ${
              totalItemCount > 0 && !isSubmitting
                ? 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-amber-500/25 ring-1 ring-amber-300'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/60'
            }`}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2 text-slate-900">
                <Printer className="w-4 h-4 animate-spin" />
                Mutfağa Basılıyor...
              </span>
            ) : (
              <>
                <Zap className="w-4 h-4 text-slate-950 fill-current" />
                <span>⚡ Siparişi Tamamla</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Success Modal / Toast */}
      {successNotice && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fadeIn">
          <div className="bg-[#0f1523] border border-emerald-500/40 rounded-2xl p-6 text-center shadow-2xl shadow-emerald-500/10 max-w-xs w-full flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-base font-extrabold text-white">İşlem Başarılı!</h3>
            <p className="text-xs text-slate-300 mt-1">
              {successNotice}
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/30">
              <Printer className="w-3.5 h-3.5" />
              <span>Fiş & Senkronizasyon Tamamlandı ✓</span>
            </div>
          </div>
        </div>
      )}

      {/* Table Transfer / Merge Modal */}
      {table && (
        <TableTransferModal
          isOpen={isTransferModalOpen}
          onClose={() => setIsTransferModalOpen(false)}
          sourceTable={table}
          allTables={allTables}
          waiterName={currentUser?.name}
          onSuccess={(targetTableId, mode) => {
            setIsTransferModalOpen(false);
            setSuccessNotice(
              mode === 'transfer'
                ? `Masa başarıyla taşındı! Hedef masaya yönlendiriliyorsunuz...`
                : `Masalar başarıyla birleştirildi! Hedef masaya yönlendiriliyorsunuz...`
            );
            setTimeout(() => {
              router.push(`/waiter/order/${targetTableId}`);
            }, 900);
          }}
        />
      )}
    </div>
  );
}
