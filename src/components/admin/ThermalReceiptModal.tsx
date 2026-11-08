'use client';

import React, { useState } from 'react';
import { X, Printer, CheckCircle2, QrCode, FileText, ArrowRight, Zap, RefreshCw, Cpu } from 'lucide-react';
import { formatCurrency } from '@/utils/helpers';
import { sendJobToLocalBridge } from '@/utils/printBridge';

export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  notes?: string;
}

export interface ReceiptData {
  orderId: string;
  tableNumber: string;
  timestamp: string;
  waiterName: string;
  items: ReceiptItem[];
  subtotal: number;
  vat: number;
  total: number;
  type: 'kitchen' | 'bill'; // 'kitchen' = Mutfak Adisyonu, 'bill' = Hesap Fişi
  paymentMethod?: string;
}

interface ThermalReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: ReceiptData | null;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({
  isOpen,
  onClose,
  receipt,
}) => {
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<{
    message: string;
    mode: string;
    latencyMs: number;
  } | null>(null);

  if (!isOpen || !receipt) return null;

  const handleSilentBridgePrint = async () => {
    setIsDispatching(true);
    setDispatchResult(null);

    const res = await sendJobToLocalBridge(receipt, {
      printerIp: '192.168.1.180',
      printerPort: 9100,
    });

    setIsDispatching(false);
    setDispatchResult({
      message: res.message,
      mode: res.mode,
      latencyMs: res.latencyMs,
    });
  };

  const handleBrowserFallbackPrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md rounded-3xl bg-[#0d111a] border border-white/[0.1] shadow-2xl p-5 sm:p-6 text-zinc-100 flex flex-col max-h-[92vh]">
        
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-orange-500/15 text-orange-400">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                {receipt.type === 'kitchen' ? 'Mutfak Hazırlık Fişi' : 'Adisyon Hesap Fişi'}
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400">
                  80mm ESC/POS
                </span>
              </h3>
              <p className="text-[11px] text-zinc-400">
                Sıfır KDS: Sipariş doğrudan mutfak termal yazıcısına iletilir.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.05]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 80mm Realistic Monospace Thermal Paper Box */}
        <div className="flex-1 overflow-y-auto pr-1">
          <div className="bg-[#fafaf7] text-black font-mono text-[11px] sm:text-xs p-5 rounded-xl shadow-inner border border-zinc-300 space-y-3 leading-tight select-none">
            
            {/* Restaurant Logo Header */}
            <div className="text-center space-y-1 pb-2 border-b border-dashed border-zinc-400">
              <div className="font-extrabold text-sm sm:text-base tracking-widest uppercase">
                *** MASALINK RESTORAN ***
              </div>
              <div className="font-bold text-xs">ARTISAN BURGER BAR</div>
              <div className="text-[10px] text-zinc-600">Kadıköy Merkez Şube • Tel: 0216 550 42 00</div>
              <div className="text-[9px] text-zinc-500">VKN: 6120894521 • MERSİS: 0612089452100014</div>
            </div>

            {/* Ticket Info */}
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between font-bold text-xs bg-zinc-200 p-1 rounded">
                <span>MASA: {receipt.tableNumber}</span>
                <span>#{receipt.orderId}</span>
              </div>
              <div className="flex justify-between text-[10px] text-zinc-600">
                <span>Tarih: {new Date().toLocaleDateString('tr-TR')} {receipt.timestamp}</span>
                <span>Garson: {receipt.waiterName}</span>
              </div>
              <div className="text-[10px] text-zinc-500 font-semibold">
                Tür: {receipt.type === 'kitchen' ? 'MUTFAK İSTASYONU (ESC/POS)' : 'HESAP KAPATMA FİŞİ'}
              </div>
            </div>

            <div className="border-b border-dashed border-zinc-400 my-1" />

            {/* Line Items */}
            <div className="space-y-2">
              <div className="flex justify-between font-bold text-[10px] text-zinc-600 uppercase border-b border-zinc-300 pb-1">
                <span>Adet / Ürün</span>
                <span>Tutar</span>
              </div>

              {receipt.items.map((item, idx) => (
                <div key={idx} className="space-y-0.5">
                  <div className="flex justify-between font-bold">
                    <span>{item.quantity}x {item.name}</span>
                    <span>{formatCurrency(item.price)}</span>
                  </div>
                  {item.notes && (
                    <div className="text-[10px] text-orange-800 font-semibold italic pl-4">
                      * Not: {item.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="border-b border-dashed border-zinc-400 my-2" />

            {/* Totals Breakdown */}
            <div className="space-y-1 text-right text-xs">
              <div className="flex justify-between text-zinc-600 text-[11px]">
                <span>Ara Toplam:</span>
                <span>{formatCurrency(receipt.subtotal)}</span>
              </div>
              <div className="flex justify-between text-zinc-600 text-[11px]">
                <span>KDV (%10 / %20 Dahil):</span>
                <span>{formatCurrency(receipt.vat)}</span>
              </div>
              <div className="flex justify-between font-extrabold text-sm sm:text-base text-black pt-1 border-t border-zinc-400">
                <span>GENEL TOPLAM:</span>
                <span>{formatCurrency(receipt.total)}</span>
              </div>
              {receipt.paymentMethod && (
                <div className="flex justify-between text-zinc-700 text-[11px] pt-1">
                  <span>Ödeme Yöntemi:</span>
                  <span className="font-bold">{receipt.paymentMethod}</span>
                </div>
              )}
            </div>

            {/* Thermal Barcode Footer */}
            <div className="text-center pt-3 border-t border-dashed border-zinc-400 space-y-1">
              <div className="tracking-[6px] text-xs font-mono font-bold">
                |||||| | |||| | |||||||| | ||||
              </div>
              <div className="text-[9px] text-zinc-500">
                {receipt.type === 'kitchen' 
                  ? 'Mutfak Termal Çıktısı • Otomatik Reçete Düşüldü' 
                  : 'Mali Değeri Yoktur • Bilgi Fişidir'}
              </div>
              <div className="text-[9px] font-bold text-zinc-700">
                www.masalink.com • Bulut Restoran POS
              </div>
            </div>

          </div>
        </div>

        {/* Bridge Feedback Alert */}
        {dispatchResult && (
          <div className="mt-3 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between animate-fadeIn">
            <span className="flex items-center gap-1.5 font-medium">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              {dispatchResult.message}
            </span>
            <span className="text-[10px] font-mono text-zinc-400">{dispatchResult.latencyMs}ms</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-4 border-t border-white/[0.08] mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-mono text-[11px]">Print Bridge: 127.0.0.1:28443</span>
            </div>
            <span className="text-zinc-600">→</span>
            <span className="text-zinc-400 font-mono text-[10px]">ESC/POS 9100</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBrowserFallbackPrint}
              className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-zinc-300 transition-colors"
              title="Yedek Tarayıcı Önizlemesi (window.print)"
            >
              Yedek Önizleme
            </button>
            <button
              onClick={handleSilentBridgePrint}
              disabled={isDispatching}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold text-xs shadow-lg shadow-orange-500/25 active:scale-95 flex items-center gap-1.5 disabled:opacity-50 transition-all"
            >
              {isDispatching ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 text-amber-200" />
              )}
              <span>Sessiz Fiş Bas (Bridge)</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
