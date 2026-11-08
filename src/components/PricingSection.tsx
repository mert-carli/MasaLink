'use client';

import React, { useState } from 'react';
import { 
  Check, 
  X, 
  Sparkles, 
  ArrowRight, 
  CreditCard, 
  ShieldCheck, 
  HelpCircle,
  Zap
} from 'lucide-react';
import { PRICING_PLANS } from '@/data/mockData';
import { formatCurrency } from '@/utils/helpers';

interface PricingSectionProps {
  onSelectPlan: (planId: string) => void;
}

export const PricingSection: React.FC<PricingSectionProps> = ({ onSelectPlan }) => {
  const [isAnnual, setIsAnnual] = useState<boolean>(true);

  return (
    <section id="fiyatlandirma" className="py-20 md:py-28 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-semibold mb-4">
            <CreditCard className="w-3.5 h-3.5" />
            <span>Şeffaf & Sıfır Komisyon Politikası</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white">
            Restoranınızın ölçeğine uygun{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-300 to-orange-500">
              net fiyatlar
            </span>.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-zinc-300">
            Sürpriz donanım faturası yok. Cironuzdan tek kuruş komisyon kesilmez. 14 gün ücretsiz deneyin, dilediğiniz an iptal edin.
          </p>

          {/* Billing Switch (Monthly / Annual) */}
          <div className="mt-8 flex items-center justify-center gap-3">
            <span className={`text-xs sm:text-sm font-semibold transition-colors ${!isAnnual ? 'text-white' : 'text-zinc-400'}`}>
              Aylık Ödeme
            </span>

            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className="relative w-14 h-8 bg-zinc-800 rounded-full p-1 transition-colors border border-white/[0.1] focus:outline-none"
              aria-label="Ödeme periyodunu değiştir"
            >
              <div
                className={`w-6 h-6 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 shadow-md transform transition-transform ${
                  isAnnual ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>

            <div className="flex items-center gap-2">
              <span className={`text-xs sm:text-sm font-semibold transition-colors ${isAnnual ? 'text-white' : 'text-zinc-400'}`}>
                Yıllık Ödeme
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 animate-pulse">
                %20 İndirim + 2 Ay Hediye
              </span>
            </div>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
          {PRICING_PLANS.map((plan) => {
            const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
            const savings = (plan.monthlyPrice - plan.annualPrice) * 12;

            return (
              <div
                key={plan.id}
                className={`rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all relative ${
                  plan.popular
                    ? 'bg-gradient-to-b from-[#1c1c24] to-[#121217] border-2 border-orange-500/50 shadow-2xl shadow-orange-500/15 scale-[1.02]'
                    : 'bg-[#111116] border border-white/[0.08] hover:border-white/[0.15]'
                }`}
              >
                {/* Popular Badge */}
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[11px] font-black uppercase tracking-wider shadow-lg shadow-orange-500/30 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    En Popüler Seçim
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-black text-white">{plan.name}</h3>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-white/[0.05]">
                      {plan.badge}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-400 mb-6 min-h-[36px]">
                    {plan.description}
                  </p>

                  {/* Price */}
                  <div className="pb-6 border-b border-white/[0.06]">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl sm:text-4xl font-black text-white">
                        {formatCurrency(price)}
                      </span>
                      <span className="text-xs text-zinc-400 font-medium">/ ay</span>
                    </div>

                    <div className="mt-1 text-[11px] text-zinc-400 flex items-center justify-between">
                      <span>+ KDV • %0 Komisyon</span>
                      {isAnnual && (
                        <span className="text-emerald-400 font-semibold font-mono">
                          Yılda {formatCurrency(savings)} tasarruf
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Features List */}
                  <div className="py-6 space-y-3">
                    <div className="text-[11px] uppercase font-bold text-zinc-400 tracking-wider">
                      Dahil Olan Özellikler:
                    </div>
                    {plan.features.map((feat, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 text-xs text-zinc-300">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}

                    {plan.notIncluded && plan.notIncluded.length > 0 && (
                      <div className="pt-2 space-y-2 border-t border-white/[0.04]">
                        {plan.notIncluded.map((feat, idx) => (
                          <div key={idx} className="flex items-start gap-2.5 text-xs text-zinc-500">
                            <X className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
                            <span>{feat}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card CTA */}
                <div className="pt-4 border-t border-white/[0.06]">
                  <button
                    onClick={() => onSelectPlan(plan.id)}
                    className={`w-full py-3.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all active:scale-95 ${
                      plan.popular
                        ? 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-xl shadow-orange-500/25'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-white/[0.08]'
                    }`}
                  >
                    <span>
                      {plan.id === 'enterprise'
                        ? '14 Gün Ücretsiz Başla (Kurumsal)'
                        : '14 Gün Ücretsiz Başla (Kredi Kartı Gerekmez)'}
                    </span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>
                  <p className="text-[11px] text-center text-zinc-400 mt-2 font-medium">
                    ⚡ Kredi kartı istenmez • 3 adımda kurulum • Sıfır taahhüt
                  </p>
                </div>

              </div>
            );
          })}
        </div>

        {/* Secure payment & hardware guarantee badge */}
        <div className="mt-14 max-w-3xl mx-auto p-4 rounded-2xl bg-zinc-900/60 border border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">İyzico & Stripe 256-bit Güvenli Ödeme</div>
              <div className="text-[11px] text-zinc-400">Tüm Visa, MasterCard, Troy kartları desteklenir.</div>
            </div>
          </div>
          <div className="text-xs text-zinc-400">
            Özel kurumsal sözleşme için: <span className="text-orange-400 font-semibold cursor-pointer">kurumsal@masalink.com</span>
          </div>
        </div>

      </div>
    </section>
  );
};
