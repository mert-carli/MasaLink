'use client';

import React from 'react';
import { 
  ShieldCheck, 
  Database, 
  Cpu, 
  WifiOff, 
  Code2, 
  Server, 
  Layers, 
  Lock, 
  Zap,
  Globe2
} from 'lucide-react';

export const TechArchitecture: React.FC = () => {
  const pillars = [
    {
      icon: Cpu,
      title: 'Vision AI Edge Computer Vision Pipeline',
      description:
        'RTSP / ONVIF IP güvenlik kameralarından gelen akışları restoranın yerel ağında hafif YOLO-v9 modelleriyle işler; sıfır bant genişliği yüküyle masa durumunu buluta aktarır.',
      badge: 'Edge AI / ONVIF',
    },
    {
      icon: Database,
      title: 'Çok Kiracılı (Multi-Tenant) İzolasyon',
      description:
        'Her restoran ve şube için şifreli veri ayrıştırması (Row-Level Security). Diğer işletmelerin verileriyle asla karışmaz, kurumsal gizlilik güvence altında.',
      badge: 'PostgreSQL RLS',
    },
    {
      icon: Zap,
      title: 'Gerçek Zamanlı WebSocket Ağı',
      description:
        'Sipariş verildiği anda mutfak ekranına ve garson terminaline 400 milisaniyenin altında sesli ve görsel bildirim iletilir.',
      badge: '< 400ms Gecikme',
    },
    {
      icon: WifiOff,
      title: 'Offline-First Kesintisiz Operasyon',
      description:
        'İnternet servis sağlayıcınız kopsa bile yerel ağda PWA teknolojisi sayesinde garsonlar sipariş almaya ve mutfak fişleri üretmeye devam eder.',
      badge: 'Local SQLite Buffer',
    },
    {
      icon: Code2,
      title: 'Açık API & ERP Entegrasyonları',
      description:
        'Logo, Mikro, Netsis gibi muhasebe sistemlerinin yanı sıra Yemeksepeti, Getir ve Trendyol Yemek sipariş havuzlarıyla çift yönlü entegrasyon.',
      badge: 'REST & Webhooks',
    },
    {
      icon: Lock,
      title: 'Banka Düzeyinde Güvenlik & KVKK',
      description:
        'TLS 1.3 uçtan uca şifreleme, iki adımlı doğrulama (2FA), rol bazlı yetkilendirme ve KVKK tam uyumlu veri saklama politikası.',
      badge: 'ISO 27001 & SOC2',
    },
    {
      icon: Globe2,
      title: 'Yüksek Erişilebilirlik & Bulut SLA',
      description:
        '%99.98 uptime garantisiyle Cuma ve Cumartesi akşamlarının en yoğun saatlerinde dahi sıfır donma, sıfır kilitlenme.',
      badge: '%99.98 Uptime SLA',
    },
  ];

  return (
    <section id="mimari" className="py-20 md:py-28 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-semibold mb-4">
            <Cpu className="w-3.5 h-3.5" />
            <span>Kurumsal SaaS Altyapısı</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white">
            Milyonlarca siparişi sıfır kesintiyle taşıyan{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-300 to-orange-500">
              güvenilir mimari
            </span>.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-zinc-300">
            Masalink sadece şık bir arayüz değil; en yoğun servis saatlerinde dahi kesintisiz çalışan yüksek performanslı bir bulut omurgasıdır.
          </p>
        </div>

        {/* Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pillars.map((pillar, idx) => (
            <div
              key={idx}
              className="rounded-2xl bg-[#111116] border border-white/[0.08] p-6 hover:border-purple-500/30 transition-all duration-300 flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-105 transition-transform">
                    <pillar.icon className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-white/[0.05]">
                    {pillar.badge}
                  </span>
                </div>

                <h3 className="text-base sm:text-lg font-bold text-white mb-2 group-hover:text-purple-300 transition-colors">
                  {pillar.title}
                </h3>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  {pillar.description}
                </p>
              </div>

              <div className="mt-6 pt-3 border-t border-white/[0.04] flex items-center gap-1.5 text-[11px] text-zinc-500">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Otomatik yedekleme & log denetimi</span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};
