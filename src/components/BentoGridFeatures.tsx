'use client';

import React, { useState, useEffect } from 'react';
import { 
  QrCode, 
  ChefHat, 
  Smartphone, 
  Boxes, 
  Zap, 
  Building2, 
  Sparkles, 
  Check, 
  Clock, 
  ArrowUpRight, 
  ShieldCheck, 
  SplitSquareVertical, 
  Flame, 
  AlertTriangle,
  Camera,
  Eye,
  Scan,
  Users,
  Activity,
  Radio
} from 'lucide-react';

export const BentoGridFeatures: React.FC = () => {
  const [visionScanSec, setVisionScanSec] = useState<number>(165);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisionScanSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatWaitTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <section id="ozellikler" className="py-20 md:py-28 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Modern Restoran Mimarisi & Computer Vision</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white">
            Eski POS donanımlarını değil, <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-300 to-orange-500">
              bulutun ve Vision AI'ın gücünü
            </span> kullanın.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-zinc-300">
            Masalink, masadaki kameradan mutfak ekranına ve kasaya kadar tüm restoran operasyonunu tek bir akıllı işletim sisteminde senkronize eder.
          </p>
        </div>

        {/* Bento Grid Container */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-12 gap-6">
          
          {/* FEATURE SPOTLIGHT: VISION AI (Col-span 12 on lg) */}
          <div className="lg:col-span-12 rounded-3xl bg-gradient-to-b from-[#16161f] via-[#111116] to-[#0c0c10] border-2 border-emerald-500/40 p-6 sm:p-9 hover:border-emerald-500/60 transition-all duration-300 shadow-2xl shadow-emerald-950/20 relative overflow-hidden group">
            {/* Ambient glows */}
            <div className="absolute top-0 right-1/4 -mt-20 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-500/15 transition-all" />
            <div className="absolute bottom-0 left-10 -mb-20 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
              
              {/* Left Column: Vision AI Copy & Value Prop */}
              <div className="lg:col-span-6 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                    <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
                    Sektörde Bir İlk: Vision AI
                  </span>
                  <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-white/[0.06]">
                    RTSP / ONVIF IP Kamera Uyumlu
                  </span>
                </div>

                <h3 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight leading-tight">
                  Restoranınızı izleyen değil, <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">
                    yöneten akıllı kameralar.
                  </span>
                </h3>

                <p className="text-zinc-300 text-sm sm:text-base leading-relaxed">
                  Pahalı sensörlere veya donanımlara gerek yok. Masalink Vision AI, mevcut restoran güvenlik kameralarınıza bağlanır; masadaki müşteri oturumunu, bekleme sürelerini ve kalkan masaları otomatik algılayıp garson & kasa ekranına anında bildirim gönderir.
                </p>

                {/* Core Vision AI Scenarios Pill List */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 text-xs">
                  <div className="bg-zinc-900/80 p-3 rounded-xl border border-white/[0.05] flex items-start gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 shrink-0 animate-ping" />
                    <div>
                      <span className="font-bold text-white block">Oturum Tespiti</span>
                      <span className="text-[11px] text-zinc-400">Müşteri oturduğu an garsona "Menü Bekliyor" uyarısı.</span>
                    </div>
                  </div>

                  <div className="bg-zinc-900/80 p-3 rounded-xl border border-white/[0.05] flex items-start gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                    <div>
                      <span className="font-bold text-white block">Bekleme Süresi Alarmı</span>
                      <span className="text-[11px] text-zinc-400">02:30 dk siparişsiz bekleyen masada sarı/kırmızı bayrak.</span>
                    </div>
                  </div>

                  <div className="bg-zinc-900/80 p-3 rounded-xl border border-white/[0.05] flex items-start gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                    <div>
                      <span className="font-bold text-white block">Masa Boşaldı / Temizlik</span>
                      <span className="text-[11px] text-zinc-400">Kalkış anında komiye "Dezenfeksiyon & Temizlik" çağrısı.</span>
                    </div>
                  </div>

                  <div className="bg-zinc-900/80 p-3 rounded-xl border border-white/[0.05] flex items-start gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                    <div>
                      <span className="font-bold text-white block">Kayıp Zaman Analitiği</span>
                      <span className="text-[11px] text-zinc-400">Oturma ile adisyon kapatma arasındaki ölü zamanı sıfırlayın.</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Camera Feed Simulation Mockup */}
              <div className="lg:col-span-6 bg-[#09090d] rounded-2xl p-4 sm:p-5 border border-emerald-500/30 shadow-2xl relative overflow-hidden">
                {/* CCTV Top Status Bar */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/[0.08] text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="font-mono text-zinc-200 font-bold">REC • CAM-02 (Ana Salon Doğu)</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-400 font-semibold">30 FPS</span>
                    <span>AI Model: YOLO-v9</span>
                  </div>
                </div>

                {/* Simulated Camera Video Frame Overlay */}
                <div className="relative aspect-[16/9] rounded-xl bg-zinc-950 border border-white/[0.06] overflow-hidden flex items-center justify-center p-3 select-none">
                  {/* Subtle Grid / Scanlines */}
                  <div className="absolute inset-0 bg-grid-pattern opacity-40 pointer-events-none" />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/[0.02] to-transparent pointer-events-none animate-pulse" />

                  {/* Bounding Box 1: Masa 04 (Bekleme Süresi Uyarısı) */}
                  <div className="absolute top-4 left-4 w-44 sm:w-52 h-28 rounded-lg border-2 border-amber-400 bg-amber-500/10 p-2 flex flex-col justify-between shadow-lg shadow-amber-500/10 backdrop-blur-xs">
                    {/* Corner Reticles */}
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500 text-black">
                        Masa 04 • Dolu
                      </span>
                      <span className="text-[10px] font-mono font-bold text-amber-300 bg-black/60 px-1 rounded">
                        3 Kişi
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="text-[11px] font-bold text-white flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span>Bekleme: {formatWaitTime(visionScanSec)}</span>
                      </div>
                      <div className="text-[10px] text-amber-200 font-semibold bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-500/40 animate-pulse">
                        ⚠️ Garson Uğramadı • Alarm!
                      </div>
                    </div>
                  </div>

                  {/* Bounding Box 2: Masa 08 (Temizlik Bekliyor) */}
                  <div className="absolute bottom-4 right-4 w-40 sm:w-48 h-24 rounded-lg border-2 border-cyan-400 bg-cyan-500/10 p-2 flex flex-col justify-between shadow-lg shadow-cyan-500/10">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500 text-black">
                        Masa 08 • Boşaldı
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      <div className="text-[10px] font-semibold text-cyan-200 flex items-center gap-1">
                        <Check className="w-3 h-3 text-cyan-400" />
                        <span>Hesap Ödendi (Kalktı)</span>
                      </div>
                      <span className="text-[9px] font-mono text-zinc-300 bg-black/60 px-1 py-0.5 rounded block">
                        Durum: Temizlik Çağrıldı (00:45)
                      </span>
                    </div>
                  </div>

                  {/* Center Radar Scanner Reticle */}
                  <div className="w-16 h-16 rounded-full border border-dashed border-emerald-400/40 flex items-center justify-center animate-spin" style={{ animationDuration: '12s' }}>
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  </div>
                </div>

                {/* CCTV Footer Metrics */}
                <div className="mt-3 pt-3 border-t border-white/[0.08] grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-zinc-900/60 p-2 rounded-lg">
                    <span className="text-[10px] text-zinc-400 block">Masa Tespiti</span>
                    <span className="font-bold text-emerald-400">%99.4 İsabet</span>
                  </div>
                  <div className="bg-zinc-900/60 p-2 rounded-lg">
                    <span className="text-[10px] text-zinc-400 block">Garson Reaksiyonu</span>
                    <span className="font-bold text-white">%35 Daha Hızlı</span>
                  </div>
                  <div className="bg-zinc-900/60 p-2 rounded-lg">
                    <span className="text-[10px] text-zinc-400 block">Masa Döngüsü</span>
                    <span className="font-bold text-orange-400">+1.5 Devir / Gün</span>
                  </div>
                </div>

              </div>

            </div>
          </div>

          {/* Card 1: QR Menü & Sipariş (Col-span 7 on lg) */}
          <div className="lg:col-span-7 rounded-2xl bg-[#121217] border border-white/[0.08] p-6 sm:p-8 flex flex-col justify-between hover:border-orange-500/30 transition-all duration-300 group relative overflow-hidden">
            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-orange-500/15 transition-all" />
            
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-orange-500/15 border border-orange-500/25 flex items-center justify-center text-orange-400">
                  <QrCode className="w-6 h-6" />
                </div>
                <span className="text-xs font-mono font-medium px-2.5 py-1 rounded-full bg-white/[0.05] text-zinc-400 border border-white/[0.05]">
                  Mobil Web • Sıfır İndirme
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                QR Menü & Masadan Anlık Sipariş
              </h3>
              <p className="text-zinc-300 text-sm leading-relaxed mb-6">
                Müşterileriniz uygulama indirmeden saniyeler içinde zengin görsel menüyü incelesin; pişme derecesi, ekstra malzeme ve alerjen filtreleriyle masadan direkt sipariş versin.
              </p>
            </div>

            {/* Visual interactive UI preview */}
            <div className="bg-[#09090c] rounded-xl p-4 border border-white/[0.06] shadow-inner">
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-3 pb-2 border-b border-white/[0.06]">
                <span className="flex items-center gap-1.5 text-zinc-200 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" /> Masa 12 Menü Seçimi
                </span>
                <span className="text-orange-400 font-mono font-bold">Sepet: ₺480</span>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 bg-zinc-900/80 p-3 rounded-lg border border-white/[0.04]">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs font-bold text-white">Smash Çift Kat Burger</div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">Orta Pişmiş • Çıtır Pastırma</div>
                    </div>
                    <span className="text-xs font-bold text-orange-400">₺360</span>
                  </div>
                  <div className="mt-2 flex gap-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300">Ekstra Cheddar</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">Glutensiz Ekmek</span>
                  </div>
                </div>

                <div className="w-full sm:w-48 bg-orange-500/10 border border-orange-500/25 p-3 rounded-lg flex flex-col justify-center items-center text-center">
                  <span className="text-[11px] text-orange-300 font-medium">Ortalama Sipariş Hızı</span>
                  <span className="text-xl font-black text-orange-400 mt-0.5">42 Saniye</span>
                  <span className="text-[10px] text-zinc-400 mt-1">Garson bekleme süresini sıfırlar</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: KDS (Mutfak Ekranı) (Col-span 5 on lg) */}
          <div className="lg:col-span-5 rounded-2xl bg-[#121217] border border-white/[0.08] p-6 sm:p-8 flex flex-col justify-between hover:border-amber-500/30 transition-all duration-300 group relative overflow-hidden">
            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-amber-500/15 transition-all" />
            
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400">
                  <ChefHat className="w-6 h-6" />
                </div>
                <span className="text-xs font-mono font-medium px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Akıllı Süre Sayacı
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                KDS (Mutfak Ekranı Sistemi)
              </h3>
              <p className="text-zinc-300 text-sm leading-relaxed mb-6">
                Kağıt fiş karmaşasına son. Renk kodlu hazırlık sayaçları, gecikme alarmları ve istasyonlara otomatik sipariş yönlendirme.
              </p>
            </div>

            {/* Visual KDS Ticket Preview */}
            <div className="bg-[#09090c] rounded-xl p-3.5 border border-white/[0.06] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                  Masa 06 • Acil Sipariş
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">
                  12:40 (Gecikiyor)
                </span>
              </div>
              <div className="text-xs bg-zinc-900/90 p-2.5 rounded-lg border border-white/[0.04] space-y-1">
                <div className="flex justify-between text-zinc-200">
                  <span>1x Trüflü Pizza (Fırın)</span>
                  <span className="text-emerald-400 font-medium">Hazır ✓</span>
                </div>
                <div className="flex justify-between text-zinc-200">
                  <span>2x Bonfile Izgara (Orta-İyi)</span>
                  <span className="text-amber-400 font-medium">Izgarada (2 dk)</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
                  Tek Tıkla "Hazır" Bildir
                </button>
              </div>
            </div>
          </div>

          {/* Card 3: Garson & Masa Terminali (Col-span 4 on lg) */}
          <div className="lg:col-span-4 rounded-2xl bg-[#121217] border border-white/[0.08] p-6 sm:p-7 flex flex-col justify-between hover:border-blue-500/30 transition-all duration-300 group relative">
            <div>
              <div className="w-12 h-12 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center text-blue-400 mb-4">
                <SplitSquareVertical className="w-6 h-6" />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white mb-2">
                Garson / Servis Terminali
              </h3>
              <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed mb-4">
                Masa yerleşimi krokisi, masa taşıma ve birleştirme, tek tıkla adisyonu ürün veya kişi bazlı bölme, masaya özel garson çağrısı.
              </p>
            </div>

            <div className="bg-[#09090c] p-3 rounded-xl border border-white/[0.06] text-xs">
              <div className="grid grid-cols-3 gap-2 text-center font-semibold">
                <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  Masa 01<br /><span className="text-[10px] font-normal text-zinc-400">Dolu (₺850)</span>
                </div>
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  Masa 02<br /><span className="text-[10px] font-normal text-zinc-400">Hesap Bekler</span>
                </div>
                <div className="p-2 rounded bg-zinc-800 border border-white/[0.05] text-zinc-400">
                  Masa 03<br /><span className="text-[10px] font-normal text-emerald-400">Boş</span>
                </div>
              </div>
              <div className="mt-2.5 text-[11px] text-zinc-400 flex items-center justify-between">
                <span>Adisyon Bölme:</span>
                <span className="text-blue-400 font-medium">Kelle Başı / Kalem Kalem</span>
              </div>
            </div>
          </div>

          {/* Card 4: Gelişmiş Stok & Reçete Takibi (Col-span 4 on lg) */}
          <div className="lg:col-span-4 rounded-2xl bg-[#121217] border border-white/[0.08] p-6 sm:p-7 flex flex-col justify-between hover:border-emerald-500/30 transition-all duration-300 group relative">
            <div>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 mb-4">
                <Boxes className="w-6 h-6" />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white mb-2">
                Gramajlı Reçete & Stok Takibi
              </h3>
              <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed mb-4">
                Satılan her hamburgerde köfte, ekmek ve sos stoğu miligramına kadar otomatik düşer. Kaçakları sıfırlayın, net kâr marjınızı bilin.
              </p>
            </div>

            <div className="bg-[#09090c] p-3 rounded-xl border border-white/[0.06] text-xs space-y-2">
              <div className="flex justify-between items-center text-zinc-300">
                <span>Dana Kıyma Stoğu:</span>
                <span className="font-mono text-emerald-400 font-bold">14.8 kg (Yeterli)</span>
              </div>
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full w-[74%]" />
              </div>
              <div className="flex justify-between items-center text-zinc-300 pt-1">
                <span className="flex items-center gap-1 text-amber-400">
                  <AlertTriangle className="w-3 h-3" /> Brioche Ekmek:
                </span>
                <span className="font-mono text-amber-400 font-bold">12 Adet (Kritik)</span>
              </div>
            </div>
          </div>

          {/* Card 5: WebSocket & Multi-Tenant (Col-span 4 on lg) */}
          <div className="lg:col-span-4 rounded-2xl bg-[#121217] border border-white/[0.08] p-6 sm:p-7 flex flex-col justify-between hover:border-purple-500/30 transition-all duration-300 group relative">
            <div>
              <div className="w-12 h-12 rounded-xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center text-purple-400 mb-4">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white mb-2">
                WebSocket & Offline-First
              </h3>
              <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed mb-4">
                Masa, mutfak ve kasa arasında sıfır gecikmeli senkronizasyon. İnternet kesilse dahi lokal ağda siparişler tıkır tıkır işler.
              </p>
            </div>

            <div className="bg-[#09090c] p-3 rounded-xl border border-white/[0.06] text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Çift Yönlü İletişim:</span>
                <span className="font-mono text-purple-400 font-bold">&lt; 0.35s Ping</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Kesintisiz Çalışma:</span>
                <span className="text-emerald-400 font-medium">Lokal SQLite Buffer</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Çok Şube Desteği:</span>
                <span className="text-white font-medium">Merkezi Bulut Rapor</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
