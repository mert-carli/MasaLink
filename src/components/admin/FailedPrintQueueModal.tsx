'use client';

import React from 'react';
import { 
  X, 
  AlertTriangle, 
  Printer, 
  RefreshCw, 
  CheckCircle2, 
  ExternalLink,
  Trash2,
  Zap,
  HelpCircle
} from 'lucide-react';
import { FailedPrintJob } from '@/utils/printBridge';
import { formatCurrency } from '@/utils/helpers';

interface FailedPrintQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  failedJobs: FailedPrintJob[];
  onRetryJob: (job: FailedPrintJob) => void;
  onBrowserFallback: (job: FailedPrintJob) => void;
  onDismissJob: (jobId: string) => void;
  onClearAll: () => void;
  isRetrying?: boolean;
}

export const FailedPrintQueueModal: React.FC<FailedPrintQueueModalProps> = ({
  isOpen,
  onClose,
  failedJobs,
  onRetryJob,
  onBrowserFallback,
  onDismissJob,
  onClearAll,
  isRetrying = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-[#121829] border border-rose-500/40 rounded-3xl p-6 max-w-xl w-full shadow-2xl text-white space-y-4 animate-scaleUp max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">Mutfak Yazıcısı Hata Kuyruğu</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                  {failedJobs.length} Bekleyen Fiş
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Yazıcıda kağıt bittiğinde veya ağ kablosu çıktığında adisyonlar kaybolmaz; burada bekletilir.
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

        {/* Diagnostic Guide */}
        <div className="p-3.5 rounded-xl bg-rose-500/[0.08] border border-rose-500/25 text-xs text-rose-200 flex items-start gap-2.5">
          <HelpCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <strong className="block text-rose-300">Fiziksel Kontrol Listesi:</strong>
            <p className="text-[11px] leading-relaxed text-zinc-300">
              1. Mutfaktaki 80mm yazıcının kapak mandalını açıp kağıt rulosunu kontrol edin.<br />
              2. Arkadaki mavi Ethernet kablosunun LAN ışığının yandığından emin olun.<br />
              3. Sorun giderildikten sonra aşağıdaki <strong>"Tekrar Fırlat"</strong> butonuna basınız.
            </p>
          </div>
        </div>

        {/* Job List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {failedJobs.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 space-y-2">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400 opacity-60" />
              <p className="text-xs font-semibold text-zinc-300">Kuyrukta bekleyen basılamamış adisyon yok.</p>
              <p className="text-[11px] text-zinc-500">Mutfak termal yazıcısı normal seyrinde çalışıyor.</p>
            </div>
          ) : (
            failedJobs.map((job) => (
              <div
                key={job.id}
                className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-rose-500/30 transition-all space-y-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{job.tableNumber}</span>
                    <span className="text-[10px] text-zinc-400 font-mono">#{job.orderId}</span>
                  </div>
                  <span className="font-mono font-bold text-orange-400">
                    {formatCurrency(job.totalAmount)}
                  </span>
                </div>

                {/* Items summary */}
                <div className="text-[11px] text-zinc-400 space-y-0.5 bg-black/30 p-2 rounded-xl">
                  {job.receipt.items.map((i, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>{i.quantity}x {i.name}</span>
                      <span className="font-mono">{formatCurrency(i.price * i.quantity)}</span>
                    </div>
                  ))}
                </div>

                {/* Error info */}
                <div className="flex items-center justify-between text-[10px] text-rose-400 font-mono">
                  <span>Hata: {job.errorCode} ({job.errorReason})</span>
                  <span>{job.failedAt}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                  <button
                    onClick={() => onRetryJob(job)}
                    disabled={isRetrying}
                    className="flex-1 py-2 px-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                    <span>Tekrar Yazıcıya Fırlat</span>
                  </button>

                  <button
                    onClick={() => onBrowserFallback(job)}
                    className="py-2 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    title="Masaüstü yazıcısından veya yedek kağıttan bas"
                  >
                    <Printer className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Yedek Yazdır</span>
                  </button>

                  <button
                    onClick={() => onDismissJob(job.id)}
                    className="p-2 rounded-xl bg-white/[0.04] hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 transition-colors"
                    title="Kuyruktan Çıkar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {failedJobs.length > 0 && (
          <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between text-xs">
            <button
              onClick={onClearAll}
              className="text-zinc-500 hover:text-rose-400 text-[11px] underline"
            >
              Tüm Kuyruğu Temizle
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold"
            >
              Kapat
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
