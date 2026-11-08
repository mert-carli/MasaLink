'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  getStoredWaiterSession, 
  clearStoredWaiterSession, 
  WaiterUser 
} from '@/utils/waiterAuth';
import { 
  AdminTable, 
  TableLifecycleStatus 
} from '@/components/admin/TableDetailDrawer';
import { 
  INITIAL_TABLES, 
  getStoredTables, 
  saveStoredTables 
} from '@/utils/tableData';
import { formatCurrency } from '@/utils/helpers';
import { syncService, SyncMessage } from '@/utils/syncService';
import { 
  Users, 
  Clock, 
  LogOut, 
  Sparkles, 
  UtensilsCrossed, 
  CheckCircle2, 
  AlertTriangle, 
  Receipt, 
  RefreshCw,
  Plus,
  Radio,
  ChevronRight,
  Flame,
  Check,
  Eye,
  Zap,
  BellRing,
  Printer,
  ShieldCheck,
  ShoppingBag,
  Camera,
  ChefHat
} from 'lucide-react';
import { sendJobToLocalBridge } from '@/utils/printBridge';
import { 
  fetchActiveDraftFromServer, 
  clearServerDraft, 
  WaiterOrderDraft 
} from '@/utils/waiterDraftStorage';

export interface PendingQrApproval {
  orderId: string;
  tableId: string;
  tableName: string;
  section: string;
  items: { name: string; quantity: number; price: number; notes?: string }[];
  totalAmount: number;
  customerNote?: string;
  timestamp: string;
}

const isWaiterSection = (waiterSection?: string, tableSection?: string) => {
  if (!waiterSection || !tableSection) return false;
  const w = waiterSection.toLowerCase();
  const t = tableSection.toLowerCase();
  if (w.includes('salon') && t === 'salon') return true;
  if (w.includes('bahçe') && t === 'bahce') return true;
  if (w.includes('teras') && (t === 'teras' || t === 'bar')) return true;
  return false;
};

export default function WaiterTablesPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<WaiterUser | null>(null);
  const [tables, setTables] = useState<AdminTable[]>(INITIAL_TABLES);
  const [activeSection, setActiveSection] = useState<'all' | 'salon' | 'bahce' | 'teras' | 'bar'>('all');
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingQrApproval[]>([]);
  const [recoveredDraft, setRecoveredDraft] = useState<WaiterOrderDraft | null>(null);

  // Load waiter session and tables
  useEffect(() => {
    const user = getStoredWaiterSession();
    if (!user) {
      router.replace('/waiter/login');
      return;
    }
    setCurrentUser(user);

    // Başka cihazda şarj bitmesi/cihaz kırılması sonrası yarım kalan taslak adisyon kontrolü
    fetchActiveDraftFromServer(user.id).then((draft) => {
      if (draft && draft.cart && Object.keys(draft.cart).length > 0) {
        setRecoveredDraft(draft);
      }
    });

    // Initial load of tables
    const loadedTables = getStoredTables();
    if (loadedTables && loadedTables.length > 0) {
      setTables(loadedTables);
    }

    // Subscribe to multi-device real-time sync events
    const unsubscribe = syncService.subscribe((msg: SyncMessage) => {
      if (msg.type === 'TABLE_STATUS_CHANGED' && msg.payload) {
        setTables((prev) => {
          const updated = prev.map((t) => (t.id === msg.payload.tableId ? { ...t, status: msg.payload.status } : t));
          saveStoredTables(updated);
          return updated;
        });
        setSyncNotice(`${msg.deviceName}: Masa durumu güncellendi.`);
        setTimeout(() => setSyncNotice(null), 3000);
      }

      if (msg.type === 'ORDER_ITEMS_ADDED' && msg.payload) {
        setTables((prev) => {
          const updated = prev.map((t) => {
            if (t.id === msg.payload.tableId) {
              const newItems = [...t.items, ...msg.payload.newItems];
              const newTotal = (t.totalAmount || 0) + (msg.payload.addedAmount || 0);
              return {
                ...t,
                status: 'preparing' as const,
                items: newItems,
                totalAmount: newTotal,
                waiterName: msg.payload.waiterName || t.waiterName,
                lastActivity: `Az önce ${msg.payload.waiterName || 'Garson'} tarafından yeni sipariş girildi`,
              };
            }
            return t;
          });
          saveStoredTables(updated);
          return updated;
        });
      }

      // Mutfak KDS Sipariş Hazır Bildirimi
      if (msg.type === 'ORDER_READY_FOR_PICKUP' && msg.payload) {
        const { tableId, tableCode, orderNumber } = msg.payload;
        setTables((prev) => {
          const updated = prev.map((t) =>
            t.id === tableId || t.name === tableCode || t.id === tableCode
              ? {
                  ...t,
                  lastActivity: `🍽️ Mutfak KDS: Sipariş #${orderNumber} hazırlandı, servise alınız!`,
                }
              : t
          );
          saveStoredTables(updated);
          return updated;
        });

        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate([200, 100, 200, 100, 400]);
          } catch (_) {}
        }
        setSyncNotice(`🔔 SİPARİŞ HAZIR: ${tableCode || 'Masa'} (#${orderNumber}) mutfaktan servise hazır!`);
        setTimeout(() => setSyncNotice(null), 8000);
      }

      if (msg.type === 'TABLE_TRANSFERRED' && msg.payload) {
        const { sourceTableId, targetTableId, sourceTableName, targetTableName, transferredItems, transferredAmount, waiterName } = msg.payload;
        setTables((prev) => {
          const updated = prev.map((t) => {
            if (t.id === sourceTableId) {
              return {
                ...t,
                status: 'cleaning' as const,
                items: [],
                totalAmount: 0,
                durationMinutes: 0,
                lastActivity: `${targetTableName} masasına transfer edildi (Temizlik Bekliyor)`,
              };
            }
            if (t.id === targetTableId) {
              return {
                ...t,
                status: 'preparing' as const,
                items: transferredItems,
                totalAmount: transferredAmount,
                waiterName: waiterName || t.waiterName,
                lastActivity: `${sourceTableName} masasından transfer alındı (${waiterName})`,
              };
            }
            return t;
          });
          saveStoredTables(updated);
          return updated;
        });
        setSyncNotice(`↔ ${sourceTableName} ➔ ${targetTableName} masasına taşındı`);
        setTimeout(() => setSyncNotice(null), 3500);
      }

      if (msg.type === 'TABLE_MERGED' && msg.payload) {
        const { sourceTableId, targetTableId, sourceTableName, targetTableName, mergedItems, newTotal, waiterName } = msg.payload;
        setTables((prev) => {
          const updated = prev.map((t) => {
            if (t.id === sourceTableId) {
              return {
                ...t,
                status: 'cleaning' as const,
                items: [],
                totalAmount: 0,
                durationMinutes: 0,
                lastActivity: `${targetTableName} ile birleştirildi (Temizlik Bekliyor)`,
              };
            }
            if (t.id === targetTableId) {
              return {
                ...t,
                status: 'preparing' as const,
                items: mergedItems,
                totalAmount: newTotal,
                waiterName: waiterName || t.waiterName,
                lastActivity: `${sourceTableName} ile adisyonlar birleştirildi (${waiterName})`,
              };
            }
            return t;
          });
          saveStoredTables(updated);
          return updated;
        });
        setSyncNotice(`🔀 ${sourceTableName} + ${targetTableName} birleştirildi`);
        setTimeout(() => setSyncNotice(null), 3500);
      }

      if (msg.type === 'VISION_AI_ALERT_TRIGGERED' && msg.payload) {
        const { tableId, tableName, section } = msg.payload;
        setTables((prev) => {
          const updated = prev.map((t) =>
            t.id === tableId ? { ...t, delayAlert: true, status: 'waiting_menu' as const } : t
          );
          saveStoredTables(updated);
          return updated;
        });

        // If this alert matches the current waiter's assigned section
        const isMySec = isWaiterSection(user?.section, section);
        if (isMySec) {
          if (typeof window !== 'undefined' && 'vibrate' in navigator) {
            try {
              navigator.vibrate([200, 100, 200, 100, 300]);
            } catch (_) {}
          }
          setSyncNotice(`🚨 ACİL GÖREV: Bölgenizdeki ${tableName || 'Masa'} için Vision AI gecikme uyarısı verdi!`);
          setTimeout(() => setSyncNotice(null), 6000);
        }
      }

      // Vision AI Hayalet Masa Sıfırlama (Ghost Table Auto-Timeout)
      if (msg.type === 'GHOST_TABLE_RESET' && msg.payload) {
        const { tableId, tableName } = msg.payload;
        setTables((prev) => {
          const updated = prev.map((t) =>
            t.id === tableId ? { 
              ...t, 
              status: 'cleaning' as const, 
              totalAmount: 0, 
              items: [], 
              lastActivity: 'Vision AI: 3 dk boş kaldı (Hayalet Masa Sıfırlandı)' 
            } : t
          );
          saveStoredTables(updated);
          return updated;
        });

        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate([250, 100, 250, 100, 400]);
          } catch (_) {}
        }
        setSyncNotice(`🧹 HAYALET MASA SIFIRLANDI: ${tableName || 'Masa'} 3 dakikadır boş algılandı. Eski adisyon arşive alındı, masayı silip sıfırlayın!`);
        setTimeout(() => setSyncNotice(null), 8000);
      }

      // Soft-Lock: First QR Order from Customer Waiting Approval
      if (msg.type === 'QR_ORDER_PENDING_APPROVAL' && msg.payload) {
        setPendingApprovals((prev) => [msg.payload, ...prev.filter((p) => p.orderId !== msg.payload.orderId)]);
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate([100, 50, 100, 50, 200]);
          } catch (_) {}
        }
        setSyncNotice(`📱 [QR Sipariş] ${msg.payload.tableName}: ${msg.payload.items.length} kalem sipariş onayınızı bekliyor!`);
        setTimeout(() => setSyncNotice(null), 7000);
      }

      // Call Waiter Event
      if (msg.type === 'CALL_WAITER_REQUESTED' && msg.payload) {
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate([80, 40, 80]);
          } catch (_) {}
        }
        setSyncNotice(`🔔 ${msg.payload.tableName} servis personeli çağırıyor!`);
        setTimeout(() => setSyncNotice(null), 5000);
      }

      // Bill Requested Event
      if (msg.type === 'BILL_REQUESTED' && msg.payload) {
        setTables((prev) => {
          const updated = prev.map((t) => (t.id === msg.payload.tableId ? { ...t, status: 'bill_requested' as const } : t));
          saveStoredTables(updated);
          return updated;
        });
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate([60, 40, 60]);
          } catch (_) {}
        }
        setSyncNotice(`🧾 ${msg.payload.tableName} hesap istedi (${msg.payload.paymentMethod || 'Nakit / Kart'})`);
        setTimeout(() => setSyncNotice(null), 5000);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [router]);

  // Soft-Lock: Approve Customer QR Order and dispatch to 80mm kitchen printer
  const handleApproveQrOrder = async (approval: PendingQrApproval) => {
    // 1. Update table status to preparing and clear delayAlert
    const allTables = getStoredTables();
    const updated = allTables.map((t) => {
      if (t.id === approval.tableId) {
        return {
          ...t,
          status: 'preparing' as const,
          delayAlert: false,
          lastActivity: `QR Siparişi Garson (${currentUser?.name || 'Garson'}) Tarafından Onaylandı`,
        };
      }
      return t;
    });

    setTables(updated);
    saveStoredTables(updated);

    // 2. Dispatch ESC/POS 80mm thermal receipt to Print Bridge
    try {
      await sendJobToLocalBridge({
        orderId: approval.orderId,
        type: 'kitchen',
        tableNumber: approval.tableName,
        waiterName: `QR Onay (${currentUser?.name || 'Garson'})`,
        timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        items: approval.items,
        subtotal: Math.round(approval.totalAmount * 0.9),
        vat: Math.round(approval.totalAmount * 0.1),
        total: approval.totalAmount,
      });
    } catch (err) {
      console.warn('Mutfak yazıcısı doğrudan erişilemedi (Kuyruğa alındı):', err);
    }

    // 3. Broadcast approval so customer's phone switches from pending to preparing
    syncService.broadcast('QR_ORDER_APPROVED', {
      orderId: approval.orderId,
      tableId: approval.tableId,
      tableName: approval.tableName,
    });

    setPendingApprovals((prev) => prev.filter((p) => p.orderId !== approval.orderId));
    setSyncNotice(`✅ ${approval.tableName} QR siparişi onaylandı ve mutfağa basıldı!`);
    setTimeout(() => setSyncNotice(null), 4000);

    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([40, 30, 60]);
      } catch (_) {}
    }
  };

  const handleLogout = () => {
    if (confirm('Vardiyadan çıkış yapmak istediğinize emin misiniz?')) {
      clearStoredWaiterSession();
      router.push('/waiter/login');
    }
  };

  const handleCleanTable = (e: React.MouseEvent, tableId: string) => {
    e.stopPropagation();
    const updated = tables.map((t) => {
      if (t.id === tableId) {
        return {
          ...t,
          status: 'empty' as const,
          items: [],
          totalAmount: 0,
          durationMinutes: 0,
          lastActivity: 'Temizlendi & Hazır (Garson Tarafından)',
        };
      }
      return t;
    });
    setTables(updated);
    saveStoredTables(updated);

    // Broadcast to cashier & kitchen
    syncService.broadcast('TABLE_STATUS_CHANGED', {
      tableId,
      status: 'empty',
    });

    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(40);
      } catch (_) {}
    }
  };

  const handleAcknowledgeDelay = (e: React.MouseEvent, tableId: string) => {
    e.stopPropagation();
    const updated = tables.map((t) => {
      if (t.id === tableId) {
        return {
          ...t,
          delayAlert: false,
          lastActivity: `Menü verildi (${currentUser?.name || 'Garson'} ilgilendi)`,
        };
      }
      return t;
    });
    setTables(updated);
    saveStoredTables(updated);

    syncService.broadcast('TABLE_STATUS_CHANGED', {
      tableId,
      status: 'waiting_menu',
      delayAlert: false,
    });

    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(50);
      } catch (_) {}
    }
  };

  const filteredTables = tables.filter((table) => {
    if (activeSection === 'all') return true;
    return table.section === activeSection;
  });

  // Calculate live statistics
  const totalTables = tables.length;
  const occupiedCount = tables.filter((t) => t.status !== 'empty' && t.status !== 'cleaning').length;
  const waitingMenuCount = tables.filter((t) => t.status === 'waiting_menu').length;
  const cleaningCount = tables.filter((t) => t.status === 'cleaning').length;
  const myUrgentTables = tables.filter(
    (t) => t.delayAlert && isWaiterSection(currentUser?.section, t.section)
  );

  // Helper for lifecycle badges
  const getLifecycleBadge = (status: TableLifecycleStatus, delayAlert?: boolean) => {
    switch (status) {
      case 'empty':
        return {
          label: 'Boş & Hazır',
          colorClass: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
          dotClass: 'bg-emerald-500',
        };
      case 'waiting_menu':
        return {
          label: delayAlert ? 'Gecikme Uyarısı!' : 'Sipariş Bekliyor',
          colorClass: 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse',
          dotClass: 'bg-amber-400 animate-ping',
        };
      case 'preparing':
      case 'ordered':
        return {
          label: 'Hazırlanıyor',
          colorClass: 'bg-orange-500/20 text-orange-400 border border-orange-500/40',
          dotClass: 'bg-orange-500',
        };
      case 'served':
        return {
          label: 'Servis Edildi',
          colorClass: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
          dotClass: 'bg-blue-500',
        };
      case 'bill_requested':
        return {
          label: 'Hesap İstendi',
          colorClass: 'bg-purple-500/20 text-purple-300 border border-purple-500/40',
          dotClass: 'bg-purple-400 animate-pulse',
        };
      case 'cleaning':
        return {
          label: 'Temizlik Bekliyor',
          colorClass: 'bg-yellow-500/15 text-yellow-300 border border-dashed border-yellow-500/50',
          dotClass: 'bg-yellow-400',
        };
      default:
        return {
          label: 'Bilinmiyor',
          colorClass: 'bg-slate-700 text-slate-300 border border-slate-600',
          dotClass: 'bg-slate-400',
        };
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-[#070a12] pb-6">
      {/* Top Header / Waiter Profile Bar */}
      <div className="sticky top-0 z-30 bg-[#0a0e19]/95 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 p-0.5 shadow-md shadow-amber-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-[#0a0e19] rounded-[10px] flex items-center justify-center text-xl">
              {currentUser?.avatar || '👨‍🍳'}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-white tracking-tight leading-none">
                {currentUser?.name || 'Garson'}
              </span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {currentUser?.section || 'Salon'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-medium text-slate-400">
                Canlı Senkronize • MasaLink POS
              </span>
            </div>
          </div>
        </div>

        {/* Right Action buttons */}
        <div className="flex items-center gap-2">
          <Link
            href="/kds"
            target="_blank"
            className="p-2 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 text-orange-400 text-xs font-bold transition-all flex items-center gap-1.5"
            title="Mutfak KDS Ekranını Aç"
          >
            <ChefHat className="w-4 h-4" />
            <span className="hidden sm:inline">KDS Mutfak</span>
          </Link>

          <button
            onClick={handleLogout}
            className="p-2 rounded-xl bg-slate-800/60 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700/60 active:scale-95 transition-all flex items-center gap-1 text-xs font-semibold"
            title="Vardiyadan Çıkış Yap"
          >
            <LogOut className="w-4 h-4" />
            <span>Çıkış</span>
          </button>
        </div>
      </div>

      {/* Sync Notification Banner (Toast) */}
      {syncNotice && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-xs font-medium text-amber-300 animate-fadeIn">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>{syncNotice}</span>
          </div>
        </div>
      )}

      {/* ŞARJ / DONANIM KESİNTİSİ SONRASI TASLAK KURTARMA AFİŞİ */}
      {recoveredDraft && (
        <div className="mx-4 mt-3 bg-gradient-to-r from-amber-500/25 via-purple-500/20 to-amber-500/15 border-2 border-amber-500/60 rounded-2xl p-3.5 shadow-xl animate-scaleUp">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/30 border border-amber-500/50 flex items-center justify-center text-lg shrink-0 mt-0.5">
                📱
              </div>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500 text-slate-950">
                    TASLAK ADİSYON KURTARILDI
                  </span>
                  <span className="text-xs font-black text-white">
                    {recoveredDraft.tableName}
                  </span>
                </div>
                <p className="text-xs text-amber-200/90 font-medium mt-1 leading-snug">
                  Cihaz kesintisi öncesinde girilen <b className="text-white">{recoveredDraft.itemCount} kalem</b> sipariş ({formatCurrency(recoveredDraft.totalAmount)}) buluttan kurtarıldı.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  clearServerDraft(currentUser?.id || '', recoveredDraft.tableId);
                  setRecoveredDraft(null);
                }}
                className="py-1 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white text-[11px] font-bold"
              >
                Sil
              </button>
              <button
                type="button"
                onClick={() => router.push(`/waiter/order/${recoveredDraft.tableId}`)}
                className="py-2 px-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 text-slate-950 font-black text-xs shadow-lg flex items-center gap-1 active:scale-95 transition-all"
              >
                <span>Taslağı Aç ➔</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Summary Pill Counters */}
      <div className="px-4 pt-3 pb-1">
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-2 text-center">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Tümü</div>
            <div className="text-base font-extrabold text-white mt-0.5">{totalTables}</div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-2 text-center">
            <div className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Açık</div>
            <div className="text-base font-extrabold text-amber-400 mt-0.5">{occupiedCount}</div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-2 text-center">
            <div className="text-[10px] font-semibold text-rose-400 uppercase tracking-wider">Bekleyen</div>
            <div className="text-base font-extrabold text-rose-400 mt-0.5">{waitingMenuCount}</div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-2 text-center">
            <div className="text-[10px] font-semibold text-yellow-400 uppercase tracking-wider">Temizlik</div>
            <div className="text-base font-extrabold text-yellow-400 mt-0.5">{cleaningCount}</div>
          </div>
        </div>
      </div>

      {/* Horizontal Area Filter Chips */}
      <div className="px-4 py-2.5 overflow-x-auto no-scrollbar flex items-center gap-2">
        {[
          { id: 'all', label: 'Tümü' },
          { id: 'salon', label: 'İç Salon' },
          { id: 'bahce', label: 'Bahçe' },
          { id: 'teras', label: 'Teras' },
          { id: 'bar', label: 'Bar' },
        ].map((tab) => {
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as any)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/25 ring-1 ring-amber-400'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Vision AI Emergency Mission Banner (Directly targeted to this Waiter's Section) */}
      {myUrgentTables.length > 0 && (
        <div className="mx-4 mt-1 mb-2.5 p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/25 via-amber-600/30 to-orange-500/25 border-2 border-amber-400 text-amber-100 shadow-xl shadow-amber-500/30 animate-pulse">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/50">
                <Eye className="w-6 h-6 text-slate-950 animate-bounce" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-black tracking-wider uppercase px-1.5 py-0.5 rounded bg-rose-600 text-white font-mono">
                    KAMERA AI: ACİL GÖREV
                  </span>
                  <span className="text-xs font-black text-amber-300 truncate">
                    {myUrgentTables[0].name} ({currentUser?.section})
                  </span>
                </div>
                <p className="text-xs text-white font-extrabold mt-0.5 truncate">
                  02:45 dakikadır menü bekliyor! Doğrudan operasyonel hedefiniz.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push(`/waiter/order/${myUrgentTables[0].id}`)}
              className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 text-slate-950 font-black text-xs shrink-0 active:scale-95 shadow-lg flex items-center gap-1 cursor-pointer"
            >
              <span>Git ➔</span>
            </button>
          </div>
        </div>
      )}

      {/* Soft-Lock: Customer First QR Orders Waiting for Waiter Approval */}
      {pendingApprovals.length > 0 && (
        <div className="mx-4 mb-3 space-y-2">
          {pendingApprovals.map((approval) => (
            <div
              key={approval.orderId}
              className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-950/80 via-[#16132b] to-purple-950/70 border-2 border-purple-500/80 shadow-2xl shadow-purple-500/20 text-purple-100 animate-pulse"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/40 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500 text-slate-950">
                        QR İLK SİPARİŞ ONAYI
                      </span>
                      <span className="text-xs font-black text-white">
                        {approval.tableName}
                      </span>
                    </div>
                    <p className="text-xs text-purple-200 font-bold mt-0.5">
                      {approval.items.map((it) => `${it.quantity}x ${it.name}`).join(', ')} • {formatCurrency(approval.totalAmount)}
                    </p>
                  </div>
                </div>
              </div>

              {approval.customerNote && (
                <>
                  <div className="flex items-center gap-1.5 text-[10px] text-amber-300 font-bold bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md mt-1.5 w-fit">
                    <Camera className="w-3 h-3 text-amber-400" />
                    <span>Vision AI Kör Noktası / Personel Manuel Teyidi</span>
                  </div>

                  <div className="mt-2 text-[11px] text-purple-300/90 italic bg-black/40 px-2 py-1 rounded-lg">
                    Not: {approval.customerNote || 'Özel mutfak notu yok'}
                  </div>
                </>
              )}

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPendingApprovals((prev) => prev.filter((p) => p.orderId !== approval.orderId))}
                  className="py-2 px-3 rounded-xl bg-slate-800 text-slate-400 hover:text-white text-xs font-bold"
                >
                  Reddet
                </button>
                <button
                  type="button"
                  onClick={() => handleApproveQrOrder(approval)}
                  className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 text-slate-950 font-black text-xs shadow-lg flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                >
                  <Printer className="w-3.5 h-3.5 fill-current" />
                  <span>✓ Masayı Onayla ve Mutfağa Bas</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2-Column Mobile Grid: Vertical Rectangular Table Cards */}
      <div className="flex-1 px-4 py-2">
        <div className="grid grid-cols-2 gap-3.5">
          {filteredTables.map((table) => {
            const isMySection = isWaiterSection(currentUser?.section, table.section);
            const isUrgentForMe = !!table.delayAlert && isMySection;
            const isDelayForOther = !!table.delayAlert && !isMySection;
            const badge = getLifecycleBadge(table.status, table.delayAlert);
            const isOpenBill = table.totalAmount > 0;
            const isCleaning = table.status === 'cleaning';
            const isEmpty = table.status === 'empty';

            return (
              <div
                key={table.id}
                onClick={() => router.push(`/waiter/order/${table.id}`)}
                className={`relative flex flex-col justify-between p-3.5 min-h-[175px] rounded-2xl bg-gradient-to-b from-[#0f1523] to-[#0c101c] border transition-all active:scale-[0.98] cursor-pointer shadow-lg group select-none ${
                  isUrgentForMe
                    ? 'border-amber-400 ring-4 ring-amber-400/90 bg-gradient-to-b from-amber-950/60 via-[#182138] to-[#0c101c] shadow-2xl shadow-amber-500/40 animate-pulse'
                    : isDelayForOther
                    ? 'border-rose-500/80 ring-2 ring-rose-500/30 shadow-rose-950/40'
                    : table.status === 'cleaning'
                    ? 'border-dashed border-yellow-500/60 bg-yellow-950/10'
                    : table.status === 'bill_requested'
                    ? 'border-purple-500/60 ring-1 ring-purple-500/30'
                    : isOpenBill
                    ? 'border-amber-500/40 hover:border-amber-400'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Card Top: Table Title & Capacity */}
                <div>
                  <div className="flex items-start justify-between gap-1 mb-1.5">
                    <span className={`text-base font-extrabold tracking-tight transition-colors ${
                      isUrgentForMe ? 'text-amber-300' : 'text-white group-hover:text-amber-400'
                    }`}>
                      {table.name}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-0.5 bg-slate-800/80 px-1.5 py-0.5 rounded-md">
                      <Users className="w-3 h-3 text-slate-400" />
                      <span>{table.capacity}</span>
                    </span>
                  </div>

                  {/* 5-Stage Lifecycle Badge / Yellow Pulse Alarm */}
                  {isUrgentForMe ? (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 shadow-md animate-bounce">
                      <Eye className="w-3 h-3 text-slate-950" />
                      <span>02:45 DK MENÜ BEKLİYOR!</span>
                    </div>
                  ) : (
                    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.colorClass}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${badge.dotClass}`} />
                      <span className="truncate">{badge.label}</span>
                    </div>
                  )}
                </div>

                {/* Card Middle: Vision AI or Order Highlights */}
                <div className="my-2">
                  {isUrgentForMe ? (
                    <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 space-y-1.5">
                      <div className="flex items-center gap-1 text-[11px] font-extrabold text-amber-300">
                        <Eye className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                        <span>Kamera 1: Senin Masan!</span>
                      </div>
                      <p className="text-[10px] text-amber-100 font-semibold leading-tight">
                        02:45 dk'dır menü bekliyor. Hemen masaya gidin.
                      </p>
                      <div className="grid grid-cols-2 gap-1 pt-1">
                        <button
                          type="button"
                          onClick={(e) => handleAcknowledgeDelay(e, table.id)}
                          className="py-1.5 px-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 font-bold text-[10px] border border-slate-700 active:scale-95 flex items-center justify-center gap-1"
                        >
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Verildi ✓</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/waiter/order/${table.id}`);
                          }}
                          className="py-1.5 px-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[10px] shadow active:scale-95 flex items-center justify-center gap-0.5"
                        >
                          <Zap className="w-3 h-3 fill-current" />
                          <span>Sipariş ➔</span>
                        </button>
                      </div>
                    </div>
                  ) : isOpenBill ? (
                    <div>
                      <div className="text-lg font-black text-amber-400 tracking-tight leading-none">
                        {formatCurrency(table.totalAmount)}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{table.durationMinutes} dk</span>
                        <span>•</span>
                        <span>{table.items.reduce((acc, i) => acc + i.quantity, 0)} kalem</span>
                      </div>
                    </div>
                  ) : isCleaning ? (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] text-yellow-300 font-medium">
                        Misafir kalktı, temizlik bekliyor.
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleCleanTable(e, table.id)}
                        className="w-full py-1.5 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border border-yellow-500/40 text-[11px] font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"
                      >
                        <Check className="w-3.5 h-3.5 text-yellow-400" />
                        <span>Temizlendi ✓</span>
                      </button>
                    </div>
                  ) : isEmpty ? (
                    <div className="flex items-center gap-1 text-xs font-semibold text-emerald-400/90">
                      <Plus className="w-3.5 h-3.5" />
                      <span>Sipariş Başlat</span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400 line-clamp-2">
                      {table.lastActivity}
                    </div>
                  )}
                </div>

                {/* Card Bottom: Waiter attribution or tap arrow */}
                <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
                  <span className="truncate max-w-[90px]">
                    {table.waiterName || 'Garson Yok'}
                  </span>
                  <div className="flex items-center gap-0.5 text-amber-400 font-bold group-hover:translate-x-0.5 transition-transform">
                    <span>Sipariş</span>
                    <ChevronRight className="w-3 h-3" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
