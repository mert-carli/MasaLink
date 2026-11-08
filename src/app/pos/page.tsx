'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  CreditCard, 
  Banknote, 
  Divide, 
  Printer, 
  Plus, 
  Minus, 
  Trash2, 
  CheckCircle2, 
  Search, 
  Users, 
  Receipt, 
  Utensils, 
  ArrowRight,
  Sparkles,
  Percent,
  Check,
  Lock,
  Maximize2,
  Minimize2,
  RefreshCw,
  Gift,
  AlertTriangle,
  Clock,
  ChevronRight,
  X,
  FileText,
  Volume2,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  ListChecks,
  BellRing,
  ChefHat
} from 'lucide-react';
import { AdminTable } from '@/components/admin/TableDetailDrawer';
import { getStoredTables, saveStoredTables, INITIAL_TABLES } from '@/utils/tableData';
import { QUICK_MENU_ITEMS, MenuItem } from '@/utils/menuData';
import { formatCurrency } from '@/utils/helpers';
import { 
  getPosShiftSession, 
  clearPosShiftSession, 
  PosShiftSession 
} from '@/utils/posAuth';
import { 
  sendJobToLocalBridge, 
  testKitchenBuzzerAndSiren,
  PrintDispatchResult 
} from '@/utils/printBridge';
import { syncService, SyncMessage } from '@/utils/syncService';
import { ReceiptData } from '@/components/admin/ThermalReceiptModal';

// Sık satılan hızlı ekleme ürünleri
const QUICK_FAVORITE_ITEMS: MenuItem[] = [
  { id: 'q-water', name: 'Su 330ml', price: 20, category: 'İçecekler' },
  { id: 'q-tea', name: 'Geleneksel Çay', price: 25, category: 'İçecekler' },
  { id: 'q-turkish-coffee', name: 'Türk Kahvesi', price: 45, category: 'İçecekler' },
  { id: 'q-filter-coffee', name: 'Filtre Kahve', price: 65, category: 'İçecekler' },
  { id: 'q-fries', name: 'Baharatlı Patates', price: 110, category: 'Yanlar' },
  { id: 'q-cola', name: 'Kola / Meşrubat', price: 65, category: 'İçecekler' },
];

export default function PosTerminalPage() {
  const router = useRouter();

  // Shift & Auth state
  const [shiftSession, setShiftSession] = useState<PosShiftSession | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Table & Data state
  const [tables, setTables] = useState<AdminTable[]>(INITIAL_TABLES);
  const [selectedTableId, setSelectedTableId] = useState<string>('tbl-4');
  const [sectionFilter, setSectionFilter] = useState<'all' | 'salon' | 'bahce' | 'teras' | 'bar'>('all');
  const [tableSearchQuery, setTableSearchQuery] = useState<string>('');

  // Middle Column item actions & search
  const [itemSearchQuery, setItemSearchQuery] = useState<string>('');
  const [isFullMenuOpen, setIsFullMenuOpen] = useState<boolean>(false);
  const [menuModalCategory, setMenuModalCategory] = useState<string>('Tümü');

  // Discount module state
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'amount'>('none');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState<string>('Müşteri Memnuniyeti');

  // Manager Authorization State (Yetkisiz İndirim & İkram İstismarı Savunması)
  const [managerApproval, setManagerApproval] = useState<{
    managerPin: string;
    managerName: string;
    managerTitle: string;
  } | null>(null);

  const [managerModal, setManagerModal] = useState<{
    isOpen: boolean;
    actionTitle: string;
    reason: string;
    enteredPin: string;
    error?: string;
    isSubmitting?: boolean;
    onSuccess: (pin: string, manager: { name: string; title: string; role: string }) => void;
  } | null>(null);

  // Split bill module state
  const [activePaymentTab, setActivePaymentTab] = useState<'full' | 'split_equal' | 'split_items' | 'split_guests'>('full');
  const [splitCount, setSplitCount] = useState<number>(2);
  const [paidSharesCount, setPaidSharesCount] = useState<number>(0);
  const [selectedItemIndices, setSelectedItemIndices] = useState<number[]>([]);

  // Payment modals
  const [isCashModalOpen, setIsCashModalOpen] = useState<boolean>(false);
  const [cashTenderAmount, setCashTenderAmount] = useState<number>(0);
  const [customCashInput, setCustomCashInput] = useState<string>('');

  // Status banners & feedback
  const [toastMessage, setToastMessage] = useState<{ title: string; desc: string; type: 'success' | 'warning' | 'info' } | null>(null);
  const [printerOnline, setPrinterOnline] = useState<boolean>(true);

  // Load Shift & Auth
  useEffect(() => {
    const session = getPosShiftSession();
    if (!session) {
      router.push('/pos/login');
      return;
    }
    setShiftSession(session);
  }, [router]);

  // Load Tables & Listen to Realtime Events
  useEffect(() => {
    const loaded = getStoredTables();
    if (loaded && loaded.length > 0) {
      setTables(loaded);
    }

    // Subscribe to SyncService
    const unsubscribe = syncService.subscribe((msg: SyncMessage) => {
      if (
        msg.type === 'ORDER_ITEMS_ADDED' ||
        msg.type === 'TABLE_STATUS_CHANGED' ||
        msg.type === 'TABLE_CHECKOUT_COMPLETED' ||
        msg.type === 'TABLE_TRANSFERRED' ||
        msg.type === 'TABLE_MERGED' ||
        msg.type === 'BILL_REQUESTED' ||
        msg.type === 'QR_ORDER_APPROVED' ||
        msg.type === 'GHOST_TABLE_RESET' ||
        msg.type === 'ORDER_READY_FOR_PICKUP' ||
        msg.type === 'ORDER_STATUS_CHANGED'
      ) {
        const fresh = getStoredTables();
        setTables(fresh);
      }

      // Mutfak KDS Sipariş Hazır Bildirimi
      if (msg.type === 'ORDER_READY_FOR_PICKUP' && msg.payload) {
        showToast(
          '🔔 Mutfak KDS: Sipariş Hazır!',
          `${msg.payload.tableCode || 'Masa'} (#${msg.payload.orderNumber}) servise hazırlandı.`,
          'success'
        );
        playSoundEffect('beep');
      }

      // Vision AI Hayalet Masa Sıfırlama Bildirimi
      if (msg.type === 'GHOST_TABLE_RESET' && msg.payload) {
        showToast(
          '👁️ Hayalet Masa Sıfırlandı (Vision AI)',
          `${msg.payload.tableName} 3 dakikadır boş algılandı. Eski adisyon arşive alındı ve masa temizliğe çekildi.`,
          'info'
        );
      }

      // Kaba kuvvet PIN saldırısı alarmı
      if (msg.type === 'SECURITY_ALERT_BRUTE_FORCE' && msg.payload) {
        showToast(
          '🚨 GÜVENLİK ALARMI (Kaba Kuvvet)',
          msg.payload.message || 'Art arda 5 hatalı PIN denemesi tespit edildi! 10 dakika kilitlendi.',
          'warning'
        );
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Active selected table
  const selectedTable = useMemo(() => {
    return tables.find((t) => t.id === selectedTableId) || tables.find((t) => t.status !== 'empty') || tables[0];
  }, [tables, selectedTableId]);

  // Audio / Haptic feedback
  const playSoundEffect = useCallback((type: 'beep' | 'success' | 'cash') => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(type === 'cash' ? [100, 50, 100] : 40);
    }
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'cash') {
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1); // A5
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
      } else {
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
      }
    } catch {
      // AudioContext fallback
    }
  }, []);

  const showToast = (title: string, desc: string, type: 'success' | 'warning' | 'info' = 'info') => {
    setToastMessage({ title, desc, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Lock Cashier / Logout
  const handleLockShift = () => {
    if (confirm('Kasa oturumunu kilitlemek istediğinize emin misiniz?')) {
      clearPosShiftSession();
      router.push('/pos/login');
    }
  };

  // Filtered tables for left column
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      const matchesSection = sectionFilter === 'all' || t.section === sectionFilter;
      const matchesSearch = t.name.toLowerCase().includes(tableSearchQuery.toLowerCase()) ||
                            t.id.toLowerCase().includes(tableSearchQuery.toLowerCase());
      return matchesSection && matchesSearch;
    });
  }, [tables, sectionFilter, tableSearchQuery]);

  // Statistics for topbar
  const openTablesCount = tables.filter((t) => t.status !== 'empty').length;
  const totalOpenAmount = tables.reduce((acc, t) => acc + (t.status !== 'empty' ? t.totalAmount : 0), 0);

  // Financial Calculations for Active Table
  const subtotal = useMemo(() => {
    if (!selectedTable || !selectedTable.items) return 0;
    return selectedTable.items.reduce((sum, item: any) => {
      const effectivePrice = item.isComped ? 0 : item.price;
      return sum + effectivePrice * item.quantity;
    }, 0);
  }, [selectedTable]);

  const discountAmount = useMemo(() => {
    if (discountType === 'percent') {
      return (subtotal * discountValue) / 100;
    }
    if (discountType === 'amount') {
      return Math.min(subtotal, discountValue);
    }
    return 0;
  }, [subtotal, discountType, discountValue]);

  const netPayable = Math.max(0, subtotal - discountAmount);
  const vatAmount = (netPayable * 10) / 110; // %10 Dahil KDV

  // Multi-guest grouping for split payments
  const guestGroups = useMemo(() => {
    if (!selectedTable || !selectedTable.items) return [];
    const map = new Map<string, { guestTag: string; items: any[]; total: number }>();
    
    selectedTable.items.forEach((item: any, idx: number) => {
      const tag = item.guestTag || 'Misafir 1';
      if (!map.has(tag)) {
        map.set(tag, { guestTag: tag, items: [], total: 0 });
      }
      const group = map.get(tag)!;
      group.items.push({ ...item, originalIndex: idx });
      group.total += (item.isComped ? 0 : item.price) * item.quantity;
    });

    return Array.from(map.values());
  }, [selectedTable]);

  // Reset discounts & split bill when changing table
  const handleSelectTable = (tblId: string) => {
    playSoundEffect('beep');
    setSelectedTableId(tblId);
    setDiscountType('none');
    setDiscountValue(0);
    setDiscountReason('Müşteri Memnuniyeti');
    setManagerApproval(null);
    setActivePaymentTab('full');
    setPaidSharesCount(0);
    setSelectedItemIndices([]);
  };

  // Update items helper
  const updateTableData = (updatedTable: AdminTable) => {
    const updated = tables.map((t) => (t.id === updatedTable.id ? updatedTable : t));
    setTables(updated);
    saveStoredTables(updated);
  };

  // 1-Tap Add item
  const handleAddItemToTable = (prod: MenuItem) => {
    if (!selectedTable) return;
    playSoundEffect('beep');
    const existingIndex = selectedTable.items.findIndex((i: any) => i.name === prod.name && !i.isComped);
    let newItems = [...selectedTable.items];

    if (existingIndex > -1) {
      newItems[existingIndex] = {
        ...newItems[existingIndex],
        quantity: newItems[existingIndex].quantity + 1,
      };
    } else {
      newItems.push({
        name: prod.name,
        price: prod.price,
        quantity: 1,
      });
    }

    const newTotal = newItems.reduce((acc, curr: any) => acc + (curr.isComped ? 0 : curr.price) * curr.quantity, 0);
    const newStatus = selectedTable.status === 'empty' ? 'preparing' : selectedTable.status;

    const updated: AdminTable = {
      ...selectedTable,
      items: newItems,
      totalAmount: newTotal,
      status: newStatus,
      lastActivity: `${prod.name} kasadan eklendi`,
    };

    updateTableData(updated);

    // Merkezi Sipariş Motoruna Gönder (PostgreSQL Transaction & Stok Düşümü)
    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tableId: selectedTable.id,
        source: 'POS',
        items: [{ productId: prod.id, name: prod.name, quantity: 1 }],
      }),
    }).catch((err) => {
      console.warn('[POS Order] Offline fallback devrede:', err);
    });

    syncService.broadcast(
      'ORDER_ITEMS_ADDED',
      { tableId: selectedTable.id, items: newItems, total: newTotal },
      'cashier_pos'
    );

    showToast('Ürün Eklendi', `${prod.name} (${formatCurrency(prod.price)}) adisyona yazıldı.`, 'info');
  };

  // Item quantity change
  const handleUpdateItemQuantity = (index: number, delta: number) => {
    if (!selectedTable) return;
    playSoundEffect('beep');
    let newItems = [...selectedTable.items];
    const item = newItems[index];
    const newQty = item.quantity + delta;

    if (newQty <= 0) {
      newItems.splice(index, 1);
    } else {
      newItems[index] = { ...item, quantity: newQty };
    }

    const newTotal = newItems.reduce((acc, curr: any) => acc + (curr.isComped ? 0 : curr.price) * curr.quantity, 0);
    const updated: AdminTable = {
      ...selectedTable,
      items: newItems,
      totalAmount: newTotal,
    };

    updateTableData(updated);
  };

  // Toggle Comp / İkram
  const executeCompItem = (index: number) => {
    if (!selectedTable) return;
    playSoundEffect('beep');
    let newItems = [...selectedTable.items];
    const item = newItems[index] as any;
    const isNowComped = !item.isComped;

    newItems[index] = {
      ...item,
      isComped: isNowComped,
      originalPrice: item.originalPrice || item.price,
    };

    const newTotal = newItems.reduce((acc, curr: any) => acc + (curr.isComped ? 0 : curr.price) * curr.quantity, 0);
    const updated: AdminTable = {
      ...selectedTable,
      items: newItems,
      totalAmount: newTotal,
    };

    updateTableData(updated);
    showToast(
      isNowComped ? 'İkram Uygulandı' : 'İkram Kaldırıldı',
      `${item.name} ${isNowComped ? '₺0 (İkram)' : formatCurrency(item.price)} olarak güncellendi.`,
      'info'
    );
  };

  const handleToggleCompItem = (index: number) => {
    if (!selectedTable) return;
    const item = selectedTable.items[index] as any;
    const willBeComped = !item.isComped;

    if (willBeComped) {
      if (managerApproval) {
        executeCompItem(index);
      } else {
        setManagerModal({
          isOpen: true,
          actionTitle: `${item.name} (₺0 İkram Yapma)`,
          reason: 'Müdür İkramı',
          enteredPin: '',
          onSuccess: (pin, manager) => {
            setManagerApproval({ managerPin: pin, managerName: manager.name, managerTitle: manager.title });
            executeCompItem(index);
          },
        });
      }
    } else {
      executeCompItem(index);
    }
  };

  // İndirim Uygulama (Yetkisiz İndirim İstismarı Korumalı)
  const handleApplyPercentDiscount = (pct: number) => {
    if (pct <= 10) {
      setDiscountType('percent');
      setDiscountValue(pct);
      playSoundEffect('beep');
    } else {
      if (managerApproval) {
        setDiscountType('percent');
        setDiscountValue(pct);
        playSoundEffect('beep');
      } else {
        setManagerModal({
          isOpen: true,
          actionTitle: `Adisyona %${pct} İndirim Uygulama`,
          reason: 'Müşteri Memnuniyeti',
          enteredPin: '',
          onSuccess: (pin, manager) => {
            setManagerApproval({ managerPin: pin, managerName: manager.name, managerTitle: manager.title });
            setDiscountType('percent');
            setDiscountValue(pct);
            playSoundEffect('cash');
          },
        });
      }
    }
  };

  const handleApplyAmountDiscount = (tl: number) => {
    const isExceedingTenPercent = tl > (subtotal * 0.1);
    if (!isExceedingTenPercent) {
      setDiscountType('amount');
      setDiscountValue(tl);
      playSoundEffect('beep');
    } else {
      if (managerApproval) {
        setDiscountType('amount');
        setDiscountValue(tl);
        playSoundEffect('beep');
      } else {
        setManagerModal({
          isOpen: true,
          actionTitle: `Adisyona -₺${tl} Tutar İndirimi`,
          reason: 'Müşteri Memnuniyeti',
          enteredPin: '',
          onSuccess: (pin, manager) => {
            setManagerApproval({ managerPin: pin, managerName: manager.name, managerTitle: manager.title });
            setDiscountType('amount');
            setDiscountValue(tl);
            playSoundEffect('cash');
          },
        });
      }
    }
  };

  // Remove item entirely
  const handleRemoveItem = (index: number) => {
    if (!selectedTable) return;
    playSoundEffect('beep');
    const itemName = selectedTable.items[index]?.name;
    let newItems = [...selectedTable.items];
    newItems.splice(index, 1);

    const newTotal = newItems.reduce((acc, curr: any) => acc + (curr.isComped ? 0 : curr.price) * curr.quantity, 0);
    const updated: AdminTable = {
      ...selectedTable,
      items: newItems,
      totalAmount: newTotal,
    };

    updateTableData(updated);
    showToast('Kalem İptal Edildi', `${itemName} adisyondan çıkarıldı.`, 'warning');
  };

  // Hardware Print Dispatcher
  const handlePrintIntermediateBill = async () => {
    if (!selectedTable) return;
    playSoundEffect('beep');

    const receipt: ReceiptData = {
      orderId: `ARA-${Date.now().toString().slice(-5)}`,
      tableNumber: selectedTable.name,
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      waiterName: selectedTable.waiterName || shiftSession?.cashierName || 'Kasa',
      items: selectedTable.items.map((i: any) => ({
        name: i.isComped ? `${i.name} (İKRAM)` : i.name,
        quantity: i.quantity,
        price: i.isComped ? 0 : i.price,
      })),
      subtotal,
      vat: vatAmount,
      total: netPayable,
      type: 'bill',
      paymentMethod: 'ARA HESAP (ÖDENMEDİ)',
    };

    const result = await sendJobToLocalBridge(receipt);
    if (result.success) {
      showToast('Ara Hesap Fişi Basıldı', `${selectedTable.name} için 80mm fiş mutfak/kasa yazıcısına iletildi.`, 'success');
    } else {
      showToast('Yazıcı Uyarısı', 'Yazıcıya bağlanılamadı, fiş arıza kuyruğuna alındı.', 'warning');
    }
  };

  // Complete Payment Action (Card, Cash, Split)
  const handleCompletePayment = async (method: 'Kredi Kartı' | 'Nakit' | 'Parçalı Tahsilat', paidAmount: number) => {
    if (!selectedTable) return;

    // 1. Sunucu Taraflı Güvenlik ve İndirim/İkram Doğrulaması (/api/tables/payment)
    const compedItems = selectedTable.items
      .filter((i: any) => i.isComped)
      .map((i: any) => ({
        name: i.name,
        price: i.originalPrice || i.price,
        quantity: i.quantity,
      }));

    try {
      const payRes = await fetch('/api/tables/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId: selectedTable.id,
          totalAmount: subtotal,
          paymentAmount: paidAmount,
          paymentMethod: method,
          discountType,
          discountValue,
          discountReason,
          compedItems,
          managerPin: managerApproval?.managerPin,
          cashierName: shiftSession?.cashierName || 'Zeynep Kaya',
        }),
      });

      const payData = await payRes.json();
      if (!payRes.ok || !payData.success) {
        showToast(
          'Tahsilat Reddedildi (Yetki Hatası)',
          payData.error || 'İndirim/ikram yetkisi veya ödeme tutarı onaylanamadı.',
          'warning'
        );
        return;
      }
    } catch (err) {
      console.warn('Payment API network fallback:', err);
    }

    playSoundEffect('cash');

    const receipt: ReceiptData = {
      orderId: `POS-${Date.now().toString().slice(-5)}`,
      tableNumber: selectedTable.name,
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      waiterName: shiftSession?.cashierName || 'Zeynep Kaya',
      items: selectedTable.items.map((i: any) => ({
        name: i.isComped ? `${i.name} [İKRAM]` : i.name,
        quantity: i.quantity,
        price: i.isComped ? 0 : i.price,
      })),
      subtotal,
      vat: vatAmount,
      total: paidAmount,
      type: 'bill',
      paymentMethod: `${method}${discountAmount > 0 ? ` (%${discountValue} İndirimli${managerApproval ? ` - ${managerApproval.managerName}` : ''})` : ''}`,
    };

    // 1. Send to hardware print bridge
    sendJobToLocalBridge(receipt).catch(() => {});

    // 2. Broadcast via SyncService
    syncService.broadcast(
      'TABLE_CHECKOUT_COMPLETED',
      {
        tableId: selectedTable.id,
        tableName: selectedTable.name,
        amount: paidAmount,
        method,
        cashier: shiftSession?.cashierName,
      },
      'cashier_pos'
    );

    syncService.broadcast(
      'TABLE_STATUS_CHANGED',
      {
        tableId: selectedTable.id,
        status: 'cleaning',
      },
      'cashier_pos'
    );

    // 3. Mark table as cleaning and ₺0
    const updated: AdminTable = {
      ...selectedTable,
      status: 'cleaning',
      totalAmount: 0,
      items: [],
      durationMinutes: 0,
      lastActivity: `Tahsilat Tamamlandı (${method}) • Temizlik Bekliyor`,
    };

    updateTableData(updated);
    setIsCashModalOpen(false);
    setCashTenderAmount(0);

    showToast(
      'Tahsilat Başarılı!',
      `${selectedTable.name} adisyonu ${formatCurrency(paidAmount)} (${method}) ile kapatıldı. Masa temizliğe alındı.`,
      'success'
    );
  };

  // Split equal pay single share
  const handlePayEqualShare = (method: 'Kredi Kartı' | 'Nakit') => {
    const shareAmount = netPayable / splitCount;
    const nextPaid = paidSharesCount + 1;
    setPaidSharesCount(nextPaid);
    playSoundEffect('cash');

    showToast(
      `Pay Tahsil Edildi (${nextPaid}/${splitCount})`,
      `${formatCurrency(shareAmount)} (${method}) alındı.`,
      'info'
    );

    if (nextPaid >= splitCount) {
      handleCompletePayment('Parçalı Tahsilat', netPayable);
    }
  };

  // Split items pay selection
  const handlePaySelectedItems = (method: 'Kredi Kartı' | 'Nakit') => {
    if (!selectedTable || selectedItemIndices.length === 0) return;
    playSoundEffect('cash');

    const selectedItemsSum = selectedItemIndices.reduce((sum, idx) => {
      const item = selectedTable.items[idx];
      return sum + (item.price * item.quantity);
    }, 0);

    // Keep remaining items on table
    const remainingItems = selectedTable.items.filter((_, idx) => !selectedItemIndices.includes(idx));
    const newTotal = remainingItems.reduce((acc, curr) => acc + curr.price * curr.quantity, 0);

    const updated: AdminTable = {
      ...selectedTable,
      items: remainingItems,
      totalAmount: newTotal,
      status: remainingItems.length === 0 ? 'cleaning' : selectedTable.status,
      lastActivity: `${selectedItemIndices.length} kalem parçalı ödendi (${method})`,
    };

    updateTableData(updated);
    setSelectedItemIndices([]);

    showToast(
      'Seçili Kalemler Tahsil Edildi',
      `${formatCurrency(selectedItemsSum)} tahsil edildi. Kalan kalemler masada tutuluyor.`,
      'success'
    );
  };

  // Split bill: Pay single guest share (Ali'nin siparişleri, Ayşe'nin siparişleri vb.)
  const handlePayGuestGroup = async (guestTag: string, method: 'Kredi Kartı' | 'Nakit', guestTotal: number) => {
    if (!selectedTable || guestTotal <= 0) return;
    playSoundEffect('cash');

    // 1. Sunucu taraflı atomik ödeme & kilit kaydı
    try {
      const payRes = await fetch('/api/tables/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId: selectedTable.id,
          totalAmount: subtotal,
          paymentAmount: guestTotal,
          paymentMethod: `${method} (${guestTag})`,
          cashierName: shiftSession?.cashierName || 'Zeynep Kaya',
        }),
      });
      const payData = await payRes.json();
      if (!payRes.ok || !payData.success) {
        showToast(
          'Tahsilat Reddedildi',
          payData.error || 'Ödeme tutarı veya masa kilidi onaylanamadı.',
          'warning'
        );
        return;
      }
    } catch (err) {
      console.warn('Payment API network fallback:', err);
    }

    // 2. Kalan masadaki ürünleri filtrele (ödenen misafiri düşür)
    const remainingItems = selectedTable.items.filter((item: any) => (item.guestTag || 'Misafir 1') !== guestTag);
    const newTotal = remainingItems.reduce((acc, curr: any) => acc + (curr.isComped ? 0 : curr.price) * curr.quantity, 0);
    const isAllSettled = remainingItems.length === 0 || newTotal <= 0.01;

    // 3. Misafire özel 80mm ara tahsilat fişi bas
    const receipt: ReceiptData = {
      orderId: `MISAFIR-${Date.now().toString().slice(-5)}`,
      tableNumber: selectedTable.name,
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      waiterName: shiftSession?.cashierName || 'Zeynep Kaya',
      items: selectedTable.items
        .filter((item: any) => (item.guestTag || 'Misafir 1') === guestTag)
        .map((i: any) => ({
          name: i.isComped ? `${i.name} [İKRAM]` : i.name,
          quantity: i.quantity,
          price: i.isComped ? 0 : i.price,
        })),
      subtotal: guestTotal,
      vat: Math.round((guestTotal * 10) / 110),
      total: guestTotal,
      type: 'bill',
      paymentMethod: `${method} • ${guestTag} Tahsilatı`,
    };
    sendJobToLocalBridge(receipt).catch(() => {});

    if (isAllSettled) {
      // Masanın tüm misafirleri ödedi - Masa temizliğe alınır
      const updated: AdminTable = {
        ...selectedTable,
        items: [],
        totalAmount: 0,
        status: 'cleaning',
        lastActivity: `Masa hesabı son misafir (${guestTag}) ile tamamen kapatıldı.`,
      };
      updateTableData(updated);

      syncService.broadcast('TABLE_CHECKOUT_COMPLETED', {
        tableId: selectedTable.id,
        tableName: selectedTable.name,
        amount: guestTotal,
        method: `${method} (${guestTag})`,
        cashier: shiftSession?.cashierName,
      }, 'cashier_pos');

      syncService.broadcast('TABLE_STATUS_CHANGED', {
        tableId: selectedTable.id,
        status: 'cleaning',
      }, 'cashier_pos');

      showToast(
        'Tüm Masa Hesabı Kapandı!',
        `${guestTag} tahsilatı ile masanın tüm hesabı ödendi. Masa temizliğe alındı.`,
        'success'
      );
    } else {
      // Parçalı misafir tahsilatı tamamlandı, kalan misafirlerin hesabı masada bekler
      const updated: AdminTable = {
        ...selectedTable,
        items: remainingItems,
        totalAmount: newTotal,
        lastActivity: `${guestTag} hesabı tahsil edildi (${formatCurrency(guestTotal)} • ${method}). Kalan: ${formatCurrency(newTotal)}`,
      };
      updateTableData(updated);

      syncService.broadcast('TABLE_STATUS_CHANGED', {
        tableId: selectedTable.id,
        status: selectedTable.status,
      }, 'cashier_pos');

      showToast(
        'Kişi Bazlı Tahsilat Alındı',
        `${guestTag} için ${formatCurrency(guestTotal)} (${method}) alındı. Kalan masa tutarı: ${formatCurrency(newTotal)}`,
        'success'
      );
    }
  };

  return (
    <div className="h-[100dvh] w-full max-w-full flex flex-col bg-slate-950 text-slate-100 select-none overflow-hidden font-sans">
      
      {/* =========================================================================
          TOPBAR: Kasa Kiosk Kumanda Çubuğu
          ========================================================================= */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 z-30">
        
        {/* Sol: Logo & Durum Özeti */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center font-black text-slate-950 text-base shadow-md shadow-amber-500/20">
            M
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-white">MasaLink POS</span>
              <span className="text-[10px] bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold px-1.5 py-0.2 rounded">
                KIOSK KASA
              </span>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <span>{openTablesCount} Açık Masa</span>
              <span>•</span>
              <span className="text-amber-400 font-semibold">{formatCurrency(totalOpenAmount)} Açık Bakiye</span>
            </p>
          </div>
        </div>

        {/* Orta: Donanım & Ağ Durumu */}
        <div className="hidden lg:flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 text-slate-300">
            <span className={`w-2 h-2 rounded-full ${printerOnline ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
            <Printer className="w-3.5 h-3.5 text-slate-400" />
            <span>Kasa & Mutfak Yazıcısı (9100)</span>
            <button
              onClick={async () => {
                playSoundEffect('beep');
                const res = await testKitchenBuzzerAndSiren();
                if (res.success) {
                  showToast('Mutfak Sireni & Buzzer Çalındı', 'ESC B dahili piezo buzzer ve RJ11 harici mutfak sireni darbesi fırlatıldı.', 'success');
                } else {
                  showToast('Yazıcı Uyarısı', 'Siren testi print bridge üzerinden iletilemedi.', 'warning');
                }
              }}
              title="Mutfak Buzzer & Harici Sireni Test Et (ESC B + RJ11 DK)"
              className="ml-1 p-1 hover:bg-slate-700 rounded text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1"
            >
              <BellRing className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] text-amber-300 font-bold hidden xl:inline">Siren Test</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 text-slate-300">
            <Banknote className="w-3.5 h-3.5 text-amber-400" />
            <span>Açılış: <strong className="text-white">₺{shiftSession?.floatCash.toLocaleString('tr-TR')}</strong></span>
            <span className="text-slate-500">({shiftSession?.shiftStartTime})</span>
          </div>
        </div>

        {/* Sağ: Kasiyer Profili & Kiosk Butonları */}
        <div className="flex items-center gap-2">
          {/* Mutfak KDS Ekranına Hızlı Geçiş */}
          <a
            href="/kds"
            target="_blank"
            rel="noreferrer"
            title="Mutfak KDS Ekranını Aç"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 text-orange-400 text-xs font-bold transition-all shadow-sm"
          >
            <ChefHat className="w-4 h-4" />
            <span className="hidden md:inline">Mutfak KDS</span>
          </a>

          <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 px-3 py-1 rounded-xl">
            <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center font-bold text-[11px]">
              {shiftSession?.cashierName.split(' ').map((n) => n[0]).join('') || 'ZK'}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-semibold leading-tight text-white">{shiftSession?.cashierName || 'Zeynep Kaya'}</p>
              <p className="text-[10px] text-amber-400/90 font-medium leading-none">{shiftSession?.role || 'Baş Kasiyer'}</p>
            </div>
          </div>

          <button
            onClick={toggleFullscreen}
            title="Tam Ekran / Kiosk Modu"
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={handleLockShift}
            title="Kasayı Kilitle / Vardiya Değiş"
            className="w-9 h-9 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 hover:text-red-300 transition-colors"
          >
            <Lock className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* =========================================================================
          ANA GÖVDE: 3 SÜTUNLU DOKUNMATİK MİZANPAJ
          ========================================================================= */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* =======================================================================
            SOL SÜTUN: CANLI AÇIK MASALAR & RADAR (%25 Genişlik)
            ======================================================================= */}
        <aside className="w-1/4 min-w-[280px] max-w-[340px] bg-slate-900/60 border-r border-slate-800 flex flex-col shrink-0">
          
          {/* Bölüm & Arama Filtresi */}
          <div className="p-3 border-b border-slate-800 bg-slate-900/40">
            <div className="relative mb-2">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={tableSearchQuery}
                onChange={(e) => setTableSearchQuery(e.target.value)}
                placeholder="Masa ara (örn: 4, Salon)..."
                className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              {tableSearchQuery && (
                <button
                  onClick={() => setTableSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Bölüm Hapları */}
            <div className="flex gap-1 overflow-x-auto no-scrollbar">
              {[
                { id: 'all', label: 'Tümü' },
                { id: 'salon', label: 'Salon' },
                { id: 'bahce', label: 'Bahçe' },
                { id: 'teras', label: 'Teras' },
                { id: 'bar', label: 'Bar' },
              ].map((sec) => {
                const isActive = sectionFilter === sec.id;
                return (
                  <button
                    key={sec.id}
                    onClick={() => setSectionFilter(sec.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      isActive
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                        : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {sec.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Masa Listesi (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {filteredTables.map((tbl) => {
              const isSelected = selectedTable?.id === tbl.id;
              const isBillRequested = tbl.status === 'bill_requested';
              const isPreparing = tbl.status === 'preparing';
              const isServed = tbl.status === 'served';
              const isCleaning = tbl.status === 'cleaning';
              const isEmpty = tbl.status === 'empty';

              return (
                <button
                  key={tbl.id}
                  onClick={() => handleSelectTable(tbl.id)}
                  className={`w-full text-left p-3 rounded-2xl border transition-all flex items-center justify-between min-h-[58px] ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-500 ring-2 ring-amber-500/20 text-white'
                      : isBillRequested
                      ? 'bg-purple-950/30 border-purple-500/60 animate-pulse text-purple-200'
                      : 'bg-slate-800/50 hover:bg-slate-800 border-slate-700/60 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {/* Durum Gösterge Çemberi */}
                    <div
                      className={`w-3 h-3 rounded-full shrink-0 ${
                        isEmpty
                          ? 'bg-emerald-500'
                          : isBillRequested
                          ? 'bg-purple-400 shadow-md shadow-purple-500'
                          : isPreparing
                          ? 'bg-amber-500'
                          : isServed
                          ? 'bg-blue-400'
                          : isCleaning
                          ? 'bg-slate-500 border border-amber-400'
                          : 'bg-amber-400'
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-white">{tbl.name}</span>
                        <span className="text-[10px] text-slate-400 uppercase font-medium">({tbl.section})</span>
                      </div>
                      <p className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{tbl.durationMinutes > 0 ? `${tbl.durationMinutes} dk` : 'Boş'}</span>
                        {tbl.waiterName && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[80px]">{tbl.waiterName.split(' ')[0]}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Tutar Rozeti */}
                  <div className="text-right">
                    <span className={`text-sm font-black ${tbl.totalAmount > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                      {formatCurrency(tbl.totalAmount)}
                    </span>
                    {isBillRequested && (
                      <span className="block text-[9px] font-bold text-purple-300 tracking-wider uppercase">
                        HESAP İSTENDİ
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* =======================================================================
            ORTA SÜTUN: ADİSYON DÖKÜMÜ & KALEM YÖNETİMİ (%45 Genişlik)
            ======================================================================= */}
        <section className="flex-1 min-w-[360px] bg-slate-950 flex flex-col border-r border-slate-800">
          
          {/* Masa Başlığı & Hızlı Ekleme Çubuğu */}
          <div className="p-3 bg-slate-900/50 border-b border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-white">{selectedTable?.name || 'Masa Seçin'}</span>
                <span className="text-xs bg-slate-800 border border-slate-700 text-slate-300 px-2 py-0.5 rounded-lg capitalize">
                  {selectedTable?.section}
                </span>
                {selectedTable?.waiterName && (
                  <span className="text-xs text-amber-400/90 font-medium">
                    Garson: {selectedTable.waiterName}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsFullMenuOpen(true)}
                  className="px-2.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tüm Menüden Ekle</span>
                </button>
              </div>
            </div>

            {/* Sık Satılan Hızlı Ürün Butonları */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0 mr-1">
                Hızlı:
              </span>
              {QUICK_FAVORITE_ITEMS.map((fav) => (
                <button
                  key={fav.id}
                  onClick={() => handleAddItemToTable(fav)}
                  className="px-2.5 py-1 bg-slate-800/90 hover:bg-slate-700/90 active:scale-95 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 flex items-center gap-1.5 shrink-0 transition-all shadow-sm"
                >
                  <span>{fav.name}</span>
                  <span className="text-amber-400 font-bold">₺{fav.price}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Adisyon Kalemleri Tablosu / Listesi */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {(!selectedTable?.items || selectedTable.items.length === 0) ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <Utensils className="w-12 h-12 mb-3 stroke-1 text-slate-600" />
                <p className="text-sm font-semibold">Bu masada henüz sipariş kalemi yok.</p>
                <p className="text-xs text-slate-600 mt-1">Yukarıdaki hızlı butonlardan veya menüden ürün ekleyin.</p>
              </div>
            ) : (
              selectedTable.items.map((item: any, idx: number) => {
                const isComped = !!item.isComped;
                const isSelectedForSplit = selectedItemIndices.includes(idx);
                const lineTotal = (isComped ? 0 : item.price) * item.quantity;

                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between min-h-[64px] ${
                      isComped
                        ? 'bg-purple-950/20 border-purple-500/40 text-purple-200'
                        : isSelectedForSplit
                        ? 'bg-amber-500/10 border-amber-500 text-white'
                        : 'bg-slate-900/70 border-slate-800 text-slate-200'
                    }`}
                  >
                    {/* Sol: Seçici (Split moduysa) + Ürün Bilgisi */}
                    <div className="flex items-center gap-3">
                      {activePaymentTab === 'split_items' && (
                        <input
                          type="checkbox"
                          checked={isSelectedForSplit}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedItemIndices([...selectedItemIndices, idx]);
                            } else {
                              setSelectedItemIndices(selectedItemIndices.filter((i) => i !== idx));
                            }
                          }}
                          className="w-5 h-5 rounded accent-amber-500 cursor-pointer"
                        />
                      )}

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-white">{item.name}</span>
                          {item.guestTag && (
                            <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/35 font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 shadow-sm">
                              👤 {item.guestTag}
                            </span>
                          )}
                          {isComped && (
                            <span className="text-[10px] bg-purple-500/30 text-purple-300 border border-purple-500/50 font-bold px-1.5 py-0.2 rounded-md flex items-center gap-1">
                              <Gift className="w-3 h-3" /> İKRAM / COMP
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">
                          {isComped ? (
                            <span className="line-through text-slate-500 mr-1.5">{formatCurrency(item.originalPrice || item.price)}</span>
                          ) : null}
                          <span className={isComped ? 'text-purple-400 font-bold' : 'text-slate-300'}>
                            {formatCurrency(isComped ? 0 : item.price)}
                          </span>
                          {item.notes && <span className="text-amber-400/90 font-medium ml-2">({item.notes})</span>}
                        </p>
                      </div>
                    </div>

                    {/* Sağ: Adet Kontrolleri & Aksiyonlar */}
                    <div className="flex items-center gap-3">
                      {/* Adet +/- */}
                      <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1">
                        <button
                          onClick={() => handleUpdateItemQuantity(idx, -1)}
                          className="w-7 h-7 rounded-lg bg-slate-700/80 hover:bg-slate-600 active:scale-95 text-slate-200 flex items-center justify-center font-bold"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-7 text-center font-black text-sm text-white">{item.quantity}</span>
                        <button
                          onClick={() => handleUpdateItemQuantity(idx, 1)}
                          className="w-7 h-7 rounded-lg bg-slate-700/80 hover:bg-slate-600 active:scale-95 text-slate-200 flex items-center justify-center font-bold"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Kalem Toplam Fiyatı */}
                      <span className={`w-20 text-right font-black text-sm ${isComped ? 'text-purple-300' : 'text-white'}`}>
                        {formatCurrency(lineTotal)}
                      </span>

                      {/* İkram / Comp Butonu */}
                      <button
                        onClick={() => handleToggleCompItem(idx)}
                        title={isComped ? 'İkramı Kaldır' : 'Kalemi İkram (₺0) Yap'}
                        className={`p-2 rounded-xl border transition-colors ${
                          isComped
                            ? 'bg-purple-500 text-white border-purple-400'
                            : 'bg-slate-800/80 text-slate-400 hover:text-purple-300 hover:bg-slate-700 border-slate-700'
                        }`}
                      >
                        <Gift className="w-4 h-4" />
                      </button>

                      {/* Sil / İptal Butonu */}
                      <button
                        onClick={() => handleRemoveItem(idx)}
                        title="Kalemi Sil"
                        className="p-2 rounded-xl bg-slate-800/80 text-slate-400 hover:text-red-400 hover:bg-slate-700 border border-slate-700 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* =======================================================================
            SAĞ SÜTUN: TAHSİLAT, İNDİRİM & AKILLI HESAP BÖLME (%30 Genişlik)
            ======================================================================= */}
        <aside className="w-[380px] bg-slate-900/80 border-l border-slate-800 flex flex-col shrink-0">
          
          {/* Hesap Bölme Sekmeleri */}
          <div className="grid grid-cols-4 p-1.5 bg-slate-950/60 border-b border-slate-800 gap-1">
            <button
              onClick={() => setActivePaymentTab('full')}
              className={`py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-colors ${
                activePaymentTab === 'full'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Receipt className="w-3 h-3" />
              <span>Tam</span>
            </button>

            <button
              onClick={() => setActivePaymentTab('split_equal')}
              className={`py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-colors ${
                activePaymentTab === 'split_equal'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Divide className="w-3 h-3" />
              <span>Eşit</span>
            </button>

            <button
              onClick={() => setActivePaymentTab('split_items')}
              className={`py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-colors ${
                activePaymentTab === 'split_items'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ListChecks className="w-3 h-3" />
              <span>Kalem</span>
            </button>

            <button
              onClick={() => setActivePaymentTab('split_guests')}
              className={`py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-colors ${
                activePaymentTab === 'split_guests'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3 h-3 text-amber-300" />
              <span>Kişi Bazlı</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-between">
            <div>
              {/* FINANSAL ÖZET KARTI */}
              <div className="bg-slate-950 border border-slate-800 rounded-3xl p-4 shadow-xl mb-4">
                <div className="flex justify-between items-center text-xs text-slate-400 mb-1.5">
                  <span>Ara Toplam</span>
                  <span className="font-semibold text-slate-200">{formatCurrency(subtotal)}</span>
                </div>

                <div className="flex justify-between items-center text-xs text-slate-400 mb-1.5">
                  <span>KDV (%10 Dahil)</span>
                  <span className="font-semibold text-slate-400">{formatCurrency(vatAmount)}</span>
                </div>

                {discountAmount > 0 && (
                  <div className="flex justify-between items-center text-xs text-emerald-400 font-bold mb-1.5">
                    <span className="flex items-center gap-1">
                      <Percent className="w-3.5 h-3.5" /> İndirim ({discountReason})
                    </span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                )}

                {managerApproval && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-[11px] text-emerald-300 font-bold mb-1.5 animate-fadeIn">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate">Yönetici Onaylı: {managerApproval.managerName} ({managerApproval.managerTitle})</span>
                  </div>
                )}

                <div className="pt-3 mt-2 border-t border-slate-800 flex justify-between items-baseline">
                  <span className="text-xs uppercase font-bold text-slate-400">Ödenecek Net Tutar</span>
                  <span className="text-2xl font-black text-amber-400 tracking-tight">
                    {formatCurrency(netPayable)}
                  </span>
                </div>
              </div>

              {/* SEKME 1: NORMAL TAHSİLAT & İNDİRİM MODÜLÜ */}
              {activePaymentTab === 'full' && (
                <div className="space-y-4">
                  {/* İndirim Düğmeleri */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Percent className="w-3.5 h-3.5 text-amber-400" /> İndirim Uygula
                      </label>
                      {discountAmount > 0 && (
                        <button
                          onClick={() => {
                            setDiscountType('none');
                            setDiscountValue(0);
                            setManagerApproval(null);
                          }}
                          className="text-[10px] text-red-400 hover:text-red-300 font-bold"
                        >
                          İndirimi Kaldır
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-4 gap-1.5">
                      {[5, 10, 15, 20].map((pct) => (
                        <button
                          key={pct}
                          onClick={() => handleApplyPercentDiscount(pct)}
                          className={`py-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                            discountType === 'percent' && discountValue === pct
                              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                              : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-750'
                          }`}
                        >
                          <span>%{pct}</span>
                          {pct > 10 && <Lock className="w-2.5 h-2.5 opacity-60" />}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                      {[20, 50, 100].map((tl) => (
                        <button
                          key={tl}
                          onClick={() => handleApplyAmountDiscount(tl)}
                          className={`py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                            discountType === 'amount' && discountValue === tl
                              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                              : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:bg-slate-800'
                          }`}
                        >
                          <span>-₺{tl}</span>
                          {tl > subtotal * 0.1 && <Lock className="w-2.5 h-2.5 opacity-60" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* SEKME 2: EŞİT HESAP BÖLME MODÜLÜ */}
              {activePaymentTab === 'split_equal' && (
                <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-300">Kişi Sayısı</span>
                    <span className="font-bold text-amber-400">{splitCount} Kişi</span>
                  </div>

                  <div className="grid grid-cols-5 gap-1.5">
                    {[2, 3, 4, 5, 6].map((cnt) => (
                      <button
                        key={cnt}
                        onClick={() => {
                          setSplitCount(cnt);
                          setPaidSharesCount(0);
                        }}
                        className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                          splitCount === cnt
                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}
                      >
                        {cnt}
                      </button>
                    ))}
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-center">
                    <span className="text-[11px] text-slate-400 block mb-0.5">Kişi Başı Tutar:</span>
                    <span className="text-xl font-black text-white">
                      {formatCurrency(netPayable / splitCount)}
                    </span>
                    <div className="mt-2 text-[11px] text-amber-400 font-semibold">
                      Ödenen: {paidSharesCount} / {splitCount} Kişi
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => handlePayEqualShare('Nakit')}
                      disabled={paidSharesCount >= splitCount}
                      className="py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md"
                    >
                      <Banknote className="w-3.5 h-3.5" /> 1 Kişi Al (Nakit)
                    </button>
                    <button
                      onClick={() => handlePayEqualShare('Kredi Kartı')}
                      disabled={paidSharesCount >= splitCount}
                      className="py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md"
                    >
                      <CreditCard className="w-3.5 h-3.5" /> 1 Kişi Al (Kart)
                    </button>
                  </div>
                </div>
              )}

              {/* SEKME 3: KALEM BAZLI BÖLME MODÜLÜ */}
              {activePaymentTab === 'split_items' && (
                <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3 space-y-3">
                  <p className="text-xs text-slate-400">
                    Sol panelden müşterinin ödemek istediği ürünleri kutucukları işaretleyerek seçin.
                  </p>
                  
                  <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Seçilen Kalem Sayısı:</span>
                      <strong className="text-white">{selectedItemIndices.length}</strong>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs uppercase font-bold text-slate-400">Seçili Tutar:</span>
                      <span className="text-lg font-black text-amber-400">
                        {formatCurrency(
                          selectedItemIndices.reduce((sum, idx) => {
                            const itm = selectedTable?.items[idx];
                            return sum + (itm ? itm.price * itm.quantity : 0);
                          }, 0)
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => handlePaySelectedItems('Nakit')}
                      disabled={selectedItemIndices.length === 0}
                      className="py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-40 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md"
                    >
                      <Banknote className="w-3.5 h-3.5" /> Seçileni Al (Nakit)
                    </button>
                    <button
                      onClick={() => handlePaySelectedItems('Kredi Kartı')}
                      disabled={selectedItemIndices.length === 0}
                      className="py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-40 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md"
                    >
                      <CreditCard className="w-3.5 h-3.5" /> Seçileni Al (Kart)
                    </button>
                  </div>
                </div>
              )}

              {/* SEKME 4: KİŞİ BAZLI (QR MİSAFİR) BÖLME MODÜLÜ */}
              {activePaymentTab === 'split_guests' && (
                <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-amber-400" />
                      QR Misafir Oturumları ({guestGroups.length} Kişi)
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">Tek tıkla kişi tahsilatı</span>
                  </div>

                  {guestGroups.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-xs">
                      Bu masada henüz sipariş veren misafir oturumu yok.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                      {guestGroups.map((group) => (
                        <div
                          key={group.guestTag}
                          className="p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center text-xs">
                                👤
                              </div>
                              <div>
                                <h4 className="text-xs font-black text-white">{group.guestTag}</h4>
                                <p className="text-[10px] text-slate-400">{group.items.length} Kalem Sipariş</p>
                              </div>
                            </div>
                            <span className="text-sm font-black text-amber-400">
                              {formatCurrency(group.total)}
                            </span>
                          </div>

                          {/* Ürün Listesi */}
                          <div className="bg-slate-950/60 rounded-xl p-2 space-y-1">
                            {group.items.map((it: any, i: number) => (
                              <div key={i} className="flex justify-between items-center text-[11px] text-slate-300">
                                <span className="truncate max-w-[190px]">{it.quantity}x {it.name}</span>
                                <span className="font-semibold text-slate-400">₺{(it.isComped ? 0 : it.price) * it.quantity}</span>
                              </div>
                            ))}
                          </div>

                          {/* Tahsilat Butonları */}
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              onClick={() => handlePayGuestGroup(group.guestTag, 'Nakit', group.total)}
                              className="py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all"
                            >
                              <Banknote className="w-3.5 h-3.5" />
                              <span>{group.guestTag.split(' ')[0]}'den Al (Nakit)</span>
                            </button>
                            <button
                              onClick={() => handlePayGuestGroup(group.guestTag, 'Kredi Kartı', group.total)}
                              className="py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>{group.guestTag.split(' ')[0]}'den Al (Kart)</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ANA TAHSİLAT BUTONLARI */}
            <div className="space-y-2 pt-4">
              {/* Ara Hesap Fişi Bas */}
              <button
                onClick={handlePrintIntermediateBill}
                disabled={!selectedTable || selectedTable.totalAmount === 0}
                className="w-full h-11 bg-slate-800 hover:bg-slate-700 border border-slate-700 active:scale-98 disabled:opacity-40 text-slate-200 text-xs font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-sm"
              >
                <Printer className="w-4 h-4 text-slate-400" />
                <span>Ara Hesap Fişi Bas (Masa Kapanmaz)</span>
              </button>

              {/* Kredi Kartı Tek Tık */}
              <button
                onClick={() => handleCompletePayment('Kredi Kartı', netPayable)}
                disabled={!selectedTable || netPayable === 0}
                className="w-full h-14 bg-blue-600 hover:bg-blue-500 active:scale-98 disabled:opacity-40 text-white text-sm font-black rounded-2xl flex items-center justify-center gap-2.5 shadow-xl shadow-blue-600/20 transition-all"
              >
                <CreditCard className="w-5 h-5" />
                <span>KREDİ KARTI ({formatCurrency(netPayable)})</span>
              </button>

              {/* Nakit Butonu (Banknot Menüsünü Açar) */}
              <button
                onClick={() => {
                  setCashTenderAmount(netPayable);
                  setCustomCashInput(netPayable.toString());
                  setIsCashModalOpen(true);
                }}
                disabled={!selectedTable || netPayable === 0}
                className="w-full h-14 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 active:scale-98 disabled:opacity-40 text-white text-sm font-black rounded-2xl flex items-center justify-center gap-2.5 shadow-xl shadow-emerald-600/20 transition-all"
              >
                <Banknote className="w-5 h-5" />
                <span>NAKİT TAHSİLAT</span>
              </button>
            </div>
          </div>
        </aside>
      </main>

      {/* =========================================================================
          MODAL 1: NAKİT PARA ÜSTÜ & BANKNOT PANELİ
          ========================================================================= */}
      {isCashModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl animate-scaleUp">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Banknote className="w-5 h-5 text-emerald-400" />
                <span>Nakit Tahsilat & Para Üstü</span>
              </h2>
              <button
                onClick={() => setIsCashModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 mb-4 text-center">
              <span className="text-xs text-slate-400 block mb-1">Ödenecek Tutar</span>
              <span className="text-2xl font-black text-white">{formatCurrency(netPayable)}</span>
            </div>

            {/* Banknot Seçenekleri */}
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Alınan Banknot Seçin:
            </label>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { label: 'Tam Tutar', val: netPayable },
                { label: '₺200', val: 200 },
                { label: '₺500', val: 500 },
                { label: '₺1.000', val: 1000 },
              ].map((b, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCashTenderAmount(b.val);
                    setCustomCashInput(b.val.toString());
                  }}
                  className={`py-3 rounded-2xl border text-xs font-black transition-all ${
                    cashTenderAmount === b.val
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-lg'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>

            {/* Manuel Giriş & Para Üstü Hesaplayıcı */}
            <div className="mb-4">
              <label className="text-[11px] font-medium text-slate-400 block mb-1">Müşteriden Alınan Nakit (₺)</label>
              <input
                type="number"
                value={customCashInput}
                onChange={(e) => {
                  setCustomCashInput(e.target.value);
                  setCashTenderAmount(parseFloat(e.target.value) || 0);
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-2xl py-3 px-4 text-xl font-bold text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Para Üstü Kartı */}
            <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl mb-6 text-center">
              <span className="text-xs text-emerald-300 font-semibold uppercase block">Müşteriye Verilecek Para Üstü:</span>
              <span className="text-3xl font-black text-emerald-400">
                {formatCurrency(Math.max(0, cashTenderAmount - netPayable))}
              </span>
            </div>

            <button
              onClick={() => handleCompletePayment('Nakit', netPayable)}
              disabled={cashTenderAmount < netPayable}
              className="w-full h-14 bg-emerald-500 hover:bg-emerald-400 active:scale-98 disabled:opacity-40 text-slate-950 font-black text-base rounded-2xl shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>Nakit Tahsilatı Onayla ve Kasayı Aç</span>
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: TÜM MENÜDEN ÜRÜN SEÇME DRAWER / MODAL
          ========================================================================= */}
      {isFullMenuOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl max-h-[85vh] flex flex-col animate-scaleUp">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Utensils className="w-5 h-5 text-amber-400" />
                <span>Menüden Ürün Seç ({selectedTable?.name})</span>
              </h2>
              <button
                onClick={() => setIsFullMenuOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Kategori Butonları */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 border-b border-slate-800">
              {['Tümü', 'Burgerler', 'Yanlar', 'İçecekler', 'Tatlılar'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setMenuModalCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                    menuModalCategory === cat
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Ürün Listesi */}
            <div className="flex-1 overflow-y-auto py-4 grid grid-cols-2 gap-2.5">
              {QUICK_MENU_ITEMS.filter((p) => menuModalCategory === 'Tümü' || p.category === menuModalCategory).map((prod) => (
                <button
                  key={prod.id}
                  onClick={() => {
                    handleAddItemToTable(prod);
                  }}
                  className="p-3 bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 rounded-2xl text-left flex justify-between items-center group transition-all active:scale-98"
                >
                  <div>
                    <h3 className="font-bold text-xs text-white group-hover:text-amber-400 transition-colors">{prod.name}</h3>
                    <p className="text-[11px] text-slate-400 truncate max-w-[180px]">{prod.description || prod.category}</p>
                  </div>
                  <span className="text-xs font-black text-amber-400 ml-2">₺{prod.price}</span>
                </button>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setIsFullMenuOpen(false)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: YÖNETİCİ PIN ONAYI (Privilege Escalation & Skimming Kalkanı)
          ========================================================================= */}
      {managerModal && managerModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-3xl p-6 shadow-2xl animate-scaleUp">
            {/* Modal Header */}
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 p-0.5 shadow-lg shadow-amber-500/20 flex items-center justify-center">
                  <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center">
                    <ShieldAlert className="w-5 h-5 text-amber-400" />
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Yönetici Onayı Gerekli</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Güvenlik & Yetki Kalkanı</p>
                </div>
              </div>
              <button
                onClick={() => setManagerModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Action Banner */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 mb-3 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Talep Edilen İşlem</span>
              <span className="text-xs font-black text-amber-400 mt-0.5 block">{managerModal.actionTitle}</span>
            </div>

            {/* Reason selector chips */}
            <div className="mb-3">
              <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1.5">
                İndirim / İkram Sebebi:
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {['Müşteri Memnuniyeti', 'Müdür İkramı', 'Hatalı Sipariş', 'VIP İndirimi'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setManagerModal((prev) => prev ? { ...prev, reason: r } : null);
                      setDiscountReason(r);
                    }}
                    className={`py-1.5 px-2 rounded-xl text-[10px] font-bold border transition-all ${
                      managerModal.reason === r
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow'
                        : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* PIN Dots Display */}
            <div className="py-2.5 bg-slate-950 border border-slate-800 rounded-2xl mb-3 flex items-center justify-center gap-3">
              {[0, 1, 2, 3].map((idx) => {
                const filled = (managerModal.enteredPin || '').length > idx;
                return (
                  <div
                    key={idx}
                    className={`w-3.5 h-3.5 rounded-full transition-all ${
                      filled
                        ? 'bg-amber-400 shadow-md shadow-amber-400/50 scale-110'
                        : 'border border-slate-700 bg-slate-900'
                    }`}
                  />
                );
              })}
            </div>

            {/* Error Message */}
            {managerModal.error && (
              <div className="mb-3 p-2 bg-rose-500/15 border border-rose-500/30 rounded-xl text-center text-[11px] font-bold text-rose-300 animate-fadeIn">
                {managerModal.error}
              </div>
            )}

            {/* Touch Numpad */}
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '✓'].map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={async () => {
                    playSoundEffect('beep');
                    if (key === 'C') {
                      setManagerModal((prev) => prev ? { ...prev, enteredPin: '', error: undefined } : null);
                    } else if (key === '✓') {
                      // Submit verification
                      if (!managerModal.enteredPin || managerModal.enteredPin.length < 4) return;
                      setManagerModal((prev) => prev ? { ...prev, isSubmitting: true, error: undefined } : null);
                      try {
                        const res = await fetch('/api/auth/manager-authorize', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            managerPin: managerModal.enteredPin,
                            reason: managerModal.reason,
                            actionType: managerModal.actionTitle,
                          }),
                        });
                        const data = await res.json();
                        if (res.ok && data.success) {
                          playSoundEffect('cash');
                          managerModal.onSuccess(managerModal.enteredPin, data.manager);
                          setManagerModal(null);
                          showToast(
                            'Yönetici Onayı Alındı',
                            `${data.manager.name} (${data.manager.title}) tarafından onaylandı.`,
                            'success'
                          );
                        } else {
                          setManagerModal((prev) => prev ? {
                            ...prev,
                            isSubmitting: false,
                            error: data.error || 'Hatalı Yönetici PIN!',
                            enteredPin: '',
                          } : null);
                        }
                      } catch (_) {
                        setManagerModal((prev) => prev ? {
                          ...prev,
                          isSubmitting: false,
                          error: 'Sunucuya ulaşılamadı.',
                        } : null);
                      }
                    } else {
                      // Digits
                      const current = managerModal.enteredPin || '';
                      if (current.length < 4) {
                        const next = current + key;
                        setManagerModal((prev) => prev ? { ...prev, enteredPin: next, error: undefined } : null);
                        if (next.length === 4) {
                          // Auto submit at 4 digits
                          setTimeout(async () => {
                            try {
                              const res = await fetch('/api/auth/manager-authorize', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  managerPin: next,
                                  reason: managerModal.reason,
                                  actionType: managerModal.actionTitle,
                                }),
                              });
                              const data = await res.json();
                              if (res.ok && data.success) {
                                playSoundEffect('cash');
                                managerModal.onSuccess(next, data.manager);
                                setManagerModal(null);
                                showToast(
                                  'Yönetici Onayı Alındı',
                                  `${data.manager.name} (${data.manager.title}) onayladı.`,
                                  'success'
                                );
                              } else {
                                setManagerModal((prev) => prev ? {
                                  ...prev,
                                  error: data.error || 'Hatalı Yönetici PIN!',
                                  enteredPin: '',
                                } : null);
                              }
                            } catch (_) {}
                          }, 150);
                        }
                      }
                    }
                  }}
                  className={`h-11 rounded-xl font-black text-sm transition-all active:scale-95 ${
                    key === 'C'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : key === '✓'
                      ? 'bg-amber-500 text-slate-950 font-black'
                      : 'bg-slate-800 hover:bg-slate-750 text-white border border-slate-700/60'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>

            {/* Quick Helper for Test */}
            <div className="text-[10px] text-center text-slate-500">
              Yetkili PIN: <span className="text-amber-400/90 font-mono font-bold">8765</span> (Ali Demir - Müd.) • <span className="text-amber-400/90 font-mono font-bold">1122</span> (Emre Şahin - Şef)
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TOAST FEEDBACK BİLDİRİMİ
          ========================================================================= */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-slate-700 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-slideUp">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
            toastMessage.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
          }`}>
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-white">{toastMessage.title}</h4>
            <p className="text-[11px] text-slate-400">{toastMessage.desc}</p>
          </div>
        </div>
      )}

    </div>
  );
}
