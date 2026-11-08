'use client';

import React, { useState } from 'react';
import { 
  X, 
  Clock, 
  CreditCard, 
  Printer, 
  Trash2, 
  Plus, 
  CheckCircle2, 
  Utensils, 
  AlertTriangle,
  Receipt,
  Users,
  Banknote,
  Zap,
  ExternalLink,
  Check,
  ArrowRightLeft,
  QrCode
} from 'lucide-react';
import { formatCurrency } from '@/utils/helpers';
import { ReceiptData } from './ThermalReceiptModal';

export type TableLifecycleStatus = 
  | 'empty'
  | 'waiting_menu'
  | 'preparing'
  | 'ordered' // backward-compatible alias for preparing
  | 'served'
  | 'bill_requested'
  | 'cleaning';

export interface AdminTable {
  id: string;
  name: string;
  section: 'salon' | 'bahce' | 'teras' | 'bar';
  capacity: number;
  status: TableLifecycleStatus;
  durationMinutes: number;
  totalAmount: number;
  items: { 
    name: string; 
    quantity: number; 
    price: number; 
    notes?: string;
    guestTag?: string;
    guestId?: string;
    isPaid?: boolean;
    paidBy?: string;
    isComped?: boolean;
    originalPrice?: number;
  }[];
  waiterName?: string;
  lastActivity: string;
  delayAlert?: boolean;
}

interface TableDetailDrawerProps {
  table: AdminTable | null;
  onClose: () => void;
  onGoToCheckout: (table: AdminTable) => void;
  onPrintReceipt: (table: AdminTable, type: 'kitchen' | 'bill') => void;
  onCloseTable: (tableId: string) => void;
  onAddItemToTable: (tableId: string, itemName: string, price: number) => void;
  onQuickCheckout?: (table: AdminTable, method: 'Nakit' | 'Kredi Kartı', tender?: number) => void;
  onUpdateStatus?: (tableId: string, status: TableLifecycleStatus) => void;
  onOpenTransferModal?: (table: AdminTable) => void;
}

export const TableDetailDrawer: React.FC<TableDetailDrawerProps> = ({
  table,
  onClose,
  onGoToCheckout,
  onPrintReceipt,
  onCloseTable,
  onAddItemToTable,
  onQuickCheckout,
  onUpdateStatus,
  onOpenTransferModal,
}) => {
  const [cashTender, setCashTender] = useState<number | null>(null);
  const [showCashPanel, setShowCashPanel] = useState<boolean>(false);

  if (!table) return null;

  const statusConfig: Record<string, { label: string; bg: string }> = {
    empty: { label: 'Boş & Misafire Hazır', bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    waiting_menu: { label: '1. Oturuldu • Menü Bekliyor', bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    preparing: { label: '2. Mutfakta Hazırlanıyor', bg: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
    ordered: { label: '2. Mutfakta Hazırlanıyor', bg: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
    served: { label: '3. Servis Edildi • Masada Yiyor', bg: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    bill_requested: { label: '4. Hesap İstendi (Kilitli)', bg: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
    cleaning: { label: '5. Kalktı • Temizlik Bekliyor', bg: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' },
  };

  const currentStatus = statusConfig[table.status] || statusConfig.empty;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end animate-fadeIn">
      <div className="relative w-full max-w-md bg-[#0f1422] border-l border-white/[0.08] shadow-2xl flex flex-col justify-between h-full text-zinc-100 animate-slideLeft">
        
        {/* Drawer Header */}
        <div className="p-5 border-b border-white/[0.08] bg-zinc-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/20 text-orange-400 flex items-center justify-center font-black text-sm">
              {table.name.replace('Masa ', '')}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-white">{table.name}</h3>
                <span className="text-xs text-zinc-400 flex items-center gap-1 font-mono">
                  <Users className="w-3.5 h-3.5" /> {table.capacity} Kişilik
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${currentStatus.bg}`}>
                  {currentStatus.label}
                </span>
                {table.status !== 'empty' && (
                  <span className="text-[11px] text-zinc-400 font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3 text-zinc-500" />
                    {table.durationMinutes} dk
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Table Lifecycle State Transition Bar (5-Step FSM) */}
        <div className="px-4 py-2 bg-black/40 border-b border-white/[0.06] overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max text-[10px]">
            <span className="text-zinc-500 font-mono text-[9px] mr-1">Aşama:</span>
            {[
              { id: 'waiting_menu', label: '1. Oturdu', color: 'hover:border-amber-500' },
              { id: 'preparing', label: '2. Hazırlık', color: 'hover:border-orange-500' },
              { id: 'served', label: '3. Servis Edildi', color: 'hover:border-blue-500' },
              { id: 'bill_requested', label: '4. Hesap İstendi', color: 'hover:border-purple-500' },
              { id: 'cleaning', label: '5. Temizlik Bekliyor', color: 'hover:border-yellow-500' },
              { id: 'empty', label: '✨ Boş & Hazır', color: 'hover:border-emerald-500' },
            ].map((step, idx) => {
              const isCurrent = table.status === step.id || (step.id === 'preparing' && table.status === 'ordered');
              return (
                <button
                  key={idx}
                  onClick={() => onUpdateStatus && onUpdateStatus(table.id, step.id as any)}
                  className={`px-2 py-1 rounded-md border font-semibold transition-all ${
                    isCurrent
                      ? 'bg-orange-500 text-white border-orange-400 shadow-xs'
                      : `bg-white/[0.03] text-zinc-400 border-white/[0.06] ${step.color} hover:text-white`
                  }`}
                  title={`${step.label} durumuna geçir`}
                >
                  {step.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Drawer Content: Adisyon Items */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {/* Delay Alert if any */}
          {table.delayAlert && (
            <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2 animate-pulse">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Vision AI Alarmı: Misafir 02:45 dakikadır bekliyor, sipariş alınmadı!</span>
            </div>
          )}

          {/* Adisyon List */}
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
              <span>Adisyon Kalemleri ({table.items.length})</span>
              <span>Birim / Tutar</span>
            </div>

            {table.items.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 space-y-2">
                <Utensils className="w-10 h-10 mx-auto opacity-30" />
                <p className="text-xs">Bu masada henüz açık adisyon yok.</p>
                <div className="flex justify-center gap-2 pt-2">
                  <button
                    onClick={() => onAddItemToTable(table.id, 'Truffle Burger', 295)}
                    className="px-2.5 py-1 rounded-lg bg-zinc-800 text-xs text-orange-400 hover:bg-zinc-700"
                  >
                    + Hızlı Burger Ekle
                  </button>
                  <button
                    onClick={() => onAddItemToTable(table.id, 'Ev Yapımı Limonata', 85)}
                    className="px-2.5 py-1 rounded-lg bg-zinc-800 text-xs text-orange-400 hover:bg-zinc-700"
                  >
                    + İçecek Ekle
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {table.items.map((it, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-zinc-900/80 border border-white/[0.05] flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded bg-orange-500/20 text-orange-400 text-[10px] font-black inline-flex items-center justify-center">
                          {it.quantity}
                        </span>
                        <span>{it.name}</span>
                      </div>
                      {it.notes && (
                        <div className="text-[10px] text-zinc-400 italic pl-5 mt-0.5">
                          Not: {it.notes}
                        </div>
                      )}
                    </div>
                    <span className="font-mono font-bold text-zinc-200">
                      {formatCurrency(it.price * it.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Item Append Buttons */}
          {table.items.length > 0 && (
            <div className="pt-2 border-t border-white/[0.06]">
              <span className="text-[11px] font-bold text-zinc-400 block mb-1.5">Hızlı Kalem Ekle:</span>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <button
                  onClick={() => onAddItemToTable(table.id, 'Trüflü Patates', 140)}
                  className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/[0.06] text-zinc-300"
                >
                  + Patates (₺140)
                </button>
                <button
                  onClick={() => onAddItemToTable(table.id, 'Fıçı Bira 50cl', 190)}
                  className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/[0.06] text-zinc-300"
                >
                  + Bira (₺190)
                </button>
                <button
                  onClick={() => onAddItemToTable(table.id, 'San Sebastian Cheesecake', 175)}
                  className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/[0.06] text-zinc-300"
                >
                  + Tatlı (₺175)
                </button>
              </div>
            </div>
          )}

          {/* Totals Box */}
          {table.items.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-zinc-900 border border-white/[0.08] space-y-1.5 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Ara Toplam:</span>
                <span>{formatCurrency(table.totalAmount * 0.9)}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>KDV (%10 Dahil):</span>
                <span>{formatCurrency(table.totalAmount * 0.1)}</span>
              </div>
              <div className="flex justify-between font-black text-base text-white pt-1 border-t border-white/[0.08]">
                <span>Toplam Tutar:</span>
                <span className="text-orange-400 font-mono">{formatCurrency(table.totalAmount)}</span>
              </div>
            </div>
          )}

        </div>

        {/* Drawer Footer Actions - Direct Instant Checkout from Floor Map */}
        <div className="p-4 sm:p-5 border-t border-white/[0.08] bg-zinc-900/95 space-y-3">
          {table.items.length > 0 ? (
            <>
              {/* Quick Cash Tender Panel (If open) */}
              {showCashPanel && (
                <div className="p-3 rounded-2xl bg-black/60 border border-emerald-500/30 space-y-2.5 animate-fadeIn">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                      <Banknote className="w-3.5 h-3.5" />
                      Nakit Tahsilat (Para Üstü)
                    </span>
                    <button
                      onClick={() => setShowCashPanel(false)}
                      className="text-zinc-500 hover:text-white text-[10px]"
                    >
                      Kapat
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { label: 'Tam', val: table.totalAmount },
                      { label: '₺500', val: 500 },
                      { label: '₺1.000', val: 1000 },
                      { label: '₺2.000', val: 2000 },
                    ].map((btn, bIdx) => (
                      <button
                        key={bIdx}
                        onClick={() => setCashTender(btn.val)}
                        className={`py-1.5 rounded-lg text-xs font-mono font-bold border transition-colors ${
                          cashTender === btn.val
                            ? 'bg-emerald-500 text-zinc-950 border-emerald-400'
                            : 'bg-white/[0.04] text-zinc-300 border-white/[0.08] hover:bg-white/[0.08]'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  {cashTender && cashTender >= table.totalAmount && (
                    <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex justify-between items-center text-xs">
                      <span className="text-emerald-300 font-semibold">Verilecek Para Üstü:</span>
                      <span className="font-mono font-black text-amber-400 text-sm">
                        {formatCurrency(cashTender - table.totalAmount)}
                      </span>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      if (onQuickCheckout) {
                        onQuickCheckout(table, 'Nakit', cashTender || table.totalAmount);
                      }
                      setShowCashPanel(false);
                      onClose();
                    }}
                    className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg transition-colors"
                  >
                    <Check className="w-4 h-4" />
                    <span>Nakit Tahsil Et & Adisyonu Kapat</span>
                  </button>
                </div>
              )}

              {/* 2-Second Instant Checkout Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    if (onQuickCheckout) {
                      onQuickCheckout(table, 'Kredi Kartı');
                    }
                    onClose();
                  }}
                  className="py-3 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex flex-col items-center justify-center gap-1"
                  title="Tek tıkla kart tahsilatı yap ve masayı boşalt"
                >
                  <div className="flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4" />
                    <span>Kart ile Kapat</span>
                  </div>
                  <span className="text-[10px] font-mono text-blue-200">
                    {formatCurrency(table.totalAmount)}
                  </span>
                </button>

                <button
                  onClick={() => setShowCashPanel(!showCashPanel)}
                  className="py-3 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex flex-col items-center justify-center gap-1"
                  title="Nakit ödeme al ve para üstü hesapla"
                >
                  <div className="flex items-center gap-1.5">
                    <Banknote className="w-4 h-4" />
                    <span>Nakit Kapat</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-200">
                    {formatCurrency(table.totalAmount)}
                  </span>
                </button>
              </div>

              {/* Thermal Print Shortcuts */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onPrintReceipt(table, 'kitchen')}
                  className="py-2 px-3 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 font-semibold text-[11px] flex items-center justify-center gap-1.5 border border-white/[0.08]"
                >
                  <Printer className="w-3.5 h-3.5 text-orange-400" />
                  <span>Mutfağa Fiş Bas</span>
                </button>
                <button
                  onClick={() => onPrintReceipt(table, 'bill')}
                  className="py-2 px-3 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 font-semibold text-[11px] flex items-center justify-center gap-1.5 border border-white/[0.08]"
                >
                  <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Hesap Fişi Bas</span>
                </button>
              </div>

              {/* Table Transfer / Merge Button */}
              {onOpenTransferModal && (
                <button
                  onClick={() => {
                    onOpenTransferModal(table);
                    onClose();
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 border border-amber-500/25 transition-colors"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
                  <span>↔ Masayı Taşı / Başka Masayla Birleştir</span>
                </button>
              )}

              {/* Customer QR Menu Link */}
              <a
                href={`/r/artisan-burger/${table.id}?token=tok_${table.id}_demo`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2 px-3 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 font-bold text-xs flex items-center justify-center gap-1.5 border border-orange-500/25 transition-colors"
                title="Müşterinin masada göreceği QR Sipariş Ekranını Yeni Sekmede Aç"
              >
                <QrCode className="w-3.5 h-3.5 text-orange-400" />
                <span>📱 Müşteri QR Menüsünü Aç ({table.name})</span>
              </a>

              {/* Advanced POS Switch link */}
              <button
                onClick={() => {
                  onGoToCheckout(table);
                  onClose();
                }}
                className="w-full py-1 text-center text-[11px] text-zinc-400 hover:text-orange-400 transition-colors flex items-center justify-center gap-1"
              >
                <span>Gelişmiş POS Ekranında Aç (Parçalı Bölme / İndirim)</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </>
          ) : (
            <button
              onClick={() => onCloseTable(table.id)}
              className="w-full py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Masayı Boşalt & Temizlendi İşaretle</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
