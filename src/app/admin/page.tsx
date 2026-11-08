'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  getStoredAuthUser, 
  clearStoredAuthUser, 
  AuthUser 
} from '@/utils/auth';
import { AdminSidebar, AdminModuleType } from '@/components/admin/AdminSidebar';
import { AdminTopbar } from '@/components/admin/AdminTopbar';
import { FloorMapModule, VisionAiAlert } from '@/components/admin/FloorMapModule';
import { PosCheckoutModule } from '@/components/admin/PosCheckoutModule';
import { MenuRecipeModule } from '@/components/admin/MenuRecipeModule';
import { TableManagementModule } from '@/components/admin/TableManagementModule';
import { StaffManagementModule } from '@/components/admin/StaffManagementModule';
import { FinanceReportModule } from '@/components/admin/FinanceReportModule';
import { SystemSettingsModule } from '@/components/admin/SystemSettingsModule';
import { TableDetailDrawer, AdminTable } from '@/components/admin/TableDetailDrawer';
import { ThermalReceiptModal, ReceiptData } from '@/components/admin/ThermalReceiptModal';
import { FailedPrintQueueModal } from '@/components/admin/FailedPrintQueueModal';
import { formatCurrency } from '@/utils/helpers';
import { syncService, SyncMessage } from '@/utils/syncService';
import { sendJobToLocalBridge, FailedPrintJob } from '@/utils/printBridge';
import { INITIAL_TABLES, getStoredTables, saveStoredTables } from '@/utils/tableData';
import { TableTransferModal } from '@/components/TableTransferModal';

const INITIAL_ALERTS: VisionAiAlert[] = [
  {
    id: 'alt-1',
    type: 'delay',
    tableId: 'tbl-6',
    tableName: 'Masa 6',
    title: 'Sipariş Gecikme Uyarısı',
    description: 'Misafir 02:45 dakikadır masada bekliyor, sipariş henüz alınmadı!',
    timeAgo: 'Şimdi',
    durationSeconds: 165,
  },
  {
    id: 'alt-2',
    type: 'seated',
    tableId: 'tbl-5',
    tableName: 'Masa 5',
    title: 'Yeni Misafir Oturumu',
    description: 'Kamera 1: 4 kişilik misafir grubu masaya oturdu (Durum: Menü Bekliyor).',
    timeAgo: '1 dk önce',
  },
  {
    id: 'alt-3',
    type: 'cleaning',
    tableId: 'tbl-3',
    tableName: 'Masa 3',
    title: 'Masa Boşaldı / Temizlik',
    description: 'Kamera 1: Misafirler kalktı. Masa dezenfekte edilmeye hazır.',
    timeAgo: '3 dk önce',
  },
];

export default function AdminPage() {
  const router = useRouter();

  // Authentication
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // Active module & branches
  const [activeModule, setActiveModule] = useState<AdminModuleType>('floor');
  const [currentBranch, setCurrentBranch] = useState('Kadıköy Merkez');

  // Operational State
  const [tables, setTables] = useState<AdminTable[]>(INITIAL_TABLES);
  const [alerts, setAlerts] = useState<VisionAiAlert[]>(INITIAL_ALERTS);
  const [globalToast, setGlobalToast] = useState<string | null>(null);

  // Printer & Disaster Recovery State
  const [printerOnline, setPrinterOnline] = useState<boolean>(true);
  const [printerStatusText, setPrinterStatusText] = useState<string>('Online (80mm)');
  const [failedPrintJobs, setFailedPrintJobs] = useState<FailedPrintJob[]>([]);
  const [isFailedQueueOpen, setIsFailedQueueOpen] = useState<boolean>(false);
  const [isRetryingJob, setIsRetryingJob] = useState<boolean>(false);

  // Drawer & Modals
  const [drawerTable, setDrawerTable] = useState<AdminTable | null>(null);
  const [transferSourceTable, setTransferSourceTable] = useState<AdminTable | null>(null);
  const [posSelectedTableId, setPosSelectedTableId] = useState<string>('tbl-1');
  const [receiptModal, setReceiptModal] = useState<{
    isOpen: boolean;
    data: ReceiptData | null;
  }>({
    isOpen: false,
    data: null,
  });

  // Verify Auth & Multi-Device Realtime Sync on mount
  useEffect(() => {
    const user = getStoredAuthUser();
    if (!user) {
      router.push('/login');
    } else {
      setCurrentUser(user);
      setIsAuthChecking(false);
    }

    // Load cached tables if available
    const stored = getStoredTables();
    if (stored && stored.length > 0) {
      setTables(stored);
    }

    // Subscribe to multi-device real-time sync events (Waiter phones, tablets, kitchen)
    const unsubscribe = syncService.subscribe((msg: SyncMessage) => {
      if (msg.type === 'TABLE_STATUS_CHANGED' && msg.payload) {
        setTables((prev) => {
          const updated = prev.map((t) => (t.id === msg.payload.tableId ? { ...t, status: msg.payload.status } : t));
          saveStoredTables(updated);
          return updated;
        });
        setGlobalToast(`📡 [Cihaz Senkronizasyonu] ${msg.deviceName}: Masa durumu güncellendi.`);
        setTimeout(() => setGlobalToast(null), 3500);
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
        setGlobalToast(`⚡ [Garson: ${msg.payload.waiterName || 'Mobil'}] ${msg.payload.tableName || 'Masa'}: Yeni sipariş mutfağa iletildi (+₺${msg.payload.addedAmount})`);
        setTimeout(() => setGlobalToast(null), 4000);
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
        setGlobalToast(`↔ [Masa Transferi] ${sourceTableName} ➔ ${targetTableName} taşındı (${waiterName || 'Garson'})`);
        setTimeout(() => setGlobalToast(null), 4500);
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
        setGlobalToast(`🔀 [Masa Birleştirme] ${sourceTableName} + ${targetTableName} birleştirildi (Toplam: ₺${newTotal})`);
        setTimeout(() => setGlobalToast(null), 4500);
      }

      if (msg.type === 'QR_ORDER_PENDING_APPROVAL' && msg.payload) {
        setGlobalToast(`📱 [QR Sipariş] ${msg.payload.tableName}: İlk sipariş garson onayı bekliyor (${msg.payload.items.length} Kalem • ₺${msg.payload.totalAmount})`);
        setTimeout(() => setGlobalToast(null), 5000);
      }

      if (msg.type === 'CALL_WAITER_REQUESTED' && msg.payload) {
        setGlobalToast(`🔔 [Garson Çağrısı] ${msg.payload.tableName} masası servis personeli çağırıyor!`);
        setTimeout(() => setGlobalToast(null), 5000);
      }

      if (msg.type === 'BILL_REQUESTED' && msg.payload) {
        setTables((prev) => {
          const updated = prev.map((t) => (t.id === msg.payload.tableId ? { ...t, status: 'bill_requested' as const } : t));
          saveStoredTables(updated);
          return updated;
        });
        setGlobalToast(`🧾 [Hesap Talebi] ${msg.payload.tableName} hesap istedi (${msg.payload.paymentMethod || 'Kredi Kartı / Nakit'})`);
        setTimeout(() => setGlobalToast(null), 5000);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [router]);

  // Logout handler
  const handleLogout = () => {
    clearStoredAuthUser();
    router.push('/login');
  };

  // Drawer handlers
  const handleSelectTable = (table: AdminTable) => {
    setDrawerTable(table);
  };

  const handleCloseDrawer = () => {
    setDrawerTable(null);
  };

  // Send waiter action (Vision AI Alert Dispatch)
  const handleSendWaiter = (tableId: string) => {
    const target = tables.find((t) => t.id === tableId);
    const updated = tables.map((t) =>
      t.id === tableId
        ? { ...t, delayAlert: true, lastActivity: 'Vision AI: 02:45 dk menü bekliyor (Garsona Hedef Yollandı)' }
        : t
    );
    setTables(updated);
    saveStoredTables(updated);

    // Broadcast Vision AI alert to the relevant waiter's mobile terminal
    syncService.broadcast('VISION_AI_ALERT_TRIGGERED', {
      tableId,
      tableName: target?.name || 'Masa',
      section: target?.section || 'salon',
      title: 'Sipariş Gecikme Uyarısı',
      description: 'Misafir 02:45 dakikadır menü bekliyor!',
    });

    setGlobalToast(`🚨 Kamera (Vision AI) uyarısı ${target?.name || 'Masa'} için ilgili bölüm garsonunun (Ahmet Yılmaz) terminaline sarı nabız olarak fırlatıldı!`);
    setTimeout(() => setGlobalToast(null), 4500);
  };

  // Clean table action
  const handleResolveCleaning = (tableId: string) => {
    setTables((prev) =>
      prev.map((t) =>
        t.id === tableId
          ? { ...t, status: 'empty', totalAmount: 0, items: [], durationMinutes: 0 }
          : t
      )
    );
    setAlerts((prev) => prev.filter((a) => a.tableId !== tableId));
  };

  // Table Add Item handler
  const handleAddItemToTable = (tableId: string, itemName: string, price: number) => {
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== tableId) return t;
        const existing = t.items.find((i) => i.name === itemName);
        let newItems;
        if (existing) {
          newItems = t.items.map((i) =>
            i.name === itemName ? { ...i, quantity: i.quantity + 1 } : i
          );
        } else {
          newItems = [...t.items, { name: itemName, quantity: 1, price }];
        }
        const newTotal = newItems.reduce((acc, curr) => acc + curr.price * curr.quantity, 0);
        const updated = {
          ...t,
          status: 'ordered' as const,
          items: newItems,
          totalAmount: newTotal,
        };
        // If drawer is open for this table, sync drawer too
        if (drawerTable?.id === tableId) {
          setDrawerTable(updated);
        }
        return updated;
      })
    );
  };

  // Table items update from POS
  const handleUpdateTableItems = (
    tableId: string,
    items: AdminTable['items'],
    total: number
  ) => {
    setTables((prev) =>
      prev.map((t) =>
        t.id === tableId
          ? {
              ...t,
              items,
              totalAmount: total,
              status: items.length > 0 ? (t.status === 'empty' ? 'ordered' : t.status) : 'empty',
            }
          : t
      )
    );
  };

  // Close Table (Payment complete)
  const handleCloseTable = (tableId: string) => {
    setTables((prev) =>
      prev.map((t) =>
        t.id === tableId
          ? {
              ...t,
              status: 'empty',
              totalAmount: 0,
              items: [],
              durationMinutes: 0,
              delayAlert: false,
            }
          : t
      )
    );
    if (drawerTable?.id === tableId) {
      setDrawerTable(null);
    }
  };

  // Go to POS from drawer
  const handleGoToCheckout = (table: AdminTable) => {
    setPosSelectedTableId(table.id);
    setActiveModule('pos');
    setDrawerTable(null);
  };

  // Instant 2-Second Checkout directly from Floor Map
  const handleQuickCheckout = (table: AdminTable, method: 'Nakit' | 'Kredi Kartı', tender?: number) => {
    handlePrintReceipt(table, 'bill');
    handleCloseTable(table.id);
    const tenderInfo = tender && tender > table.totalAmount ? ` (Para Üstü: ${formatCurrency(tender - table.totalAmount)})` : '';
    setGlobalToast(`⚡ ${table.name} adisyonu ${formatCurrency(table.totalAmount)} tutarla (${method})${tenderInfo} anında tahsil edildi ve masa boşaltıldı!`);
    setTimeout(() => {
      setGlobalToast(null);
    }, 4500);

    // Broadcast checkout to all connected waiter/kitchen devices
    syncService.broadcast('TABLE_CHECKOUT_COMPLETED', { tableId: table.id, amount: table.totalAmount });
  };

  // 5-Stage Table Lifecycle State Machine Transition
  const handleUpdateTableStatus = (tableId: string, status: AdminTable['status']) => {
    setTables((prev) =>
      prev.map((t) => (t.id === tableId ? { ...t, status } : t))
    );
    if (drawerTable?.id === tableId) {
      setDrawerTable((prev) => (prev ? { ...prev, status } : null));
    }
    const statusLabels: Record<string, string> = {
      waiting_menu: '1. Oturuldu (Menü Bekliyor)',
      preparing: '2. Mutfakta Hazırlanıyor',
      served: '3. Servis Edildi (Afiyet Olsun)',
      bill_requested: '4. Hesap İstendi (Adisyon Kilitli)',
      cleaning: '5. Temizlik Bekliyor',
      empty: 'Boş & Hazır',
    };
    const targetTable = tables.find(t => t.id === tableId);
    if (targetTable) {
      setGlobalToast(`📍 ${targetTable.name} durumu "${statusLabels[status] || status}" olarak güncellendi.`);
      setTimeout(() => setGlobalToast(null), 3000);
    }

    // Broadcast state transition to all devices
    syncService.broadcast('TABLE_STATUS_CHANGED', { tableId, status });
  };

  // Thermal ESC/POS Receipt simulation trigger
  const handlePrintReceipt = async (table: AdminTable, type: 'kitchen' | 'bill') => {
    const isKitchen = type === 'kitchen';
    const subtotal = Math.round(table.totalAmount * 0.9);
    const kdv = Math.round(table.totalAmount * 0.1);

    const receipt: ReceiptData = {
      orderId: `AD-${Math.floor(100000 + Math.random() * 900000)}`,
      tableNumber: table.name,
      timestamp: `${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`,
      waiterName: table.waiterName || 'Ahmet K.',
      type,
      items: table.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        notes: isKitchen && i.name.includes('Smash') ? 'Az tuzlu, iyi pişmiş' : undefined,
      })),
      subtotal,
      vat: kdv,
      total: table.totalAmount,
      paymentMethod: type === 'bill' ? 'Nakit / Kart' : undefined,
    };

    // Attempt local bridge dispatch
    const printRes = await sendJobToLocalBridge(receipt);
    if (!printRes.success && printRes.failedJob) {
      setPrinterOnline(false);
      setPrinterStatusText('Kağıt Bitti / Çevrimdışı');
      setFailedPrintJobs((prev) => [printRes.failedJob!, ...prev]);
    } else if (failedPrintJobs.length === 0) {
      setPrinterOnline(true);
      setPrinterStatusText('Online (80mm)');
    }

    setReceiptModal({
      isOpen: true,
      data: receipt,
    });
  };

  // Retry Failed Print Job
  const handleRetryJob = async (job: FailedPrintJob) => {
    setIsRetryingJob(true);
    const res = await sendJobToLocalBridge(job.receipt);
    setIsRetryingJob(false);

    if (res.success) {
      setFailedPrintJobs((prev) => prev.filter((j) => j.id !== job.id));
      if (failedPrintJobs.length <= 1) {
        setPrinterOnline(true);
        setPrinterStatusText('Online (80mm)');
      }
      setGlobalToast(`✅ ${job.tableNumber} adisyonu mutfak yazıcısına başarıyla iletildi ve kuyruktan düşürüldü!`);
      setTimeout(() => setGlobalToast(null), 4000);
    } else {
      setGlobalToast(`❌ Yazıcı hala çevrimdışı! Lütfen kağıt rulosunu veya Ethernet kablosunu kontrol ediniz.`);
      setTimeout(() => setGlobalToast(null), 4000);
    }
  };

  // Browser Fallback Print for Failed Job
  const handleBrowserFallback = (job: FailedPrintJob) => {
    setReceiptModal({
      isOpen: true,
      data: job.receipt,
    });
    setFailedPrintJobs((prev) => prev.filter((j) => j.id !== job.id));
    if (failedPrintJobs.length <= 1) {
      setPrinterOnline(true);
      setPrinterStatusText('Online (80mm)');
    }
  };

  // Disaster Simulation Trigger for Testing
  const handleSimulatePrinterError = () => {
    const sampleReceipt: ReceiptData = {
      orderId: 'AD-99412',
      tableNumber: 'Masa 4 (Bahçe)',
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      waiterName: 'Deniz A.',
      type: 'kitchen',
      items: [
        { name: 'Double Cheddar Bacon Burger', quantity: 2, price: 340 },
        { name: 'Baharatlı Patates', quantity: 2, price: 110 },
      ],
      subtotal: 810,
      vat: 90,
      total: 900,
    };

    const simulatedJob: FailedPrintJob = {
      id: `fail-${Date.now()}`,
      orderId: sampleReceipt.orderId,
      tableNumber: sampleReceipt.tableNumber,
      totalAmount: sampleReceipt.total,
      receipt: sampleReceipt,
      errorReason: 'Mutfak termal yazıcısının kağıdı bitti veya Ethernet kablosu takılı değil (ECONNREFUSED).',
      errorCode: 'ECONNREFUSED',
      failedAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      retryCount: 0,
    };

    setPrinterOnline(false);
    setPrinterStatusText('Kağıt Bitti / Çevrimdışı');
    setFailedPrintJobs((prev) => [simulatedJob, ...prev]);
  };

  // Aggregated KPIs
  const occupiedTables = tables.filter((t) => t.status !== 'empty').length;
  const currentTurnover = tables.reduce((acc, t) => acc + t.totalAmount, 0) + 21850; // base + active

  if (isAuthChecking) {
    return (
      <div className="w-full h-screen bg-[#070a12] flex items-center justify-center text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
          <span className="text-xs font-mono">Masalink Kokpiti Yükleniyor...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full h-screen overflow-hidden bg-[#070a12]">
      {/* Collapsible Left Sidebar */}
      <AdminSidebar
        activeModule={activeModule}
        onChangeModule={setActiveModule}
        user={currentUser}
        onLogout={handleLogout}
        activeTableCount={occupiedTables}
        aiAlertCount={alerts.length}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Operational Bar */}
        <AdminTopbar
          user={currentUser}
          totalRevenue={currentTurnover}
          activeTableCount={occupiedTables}
          totalTableCount={tables.length}
          printerOnline={printerOnline}
          printerStatusText={printerStatusText}
          failedPrintCount={failedPrintJobs.length}
          onLogout={handleLogout}
          onGoToPos={() => setActiveModule('pos')}
          onTestPrint={() => {
            const sampleTable = tables.find((t) => t.status !== 'empty') || tables[0];
            handlePrintReceipt(sampleTable, 'kitchen');
          }}
          onTriggerVisionMock={() => {
            setActiveModule('floor');
          }}
          onOpenFailedQueue={() => setIsFailedQueueOpen(true)}
        />

        {/* Scrollable Module Workspace */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-gradient-to-b from-[#090d18] to-[#070a12] space-y-4">
          {/* Critical Disaster Alert Banner: Mutfak Yazıcısı Kağıt Bitti / Çevrimdışı */}
          {failedPrintJobs.length > 0 && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-950/90 via-rose-900/80 to-zinc-900 border-2 border-rose-500/80 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xl animate-pulse">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-500 text-white font-black text-sm flex items-center justify-center shrink-0">
                  <span className="text-base">⚠️</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-black text-sm text-rose-100">
                      DİKKAT: Mutfak Yazıcısına İletilemeyen {failedPrintJobs.length} Adisyon Var!
                    </h4>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-rose-300 font-mono">
                      {failedPrintJobs[0].errorCode}
                    </span>
                  </div>
                  <p className="text-xs text-rose-300/80 mt-0.5">
                    Kağıt rulosu bitti veya ağ kablosu çıkık ({failedPrintJobs[0].tableNumber} - {formatCurrency(failedPrintJobs[0].totalAmount)})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleRetryJob(failedPrintJobs[0])}
                  disabled={isRetryingJob}
                  className="px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg transition-transform active:scale-95 disabled:opacity-50"
                >
                  <span>🔄 Tekrar Fırlat</span>
                </button>
                <button
                  onClick={() => setIsFailedQueueOpen(true)}
                  className="px-3 py-2 rounded-xl bg-white/[0.1] hover:bg-white/[0.2] text-white font-semibold text-xs transition-colors"
                >
                  Kuyruğu Aç ({failedPrintJobs.length})
                </button>
              </div>
            </div>
          )}

          {/* Instant Notification Toast */}
          {globalToast && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-between text-xs font-bold animate-fadeIn shadow-lg">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                {globalToast}
              </span>
              <button
                onClick={() => setGlobalToast(null)}
                className="text-[11px] text-emerald-400 hover:text-white underline ml-3"
              >
                Tamam
              </button>
            </div>
          )}

          {activeModule === 'floor' && (
            <FloorMapModule
              tables={tables}
              onSelectTable={handleSelectTable}
              onSendWaiter={handleSendWaiter}
              onResolveCleaning={handleResolveCleaning}
              alerts={alerts}
              onDismissAlert={(id) => setAlerts((prev) => prev.filter((a) => a.id !== id))}
              onDirectQuickPay={(t) => handleQuickCheckout(t, 'Kredi Kartı')}
            />
          )}

          {activeModule === 'pos' && (
            <PosCheckoutModule
              tables={tables}
              selectedTableId={posSelectedTableId}
              onSelectTableId={setPosSelectedTableId}
              onUpdateTableItems={handleUpdateTableItems}
              onCloseTable={handleCloseTable}
              onPrintReceipt={handlePrintReceipt}
            />
          )}

          {activeModule === 'menu' && <MenuRecipeModule />}

          {activeModule === 'tables' && <TableManagementModule />}

          {activeModule === 'staff' && <StaffManagementModule />}

          {activeModule === 'finance' && <FinanceReportModule />}

          {activeModule === 'settings' && (
            <SystemSettingsModule onSimulatePrinterError={handleSimulatePrinterError} />
          )}
        </main>
      </div>

      {/* Right Table Detail Drawer */}
      <TableDetailDrawer
        table={drawerTable}
        onClose={handleCloseDrawer}
        onGoToCheckout={handleGoToCheckout}
        onPrintReceipt={handlePrintReceipt}
        onCloseTable={handleCloseTable}
        onAddItemToTable={handleAddItemToTable}
        onQuickCheckout={handleQuickCheckout}
        onUpdateStatus={handleUpdateTableStatus}
        onOpenTransferModal={(tbl) => setTransferSourceTable(tbl)}
      />

      {/* Table Transfer / Merge Modal (Desktop & Mobile) */}
      {transferSourceTable && (
        <TableTransferModal
          isOpen={!!transferSourceTable}
          onClose={() => setTransferSourceTable(null)}
          sourceTable={transferSourceTable}
          allTables={tables}
          waiterName={currentUser?.name || 'Kasa'}
          onSuccess={(targetId, mode) => {
            setTransferSourceTable(null);
            setGlobalToast(
              mode === 'transfer'
                ? `↔ Masa transferi başarıyla tamamlandı (Hedef: ${tables.find((t) => t.id === targetId)?.name || 'Masa'})`
                : `🔀 Masalar başarıyla birleştirildi (Hedef: ${tables.find((t) => t.id === targetId)?.name || 'Masa'})`
            );
            setTimeout(() => setGlobalToast(null), 4000);
          }}
        />
      )}

      {/* ESC/POS Thermal Receipt Print Simulation Modal */}
      <ThermalReceiptModal
        isOpen={receiptModal.isOpen}
        onClose={() => setReceiptModal({ isOpen: false, data: null })}
        receipt={receiptModal.data}
      />

      {/* Disaster Recovery: Mutfak Yazıcısı Hata & Kuyruk Modalı */}
      <FailedPrintQueueModal
        isOpen={isFailedQueueOpen}
        onClose={() => setIsFailedQueueOpen(false)}
        failedJobs={failedPrintJobs}
        onRetryJob={handleRetryJob}
        onBrowserFallback={handleBrowserFallback}
        onDismissJob={(jobId) => setFailedPrintJobs((prev) => prev.filter((j) => j.id !== jobId))}
        onClearAll={() => {
          setFailedPrintJobs([]);
          setPrinterOnline(true);
          setPrinterStatusText('Online (80mm)');
        }}
        isRetrying={isRetryingJob}
      />
    </div>
  );
}
