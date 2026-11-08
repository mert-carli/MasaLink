'use client';

import React, { useState } from 'react';
import { 
  Users, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Radio, 
  Sparkles, 
  Eye, 
  Send, 
  Check, 
  Plus, 
  Search,
  Filter,
  Flame,
  ArrowRight
} from 'lucide-react';
import { AdminTable } from './TableDetailDrawer';
import { formatCurrency } from '@/utils/helpers';

export interface VisionAiAlert {
  id: string;
  type: 'seated' | 'delay' | 'cleaning';
  tableId: string;
  tableName: string;
  title: string;
  description: string;
  timeAgo: string;
  durationSeconds?: number;
  isResolved?: boolean;
}

interface FloorMapModuleProps {
  tables: AdminTable[];
  onSelectTable: (table: AdminTable) => void;
  onSendWaiter: (tableId: string) => void;
  onResolveCleaning: (tableId: string) => void;
  alerts: VisionAiAlert[];
  onDismissAlert: (alertId: string) => void;
  onDirectQuickPay?: (table: AdminTable) => void;
}

export const FloorMapModule: React.FC<FloorMapModuleProps> = ({
  tables,
  onSelectTable,
  onSendWaiter,
  onResolveCleaning,
  alerts,
  onDismissAlert,
  onDirectQuickPay,
}) => {
  const [selectedSection, setSelectedSection] = useState<'all' | 'salon' | 'bahce' | 'teras' | 'bar'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'empty' | 'delayed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filtering
  const filteredTables = tables.filter((table) => {
    if (selectedSection !== 'all' && table.section !== selectedSection) return false;
    if (statusFilter === 'active' && table.status === 'empty') return false;
    if (statusFilter === 'empty' && table.status !== 'empty') return false;
    if (statusFilter === 'delayed' && !table.delayAlert) return false;
    if (searchQuery.trim() && !table.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const getStatusBadge = (status: AdminTable['status'], delayAlert?: boolean) => {
    if (delayAlert) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
          <AlertTriangle className="w-3 h-3 text-rose-400" />
          Gecikme (02:45+)
        </span>
      );
    }

    switch (status) {
      case 'waiting_menu':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            1. Menü Bekliyor
          </span>
        );
      case 'preparing':
      case 'ordered':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/40">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            2. Hazırlanıyor
          </span>
        );
      case 'served':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            3. Servis Edildi
          </span>
        );
      case 'bill_requested':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/25 text-purple-200 border border-purple-500/50">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            4. Hesap İstendi
          </span>
        );
      case 'cleaning':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/50">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            5. Temizlik Bekliyor
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
            ✨ Boş & Hazır
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Vision AI Camera Live Ribbon */}
      <section className="rounded-2xl border border-white/[0.08] bg-gradient-to-r from-zinc-900/90 via-[#131b2e]/90 to-zinc-900/90 p-4 shadow-xl backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400">
              <Eye className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-white tracking-wide uppercase">
                  Vision AI Canlı Akış Radarı
                </h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium">
                  3 Kamera Aktif
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Restoran güvenlik kamerasından anlık misafir tespiti ve bekleme süresi alarmları
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="text-[11px] font-mono text-zinc-300 bg-white/[0.04] px-2 py-1 rounded-md border border-white/[0.05]">
              Yapay Zekâ Tepki Süresi: <strong className="text-orange-400">~0.4 sn</strong>
            </span>
          </div>
        </div>

        {/* Live Alerts Stream Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-3 rounded-xl border transition-all duration-200 relative overflow-hidden flex flex-col justify-between ${
                alert.type === 'delay'
                  ? 'bg-rose-500/[0.08] border-rose-500/30 text-rose-100 shadow-[0_0_15px_rgba(244,63,94,0.1)]'
                  : alert.type === 'seated'
                  ? 'bg-amber-500/[0.08] border-amber-500/30 text-amber-100'
                  : 'bg-cyan-500/[0.08] border-cyan-500/30 text-cyan-100'
              }`}
            >
              {/* Type indicator stripe */}
              <div
                className={`absolute top-0 left-0 right-0 h-1 ${
                  alert.type === 'delay'
                    ? 'bg-gradient-to-r from-rose-500 to-amber-500 animate-pulse'
                    : alert.type === 'seated'
                    ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                    : 'bg-gradient-to-r from-cyan-400 to-blue-500'
                }`}
              />

              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-bold flex items-center gap-1.5">
                    {alert.type === 'delay' && <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
                    {alert.type === 'seated' && <Users className="w-3.5 h-3.5 text-amber-400" />}
                    {alert.type === 'cleaning' && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />}
                    {alert.tableName}
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">{alert.timeAgo}</span>
                </div>
                <p className="text-xs font-medium text-zinc-200 line-clamp-2 leading-relaxed">
                  {alert.description}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="mt-3 flex items-center gap-2 pt-2 border-t border-white/[0.08]">
                {alert.type === 'delay' && (
                  <button
                    onClick={() => onSendWaiter(alert.tableId)}
                    className="flex-1 py-1.5 px-2.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                  >
                    <Send className="w-3 h-3" />
                    Garson Gönder
                  </button>
                )}
                {alert.type === 'cleaning' && (
                  <button
                    onClick={() => onResolveCleaning(alert.tableId)}
                    className="flex-1 py-1.5 px-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                  >
                    <Check className="w-3 h-3" />
                    Temizlendi İşaretle
                  </button>
                )}
                {alert.type === 'seated' && (
                  <button
                    onClick={() => {
                      const t = tables.find(x => x.id === alert.tableId);
                      if (t) onSelectTable(t);
                    }}
                    className="flex-1 py-1.5 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                  >
                    <ArrowRight className="w-3 h-3" />
                    Adisyon Aç
                  </button>
                )}
                <button
                  onClick={() => onDismissAlert(alert.id)}
                  className="px-2 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-400 text-[10px] transition-colors"
                  title="Bildirimi Kapat"
                >
                  Yoksay
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Floor Header & Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Section Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-900/80 border border-white/[0.06] overflow-x-auto">
          {[
            { id: 'all', label: 'Tüm Alanlar' },
            { id: 'salon', label: 'İç Salon' },
            { id: 'bahce', label: 'Açık Bahçe' },
            { id: 'teras', label: 'Teras Kat' },
            { id: 'bar', label: 'Bar Alanı' },
          ].map((sec) => (
            <button
              key={sec.id}
              onClick={() => setSelectedSection(sec.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedSection === sec.id
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              {sec.label}
            </button>
          ))}
        </div>

        {/* Status Filters & Search */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Masa ara (Örn: Masa 4)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-zinc-900/80 border border-white/[0.08] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 w-44 sm:w-52"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-1.5 bg-zinc-900/80 border border-white/[0.08] rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-orange-500 cursor-pointer"
          >
            <option value="all">Filtre: Tümü ({tables.length})</option>
            <option value="active">Dolu Masalar ({tables.filter(t => t.status !== 'empty').length})</option>
            <option value="empty">Boş Masalar ({tables.filter(t => t.status === 'empty').length})</option>
            <option value="delayed">Gecikme Alarmları ({tables.filter(t => t.delayAlert).length})</option>
          </select>
        </div>
      </div>

      {/* Table Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
        {filteredTables.map((table) => {
          const isAlert = table.delayAlert;
          const isCleaning = table.status === 'cleaning';
          const isBill = table.status === 'bill_requested';
          const isServed = table.status === 'served';
          const isPreparing = table.status === 'preparing' || table.status === 'ordered';
          const isWaitingMenu = table.status === 'waiting_menu';
          const isEmpty = table.status === 'empty';
          const isBusy = !isEmpty;

          const cardTheme = isAlert
            ? 'bg-rose-500/[0.08] border-rose-500/50 shadow-[0_0_25px_rgba(244,63,94,0.25)]'
            : isCleaning
            ? 'bg-yellow-500/[0.07] border-yellow-500/40 border-dashed shadow-[0_0_15px_rgba(234,179,8,0.15)]'
            : isBill
            ? 'bg-purple-500/[0.08] border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.2)]'
            : isPreparing
            ? 'bg-orange-500/[0.06] border-orange-500/40'
            : isServed
            ? 'bg-blue-500/[0.06] border-blue-500/40'
            : isWaitingMenu
            ? 'bg-amber-500/[0.06] border-amber-500/40'
            : 'bg-zinc-950/40 border-emerald-500/20 opacity-70 hover:opacity-100 hover:border-emerald-500/40';

          return (
            <div
              key={table.id}
              onClick={() => onSelectTable(table)}
              className={`group relative p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[165px] ${cardTheme}`}
            >
              {/* Header: Name + Capacity */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-sm text-white group-hover:text-orange-400 transition-colors">
                      {table.name}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {table.section.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-zinc-400">
                    <Users className="w-3 h-3 text-zinc-500" />
                    <span>{table.capacity}</span>
                  </div>
                </div>

                {/* Status Pill */}
                <div className="mb-2">
                  {getStatusBadge(table.status, table.delayAlert)}
                </div>

                {/* Busy Info: Item count & Waiter */}
                {isBusy && !isCleaning && (
                  <div className="space-y-1 text-[11px] text-zinc-400 mt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Ürün Adedi:</span>
                      <span className="text-zinc-300 font-medium">
                        {table.items.reduce((s, i) => s + i.quantity, 0)} Adet
                      </span>
                    </div>
                    {table.durationMinutes > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-zinc-500" />
                          Süre:
                        </span>
                        <span className={`font-mono ${table.durationMinutes > 30 ? 'text-amber-400' : 'text-zinc-300'}`}>
                          {table.durationMinutes} dk
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Cleaning Notice */}
                {isCleaning && (
                  <div className="mt-2 p-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-[10px] space-y-0.5">
                    <p className="font-bold">Masa Boşaldı</p>
                    <p className="text-zinc-400">Yeni misafir almadan önce dezenfekte edilmeli.</p>
                  </div>
                )}
              </div>

              {/* Bottom: Total Price or Empty prompt */}
              <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between">
                {isCleaning ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onResolveCleaning(table.id);
                    }}
                    className="w-full py-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-zinc-950 font-black text-[11px] flex items-center justify-center gap-1.5 shadow-sm transition-transform active:scale-95"
                  >
                    <span>🧹 Temizlendi İşaretle</span>
                  </button>
                ) : isBusy ? (
                  <>
                    <div className="flex flex-col">
                      <span className="text-[9px] text-zinc-500 uppercase font-mono">Tutar:</span>
                      <span className="text-xs font-black text-orange-400 font-mono">
                        {formatCurrency(table.totalAmount)}
                      </span>
                    </div>

                    {table.status === 'bill_requested' && onDirectQuickPay ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDirectQuickPay(table);
                        }}
                        className="py-1 px-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-[10px] flex items-center gap-1 shadow-sm transition-transform active:scale-95"
                        title="Masaya gitmeden tek tıkla hesabı kapat"
                      >
                        <span>⚡ Kapat</span>
                      </button>
                    ) : (
                      <span className="text-[10px] text-zinc-400 group-hover:text-orange-400 transition-colors">
                        Detay →
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[10px] text-emerald-400/80 font-medium flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-400" /> Misafire Hazır
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
