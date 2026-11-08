'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ChefHat,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RefreshCw,
  Search,
  Filter,
  Utensils,
  ArrowLeft,
  QrCode,
  Smartphone,
  Monitor,
  Sparkles,
  Check,
  BellRing,
} from 'lucide-react';
import { syncService, SyncMessage } from '@/utils/syncService';
import { getStoredTables, AdminTable } from '@/utils/tableData';

export interface KdsOrderItem {
  id: string;
  name: string;
  quantity: number;
  cookingLevel?: string;
  extras?: { name: string; price?: number }[];
  note?: string;
  guestTag?: string;
  completed?: boolean;
}

export interface KdsTicket {
  id: string;
  orderNumber: number;
  tableId: string;
  tableCode: string;
  source: 'QR' | 'WAITER' | 'POS';
  status: 'PREPARING' | 'READY' | 'SERVED';
  customerNote?: string;
  createdAt: string; // ISO string
  items: KdsOrderItem[];
  total?: number;
}

export default function KitchenKdsPage() {
  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [completedTickets, setCompletedTickets] = useState<KdsTicket[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'grill' | 'beverage' | 'ready' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [lastEventNotice, setLastEventNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const audioContextRef = useRef<AudioContext | null>(null);

  // Web Audio API ile Mutfak Zili Sentezleyici
  const playKitchenBell = useCallback((type: 'new_order' | 'ready') => {
    if (!isSoundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = audioContextRef.current || new AudioCtx();
      audioContextRef.current = ctx;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'new_order') {
        // İki tonlu mutfak ding-dong zili (F5 -> A5)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(698.46, now); // F5
        osc.frequency.setValueAtTime(880.0, now + 0.15); // A5
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
      } else {
        // Hazır tek tonlu tık tık zili (C6)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1046.5, now);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      }
    } catch (_) {}
  }, [isSoundEnabled]);

  // Sayaç Güncellemesi (Her saniye)
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Aktif Siparişleri Yükle (API + Local Demo Fallback)
  const loadInitialOrders = useCallback(async () => {
    setIsLoading(true);
    let loadedFromApi = false;

    try {
      const res = await fetch('/api/kds?tenantId=tenant-artisan-burger');
      if (res.ok) {
        const data = await res.json();
        if (data.orders && Array.isArray(data.orders) && data.orders.length > 0) {
          const apiTickets: KdsTicket[] = data.orders.map((o: any) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            tableId: o.tableId,
            tableCode: o.tableCode || `Masa ${o.tableId}`,
            source: o.source || 'POS',
            status: o.status === 'READY' ? 'READY' : 'PREPARING',
            customerNote: o.customerNote,
            createdAt: o.createdAt || new Date().toISOString(),
            items: o.items.map((i: any) => ({
              id: i.id || `item-${Math.random().toString(36).substr(2, 6)}`,
              name: i.name,
              quantity: i.quantity,
              cookingLevel: i.cookingLevel,
              extras: i.extras || [],
              note: i.note,
              guestTag: i.guestTag,
              completed: false,
            })),
            total: o.total,
          }));

          setTickets(apiTickets);
          loadedFromApi = true;
        }
      }
    } catch (err) {
      console.warn('[KDS] API yüklemesi başarısız, yerel simülasyon kullanılıyor:', err);
    }

    // API boş veya veri yoksa demo masalarındaki siparişleri KDS biletine dönüştür
    if (!loadedFromApi) {
      const stored = getStoredTables();
      const mockTickets: KdsTicket[] = [];

      stored
        .filter((t) => t.status === 'preparing' && t.items.length > 0)
        .forEach((t, idx) => {
          mockTickets.push({
            id: `ord-demo-${t.id}`,
            orderNumber: 1040 + idx,
            tableId: t.id,
            tableCode: t.name,
            source: idx % 2 === 0 ? 'QR' : 'WAITER',
            status: 'PREPARING',
            customerNote: idx === 0 ? 'Burgerler az tuzlu olsun, soslar ayrı rica ederiz.' : undefined,
            createdAt: new Date(Date.now() - (t.durationMinutes || 8) * 60000).toISOString(),
            items: t.items.map((item, itemIdx) => ({
              id: `item-${t.id}-${itemIdx}`,
              name: item.name,
              quantity: item.quantity,
              cookingLevel: item.name.includes('Burger') ? 'Orta Pişmiş' : undefined,
              extras: item.name.includes('Trüflü') ? [{ name: 'Trüflü Mayonez' }, { name: 'Karamelize Soğan' }] : [],
              note: item.notes,
              guestTag: item.guestTag,
              completed: false,
            })),
            total: t.totalAmount,
          });
        });

      setTickets(mockTickets);
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadInitialOrders();
  }, [loadInitialOrders]);

  // Real-Time SSE Olay Dinleyicisi
  useEffect(() => {
    const unsubscribe = syncService.subscribe((msg: SyncMessage) => {
      // 1. Yeni Sipariş Geldiğinde KDS'e Anında Kart Ekle
      if (
        (msg.type === 'QR_ORDER_SUBMITTED' ||
          msg.type === 'ORDER_ITEMS_ADDED' ||
          msg.type === 'QR_ORDER_APPROVED') &&
        msg.payload
      ) {
        const payload = msg.payload;
        const newTicketId = payload.orderId || `ord-${Date.now()}`;

        setTickets((prev) => {
          // Bilet zaten varsa güncelle
          const exists = prev.find((t) => t.id === newTicketId);
          if (exists) return prev;

          const newItems: KdsOrderItem[] = (payload.items || payload.newItems || []).map((i: any, idx: number) => ({
            id: i.id || `item-${Date.now()}-${idx}`,
            name: i.name || i.productName || 'Ürün',
            quantity: Number(i.quantity) || 1,
            cookingLevel: i.cookingLevel,
            extras: i.extras || [],
            note: i.notes || i.note,
            guestTag: i.guestTag,
            completed: false,
          }));

          const newTicket: KdsTicket = {
            id: newTicketId,
            orderNumber: payload.orderNumber || Math.floor(Math.random() * 900) + 100,
            tableId: payload.tableId || 'tbl-1',
            tableCode: payload.tableCode || `Masa ${payload.tableId || '1'}`,
            source: msg.sourceDevice === 'customer_qr' ? 'QR' : msg.sourceDevice === 'waiter_mobile' ? 'WAITER' : 'POS',
            status: 'PREPARING',
            customerNote: payload.customerNote,
            createdAt: payload.timestamp || new Date().toISOString(),
            items: newItems,
            total: payload.total,
          };

          return [newTicket, ...prev];
        });

        playKitchenBell('new_order');
        setLastEventNotice(`🔔 Yeni Sipariş Geldi: ${payload.tableCode || 'Masa'} (#${payload.orderNumber || ''})`);
        setTimeout(() => setLastEventNotice(null), 6000);
      }

      // 2. Sipariş Durumu Harici Olarak Değiştiğinde
      if (msg.type === 'ORDER_STATUS_CHANGED' && msg.payload) {
        const { orderId, status } = msg.payload;
        if (status === 'SERVED') {
          setTickets((prev) => {
            const finished = prev.find((t) => t.id === orderId);
            if (finished) {
              setCompletedTickets((c) => [{ ...finished, status: 'SERVED' }, ...c.slice(0, 20)]);
            }
            return prev.filter((t) => t.id !== orderId);
          });
        } else if (status === 'READY') {
          setTickets((prev) =>
            prev.map((t) => (t.id === orderId ? { ...t, status: 'READY' } : t))
          );
        } else if (status === 'PREPARING') {
          // Out-of-order koruması: Bilet zaten READY ise gecikmiş PREPARING olayı ile geriye düşürme!
          setTickets((prev) =>
            prev.map((t) => {
              if (t.id === orderId) {
                if (t.status === 'READY') {
                  return t; // Durumu koru, geriye alma
                }
                return { ...t, status: 'PREPARING' };
              }
              return t;
            })
          );
        }
      }

      // 3. Masa Hesabı Kapatıldığında / Sıfırlandığında KDS'teki bekleyen bileti arşive al
      if ((msg.type === 'TABLE_CHECKOUT_COMPLETED' || msg.type === 'GHOST_TABLE_RESET') && msg.payload?.tableId) {
        const closedTableId = msg.payload.tableId;
        setTickets((prev) => {
          const matching = prev.filter((t) => t.tableId === closedTableId);
          if (matching.length > 0) {
            setCompletedTickets((c) => [...matching.map((m) => ({ ...m, status: 'SERVED' as const })), ...c.slice(0, 20)]);
          }
          return prev.filter((t) => t.tableId !== closedTableId);
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [playKitchenBell]);

  // Tekil Ürün Hazır İşareti (Item Check-off)
  const toggleItemCompleted = (ticketId: string, itemId: string) => {
    setTickets((prev) =>
      prev.map((t) => {
        if (t.id === ticketId) {
          const updatedItems = t.items.map((i) =>
            i.id === itemId ? { ...i, completed: !i.completed } : i
          );
          return { ...t, items: updatedItems };
        }
        return t;
      })
    );
  };

  // Siparişi "HAZIR" Durumuna Getir ve Garson/POS/QR'a Push Et
  const handleMarkOrderReady = async (ticket: KdsTicket) => {
    // 1. İyimser Arayüz Güncellemesi
    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticket.id
          ? {
              ...t,
              status: 'READY',
              items: t.items.map((i) => ({ ...i, completed: true })),
            }
          : t
      )
    );

    playKitchenBell('ready');
    setLastEventNotice(`🍽️ Sipariş Hazırlandı: ${ticket.tableCode} (#${ticket.orderNumber}) ➔ Garson terminaline çağrı gönderildi.`);
    setTimeout(() => setLastEventNotice(null), 5000);

    // 2. Sunucuya Gönder (Sunucu veritabanını günceller ve realtimeHub.broadcast ile Garson/POS/QR'a fırlatır)
    try {
      await fetch('/api/kds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: ticket.id,
          tableId: ticket.tableId,
          status: 'READY',
        }),
      });
    } catch (err) {
      console.warn('[KDS] Durum güncelleme API hatası:', err);
    }
  };

  // Siparişi "MASAYA TESLİM EDİLDİ" Yap ve Tamamlananlara Taşı
  const handleMarkOrderServed = async (ticket: KdsTicket) => {
    setTickets((prev) => prev.filter((t) => t.id !== ticket.id));
    setCompletedTickets((prev) => [{ ...ticket, status: 'SERVED' }, ...prev.slice(0, 25)]);

    setLastEventNotice(`✓ ${ticket.tableCode} (#${ticket.orderNumber}) masaya servis edildi.`);
    setTimeout(() => setLastEventNotice(null), 4000);

    try {
      await fetch('/api/kds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: ticket.id,
          tableId: ticket.tableId,
          status: 'SERVED',
        }),
      });
    } catch (err) {
      console.warn('[KDS] Servis tamamlandı API hatası:', err);
    }
  };

  // Tam Ekran Aç / Kapa
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      }
    }
  };

  // Süre Hesaplama & Renk Ayrımı
  const getElapsedTimeInfo = (createdAtIso: string) => {
    const elapsedMs = Math.max(0, now - new Date(createdAtIso).getTime());
    const totalMinutes = Math.floor(elapsedMs / 60000);
    const totalSeconds = Math.floor((elapsedMs % 60000) / 1000);
    const formatted = `${totalMinutes.toString().padStart(2, '0')}:${totalSeconds.toString().padStart(2, '0')}`;

    if (totalMinutes < 10) {
      return {
        text: formatted,
        minutes: totalMinutes,
        badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        cardClass: 'border-slate-800 hover:border-slate-700',
        urgency: 'normal',
      };
    } else if (totalMinutes < 18) {
      return {
        text: formatted,
        minutes: totalMinutes,
        badgeClass: 'bg-amber-500/25 text-amber-300 border-amber-500/40 animate-pulse',
        cardClass: 'border-amber-500/40 shadow-amber-900/10 shadow-lg',
        urgency: 'warning',
      };
    } else {
      return {
        text: formatted,
        minutes: totalMinutes,
        badgeClass: 'bg-rose-500/30 text-rose-300 border-rose-500/50 animate-pulse font-black',
        cardClass: 'border-rose-500/60 shadow-rose-950/40 shadow-xl ring-1 ring-rose-500/40',
        urgency: 'critical',
      };
    }
  };

  // Filtrelenmiş Biletler
  const displayTickets = useMemo(() => {
    if (activeTab === 'completed') {
      return completedTickets;
    }

    return tickets.filter((t) => {
      // Tab filtreleme
      if (activeTab === 'ready' && t.status !== 'READY') return false;
      if (activeTab === 'grill') {
        const hasGrill = t.items.some((i) => i.name.toLowerCase().includes('burger') || i.name.toLowerCase().includes('köfte'));
        if (!hasGrill) return false;
      }
      if (activeTab === 'beverage') {
        const hasBeverage = t.items.some((i) => i.name.toLowerCase().includes('kola') || i.name.toLowerCase().includes('limonata') || i.name.toLowerCase().includes('bira') || i.name.toLowerCase().includes('su'));
        if (!hasBeverage) return false;
      }

      // Arama filtresi
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTable = t.tableCode.toLowerCase().includes(q) || t.tableId.toLowerCase().includes(q);
        const matchNum = t.orderNumber.toString().includes(q);
        const matchItem = t.items.some((i) => i.name.toLowerCase().includes(q));
        if (!matchTable && !matchNum && !matchItem) return false;
      }

      return true;
    });
  }, [tickets, completedTickets, activeTab, searchQuery]);

  return (
    <div className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-[#070b12] text-slate-100 flex flex-col font-sans select-none">
      {/* ------------------------------------------------------------- */}
      {/* 1. KDS HEADER & CONTROL BAR                                   */}
      {/* ------------------------------------------------------------- */}
      <header className="bg-[#0b101b] border-b border-slate-800/80 px-4 py-3 sticky top-0 z-40 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          
          {/* Logo, Başlık & Canlı Durum */}
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
              title="Yönetim Paneline Dön"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>

            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20">
                <ChefHat className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-black tracking-wide text-white flex items-center gap-1.5">
                    MasaLink KDS
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Mutfak Ekranı
                    </span>
                  </h1>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                    SSE Canlı (&lt;15ms)
                  </span>
                  <span>•</span>
                  <span>Artisan Burger Merkez Şube</span>
                </div>
              </div>
            </div>
          </div>

          {/* İstatistikler */}
          <div className="hidden lg:flex items-center gap-4 bg-slate-900/80 px-4 py-1.5 rounded-2xl border border-slate-800">
            <div className="text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Bekleyen Bilet</span>
              <span className="text-sm font-extrabold text-amber-400 font-mono">
                {tickets.filter((t) => t.status === 'PREPARING').length}
              </span>
            </div>
            <div className="w-[1px] h-6 bg-slate-800" />
            <div className="text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Servise Hazır</span>
              <span className="text-sm font-extrabold text-emerald-400 font-mono">
                {tickets.filter((t) => t.status === 'READY').length}
              </span>
            </div>
            <div className="w-[1px] h-6 bg-slate-800" />
            <div className="text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Ort. Hazırlık</span>
              <span className="text-sm font-extrabold text-blue-400 font-mono">
                {tickets.length > 0 ? '7.4 dk' : '—'}
              </span>
            </div>
          </div>

          {/* Aksiyon Butonları (Ses, Arama, Yenile, Tam Ekran) */}
          <div className="flex items-center gap-2">
            {/* Arama */}
            <div className="relative flex-1 sm:w-48">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Masa veya No ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
              />
            </div>

            {/* Ses Açık/Kapalı */}
            <button
              onClick={() => setIsSoundEnabled(!isSoundEnabled)}
              className={`p-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
                isSoundEnabled
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
              title={isSoundEnabled ? 'Mutfak Zili Açık' : 'Mutfak Zili Kapalı'}
            >
              {isSoundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Yenile */}
            <button
              onClick={loadInitialOrders}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Siparişleri Yenile"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {/* Tam Ekran */}
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Tam Ekran Modu"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* İstasyon Sekmeleri (Station Filters) */}
        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-800/60 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
              activeTab === 'all'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <span>Tüm Siparişler</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 font-mono">
              {tickets.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('grill')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
              activeTab === 'grill'
                ? 'bg-orange-500 text-slate-950 shadow-md shadow-orange-500/20'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Izgara / Burger</span>
          </button>

          <button
            onClick={() => setActiveTab('beverage')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
              activeTab === 'beverage'
                ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
            <span>Bar / İçecek</span>
          </button>

          <button
            onClick={() => setActiveTab('ready')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
              activeTab === 'ready'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <BellRing className="w-3.5 h-3.5" />
            <span>Servise Hazır</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 font-mono">
              {tickets.filter((t) => t.status === 'READY').length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('completed')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
              activeTab === 'completed'
                ? 'bg-slate-700 text-white shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Tamamlananlar</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 font-mono">
              {completedTickets.length}
            </span>
          </button>
        </div>
      </header>

      {/* ------------------------------------------------------------- */}
      {/* 2. REALTIME NOTIFICATION TOAST                                 */}
      {/* ------------------------------------------------------------- */}
      {lastEventNotice && (
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-slate-950 px-4 py-2 font-black text-xs flex items-center justify-between shadow-xl animate-fadeIn sticky top-[108px] z-30">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 animate-bounce" />
            <span>{lastEventNotice}</span>
          </div>
          <span className="text-[10px] bg-black/20 px-2 py-0.5 rounded font-mono">KDS REALTIME</span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. KDS TICKETS GRID (BILETLER DİZİSİ)                         */}
      {/* ------------------------------------------------------------- */}
      <main className="flex-1 p-4 overflow-y-auto">
        {displayTickets.length === 0 ? (
          <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-800/80 rounded-3xl bg-[#090e18]/50">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mb-3">
              <ChefHat className="w-8 h-8" />
            </div>
            <h3 className="text-base font-extrabold text-slate-300">
              {activeTab === 'completed' ? 'Henüz Tamamlanmış Sipariş Yok' : 'Mutfak İstasyonu Temiz!'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              QR Menüden, Garson Terminalinden veya Kasa POS ekranından girilen yeni siparişler anında bu ekrana düşer.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <Link
                href="/r/artisan-burger/tbl-4"
                target="_blank"
                className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold hover:bg-amber-500/25 transition-all flex items-center gap-1.5"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Test QR Siparişi Ver</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 items-start">
            {displayTickets.map((ticket) => {
              const timeInfo = getElapsedTimeInfo(ticket.createdAt);
              const isReady = ticket.status === 'READY';
              const isServed = ticket.status === 'SERVED';

              return (
                <div
                  key={ticket.id}
                  className={`bg-[#0c121e] rounded-2xl border flex flex-col transition-all overflow-hidden ${
                    isReady
                      ? 'border-emerald-500/50 shadow-lg shadow-emerald-950/30'
                      : isServed
                      ? 'border-slate-800 opacity-70'
                      : timeInfo.cardClass
                  }`}
                >
                  {/* Bilet Başlığı */}
                  <div className={`p-3.5 border-b border-slate-800/80 flex items-start justify-between gap-2 ${
                    isReady ? 'bg-emerald-950/30' : 'bg-slate-900/60'
                  }`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-white font-mono tracking-tight">
                          #{ticket.orderNumber}
                        </span>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg border font-mono flex items-center gap-1 ${
                          ticket.source === 'QR'
                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                            : ticket.source === 'WAITER'
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        }`}>
                          {ticket.source === 'QR' && <QrCode className="w-3 h-3" />}
                          {ticket.source === 'WAITER' && <Smartphone className="w-3 h-3" />}
                          {ticket.source === 'POS' && <Monitor className="w-3 h-3" />}
                          {ticket.source}
                        </span>
                      </div>
                      <h4 className="text-sm font-extrabold text-slate-200 mt-1 flex items-center gap-1.5">
                        <span>{ticket.tableCode}</span>
                      </h4>
                    </div>

                    {/* Canlı Kronometre Sayacı */}
                    <div className="text-right">
                      <div className={`px-2 py-1 rounded-xl border text-xs font-mono font-black flex items-center gap-1 ${
                        isReady
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : timeInfo.badgeClass
                      }`}>
                        <Clock className="w-3 h-3" />
                        <span>{isReady ? 'HAZIR' : timeInfo.text}</span>
                      </div>
                    </div>
                  </div>

                  {/* Özel Müşteri / Garson Notu Uyarısı */}
                  {ticket.customerNote && (
                    <div className="bg-amber-500/15 border-b border-amber-500/30 px-3 py-2 text-[11px] text-amber-200 flex items-start gap-1.5 font-semibold">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span>Not: {ticket.customerNote}</span>
                    </div>
                  )}

                  {/* Ürün Listesi */}
                  <div className="p-3 space-y-2 flex-1">
                    {ticket.items.map((item) => {
                      return (
                        <div
                          key={item.id}
                          onClick={() => !isServed && toggleItemCompleted(ticket.id, item.id)}
                          className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-2 ${
                            item.completed
                              ? 'bg-emerald-950/20 border-emerald-500/30 text-slate-400 line-through'
                              : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700 text-white'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-extrabold font-mono text-xs flex items-center justify-center shrink-0">
                                {item.quantity}x
                              </span>
                              <span className={`text-xs font-bold leading-tight ${item.completed ? 'text-slate-400' : 'text-slate-100'}`}>
                                {item.name}
                              </span>
                            </div>

                            {/* Pişme Derecesi */}
                            {item.cookingLevel && (
                              <div className="mt-1 ml-8">
                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-orange-500/20 text-orange-300 border border-orange-500/30">
                                  🔥 {item.cookingLevel}
                                </span>
                              </div>
                            )}

                            {/* Ekstralar / Seçenekler */}
                            {item.extras && item.extras.length > 0 && (
                              <div className="mt-1 ml-8 flex flex-wrap gap-1">
                                {item.extras.map((extra, eIdx) => (
                                  <span
                                    key={eIdx}
                                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700"
                                  >
                                    +{extra.name}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Ürün Özel Notu */}
                            {item.note && (
                              <p className="mt-1 ml-8 text-[10px] text-amber-300/90 font-medium">
                                ✎ {item.note}
                              </p>
                            )}

                            {/* Misafir Etiketi (Kişi Bazlı Bölme) */}
                            {item.guestTag && (
                              <div className="mt-1 ml-8">
                                <span className="text-[9px] text-slate-400 font-mono">
                                  👤 {item.guestTag}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Checkbox Icon */}
                          <div className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${
                            item.completed
                              ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-bold'
                              : 'border-slate-700 bg-slate-800/80 text-transparent'
                          }`}>
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Bilet Aksiyon Butonu (HAZIR / SERVİSE ÇAĞIR / TESLİM EDİLDİ) */}
                  {!isServed && (
                    <div className="p-3 pt-0">
                      {!isReady ? (
                        <button
                          type="button"
                          onClick={() => handleMarkOrderReady(ticket)}
                          className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 active:scale-[0.98] text-slate-950 font-extrabold text-xs transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                        >
                          <BellRing className="w-4 h-4 animate-bounce" />
                          <span>HAZIR / SERVİSE ÇAĞIR</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleMarkOrderServed(ticket)}
                          className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-400 hover:to-cyan-500 active:scale-[0.98] text-white font-extrabold text-xs transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>MASAYA TESLİM EDİLDİ ✓</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
