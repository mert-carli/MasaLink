'use client';

import React, { useState } from 'react';
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
  Check
} from 'lucide-react';
import { AdminTable } from './TableDetailDrawer';
import { formatCurrency } from '@/utils/helpers';
import { QUICK_MENU_ITEMS, MenuItem as QuickProduct } from '@/utils/menuData';

interface PosCheckoutModuleProps {
  tables: AdminTable[];
  selectedTableId: string;
  onSelectTableId: (id: string) => void;
  onUpdateTableItems: (tableId: string, items: AdminTable['items'], total: number) => void;
  onCloseTable: (tableId: string) => void;
  onPrintReceipt: (table: AdminTable, type: 'kitchen' | 'bill') => void;
}

export const PosCheckoutModule: React.FC<PosCheckoutModuleProps> = ({
  tables,
  selectedTableId,
  onSelectTableId,
  onUpdateTableItems,
  onCloseTable,
  onPrintReceipt,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('Tümü');
  const [paymentModalType, setPaymentModalType] = useState<'none' | 'cash' | 'split'>('none');
  const [cashGiven, setCashGiven] = useState<number>(0);
  const [splitCount, setSplitCount] = useState<number>(2);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Active table
  const activeTable = tables.find((t) => t.id === selectedTableId) || tables[0];
  const busyTables = tables.filter((t) => t.status !== 'empty');

  const categories = ['Tümü', 'Burgerler', 'Yanlar', 'İçecekler', 'Tatlılar'];

  const filteredProducts = activeCategory === 'Tümü'
    ? QUICK_MENU_ITEMS
    : QUICK_MENU_ITEMS.filter((p) => p.category === activeCategory);

  // Manipulate active table items
  const handleAddItem = (prod: QuickProduct) => {
    if (!activeTable) return;
    const existing = activeTable.items.find((i) => i.name === prod.name);
    let newItems;
    if (existing) {
      newItems = activeTable.items.map((i) =>
        i.name === prod.name ? { ...i, quantity: i.quantity + 1 } : i
      );
    } else {
      newItems = [...activeTable.items, { name: prod.name, price: prod.price, quantity: 1 }];
    }
    const newTotal = newItems.reduce((acc, curr) => acc + curr.price * curr.quantity, 0);
    onUpdateTableItems(activeTable.id, newItems, newTotal);
  };

  const handleUpdateQuantity = (index: number, delta: number) => {
    if (!activeTable) return;
    const newItems = [...activeTable.items];
    newItems[index].quantity += delta;
    if (newItems[index].quantity <= 0) {
      newItems.splice(index, 1);
    }
    const newTotal = newItems.reduce((acc, curr) => acc + curr.price * curr.quantity, 0);
    onUpdateTableItems(activeTable.id, newItems, newTotal);
  };

  // Payment Finalization
  const handleCompletePayment = (method: 'Kredi Kartı' | 'Nakit' | 'Parçalı') => {
    if (!activeTable) return;
    const tableId = activeTable.id;
    const amount = activeTable.totalAmount;
    
    // Auto trigger receipt printing
    onPrintReceipt(activeTable, 'bill');
    
    // Close table in state
    onCloseTable(tableId);
    setPaymentModalType('none');
    setCashGiven(0);

    setSuccessNotice(`${activeTable.name} adisyonu ${formatCurrency(amount)} (${method}) ile kapatıldı ve hesap fişi fırlatıldı!`);
    setTimeout(() => {
      setSuccessNotice(null);
    }, 4000);
  };

  return (
    <div className="space-y-4">
      {/* Success Notification Banner */}
      {successNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2.5 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            {successNotice}
          </div>
          <button
            onClick={() => setSuccessNotice(null)}
            className="text-[11px] text-emerald-400 underline hover:text-white"
          >
            Tamam
          </button>
        </div>
      )}

      {/* Busy Tables Selector Carousel / Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider shrink-0 pl-1">
          Aktif Masalar:
        </span>
        {tables.map((tbl) => {
          const isSelected = tbl.id === activeTable?.id;
          const isBusy = tbl.status !== 'empty';

          return (
            <button
              key={tbl.id}
              onClick={() => onSelectTableId(tbl.id)}
              className={`px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-2 border ${
                isSelected
                  ? 'bg-orange-500 text-white border-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.3)]'
                  : isBusy
                  ? 'bg-zinc-900/90 text-zinc-200 border-white/[0.08] hover:border-orange-500/40'
                  : 'bg-zinc-950/40 text-zinc-500 border-white/[0.03] hover:text-zinc-300'
              }`}
            >
              <span>{tbl.name}</span>
              {isBusy && (
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${isSelected ? 'bg-black/30 text-white' : 'bg-orange-500/20 text-orange-400'}`}>
                  {formatCurrency(tbl.totalAmount)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* POS Grid: Menu Items (Left 60%) + Checkout Summary (Right 40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left: Touch Catalog */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          {/* Categories */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                  activeCategory === cat
                    ? 'bg-white text-zinc-950 shadow-md'
                    : 'bg-zinc-900/80 text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Product Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredProducts.map((prod) => (
              <button
                key={prod.id}
                onClick={() => handleAddItem(prod)}
                className="group p-3.5 rounded-2xl bg-zinc-900/80 border border-white/[0.08] hover:border-orange-500/60 hover:bg-zinc-800/90 transition-all text-left flex flex-col justify-between min-h-[110px] active:scale-[0.98] shadow-sm"
              >
                <div>
                  <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider block mb-1">
                    {prod.category}
                  </span>
                  <h4 className="text-xs font-bold text-white group-hover:text-orange-400 line-clamp-2 leading-snug">
                    {prod.name}
                  </h4>
                </div>
                <div className="mt-2 flex items-center justify-between pt-2 border-t border-white/[0.06]">
                  <span className="text-xs font-mono font-black text-amber-400">
                    {formatCurrency(prod.price)}
                  </span>
                  <div className="w-6 h-6 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs group-hover:bg-orange-500 group-hover:text-white transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Active Table Bill & Payment Pad */}
        <div className="lg:col-span-5 xl:col-span-4 bg-[#0f1422] border border-white/[0.08] rounded-2xl p-4 flex flex-col justify-between shadow-2xl h-[calc(100vh-210px)] min-h-[550px] sticky top-4">
          
          {/* Header */}
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-white">{activeTable?.name || 'Masa Seçilmedi'}</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 font-bold border border-orange-500/30">
                    {activeTable?.section.toUpperCase()}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Garson: {activeTable?.waiterName || 'Atanmadı'} • {activeTable?.durationMinutes || 0} dk açık
                </p>
              </div>

              {/* Fast ESC/POS Kitchen Print */}
              <button
                onClick={() => activeTable && onPrintReceipt(activeTable, 'kitchen')}
                disabled={!activeTable || activeTable.items.length === 0}
                className="p-2 rounded-xl bg-white/[0.05] hover:bg-orange-500 hover:text-white text-zinc-300 transition-colors border border-white/[0.08] flex items-center gap-1.5 text-xs font-semibold disabled:opacity-40"
                title="ESC/POS 80mm Mutfağa Fiş Bas"
              >
                <Printer className="w-3.5 h-3.5" />
                <span className="text-[11px] hidden sm:inline">Mutfağa Fiş</span>
              </button>
            </div>

            {/* Bill Items Scrollable List */}
            <div className="mt-3 space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {!activeTable || activeTable.items.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 text-xs">
                  Adisyonda henüz ürün yok.<br />Soldan ürün ekleyiniz.
                </div>
              ) : (
                activeTable.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="font-semibold text-zinc-200 truncate">{item.name}</p>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {formatCurrency(item.price)} × {item.quantity} = {formatCurrency(item.price * item.quantity)}
                      </span>
                    </div>

                    {/* Quantity controls */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleUpdateQuantity(idx, -1)}
                        className="w-6 h-6 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 flex items-center justify-center"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-5 text-center font-bold text-xs text-white">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => handleUpdateQuantity(idx, 1)}
                        className="w-6 h-6 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 flex items-center justify-center"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Bottom Financial Totals & Actions */}
          <div className="pt-3 border-t border-white/[0.08] space-y-3">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Ara Toplam (KDV Hariç):</span>
                <span className="font-mono text-zinc-300">
                  {formatCurrency((activeTable?.totalAmount || 0) * 0.9)}
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>KDV (%10):</span>
                <span className="font-mono text-zinc-300">
                  {formatCurrency((activeTable?.totalAmount || 0) * 0.1)}
                </span>
              </div>
              <div className="flex justify-between items-baseline pt-1 border-t border-white/[0.06]">
                <span className="font-bold text-white text-sm">GENEL TOPLAM:</span>
                <span className="font-mono font-black text-xl text-orange-400">
                  {formatCurrency(activeTable?.totalAmount || 0)}
                </span>
              </div>
            </div>

            {/* Payment Method Action Buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setPaymentModalType('cash')}
                disabled={!activeTable || activeTable.totalAmount === 0}
                className="py-3 px-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all disabled:opacity-40"
              >
                <Banknote className="w-4 h-4" />
                Nakit
              </button>

              <button
                onClick={() => handleCompletePayment('Kredi Kartı')}
                disabled={!activeTable || activeTable.totalAmount === 0}
                className="py-3 px-2 rounded-xl bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/30 font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all disabled:opacity-40"
              >
                <CreditCard className="w-4 h-4" />
                Kredi Kartı
              </button>

              <button
                onClick={() => setPaymentModalType('split')}
                disabled={!activeTable || activeTable.totalAmount === 0}
                className="py-3 px-2 rounded-xl bg-purple-600/20 hover:bg-purple-600 text-purple-400 hover:text-white border border-purple-500/30 font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all disabled:opacity-40"
              >
                <Divide className="w-4 h-4" />
                Adisyon Böl
              </button>
            </div>

            {/* Print Account Slip */}
            <button
              onClick={() => activeTable && onPrintReceipt(activeTable, 'bill')}
              disabled={!activeTable || activeTable.totalAmount === 0}
              className="w-full py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 border border-white/[0.08] text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
            >
              <Receipt className="w-3.5 h-3.5 text-orange-400" />
              Hesap Fişi Yazdır (Ön Bilgi)
            </button>
          </div>
        </div>
      </div>

      {/* Cash Payment Drawer / Modal */}
      {paymentModalType === 'cash' && activeTable && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#121829] border border-white/[0.12] rounded-3xl p-6 max-w-sm w-full shadow-2xl text-white space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Banknote className="w-5 h-5 text-emerald-400" />
                <h4 className="font-bold text-base">Nakit Ödeme Tahsilatı</h4>
              </div>
              <button
                onClick={() => setPaymentModalType('none')}
                className="text-zinc-400 hover:text-white text-xs"
              >
                Kapat
              </button>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] space-y-1">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Ödenecek Tutar:</span>
                <span className="font-bold text-white font-mono text-sm">
                  {formatCurrency(activeTable.totalAmount)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Alınan Nakit:</span>
                <span className="font-bold text-emerald-400 font-mono text-sm">
                  {formatCurrency(cashGiven || activeTable.totalAmount)}
                </span>
              </div>
              <div className="flex justify-between text-xs pt-1 border-t border-white/[0.06]">
                <span className="font-bold text-orange-400">Verilecek Para Üstü:</span>
                <span className="font-bold text-orange-400 font-mono text-sm">
                  {formatCurrency(Math.max(0, (cashGiven || activeTable.totalAmount) - activeTable.totalAmount))}
                </span>
              </div>
            </div>

            {/* Quick Cash Buttons */}
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 block mb-2">
                Hızlı Banknot Seçimi:
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  activeTable.totalAmount,
                  Math.ceil(activeTable.totalAmount / 100) * 100,
                  500,
                  1000
                ].map((val, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCashGiven(val)}
                    className="py-2 rounded-xl bg-white/[0.06] hover:bg-emerald-500/20 hover:border-emerald-500/40 border border-white/[0.08] text-xs font-mono font-bold text-zinc-200 transition-colors"
                  >
                    ₺{val}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <div className="pt-2 flex gap-2">
              <button
                onClick={() => handleCompletePayment('Nakit')}
                className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-lg transition-colors flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                Tahsil Et & Fiş Bas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split Payment Modal */}
      {paymentModalType === 'split' && activeTable && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#121829] border border-white/[0.12] rounded-3xl p-6 max-w-sm w-full shadow-2xl text-white space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Divide className="w-5 h-5 text-purple-400" />
                <h4 className="font-bold text-base">Adisyonu Eşit Böl</h4>
              </div>
              <button
                onClick={() => setPaymentModalType('none')}
                className="text-zinc-400 hover:text-white text-xs"
              >
                Kapat
              </button>
            </div>

            <div className="text-center py-2">
              <span className="text-xs text-zinc-400">Kişi Sayısı:</span>
              <div className="flex items-center justify-center gap-4 mt-2">
                <button
                  onClick={() => setSplitCount(Math.max(2, splitCount - 1))}
                  className="w-10 h-10 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-lg font-bold"
                >
                  -
                </button>
                <span className="text-2xl font-black text-purple-400 w-12 text-center">
                  {splitCount}
                </span>
                <button
                  onClick={() => setSplitCount(Math.min(10, splitCount + 1))}
                  className="w-10 h-10 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-lg font-bold"
                >
                  +
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-center">
              <span className="text-xs text-purple-300">Kişi Başı Düşen Pay:</span>
              <p className="text-xl font-black text-white font-mono mt-0.5">
                {formatCurrency(activeTable.totalAmount / splitCount)}
              </p>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                onClick={() => handleCompletePayment('Parçalı')}
                className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg transition-colors flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                {splitCount} Kişilik Tahsilatı Kapat
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
