'use client';

import React, { useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { Hero } from '@/components/Hero';
import { BentoGridFeatures } from '@/components/BentoGridFeatures';
import { InteractiveSimulator } from '@/components/InteractiveSimulator';
import { RoiCalculator } from '@/components/RoiCalculator';
import { ComparisonTable } from '@/components/ComparisonTable';
import { TechArchitecture } from '@/components/TechArchitecture';
import { PricingSection } from '@/components/PricingSection';
import { FaqSection } from '@/components/FaqSection';
import { OnboardingModal } from '@/components/OnboardingModal';
import { LegalModal, LegalDocType } from '@/components/LegalModal';
import { Footer } from '@/components/Footer';
import { MasaLink3DLogo } from '@/components/MasaLink3DLogo';
import { X, Lock, CheckCircle2, ArrowRight } from 'lucide-react';
import { setStoredAuthUser, DEMO_ADMIN_USER } from '@/utils/auth';

export default function Home() {
  const [onboardingOpen, setOnboardingOpen] = useState<boolean>(false);
  const [selectedPlan, setSelectedPlan] = useState<string>('pro');
  const [loginDemoOpen, setLoginDemoOpen] = useState<boolean>(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocType | null>(null);

  const handleOpenOnboarding = (planId: string = 'pro') => {
    setSelectedPlan(planId);
    setOnboardingOpen(true);
  };

  const handleOpenLegal = (doc: LegalDocType) => {
    setLegalDoc(doc);
  };

  return (
    <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-[#09090b] text-zinc-100 flex flex-col selection:bg-orange-500/30 selection:text-orange-200">
      {/* Navigation */}
      <Navbar
        onOpenOnboarding={handleOpenOnboarding}
        onOpenLoginDemo={() => setLoginDemoOpen(true)}
      />

      {/* Hero Section */}
      <Hero onOpenOnboarding={() => handleOpenOnboarding('pro')} />

      {/* Bento Grid Feature Showcase */}
      <BentoGridFeatures />

      {/* Interactive Role Simulator Playground */}
      <InteractiveSimulator />

      {/* ROI & Profitability Savings Calculator */}
      <RoiCalculator onOpenOnboarding={() => handleOpenOnboarding('pro')} />

      {/* Market Comparison Table */}
      <ComparisonTable />

      {/* Cloud Architecture & Multi-Tenant Specs */}
      <TechArchitecture />

      {/* Dynamic Pricing & Packages */}
      <PricingSection onSelectPlan={handleOpenOnboarding} />

      {/* Frequently Asked Questions */}
      <FaqSection />

      {/* Final Call to Action Strip */}
      <section className="py-20 relative overflow-hidden bg-gradient-to-b from-[#09090b] to-[#121218] border-t border-white/[0.08]">
        <div className="absolute inset-0 bg-dot-pattern opacity-30 pointer-events-none" />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10 flex flex-col items-center">
          <div className="mb-4">
            <MasaLink3DLogo size="lg" badge="3D Cloud POS" withGlow={true} />
          </div>
          <span className="text-xs uppercase font-extrabold tracking-widest text-orange-400 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 inline-block mb-4">
            Sıfır Risk • 14 Gün Ücretsiz
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight leading-tight">
            Restoranınızı geleceğin bulut hızına taşımaya hazır mısınız?
          </h2>
          <p className="mt-4 text-base sm:text-lg text-zinc-300 max-w-2xl mx-auto">
            Kurulum ücreti yok, donanım mecburiyeti yok. 1 saat içinde tüm menünüzü canlıya alın.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => handleOpenOnboarding('pro')}
              className="w-full sm:w-auto px-8 py-4 rounded-xl text-sm sm:text-base font-bold text-white bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 shadow-xl shadow-orange-500/30 flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <span>Hemen Ücretsiz Başla</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="#simulator"
              className="w-full sm:w-auto px-7 py-4 rounded-xl text-sm sm:text-base font-semibold text-zinc-300 bg-zinc-900 border border-white/[0.08] hover:bg-zinc-800 transition-colors"
            >
              Simülatörü Tekrar İncele
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer onOpenLegal={handleOpenLegal} />

      {/* Onboarding Interactive Modal */}
      <OnboardingModal
        isOpen={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
        initialPlan={selectedPlan}
        onOpenLegal={handleOpenLegal}
      />

      {/* Legal & Compliance Modal */}
      <LegalModal
        isOpen={legalDoc !== null}
        onClose={() => setLegalDoc(null)}
        initialDoc={legalDoc || 'distance_sales'}
      />

      {/* Login Demo Dialog */}
      {loginDemoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-md rounded-3xl bg-[#121217] border border-white/[0.1] shadow-2xl p-6 sm:p-7 text-zinc-100">
            <button
              onClick={() => setLoginDemoOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-xl text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center justify-between mb-4 pr-8">
              <MasaLink3DLogo size="sm" badge="Yönetici Girişi" />
            </div>

            <h3 className="text-xl font-black text-white">
              Restoran Yönetici Girişi
            </h3>
            <p className="text-xs text-zinc-400 mt-1 mb-5">
              Masalink şube veya kasa panelinize erişmek için kimlik bilgilerinizi girin.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  E-Posta Adresi
                </label>
                <input
                  type="email"
                  defaultValue="demo@masalink.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/[0.08] text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Şifre
                </label>
                <input
                  type="password"
                  defaultValue="••••••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/[0.08] text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="pt-2">
                <button
                  onClick={() => {
                    if (process.env.NODE_ENV !== 'production') {
                      setStoredAuthUser(DEMO_ADMIN_USER);
                      setLoginDemoOpen(false);
                      window.location.href = '/admin';
                    } else {
                      window.location.href = '/login';
                    }
                  }}
                  className="w-full py-3 rounded-xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-orange-500 to-amber-600 shadow-lg shadow-orange-500/25 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <span>Admin Paneline Giriş Yap</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[11px] text-center text-zinc-500 mt-2">
                Henüz Masalink kullanıcısı değil misiniz?{' '}
                <button
                  onClick={() => {
                    setLoginDemoOpen(false);
                    handleOpenOnboarding('pro');
                  }}
                  className="text-orange-400 font-bold hover:underline"
                >
                  Ücretsiz Kayıt Olun
                </button>
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
