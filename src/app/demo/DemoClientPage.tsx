'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Sparkles, 
  RefreshCw, 
  Camera, 
  PlusCircle, 
  Database, 
  CheckCircle2, 
  Layers, 
  ShieldCheck,
  Radio,
  ExternalLink,
  Store,
  Smartphone
} from 'lucide-react';
import { MasaLink3DLogo } from '@/components/MasaLink3DLogo';
import { InteractiveSimulator } from '@/components/InteractiveSimulator';
import { OnboardingModal } from '@/components/OnboardingModal';
import { LegalModal, LegalDocType } from '@/components/LegalModal';
import { 
  getStoredDemoState, 
  saveStoredDemoState, 
  resetStoredDemoState 
} from '@/utils/demoStorage';
import { SimulationOrder } from '@/data/mockData';

export default function DemoClientPage() {
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocType | null>(null);
  const [demoNotification, setDemoNotification] = useState<string | null>(null);

  const notify = (msg: string) => {
    setDemoNotification(msg);
    setTimeout(() => setDemoNotification(null), 3500);
  };

  const handleInjectQuickOrder = () => {
    const state = getStoredDemoState();
    const tableId = `Masa ${Math.floor(10 + Math.random() * 15)}`;
    const randomItems = [
      { name: 'Truffle Burger', quantity: 2, price: 590, notes: 'Az pişmiş' },
      { name: 'San Pellegrino & Ev Yapımı Limonata', quantity: 2, price: 170, notes: 'Bol buz' },
    ];
    const total = 760;

    const newOrder: SimulationOrder = {
      id: `ORD-${Math.floor(100 + Math.random() * 900)}`,
      tableNumber: tableId,
      items: randomItems,
      totalPrice: total,
      status: 'bekliyor',
      station: 'Izgara & Sıcak',
      orderTime: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      elapsedSeconds: 0,
    };

    saveStoredDemoState({
      orders: [newOrder, ...state.orders],
      totalRevenue: state.totalRevenue + total,
    });
    notify(`⚡ Hızlı Test: ${tableId} için ₺${total} tutarında sipariş enjekte edildi!`);
  };

  const handleInjectVisionAlarm = () => {
    const state = getStoredDemoState();
    const tableId = `Masa 0${Math.floor(1 + Math.random() * 9)}`;
    const newAlert = {
      id: `va-demo-${Date.now()}`,
      tableNumber: tableId,
      type: 'waiting_delay' as const,
      title: 'Vision AI: Test Bekleme Alarmı',
      message: `${tableId} masasında oturan müşteri 02:45 dakikadır garson bekliyor!`,
      time: 'Şimdi',
      severity: 'warning' as const,
      actionLabel: 'Garson Yönlendir',
      camId: 'CAM-02 (Teras)',
      handled: false,
    };

    saveStoredDemoState({
      visionAlerts: [newAlert, ...state.visionAlerts],
    });
    notify(`📷 Vision AI Test: ${tableId} için bekleme alarmı fırlatıldı!`);
  };

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 flex flex-col justify-between selection:bg-orange-500 selection:text-white">
      {/* Top Demo Global Header */}
      <header className="sticky top-0 z-40 bg-[#0a0a0e]/90 backdrop-blur-xl border-b border-white/[0.08] px-4 sm:px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          
          {/* Logo & Breadcrumb */}
          <div className="flex items-center gap-3">
            <Link href="/" className="hover:opacity-90 transition-opacity">
              <MasaLink3DLogo size="sm" badge="Demo Modu" />
            </Link>
            <div className="hidden md:flex items-center gap-2 text-xs font-mono text-zinc-400 pl-3 border-l border-white/[0.08]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Oturum Arabelleği (localStorage)</span>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-2">
            <Link
              href="/pos"
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-bold text-amber-300 transition-all active:scale-95"
            >
              <Store className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kasa Terminali (/pos)</span>
              <span className="sm:hidden">POS</span>
            </Link>

            <Link
              href="/waiter"
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-all active:scale-95"
            >
              <Smartphone className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Garson Mobil</span>
            </Link>

            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-xs font-semibold text-zinc-300 hover:text-white transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Ana Sayfa</span>
            </Link>

            <button
              onClick={() => setIsOnboardingOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 text-white text-xs font-bold shadow-lg shadow-orange-500/20 hover:brightness-110 active:scale-95 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Restoranını Oluştur</span>
            </button>
          </div>

        </div>
      </header>

      {/* Demo Notification Toast */}
      {demoNotification && (
        <div className="fixed top-16 right-6 z-50 px-4 py-2.5 rounded-xl bg-zinc-900 border border-emerald-500/50 text-emerald-300 text-xs font-bold shadow-2xl flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{demoNotification}</span>
        </div>
      )}

      {/* Main Demo Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Quick Sandbox Action Ribbon */}
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/[0.08] flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Masalink Canlı Demo Laboratuvarı (/demo)
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
                  v2.4
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Verileriniz yerel oturum arabelleğinde tutulur. Sayfayı yenileseniz dahi adisyonlar ve ciro korunur.
              </p>
            </div>
          </div>

          {/* Sandbox Inject Buttons */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              onClick={handleInjectQuickOrder}
              className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-white/[0.08] transition-all active:scale-95"
            >
              <PlusCircle className="w-3.5 h-3.5 text-orange-400" />
              <span>+ Test Siparişi Ekle</span>
            </button>

            <button
              onClick={handleInjectVisionAlarm}
              className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-xs font-semibold text-emerald-400 border border-emerald-500/30 transition-all active:scale-95"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>+ Vision AI Alarmı Fırlat</span>
            </button>
          </div>
        </div>

        {/* The Interactive Simulator in Standalone Mode */}
        <InteractiveSimulator isStandalone={true} />

        {/* Technical Persistence Note Card */}
        <div className="p-4 rounded-2xl bg-[#0c0c12] border border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-400">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Bu ortamda oluşturduğunuz masalar ve ciro kayıtları doğrudan tarayıcınızın <code className="text-zinc-200 bg-zinc-900 px-1 py-0.5 rounded">localStorage</code> alanında depolanır.
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/" className="text-orange-400 hover:underline flex items-center gap-1 font-semibold">
              <span>Landing Sayfasını Gör</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.08] py-6 px-4 text-center text-xs text-zinc-500">
        MasaLink Multi-Tenant SaaS Demo Ortamı • Sıfır Komisyon & Vision AI Ekosistemi
      </footer>

      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        initialPlan="pro"
        onOpenLegal={(doc) => setLegalDoc(doc)}
      />

      {/* Legal & Compliance Modal */}
      <LegalModal
        isOpen={legalDoc !== null}
        onClose={() => setLegalDoc(null)}
        initialDoc={legalDoc || 'distance_sales'}
      />
    </div>
  );
}
