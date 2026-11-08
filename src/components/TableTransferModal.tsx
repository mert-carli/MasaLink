'use client';

import React, { useState } from 'react';
import { 
  X, 
  ArrowRightLeft, 
  GitMerge, 
  Users, 
  CheckCircle2, 
  Printer, 
  AlertCircle, 
  ArrowRight,
  Sparkles,
  Layers,
  Check
} from 'lucide-react';
import { AdminTable } from '@/components/admin/TableDetailDrawer';
import { formatCurrency } from '@/utils/helpers';
import { saveStoredTables, getStoredTables } from '@/utils/tableData';
import { syncService } from '@/utils/syncService';
import { sendJobToLocalBridge } from '@/utils/printBridge';

interface TableTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceTable: AdminTable;
  allTables: AdminTable[];
  waiterName?: string;
  onSuccess: (targetTableId: string, mode: 'transfer' | 'merge') => void;
}

export const TableTransferModal: React.FC<TableTransferModalProps> = ({
  isOpen,
  onClose,
  sourceTable,
  allTables,
  waiterName = 'Garson',
  onSuccess,
}) => {
  const [mode, setMode] = useState<'transfer' | 'merge'>('transfer');
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [printReceipt, setPrintReceipt] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<'all' | 'empty' | 'occupied'>('all');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Candidate target tables (cannot select itself)
  const candidateTables = allTables.filter((t) => t.id !== sourceTable.id);

  const filteredCandidates = candidateTables.filter((t) => {
    if (filterType === 'empty') return t.status === 'empty';
    if (filterType === 'occupied') return t.status !== 'empty' && t.status !== 'cleaning';
    return true;
  });

  const targetTable = candidateTables.find((t) => t.id === selectedTargetId) || null;

  // Execute Transfer or Merge
  const handleExecute = async () => {
    if (!targetTable || isProcessing) return;

    setIsProcessing(true);
    setErrorMessage(null);

    // Haptic vibration
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([40, 30, 60]);
      } catch (_) {}
    }

    // 1. Sunucu tarafı atomik transfer API çağrısı
    try {
      const staffToken = typeof window !== 'undefined' ? localStorage.getItem('masalink_staff_token') : null;
      const res = await fetch('/api/tables/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(staffToken ? { Authorization: `Bearer ${staffToken}` } : {}),
        },
        body: JSON.stringify({
          sourceTableId: sourceTable.id,
          targetTableId: targetTable.id,
          mode,
          waiterName,
          expectedSourceVersion: (sourceTable as any).version,
          expectedTargetVersion: (targetTable as any).version,
        }),
      });

      const responseJson = await res.json().catch(() => null);

      if (!res.ok) {
        setErrorMessage(responseJson?.error || 'Masa transferi sunucuda onaylanamadı.');
        setIsProcessing(false);
        return;
      }
    } catch (err: any) {
      console.warn('Masa transferi API uyarısı:', err);
    }

    const currentAllTables = getStoredTables();

    if (mode === 'transfer') {
      // 1. Transfer mode
      const transferredItems = [...sourceTable.items];
      const transferredAmount = sourceTable.totalAmount;

      const updatedTables = currentAllTables.map((t) => {
        if (t.id === sourceTable.id) {
          return {
            ...t,
            status: 'cleaning' as const,
            items: [],
            totalAmount: 0,
            durationMinutes: 0,
            lastActivity: `${targetTable.name} masasına taşındı (Temizlik Bekliyor)`,
          };
        }
        if (t.id === targetTable.id) {
          return {
            ...t,
            status: 'preparing' as const,
            items: transferredItems,
            totalAmount: transferredAmount,
            waiterName: waiterName,
            lastActivity: `${sourceTable.name} masasından transfer alındı (${waiterName})`,
          };
        }
        return t;
      });

      saveStoredTables(updatedTables);

      // Broadcast event
      syncService.broadcast('TABLE_TRANSFERRED', {
        sourceTableId: sourceTable.id,
        sourceTableName: sourceTable.name,
        targetTableId: targetTable.id,
        targetTableName: targetTable.name,
        transferredItems,
        transferredAmount,
        waiterName,
      });

      // Print transfer ticket to kitchen & cashier bridge
      if (printReceipt) {
        try {
          await sendJobToLocalBridge({
            orderId: `TRF-${Date.now().toString().slice(-6)}`,
            type: 'kitchen',
            tableNumber: `${sourceTable.name} ➔ ${targetTable.name}`,
            waiterName: waiterName,
            timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
            items: transferredItems,
            subtotal: Math.round(transferredAmount * 0.9),
            vat: Math.round(transferredAmount * 0.1),
            total: transferredAmount,
          });
        } catch (err) {
          console.warn('Transfer fişi basılamadı:', err);
        }
      }

      onSuccess(targetTable.id, 'transfer');
    } else {
      // 2. Merge mode
      const mergedItems = [...targetTable.items, ...sourceTable.items];
      const newTotal = (targetTable.totalAmount || 0) + (sourceTable.totalAmount || 0);

      const updatedTables = currentAllTables.map((t) => {
        if (t.id === sourceTable.id) {
          return {
            ...t,
            status: 'cleaning' as const,
            items: [],
            totalAmount: 0,
            durationMinutes: 0,
            lastActivity: `${targetTable.name} ile birleştirildi (Temizlik Bekliyor)`,
          };
        }
        if (t.id === targetTable.id) {
          return {
            ...t,
            status: 'preparing' as const,
            items: mergedItems,
            totalAmount: newTotal,
            waiterName: waiterName,
            lastActivity: `${sourceTable.name} ile adisyonlar birleştirildi (${waiterName})`,
          };
        }
        return t;
      });

      saveStoredTables(updatedTables);

      // Broadcast event
      syncService.broadcast('TABLE_MERGED', {
        sourceTableId: sourceTable.id,
        sourceTableName: sourceTable.name,
        targetTableId: targetTable.id,
        targetTableName: targetTable.name,
        mergedItems,
        addedAmount: sourceTable.totalAmount,
        newTotal,
        waiterName,
      });

      // Print merge ticket
      if (printReceipt) {
        try {
          await sendJobToLocalBridge({
            orderId: `MRG-${Date.now().toString().slice(-6)}`,
            type: 'kitchen',
            tableNumber: `${sourceTable.name} + ${targetTable.name}`,
            waiterName: waiterName,
            timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
            items: mergedItems,
            subtotal: Math.round(newTotal * 0.9),
            vat: Math.round(newTotal * 0.1),
            total: newTotal,
          });
        } catch (err) {
          console.warn('Birleştirme fişi basılamadı:', err);
        }
      }

      onSuccess(targetTable.id, 'merge');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn select-none">
      <div className="w-full max-w-lg bg-[#0c101c] border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Modal Top Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between bg-gradient-to-r from-slate-900 to-[#0c101c]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center">
              <ArrowRightLeft className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white tracking-tight leading-none">
                Masa Transferi & Birleştirme
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Kaynak: <span className="text-amber-400 font-bold">{sourceTable.name}</span> ({sourceTable.items.length} Kalem • {formatCurrency(sourceTable.totalAmount)})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Operation Mode Selector (Transfer vs Merge) */}
        <div className="p-4 border-b border-slate-800/60 bg-slate-900/40">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('transfer');
                setSelectedTargetId(null);
              }}
              className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                mode === 'transfer'
                  ? 'bg-amber-500/15 border-amber-500/60 text-white shadow-md shadow-amber-500/10 ring-1 ring-amber-400/50'
                  : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
                  Masayı Taşı
                </span>
                {mode === 'transfer' && <Check className="w-3.5 h-3.5 text-amber-400" />}
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                Misafir başka masaya geçti. Bu masanın hesabı hedef masaya aktarılır.
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('merge');
                setSelectedTargetId(null);
              }}
              className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                mode === 'merge'
                  ? 'bg-purple-500/15 border-purple-500/60 text-white shadow-md shadow-purple-500/10 ring-1 ring-purple-400/50'
                  : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <GitMerge className="w-3.5 h-3.5 text-purple-400" />
                  Masaları Birleştir
                </span>
                {mode === 'merge' && <Check className="w-3.5 h-3.5 text-purple-400" />}
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                İki masa bir araya geldi. Siparişler hedef masanın hesabına eklenir.
              </p>
            </button>
          </div>
        </div>

        {/* Target Table List & Filter */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              {mode === 'transfer' ? 'Hedef Masa Seçin (Taşınacak)' : 'Hedef Masa Seçin (Birleşecek)'}
            </span>
            <div className="flex items-center gap-1 text-[10px]">
              {(['all', 'empty', 'occupied'] as const).map((ft) => (
                <button
                  key={ft}
                  onClick={() => setFilterType(ft)}
                  className={`px-2 py-0.5 rounded-full font-semibold transition-colors ${
                    filterType === ft
                      ? 'bg-slate-700 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {ft === 'all' ? 'Tümü' : ft === 'empty' ? 'Boş' : 'Açık'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto pr-1 no-scrollbar">
            {filteredCandidates.map((t) => {
              const isSelected = selectedTargetId === t.id;
              const isEmpty = t.status === 'empty';

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTargetId(t.id)}
                  className={`p-2.5 rounded-xl text-left border transition-all active:scale-95 flex flex-col justify-between ${
                    isSelected
                      ? mode === 'transfer'
                        ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/50 shadow-lg'
                        : 'bg-purple-500/20 border-purple-400 ring-2 ring-purple-400/50 shadow-lg'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-extrabold text-white truncate max-w-[85px]">
                      {t.name}
                    </span>
                    <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                      <Users className="w-2.5 h-2.5" />
                      {t.capacity}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    {isEmpty ? (
                      <span className="text-emerald-400 font-semibold text-[10px]">
                        🟢 Boş & Hazır
                      </span>
                    ) : (
                      <span className="text-amber-400 font-mono font-bold text-[10px]">
                        {formatCurrency(t.totalAmount)}
                      </span>
                    )}
                    {isSelected && (
                      <CheckCircle2 className={`w-3.5 h-3.5 ${mode === 'transfer' ? 'text-amber-400' : 'text-purple-400'}`} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Operation Preview Box */}
          {targetTable && (
            <div className={`p-3 rounded-xl border text-xs animate-fadeIn ${
              mode === 'transfer'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                : 'bg-purple-500/10 border-purple-500/30 text-purple-200'
            }`}>
              <div className="font-bold flex items-center gap-1.5 mb-1 text-white">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>İşlem Önizlemesi</span>
              </div>
              {mode === 'transfer' ? (
                <div className="space-y-0.5 text-[11px]">
                  <div>
                    • <strong>{sourceTable.name}</strong> üzerindeki <strong>{sourceTable.items.length} kalem</strong> ({formatCurrency(sourceTable.totalAmount)}) ➔ <strong>{targetTable.name}</strong> masasına taşınacak.
                  </div>
                  <div>
                    • <strong>{sourceTable.name}</strong> otomatik olarak <em>"Temizlik Bekliyor"</em> durumuna geçecek.
                  </div>
                </div>
              ) : (
                <div className="space-y-0.5 text-[11px]">
                  <div>
                    • <strong>{sourceTable.name}</strong> ({formatCurrency(sourceTable.totalAmount)}) ile <strong>{targetTable.name}</strong> ({formatCurrency(targetTable.totalAmount)}) adisyonları birleşecek.
                  </div>
                  <div>
                    • <strong>{targetTable.name} Yeni Toplam:</strong> <span className="font-bold text-white">{formatCurrency((targetTable.totalAmount || 0) + sourceTable.totalAmount)}</span>
                  </div>
                  <div>
                    • <strong>{sourceTable.name}</strong> hesabı kapatılıp <em>"Temizlik Bekliyor"</em> durumuna düşürülecek.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Print Checkbox */}
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={printReceipt}
              onChange={(e) => setPrintReceipt(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-amber-400 w-4 h-4 cursor-pointer"
            />
            <span className="flex items-center gap-1.5">
              <Printer className="w-3.5 h-3.5 text-slate-400" />
              <span>Mutfak ve kasaya {mode === 'transfer' ? 'Masa Transfer Fişi' : 'Birleştirme Fişi'} bastır</span>
            </span>
          </label>
        </div>

        {/* Modal Bottom Actions */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/60 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 active:scale-95 transition-all"
          >
            Vazgeç
          </button>

          <button
            type="button"
            disabled={!targetTable || isProcessing}
            onClick={handleExecute}
            className={`flex-1 py-3 px-4 rounded-xl text-xs font-black tracking-wide flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all ${
              targetTable && !isProcessing
                ? mode === 'transfer'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-amber-500/25 ring-1 ring-amber-300'
                  : 'bg-gradient-to-r from-purple-500 to-purple-400 hover:from-purple-400 hover:to-purple-300 text-white shadow-purple-500/25 ring-1 ring-purple-300'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/60'
            }`}
          >
            {isProcessing ? (
              <span className="flex items-center gap-1.5">
                <Printer className="w-3.5 h-3.5 animate-spin" />
                Aktarılıyor...
              </span>
            ) : mode === 'transfer' ? (
              <>
                <ArrowRightLeft className="w-4 h-4" />
                <span>Masayı Taşı ({targetTable ? targetTable.name : 'Hedef Seçin'})</span>
              </>
            ) : (
              <>
                <GitMerge className="w-4 h-4" />
                <span>Masaları Birleştir ({targetTable ? targetTable.name : 'Hedef Seçin'})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
