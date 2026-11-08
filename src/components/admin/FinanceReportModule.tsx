'use client';

import React, { useState } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Download, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight, 
  Flame, 
  Clock, 
  Receipt, 
  FileSpreadsheet, 
  FileText,
  PieChart,
  CheckCircle2
} from 'lucide-react';
import { formatCurrency } from '@/utils/helpers';

export const FinanceReportModule: React.FC = () => {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Financial figures mock based on selected period
  const dataMap = {
    today: {
      grossRevenue: 28450,
      ingredientCost: 9104, // ~32%
      laborCost: 4500, // staff for the day
      saasFee: 140, // Masalink amortized daily
      netProfit: 14706,
      netMargin: 51.7,
      totalOrders: 94,
      avgTicket: 302.6,
      turnoverMinutes: 34,
      turnoverDelta: '-4 dk hızlandı',
    },
    week: {
      grossRevenue: 184200,
      ingredientCost: 58944,
      laborCost: 31500,
      saasFee: 980,
      netProfit: 92776,
      netMargin: 50.4,
      totalOrders: 612,
      avgTicket: 300.9,
      turnoverMinutes: 36,
      turnoverDelta: '-2 dk hızlandı',
    },
    month: {
      grossRevenue: 745000,
      ingredientCost: 238400,
      laborCost: 135000,
      saasFee: 4200,
      netProfit: 367400,
      netMargin: 49.3,
      totalOrders: 2480,
      avgTicket: 300.4,
      turnoverMinutes: 35,
      turnoverDelta: '-5 dk hızlandı',
    },
  };

  const current = dataMap[period];

  // Hourly density mock for heatmap (12:00 to 23:00)
  const hourlyHeatmap = [
    { hour: '12:00', orders: 12, turnover: 3650, intensity: 60 },
    { hour: '13:00', orders: 19, turnover: 5800, intensity: 95 },
    { hour: '14:00', orders: 15, turnover: 4500, intensity: 75 },
    { hour: '15:00', orders: 6, turnover: 1800, intensity: 30 },
    { hour: '16:00', orders: 5, turnover: 1500, intensity: 25 },
    { hour: '17:00', orders: 8, turnover: 2400, intensity: 40 },
    { hour: '18:00', orders: 14, turnover: 4200, intensity: 70 },
    { hour: '19:00', orders: 22, turnover: 6700, intensity: 100 },
    { hour: '20:00', orders: 20, turnover: 6100, intensity: 92 },
    { hour: '21:00', orders: 16, turnover: 4800, intensity: 78 },
    { hour: '22:00', orders: 9, turnover: 2700, intensity: 45 },
    { hour: '23:00', orders: 3, turnover: 900, intensity: 15 },
  ];

  const handleExport = (type: 'csv' | 'pdf') => {
    const filename = `masalink_bilanco_${period}_${new Date().toISOString().slice(0, 10)}.${type}`;
    setExportNotice(`${filename} başarıyla üretildi ve indirildi.`);
    setTimeout(() => {
      setExportNotice(null);
    }, 4000);
  };

  return (
    <div className="space-y-6">
      {/* Header & Period Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-orange-400" />
            Finans, Maliyet & Gerçek Kârlılık Raporu
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Brüt cirodan reçete hammadde maliyeti ve personel gideri düşülerek hesaplanan net kâr.
          </p>
        </div>

        {/* Period Pills + Export */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-900/80 border border-white/[0.06]">
            {[
              { id: 'today', label: 'Bugün' },
              { id: 'week', label: 'Bu Hafta' },
              { id: 'month', label: 'Bu Ay' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  period === p.id
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleExport('csv')}
              className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-white/[0.08] hover:bg-white/[0.08] text-xs font-semibold text-zinc-300 flex items-center gap-1.5 transition-colors"
              title="Excel Bilanço İndir"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              Excel (CSV)
            </button>
            <button
              onClick={() => handleExport('pdf')}
              className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-white/[0.08] hover:bg-white/[0.08] text-xs font-semibold text-zinc-300 flex items-center gap-1.5 transition-colors"
              title="Resmi PDF Bilanço"
            >
              <FileText className="w-3.5 h-3.5 text-rose-400" />
              PDF Bilanço
            </button>
          </div>
        </div>
      </div>

      {/* Export Notification */}
      {exportNotice && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between animate-fadeIn">
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            {exportNotice}
          </span>
          <button onClick={() => setExportNotice(null)} className="underline text-[11px]">Kapat</button>
        </div>
      )}

      {/* KPI Cards (True Profitability Engine) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Gross Turnover */}
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/[0.08] relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span>Toplam Brüt Ciro</span>
            <span className="p-1 rounded-lg bg-orange-500/10 text-orange-400">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-white font-mono mt-1">
            {formatCurrency(current.grossRevenue)}
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-emerald-400">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>+{period === 'today' ? '18.4%' : '24.2%'} geçen döneme göre</span>
          </div>
        </div>

        {/* 2. Reçete Hammadde Maliyeti */}
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/[0.08]">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span>Hammadde Gideri (Reçete)</span>
            <span className="text-[10px] text-zinc-400 font-mono">
              %{Math.round((current.ingredientCost / current.grossRevenue) * 100)} Ciroya Oran
            </span>
          </div>
          <div className="text-2xl font-black text-zinc-300 font-mono mt-1">
            -{formatCurrency(current.ingredientCost)}
          </div>
          <p className="mt-2 text-[10px] text-zinc-500">
            Gramajlı reçete düşümünden otomatik hesaplandı
          </p>
        </div>

        {/* 3. Personel + SaaS */}
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/[0.08]">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span>Personel & Operasyon</span>
            <span className="text-[10px] text-zinc-400 font-mono">
              %{Math.round((current.laborCost / current.grossRevenue) * 100)} Ciroya Oran
            </span>
          </div>
          <div className="text-2xl font-black text-zinc-300 font-mono mt-1">
            -{formatCurrency(current.laborCost + current.saasFee)}
          </div>
          <p className="mt-2 text-[10px] text-zinc-500">
            Personel: {formatCurrency(current.laborCost)} • MasaLink: {formatCurrency(current.saasFee)}
          </p>
        </div>

        {/* 4. NET PROFIT (HERO) */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/60 via-zinc-900/90 to-zinc-900/90 border border-emerald-500/40 relative shadow-[0_0_30px_rgba(16,185,129,0.15)]">
          <div className="flex items-center justify-between text-xs text-emerald-400 mb-1">
            <span className="font-bold uppercase tracking-wider">GERÇEK NET KÂR</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
              %{current.netMargin} Marj
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
            {formatCurrency(current.netProfit)}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-emerald-300/80">
            <span>{current.totalOrders} Tamamlanan Masa</span>
            <span>Sepet: {formatCurrency(current.avgTicket)}</span>
          </div>
        </div>
      </div>

      {/* Hourly Density Heatmap (12:00 to 23:00) */}
      <div className="p-5 rounded-2xl bg-zinc-900/80 border border-white/[0.08] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-400" />
              Saatlik Yoğunluk Isı Haritası (Heatmap)
            </h4>
            <p className="text-xs text-zinc-400 mt-0.5">
              Mutfak ve salonun en yoğun olduğu saatler ve anlık ciro dağılımı.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <Clock className="w-3.5 h-3.5 text-orange-400" />
              <span>Ortalama Masa Devri:</span>
              <strong className="text-white font-mono">{current.turnoverMinutes} Dakika</strong>
              <span className="text-emerald-400 text-[10px]">({current.turnoverDelta})</span>
            </div>
          </div>
        </div>

        {/* Heatmap Bar Chart */}
        <div className="grid grid-cols-12 gap-1.5 pt-4 items-end h-48 border-b border-white/[0.06] pb-2">
          {hourlyHeatmap.map((item, idx) => (
            <div key={idx} className="flex flex-col items-center h-full justify-end group relative">
              {/* Tooltip on hover */}
              <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-black/90 border border-white/[0.1] px-2 py-1 rounded-lg text-[10px] text-zinc-200 pointer-events-none whitespace-nowrap z-20 shadow-xl">
                <div>{item.hour}: <strong>{formatCurrency(item.turnover)}</strong></div>
                <div className="text-zinc-400">{item.orders} Masa Siparişi</div>
              </div>

              {/* Bar */}
              <div
                className={`w-full rounded-t-lg transition-all duration-300 ${
                  item.intensity >= 90
                    ? 'bg-gradient-to-t from-orange-600 to-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                    : item.intensity >= 60
                    ? 'bg-gradient-to-t from-amber-600 to-orange-500'
                    : item.intensity >= 30
                    ? 'bg-gradient-to-t from-zinc-700 to-amber-600'
                    : 'bg-zinc-800'
                }`}
                style={{ height: `${item.intensity}%` }}
              />

              <span className="text-[10px] text-zinc-500 font-mono mt-2 group-hover:text-zinc-300 transition-colors">
                {item.hour}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
          <span>Yoğunluk Ölçeği: 0% (Sakin) → 100% (Pik Saat - 19:00 / 20:00)</span>
          <span className="text-orange-400 font-medium">Vision AI Kamera Doluluk Verisiyle Eşzamanlı</span>
        </div>
      </div>
    </div>
  );
};
