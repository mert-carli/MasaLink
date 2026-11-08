'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  Building2, 
  Palette, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft,
  Upload,
  ChefHat,
  Coffee,
  Pizza,
  Wine,
  UtensilsCrossed,
  ShieldCheck
} from 'lucide-react';
import { MasaLink3DLogo } from '@/components/MasaLink3DLogo';
import { triggerConfetti } from '@/utils/helpers';
import { LegalDocType } from '@/components/LegalModal';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPlan?: string;
  onOpenLegal?: (doc: LegalDocType) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  initialPlan = 'pro',
  onOpenLegal,
}) => {
  const [step, setStep] = useState<number>(1);
  const [restaurantName, setRestaurantName] = useState<string>('');
  const [cuisineType, setCuisineType] = useState<string>('burger');
  const [branchCount, setBranchCount] = useState<string>('1');
  const [tableCount, setTableCount] = useState<number>(24);
  const [selectedThemeColor, setSelectedThemeColor] = useState<string>('#f97316');
  const [selectedPlan, setSelectedPlan] = useState<string>(initialPlan);
  const [logoUploaded, setLogoUploaded] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (initialPlan) {
      setSelectedPlan(initialPlan);
    }
  }, [initialPlan]);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setIsSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const themeColors = [
    { name: 'Günbatımı Turuncu', hex: '#f97316' },
    { name: 'Zümrüt Yeşili', hex: '#10b981' },
    { name: 'Gece Mavisi', hex: '#3b82f6' },
    { name: 'Asil Mor', hex: '#a855f7' },
    { name: 'Yakut Kırmızısı', hex: '#ef4444' },
  ];

  const cuisineTypes = [
    { id: 'burger', label: 'Burger & Sokak Lezzeti', icon: '🍔' },
    { id: 'pizza', label: 'Pizza & İtalyan Mutfağı', icon: '🍕' },
    { id: 'coffee', label: '3. Nesil Kahve & Kafe', icon: '☕' },
    { id: 'bar', label: 'Bar & Kokteyl Lounge', icon: '🍸' },
    { id: 'finedining', label: 'Restoran & Fine Dining', icon: '🍽️' },
  ];

  const handleFinish = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSuccess(true);
    triggerConfetti();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl bg-[#121217] border border-white/[0.1] shadow-2xl p-5 sm:p-8 text-zinc-100">
        
        {/* Glow corner */}
        <div 
          className="absolute -top-20 -right-20 w-44 h-44 rounded-full blur-3xl pointer-events-none opacity-20"
          style={{ backgroundColor: selectedThemeColor }}
        />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Success Screen */}
        {isSuccess ? (
          <div className="text-center py-6 space-y-4">
            <div className="flex justify-center mb-2">
              <MasaLink3DLogo size="xl" showText={false} withGlow={true} />
            </div>

            <h3 className="text-2xl font-black text-white">
              Tebrikler, {restaurantName || 'Restoranınız'} Hazır!
            </h3>

            <p className="text-xs sm:text-sm text-zinc-300 max-w-xs mx-auto leading-relaxed">
              MasaLink 3D Restoran altyapınız oluşturuldu. QR menü ve POS sisteminize anında erişebilirsiniz.
            </p>

            <div className="p-3.5 rounded-xl bg-zinc-900 border border-white/[0.06] text-xs text-left space-y-1.5 max-w-xs mx-auto">
              <div className="flex justify-between">
                <span className="text-zinc-400">Plan:</span>
                <span className="font-bold text-orange-400 uppercase">{selectedPlan}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Masa Sayısı:</span>
                <span className="font-bold text-white">{tableCount} Masa</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">QR Kod Bağlantısı:</span>
                <span className="font-mono text-emerald-400 text-[11px]">masalink.com/qr/{restaurantName ? restaurantName.toLowerCase().replace(/\s+/g, '-') : 'demo'}</span>
              </div>
            </div>

            <div className="pt-4 flex flex-col gap-2.5">
              <button
                onClick={() => {
                  onClose();
                  const simEl = document.getElementById('simulator');
                  if (simEl) simEl.scrollIntoView({ behavior: 'smooth' });
                }}
                className="w-full py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-orange-500 to-amber-600 shadow-xl shadow-orange-500/25 hover:brightness-110 active:scale-95 transition-all"
              >
                Canlı Simülasyonda Görüntüle
              </button>
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl font-semibold text-xs text-zinc-400 hover:text-white"
              >
                Kapat
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Header with 3D Brand Emblem */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <MasaLink3DLogo size="sm" badge="3D Setup" />
                <span className="text-[11px] font-semibold text-orange-400">
                  Adım {step} / 3: {step === 1 ? 'İşletme Bilgileri' : step === 2 ? 'Marka & 3D Logo' : 'Paket Onayı'}
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-white">
                Restoranınızı Buluta Taşıyın
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                14 gün ücretsiz deneme sürümünüzü saniyeler içinde başlatın.
              </p>

              {/* Zero-risk Trial Pill */}
              <div className="mt-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between text-[11px] text-emerald-300">
                <div className="flex items-center gap-1.5 font-semibold">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Kredi Kartı Gerekmez • 0 TL Deneme</span>
                </div>
                <span className="font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  Plan: {selectedPlan}
                </span>
              </div>
            </div>

            {/* Step 1: Restaurant Info */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                    Restoran / Kafe Adı:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Örn: Artisan Burger Bar"
                    value={restaurantName}
                    onChange={(e) => setRestaurantName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/[0.1] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                    Mutfak / İşletme Türü:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {cuisineTypes.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => setCuisineType(c.id)}
                        className={`p-2.5 rounded-xl border text-left text-xs font-semibold flex items-center gap-2 transition-all ${
                          cuisineType === c.id
                            ? 'bg-orange-500/15 border-orange-500 text-orange-300'
                            : 'bg-zinc-900/80 border-white/[0.06] text-zinc-400 hover:bg-zinc-800'
                        }`}
                      >
                        <span className="text-base">{c.icon}</span>
                        <span className="truncate">{c.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      Şube Sayısı:
                    </label>
                    <select
                      value={branchCount}
                      onChange={(e) => setBranchCount(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-white/[0.1] text-xs text-white focus:outline-none focus:border-orange-500"
                    >
                      <option value="1">1 Şube (Tek İşletme)</option>
                      <option value="2-5">2 - 5 Şube</option>
                      <option value="6+">6+ Şube (Zincir)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      Tahmini Masa Sayısı:
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={tableCount}
                      onChange={(e) => setTableCount(Number(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-white/[0.1] text-xs text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-full mt-4 py-3 rounded-xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-orange-500 to-amber-600 flex items-center justify-center gap-2 shadow-lg shadow-orange-500/25 active:scale-95"
                >
                  Devam Et: Marka & Tasarım
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Step 2: Branding & Color */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                    QR Menü Tema Renginiz:
                  </label>
                  <div className="flex items-center gap-3">
                    {themeColors.map((color) => (
                      <button
                        type="button"
                        key={color.hex}
                        onClick={() => setSelectedThemeColor(color.hex)}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                          selectedThemeColor === color.hex
                            ? 'ring-2 ring-white scale-110 shadow-lg'
                            : 'opacity-70 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: color.hex }}
                        title={color.name}
                      >
                        {selectedThemeColor === color.hex && (
                          <CheckCircle2 className="w-5 h-5 text-white" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                    Restoran Logosu:
                  </label>
                  <div className="space-y-2">
                    {/* Official 3D Logo Choice */}
                    <div
                      onClick={() => setLogoUploaded(true)}
                      className={`cursor-pointer p-3 rounded-xl border flex items-center justify-between transition-all ${
                        logoUploaded
                          ? 'bg-orange-500/15 border-orange-500 text-white'
                          : 'bg-zinc-900 border-white/[0.08] hover:border-orange-500/40 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <MasaLink3DLogo size="sm" showText={false} />
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-1.5">
                            MasaLink Restoran Logosu
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-400 font-bold">Kare Format</span>
                          </div>
                          <div className="text-[10px] text-zinc-400">Yüksek çözünürlüklü kurumsal restoran logosu</div>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${logoUploaded ? 'bg-orange-500 border-orange-400 text-white' : 'border-zinc-600'}`}>
                        {logoUploaded && <CheckCircle2 className="w-3.5 h-3.5" />}
                      </div>
                    </div>

                    {/* Custom File Upload Option */}
                    <div
                      onClick={() => setLogoUploaded(false)}
                      className={`cursor-pointer border-2 border-dashed rounded-xl p-3 text-center transition-colors ${
                        !logoUploaded
                          ? 'border-orange-500/40 bg-zinc-900/60'
                          : 'border-white/[0.08] bg-zinc-900/30'
                      }`}
                    >
                      <span className="text-[11px] text-zinc-400 block">
                        Veya kendi özel logonuzu yükleyin (PNG, SVG, JPG)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="w-1/3 py-3 rounded-xl font-bold text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Geri
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="w-2/3 py-3 rounded-xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-orange-500 to-amber-600 flex items-center justify-center gap-2 shadow-lg shadow-orange-500/25 active:scale-95"
                  >
                    Paket Seçimine İlerle
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Package Confirmation & Launch */}
            {step === 3 && (
              <form onSubmit={handleFinish} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-2">
                    Denemek İstediğiniz Masalink Paketi:
                  </label>
                  <div className="space-y-2">
                    {[
                      { id: 'starter', name: 'Başlangıç', price: '₺1.190 / ay', desc: 'QR Menü + Kasa' },
                      { id: 'pro', name: 'Pro (Önerilen)', price: '₺2.310 / ay', desc: 'KDS + Garson Panelleri + Otomatik Stok' },
                      { id: 'enterprise', name: 'Enterprise', price: '₺4.390 / ay', desc: 'Çok Şube + ERP Entegrasyonu' },
                    ].map((p) => (
                      <div
                        key={p.id}
                        onClick={() => setSelectedPlan(p.id)}
                        className={`cursor-pointer p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${
                          selectedPlan === p.id
                            ? 'bg-orange-500/15 border-orange-500 text-white font-bold'
                            : 'bg-zinc-900 border-white/[0.06] text-zinc-400 hover:bg-zinc-800'
                        }`}
                      >
                        <div>
                          <div className="text-white font-bold">{p.name}</div>
                          <div className="text-[10px] text-zinc-400">{p.desc}</div>
                        </div>
                        <div className="text-right">
                          <span className="text-orange-400 font-mono font-bold">{p.price}</span>
                          <span className="block text-[9px] text-emerald-400">14 Gün Ücretsiz</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-[11px] text-zinc-300 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Bugün hiçbir ödeme veya kredi kartı gerekmez (0 TL).</span>
                  </div>
                  <p className="text-zinc-400 pl-6 leading-relaxed">
                    14 günlük tam erişimli deneme süreniz anında aktif edilir. Memnun kalırsanız sürenin sonunda dilediğiniz ödeme yöntemiyle (Iyzico / Stripe / Havale) devam edebilirsiniz.
                  </p>
                </div>

                {/* Legal Consent Checkbox */}
                <div className="flex items-start gap-2 pt-1 pb-1">
                  <input
                    type="checkbox"
                    id="legal-consent"
                    required
                    defaultChecked
                    className="mt-0.5 rounded border-zinc-700 bg-zinc-900 text-orange-500 focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="legal-consent" className="text-[11px] text-zinc-400 cursor-pointer select-none leading-snug">
                    <button
                      type="button"
                      onClick={() => onOpenLegal && onOpenLegal('distance_sales')}
                      className="text-orange-400 underline hover:text-orange-300 font-semibold"
                    >
                      Mesafeli Satış Sözleşmesi
                    </button>
                    <span>, İptal Koşulları ve </span>
                    <button
                      type="button"
                      onClick={() => onOpenLegal && onOpenLegal('kvkk')}
                      className="text-orange-400 underline hover:text-orange-300 font-semibold"
                    >
                      KVKK Aydınlatma Metni'ni
                    </button>
                    <span> okudum, kabul ediyorum.</span>
                  </label>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="w-1/3 py-3 rounded-xl font-bold text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Geri
                  </button>
                  <button
                    type="submit"
                    className="w-2/3 py-3 rounded-xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 shadow-xl shadow-orange-500/30 flex items-center justify-center gap-2 active:scale-95"
                  >
                    <Sparkles className="w-4 h-4" />
                    14 Gün Ücretsiz Başlat
                  </button>
                </div>
              </form>
            )}

          </div>
        )}

      </div>
    </div>
  );
};
