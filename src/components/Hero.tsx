'use client';

import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  ArrowRight, 
  QrCode, 
  ChefHat, 
  CreditCard, 
  Zap, 
  CheckCircle2, 
  Clock, 
  Layers, 
  TrendingUp, 
  ShieldCheck,
  Flame,
  Smartphone,
  Camera,
  Radio,
  Eye,
  Scan,
  Users,
  Activity,
  Award,
  ChevronRight
} from 'lucide-react';
import { MasaLink3DLogo } from '@/components/MasaLink3DLogo';
import { triggerConfetti } from '@/utils/helpers';

interface HeroProps {
  onOpenOnboarding: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onOpenOnboarding }) => {
  // Mode toggle: 'pipeline' (Sipariş Akışı) | 'vision' (Vision AI Kamera Radarı)
  const [heroMode, setHeroMode] = useState<'vision' | 'pipeline'>('vision');
  const [pipelineStep, setPipelineStep] = useState<number>(1);
  const [timerSeconds, setTimerSeconds] = useState<number>(165);
  const [visionPulse, setVisionPulse] = useState<boolean>(false);
  const [cctvSec, setCctvSec] = useState<number>(142);

  // Auto cycling pipeline steps for visual life
  useEffect(() => {
    const interval = setInterval(() => {
      setPipelineStep((prev) => (prev % 3) + 1);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Timer counter simulation
  useEffect(() => {
    const timer = setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
      setCctvSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleTriggerVisionScan = () => {
    setVisionPulse(true);
    triggerConfetti();
    setTimeout(() => {
      setVisionPulse(false);
    }, 1200);
  };

  return (
    <section className="relative pt-4 pb-20 md:pt-10 md:pb-28 overflow-hidden w-full max-w-full">
      {/* Background radial spotlights & subtle grid */}
      <div className="absolute inset-0 bg-grid-pattern opacity-50 pointer-events-none" />
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[850px] max-w-[100vw] h-[450px] bg-gradient-to-b from-orange-500/25 via-amber-500/15 to-transparent blur-[140px] pointer-events-none rounded-full overflow-hidden" />
      <div className="absolute top-1/4 -left-32 w-80 h-80 bg-emerald-600/15 blur-[120px] pointer-events-none rounded-full" />
      <div className="absolute top-1/3 -right-32 w-80 h-80 bg-orange-600/15 blur-[120px] pointer-events-none rounded-full" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
        
        {/* Top Cognitive Hook & Clean Status Pill */}
        <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
          
          {/* Live System Status Pill - Clean, Balanced, Unified */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-900/80 border border-white/[0.08] text-xs text-zinc-300 mb-6 shadow-lg shadow-black/40 backdrop-blur-md max-w-full">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <span className="font-semibold text-white">Canlı Ağ:</span>
            <span className="text-zinc-300">420+ Restoran</span>
            <span className="text-zinc-600">•</span>
            <span className="text-orange-400 font-semibold font-mono">₺184.500 Ciro</span>
            <span className="text-zinc-600 hidden xs:inline">•</span>
            <span className="text-emerald-400 font-mono hidden xs:inline">0.38s Gecikme</span>
          </div>

          {/* 3D Brand Emblem Showcase */}
          <div className="mb-4 transform hover:scale-105 transition-transform duration-300">
            <MasaLink3DLogo size="lg" withGlow={true} />
          </div>

          {/* High-Impact Psychological Headline */}
          <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-white leading-[1.1] sm:leading-[1.08] break-words">
            Masada müşteri bekletip <br />
            <span className="relative whitespace-normal sm:whitespace-nowrap">
              <span className="relative z-10 text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-300 to-orange-500">
                ciro kaybetmeye son.
              </span>
              <span className="absolute left-0 bottom-1 sm:bottom-1.5 w-full h-2.5 sm:h-3.5 bg-orange-500/20 -rotate-1 rounded-sm -z-0" />
            </span>
          </h1>

          {/* Persuasive Subtitle */}
          <p className="mt-6 text-base sm:text-lg md:text-xl text-zinc-300 max-w-2xl font-normal leading-relaxed">
            Pahalı dokunmatik POS cihazlarını ve komisyonları çöpe atın. <strong className="text-white">Mevcut güvenlik kameralarınızdan</strong> masa bekleme süresini algılayan <span className="text-emerald-400 font-semibold">Vision AI</span>, temassız QR sipariş ve anlık mutfak KDS ekranı tek ekosistemde.
          </p>

          {/* CTAs with Immediate Dopamine Reward */}
          <div className="mt-8 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <button
              onClick={onOpenOnboarding}
              className="w-full sm:w-auto relative group overflow-hidden inline-flex items-center justify-center gap-2.5 px-8 py-4 text-base font-extrabold text-white bg-gradient-to-r from-orange-500 via-orange-600 to-amber-600 rounded-xl shadow-2xl shadow-orange-500/30 hover:shadow-orange-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Sparkles className="w-4 h-4 text-amber-200 animate-spin" style={{ animationDuration: '6s' }} />
              <span>14 Gün Ücretsiz Başla</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 pointer-events-none" />
            </button>

            <a
              href="#simulator"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-4 text-base font-bold text-zinc-200 bg-zinc-900/90 hover:bg-zinc-800/90 border border-white/[0.12] rounded-xl hover:border-orange-500/40 transition-all shadow-xl"
            >
              <Eye className="w-4 h-4 text-emerald-400" />
              Canlı Simülasyonu Keşfet
            </a>
          </div>

          {/* Trust points */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-y-2 gap-x-6 text-xs text-zinc-400 font-medium">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Kredi kartı gerekmez</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>1 Saatte menü kurulumu</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>%0 Komisyon Garantisi</span>
            </div>
          </div>
        </div>

        {/* INTERACTIVE 3D HERO COMMAND COCKPIT MOCKUP */}
        <div className="mt-12 max-w-5xl mx-auto">
          <div className="relative rounded-3xl p-[1px] bg-gradient-to-b from-orange-500/40 via-emerald-500/20 to-white/[0.06] shadow-2xl shadow-orange-950/30">
            <div className="rounded-[23px] bg-[#0c0c11]/95 backdrop-blur-2xl p-4 sm:p-7 border border-white/[0.06]">
              
              {/* Cockpit Mode Toggle Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-5 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <MasaLink3DLogo size="sm" showText={false} />
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      MasaLink Komuta Merkezi
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                        Canlı Simülasyon
                      </span>
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Aşağıdaki sekmelerle Vision AI kamera radarını veya anlık sipariş akışını canlı test edin
                    </p>
                  </div>
                </div>

                {/* Dual Mode Switcher Pill */}
                <div className="flex items-center gap-1 bg-zinc-900/90 p-1 rounded-xl border border-white/[0.08] self-stretch sm:self-auto">
                  <button
                    onClick={() => setHeroMode('vision')}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      heroMode === 'vision'
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>👁️ Vision AI Radarı</span>
                  </button>

                  <button
                    onClick={() => setHeroMode('pipeline')}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      heroMode === 'pipeline'
                        ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/20'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>🔥 Canlı Sipariş Akışı</span>
                  </button>
                </div>
              </div>

              {/* MODE A: VISION AI CAMERA VIEW (Hypnotic & Visually Stunning) */}
              {heroMode === 'vision' && (
                <div className="mt-5 space-y-4">
                  {/* CCTV Viewport with Responsive Aspect & Min-Height */}
                  <div className="relative min-h-[280px] sm:min-h-[220px] aspect-auto sm:aspect-[21/9] rounded-2xl bg-[#08080c] border border-emerald-500/30 overflow-hidden p-3 sm:p-4 flex flex-col justify-between shadow-inner">
                    {/* Background Grid & Scanline Effect */}
                    <div className="absolute inset-0 bg-grid-pattern opacity-30 pointer-events-none" />
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent pointer-events-none animate-scanline" />

                    {/* Camera Overlay Bar */}
                    <div className="flex items-center justify-between text-xs relative z-10">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                        <span className="font-mono text-zinc-200 font-bold tracking-wider text-[11px] sm:text-xs truncate">
                          CAM-02 (Salon Doğu) • RTSP
                        </span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[10px] sm:text-[11px] shrink-0">
                        <span className="px-1.5 sm:px-2 py-0.5 rounded bg-zinc-800 text-emerald-400 font-bold">30 FPS</span>
                        <span className="hidden sm:inline text-zinc-400">YOLO-v9 Neural Edge</span>
                      </div>
                    </div>

                    {/* Interactive Bounding Boxes Overlay */}
                    <div className="relative w-full h-full my-2 min-h-[160px]">
                      {/* Box 1: Masa 04 (Gecikme Alarmı) */}
                      <div className="absolute top-1 left-1 sm:left-4 w-[140px] sm:w-56 max-w-[calc(100%-16px)] rounded-xl border-2 border-amber-400 bg-amber-500/15 p-2 sm:p-2.5 shadow-xl shadow-amber-950/40 backdrop-blur-xs">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[9px] sm:text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-amber-400 text-black">
                            [MASA 04]
                          </span>
                          <span className="text-[9px] sm:text-[10px] font-mono text-amber-300 bg-black/60 px-1 rounded">
                            3 Kişi
                          </span>
                        </div>
                        <div className="text-[10px] sm:text-[11px] font-bold text-white flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>Bekleme: {formatTimer(cctvSec)}</span>
                        </div>
                        <div className="mt-1 text-[9px] sm:text-[10px] text-amber-200 font-bold bg-amber-950/90 px-1 py-0.5 rounded border border-amber-500/50 animate-pulse truncate">
                          ⚠️ Garson Uğramadı Alarmı!
                        </div>
                      </div>

                      {/* Box 2: Masa 08 (Boşaldı) */}
                      <div className="absolute bottom-1 right-1 sm:right-4 w-[135px] sm:w-52 max-w-[calc(100%-16px)] rounded-xl border-2 border-cyan-400 bg-cyan-500/15 p-2 sm:p-2.5 shadow-xl shadow-cyan-950/40">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[9px] sm:text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-cyan-400 text-black">
                            [MASA 08: BOŞALDI]
                          </span>
                        </div>
                        <div className="text-[9px] sm:text-[10px] font-semibold text-cyan-200 truncate">
                          Hesap Ödendi • Kalktı
                        </div>
                        <div className="mt-1 text-[9px] sm:text-[10px] text-cyan-300 font-mono bg-black/70 px-1 py-0.5 rounded truncate">
                          🧹 Komi Çağrıldı (00:45)
                        </div>
                      </div>

                      {/* Center Radar Scanner Reticle */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 sm:w-20 sm:h-20 rounded-full border border-dashed border-emerald-400/50 flex items-center justify-center animate-spin" style={{ animationDuration: '14s' }}>
                        <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-400 animate-ping" />
                      </div>
                    </div>

                    {/* Camera Bottom Action bar */}
                    <div className="flex items-center justify-between pt-2 border-t border-white/[0.08] relative z-10 text-xs">
                      <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Kamera görüntüsünden otomatik algılanır; garsonun hiçbir şey girmesine gerek kalmaz.</span>
                      </span>
                      <button
                        onClick={handleTriggerVisionScan}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          visionPulse
                            ? 'bg-emerald-500 text-white scale-105'
                            : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40'
                        }`}
                      >
                        <Scan className="w-3.5 h-3.5" />
                        Canlı Tarama Tetikle
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* MODE B: LIVE ORDER PIPELINE (Masa QR -> KDS -> Kasa) */}
              {heroMode === 'pipeline' && (
                <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4 relative">
                  {/* Step 1: Customer Mobile QR */}
                  <div
                    onClick={() => setPipelineStep(1)}
                    className={`cursor-pointer rounded-2xl p-4 transition-all relative ${
                      pipelineStep === 1
                        ? 'bg-orange-500/10 border-orange-500/50 shadow-lg shadow-orange-500/10'
                        : 'bg-zinc-900/50 border-white/[0.05] hover:bg-zinc-900/80'
                    } border`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
                        <QrCode className="w-4 h-4" />
                        1. Adım: Masa 04 (Müşteri)
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">T+0.0s</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="bg-zinc-950/60 p-2.5 rounded-lg border border-white/[0.04]">
                        <div className="flex justify-between font-semibold text-zinc-200">
                          <span>2x Smash Trüflü Burger</span>
                          <span className="text-orange-400">₺720</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">Orta Pişmiş • Karamelize Soğan</p>
                      </div>
                      <div className="bg-zinc-950/60 p-2.5 rounded-lg border border-white/[0.04]">
                        <div className="flex justify-between font-semibold text-zinc-200">
                          <span>2x Zencefilli Limonata</span>
                          <span className="text-orange-400">₺190</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">Bol Buzlu</p>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">Toplam Adisyon:</span>
                      <span className="font-bold text-white text-sm">₺910,00</span>
                    </div>
                  </div>

                  {/* Step 2: Kitchen KDS Display */}
                  <div
                    onClick={() => setPipelineStep(2)}
                    className={`cursor-pointer rounded-2xl p-4 transition-all relative ${
                      pipelineStep === 2
                        ? 'bg-amber-500/10 border-amber-500/50 shadow-lg shadow-amber-500/10'
                        : 'bg-zinc-900/50 border-white/[0.05] hover:bg-zinc-900/80'
                    } border`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <ChefHat className="w-4 h-4" />
                        2. Adım: Mutfak KDS
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">T+0.35s</span>
                    </div>

                    <div className="bg-zinc-950/60 p-3 rounded-lg border border-white/[0.04]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-white">İstasyon: Izgara & Sıcak</span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded">
                          <Clock className="w-3 h-3" />
                          {formatTimer(timerSeconds)}
                        </span>
                      </div>

                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-1.5 text-zinc-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          <span>Köfteler ızgarada mühürleniyor</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-zinc-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span>Limonatalar Bar'a iletildi</span>
                        </div>
                      </div>

                      <div className="mt-3 flex gap-1.5">
                        <button className="flex-1 py-1 text-[10px] font-semibold bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                          Hazırlanıyor
                        </button>
                        <button className="flex-1 py-1 text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                          Servise Hazır ✓
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">Gecikme İhtimali:</span>
                      <span className="font-semibold text-emerald-400">%0 (Zamanında)</span>
                    </div>
                  </div>

                  {/* Step 3: Cashier POS & Stock Recipe Auto-Deduction */}
                  <div
                    onClick={() => setPipelineStep(3)}
                    className={`cursor-pointer rounded-2xl p-4 transition-all relative ${
                      pipelineStep === 3
                        ? 'bg-emerald-500/10 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                        : 'bg-zinc-900/50 border-white/[0.05] hover:bg-zinc-900/80'
                    } border`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4" />
                        3. Adım: Kasa & Otomatik Stok
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">Senkron</span>
                    </div>

                    <div className="bg-zinc-950/60 p-3 rounded-lg border border-white/[0.04] space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-300">Adisyon:</span>
                        <span className="font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded text-[10px]">
                          Açık / Masada
                        </span>
                      </div>

                      <div className="pt-2 border-t border-white/[0.06]">
                        <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                          Otomatik Düşen Reçete:
                        </span>
                        <div className="grid grid-cols-2 gap-1 text-[11px] text-zinc-300">
                          <span className="text-red-400">-320g Kıyma</span>
                          <span className="text-red-400">-2x Ekmek</span>
                          <span className="text-red-400">-40g Sos</span>
                          <span className="text-red-400">-4x Limon</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">Net Kâr Marjı:</span>
                      <span className="font-bold text-emerald-400 text-sm">%68.4 Marj</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Bottom Quick Feature Metrics */}
              <div className="mt-6 pt-5 border-t border-white/[0.06] grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="p-2">
                  <div className="text-xl sm:text-2xl font-black text-white">420+</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">Aktif Restoran & Kafe</div>
                </div>
                <div className="p-2">
                  <div className="text-xl sm:text-2xl font-black text-orange-400">%0</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">Sipariş Başı Komisyon</div>
                </div>
                <div className="p-2">
                  <div className="text-xl sm:text-2xl font-black text-emerald-400">&lt; 400ms</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">WebSocket Senkronizasyonu</div>
                </div>
                <div className="p-2">
                  <div className="text-xl sm:text-2xl font-black text-cyan-400">+1.5 Döngü</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">Vision AI Günlük Masa Devri</div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Social Proof Logo Strip */}
        <div className="mt-14 pt-8 border-t border-white/[0.05] text-center">
          <p className="text-xs uppercase tracking-widest text-zinc-400 font-bold mb-5">
            Türkiye'nin Öncü Gastronomi Markaları Masalink Altyapısına Güveniyor
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-14 opacity-70 grayscale hover:grayscale-0 transition-all duration-300">
            <span className="text-sm font-black text-zinc-300 tracking-wider">ARTISAN BURGER LAB</span>
            <span className="text-sm font-black text-zinc-300 tracking-wider">BEBEK ROASTERY CO.</span>
            <span className="text-sm font-black text-zinc-300 tracking-wider">MODA NAPOLI PIZZA</span>
            <span className="text-sm font-black text-zinc-300 tracking-wider">BISTRO LE SOLEIL</span>
            <span className="text-sm font-black text-zinc-300 tracking-wider">THE SMOKE HOUSE</span>
          </div>
        </div>

      </div>
    </section>
  );
};
