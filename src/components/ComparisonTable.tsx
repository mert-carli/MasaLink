'use client';

import React from 'react';
import { Check, X, Minus, Sparkles, Scale } from 'lucide-react';

export const ComparisonTable: React.FC = () => {
  const comparisonRows = [
    {
      feature: 'Kamera Entegre Masa Analitiği (Vision AI)',
      masalink: 'Var (Mevcut IP kameralarla otomatik doluluk ve bekleme süresi tespiti)',
      traditional: 'Yok (Yalnızca garsonun elle girmesine bağımlı)',
      simpleQr: 'Yok',
    },
    {
      feature: 'Donanım Maliyeti',
      masalink: '0 TL (Mevcut tablet & telefonlarda çalışır)',
      traditional: '50.000 TL - 150.000 TL (Özel dokunmatik POS)',
      simpleQr: '0 TL (Yalnızca masa kartı)',
    },
    {
      feature: 'Sipariş Komisyonu',
      masalink: '%0 Komisyon (Sabit SaaS abonelik)',
      traditional: '%1.5 - %4.5 + Pos cihaz kirası',
      simpleQr: 'Sipariş alma yeteneği yok',
    },
    {
      feature: 'Masadan Anlık QR Sipariş',
      masalink: 'Var (Varyasyon, alerjen & masadan direkt mutfağa)',
      traditional: 'Yok (Garsonun masaya gelmesi şart)',
      simpleQr: 'Yalnızca PDF/Fotoğraf izleme (Sipariş yok)',
    },
    {
      feature: 'KDS (Mutfak Ekranı) & Sayaç',
      masalink: 'Gelişmiş süre sayacı ve istasyon yönlendirme',
      traditional: 'Pahalı ek mutfak yazıcıları / kağıt fiş',
      simpleQr: 'Yok',
    },
    {
      feature: 'Gramajlı Reçete & Stok Düşümü',
      masalink: 'Var (Otomatik porsiyon ve hammadde düşüşü)',
      traditional: 'Karmaşık ek ERP lisansı gerektirir',
      simpleQr: 'Yok',
    },
    {
      feature: 'Çevrimdışı (Offline-First) Çalışma',
      masalink: 'Var (Lokal Wi-Fi üzerinden kesintisiz devam eder)',
      traditional: 'Kısmi (Sunucu PC çökerse sistem durur)',
      simpleQr: 'İnternetsiz çalışmaz',
    },
    {
      feature: 'Kurulum & Canlıya Geçiş Süresi',
      masalink: '< 1 Saat (PDF menüyü yükleyin ve başlayın)',
      traditional: '2 - 3 Hafta (Teknik servis & kablolama)',
      simpleQr: '1 - 2 Gün',
    },
  ];

  return (
    <section className="py-20 md:py-24 relative bg-[#09090c]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-semibold mb-4">
            <Scale className="w-3.5 h-3.5" />
            <span>Piyasa Karşılaştırması</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            Neden klasik POS veya basit QR menüler yerine{' '}
            <span className="text-orange-400">Masalink</span>?
          </h2>
          <p className="mt-3 text-sm sm:text-base text-zinc-300">
            Pahalı lisanslar, hantal dokunmatik ekranlar ve işlevsiz PDF menüler yerine hepsi bir arada bulut gücü.
          </p>
        </div>

        {/* Mobile Swipe Indicator */}
        <div className="md:hidden flex items-center justify-center gap-2 text-xs text-zinc-400 mb-3 bg-zinc-900/60 py-2 px-3 rounded-full border border-white/[0.06] w-fit mx-auto">
          <span>⟵ Tabloyu kaydırarak inceleyin ⟶</span>
        </div>

        {/* Responsive Comparison Table */}
        <div className="overflow-x-auto rounded-3xl border border-white/[0.08] bg-[#111116] shadow-2xl">
          <table className="w-full text-left text-xs sm:text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-white/[0.08] bg-zinc-900/80">
                <th className="py-5 px-6 font-bold text-zinc-400 w-1/4">Özellik & Kriter</th>
                <th className="py-5 px-6 font-black text-white w-1/3 bg-orange-500/15 border-x border-orange-500/30">
                  <div className="flex items-center gap-2">
                    <span className="text-orange-400 font-extrabold text-base">Masalink</span>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-orange-500 text-black">
                      Bulut POS
                    </span>
                  </div>
                </th>
                <th className="py-5 px-6 font-bold text-zinc-400 w-1/4">Geleneksel POS Sistemleri</th>
                <th className="py-5 px-6 font-bold text-zinc-400 w-1/4">Klasik QR Menüler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {comparisonRows.map((row, idx) => (
                <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-4 px-6 font-semibold text-zinc-200">
                    {row.feature}
                  </td>
                  <td className="py-4 px-6 font-bold text-orange-300 bg-orange-500/[0.06] border-x border-orange-500/20">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{row.masalink}</span>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-zinc-400">
                    <div className="flex items-center gap-2">
                      <X className="w-4 h-4 text-red-400 shrink-0" />
                      <span>{row.traditional}</span>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-zinc-400">
                    <div className="flex items-center gap-2">
                      <Minus className="w-4 h-4 text-zinc-600 shrink-0" />
                      <span>{row.simpleQr}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </section>
  );
};
