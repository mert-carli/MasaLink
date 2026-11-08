'use client';

import React, { useState, useMemo } from 'react';
import { 
  Calculator, 
  TrendingUp, 
  Users, 
  Clock, 
  Coins, 
  Sparkles, 
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Camera,
  Eye
} from 'lucide-react';
import { formatCurrency } from '@/utils/helpers';

interface RoiCalculatorProps {
  onOpenOnboarding: () => void;
}

export const RoiCalculator: React.FC<RoiCalculatorProps> = ({ onOpenOnboarding }) => {
  // Sliders state
  const [dailyTables, setDailyTables] = useState<number>(45);
  const [avgTicket, setAvgTicket] = useState<number>(650);
  const [waiterCount, setWaiterCount] = useState<number>(5);

  // Calculations
  const results = useMemo(() => {
    // 1. Ek Ciro: Masa devir hızı %18 artar -> günde %18 daha fazla masa oturur
    const monthlyTables = dailyTables * 30;
    const extraTablesPerMonth = monthlyTables * 0.18;
    const monthlyExtraRevenue = extraTablesPerMonth * avgTicket;

    // 2. Vision AI: Masada unutulan/bekletilen müşteri kaybı engelleme (+1.5 masa devri/gün)
    const visionRecoveredTables = dailyTables * 1.5 * 30;
    const monthlyVisionAiGain = visionRecoveredTables * (avgTicket * 0.08);

    // 3. Garson iş gücü verimliliği: Ortalama bir garsonun tam maliyeti ₺34.000/ay
    // Masalink QR + Vision AI ile sipariş ve servis hızı %35 artar.
    const waiterCost = 34000;
    const monthlyLaborSavings = waiterCount * waiterCost * 0.28;

    // 4. Kaçak & Stok Tasarrufu: Adisyon kaçakları ve hammadde firesi önleme (Cironun %3.5'i)
    const baseMonthlyTurnover = monthlyTables * avgTicket;
    const monthlyStockSavings = baseMonthlyTurnover * 0.035;

    // Toplam Aylık Kârlılık ve Verimlilik Artışı
    const totalMonthlyGain = monthlyExtraRevenue + monthlyVisionAiGain + monthlyLaborSavings + monthlyStockSavings;

    // Masalink Pro Aylık Maliyeti: ₺2.890
    const masalinkCost = 2890;
    const roiMultiplier = Math.round((totalMonthlyGain / masalinkCost) * 10) / 10;

    return {
      monthlyExtraRevenue,
      monthlyVisionAiGain,
      monthlyLaborSavings,
      monthlyStockSavings,
      totalMonthlyGain,
      roiMultiplier,
      baseMonthlyTurnover,
    };
  }, [dailyTables, avgTicket, waiterCount]);

  return (
    <section id="roi-hesaplayici" className="py-20 md:py-28 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-semibold mb-4">
            <Calculator className="w-3.5 h-3.5" />
            <span>Kârlılık ve Verimlilik Simülasyonu</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white">
            Masalink ile{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-300 to-orange-500">
              ne kadar tasarruf
            </span> edersiniz?
          </h2>
          <p className="mt-4 text-base sm:text-lg text-zinc-300">
            Kendi işletme verilerinizi girerek masa devir hızlanması, garson verimliliği ve gramaj reçete kaçak önleme kazancınızı hesaplayın.
          </p>
        </div>

        {/* Calculator Body */}
        <div className="max-w-5xl mx-auto rounded-3xl bg-[#111116] border border-white/[0.08] p-6 sm:p-10 shadow-2xl relative overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            
            {/* Left: Input Sliders (Col-span 7) */}
            <div className="lg:col-span-7 space-y-7">
              
              {/* Slider 1: Günlük Masa Sayısı */}
              <div className="bg-zinc-900/60 p-4 sm:p-5 rounded-2xl border border-white/[0.05]">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-orange-400" />
                    Günlük Hizmet Verilen Masa Sayısı:
                  </label>
                  <span className="text-base sm:text-lg font-black text-orange-400 font-mono">
                    {dailyTables} Masa / Gün
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="200"
                  step="5"
                  value={dailyTables}
                  onChange={(e) => setDailyTables(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
                <div className="flex justify-between text-[11px] text-zinc-500 mt-2 font-mono">
                  <span>10 Masa (Butik)</span>
                  <span>100 Masa (Büyük)</span>
                  <span>200 Masa (Çok Yoğun)</span>
                </div>
              </div>

              {/* Slider 2: Ortalama Masa Hesabı (TL) */}
              <div className="bg-zinc-900/60 p-4 sm:p-5 rounded-2xl border border-white/[0.05]">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    Ortalama Masa Hesabı (Adisyon Tutarı):
                  </label>
                  <span className="text-base sm:text-lg font-black text-amber-400 font-mono">
                    {formatCurrency(avgTicket)}
                  </span>
                </div>
                <input
                  type="range"
                  min="150"
                  max="2500"
                  step="25"
                  value={avgTicket}
                  onChange={(e) => setAvgTicket(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <div className="flex justify-between text-[11px] text-zinc-500 mt-2 font-mono">
                  <span>₺150 (Kafe / Tatlı)</span>
                  <span>₺650 (Bistro)</span>
                  <span>₺2.500 (Fine Dining)</span>
                </div>
              </div>

              {/* Slider 3: Çalışan Garson Sayısı */}
              <div className="bg-zinc-900/60 p-4 sm:p-5 rounded-2xl border border-white/[0.05]">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Çalışan Garson / Servis Personeli:
                  </label>
                  <span className="text-base sm:text-lg font-black text-emerald-400 font-mono">
                    {waiterCount} Personel
                  </span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="20"
                  step="1"
                  value={waiterCount}
                  onChange={(e) => setWaiterCount(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-[11px] text-zinc-500 mt-2 font-mono">
                  <span>2 Personel</span>
                  <span>10 Personel</span>
                  <span>20 Personel</span>
                </div>
              </div>

            </div>

            {/* Right: Calculated Value Output Card (Col-span 5) */}
            <div className="lg:col-span-5 rounded-2xl bg-gradient-to-b from-[#181822] to-[#121217] border border-orange-500/30 p-6 sm:p-7 shadow-2xl relative">
              <div className="absolute top-0 right-0 -mr-12 -mt-12 w-48 h-48 bg-orange-500/15 rounded-full blur-2xl pointer-events-none" />

              <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
                <span className="text-xs font-bold uppercase tracking-wider text-orange-400">
                  Tahmini Aylık Net Katkı
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
                  {results.roiMultiplier}x ROI
                </span>
              </div>

              {/* Big Grand Total */}
              <div className="py-4">
                <div className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                  {formatCurrency(results.totalMonthlyGain)}
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  Masalink ile her ay işletmenizin cebinde kalan ek değer
                </p>
              </div>

              {/* Breakdown Details with Vision AI */}
              <div className="space-y-3 pt-3 border-t border-white/[0.08] text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-orange-400" />
                    Hızlı Masa Devri (+%18 Ciro):
                  </span>
                  <span className="font-bold text-white font-mono">
                    +{formatCurrency(results.monthlyExtraRevenue)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-emerald-300 font-semibold flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-emerald-400" />
                    Vision AI Bekletilen Müşteri Kurtarma (+1.5 Devir/Gün):
                  </span>
                  <span className="font-bold text-emerald-400 font-mono">
                    +{formatCurrency(results.monthlyVisionAiGain)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-emerald-400" />
                    Garson Servis Hızında %35 Artış:
                  </span>
                  <span className="font-bold text-white font-mono">
                    +{formatCurrency(results.monthlyLaborSavings)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    Adisyon Kaçak & Reçete Koruma:
                  </span>
                  <span className="font-bold text-white font-mono">
                    +{formatCurrency(results.monthlyStockSavings)}
                  </span>
                </div>
              </div>

              {/* Package Comparison Pill */}
              <div className="mt-5 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-medium">Masalink Pro Maliyeti:</span>
                <span className="font-mono font-bold text-orange-400">₺2.890 / ay</span>
              </div>

              {/* CTA button */}
              <button
                onClick={onOpenOnboarding}
                className="mt-5 w-full py-3.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 shadow-xl shadow-orange-500/25 flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                Bu Kârlılıkla 14 Gün Başla
                <ArrowRight className="w-4 h-4" />
              </button>

            </div>

          </div>
        </div>

      </div>
    </section>
  );
};
