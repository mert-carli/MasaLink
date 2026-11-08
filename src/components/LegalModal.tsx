'use client';

import React from 'react';
import { X, ShieldCheck, FileText, CheckCircle2, AlertCircle, Clock, Server, Lock } from 'lucide-react';
import { MasaLink3DLogo } from '@/components/MasaLink3DLogo';

export type LegalDocType = 'distance_sales' | 'kvkk' | 'sla';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDoc?: LegalDocType;
}

export const LegalModal: React.FC<LegalModalProps> = ({
  isOpen,
  onClose,
  initialDoc = 'distance_sales',
}) => {
  const [activeDoc, setActiveDoc] = React.useState<LegalDocType>(initialDoc);

  React.useEffect(() => {
    if (initialDoc) {
      setActiveDoc(initialDoc);
    }
  }, [initialDoc]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-3xl bg-[#0f0f15] border border-white/[0.1] shadow-2xl overflow-hidden text-zinc-100">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-white/[0.08] flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <MasaLink3DLogo size="sm" badge="B2B Legal" />
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                Kurumsal Güven & Yasal Şartlar
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-mono">
                  GİB & KVKK Uyumlu
                </span>
              </h3>
              <p className="text-xs text-zinc-400 hidden sm:block">
                Masalink Teknoloji A.Ş. B2B Restoran Hizmet Sözleşmeleri ve Taahhütleri
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Document Tab Navigation */}
        <div className="flex items-center gap-1 p-2 bg-zinc-950/80 border-b border-white/[0.06] overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveDoc('distance_sales')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
              activeDoc === 'distance_sales'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Mesafeli Satış & İptal/İade</span>
          </button>

          <button
            onClick={() => setActiveDoc('kvkk')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
              activeDoc === 'kvkk'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>KVKK & Gizlilik Politikası</span>
          </button>

          <button
            onClick={() => setActiveDoc('sla')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
              activeDoc === 'sla'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>SLA Taahhüdü (%99.9 Uptime)</span>
          </button>
        </div>

        {/* Document Body (Scrollable) */}
        <div className="p-5 sm:p-7 overflow-y-auto text-xs sm:text-sm text-zinc-300 space-y-5 leading-relaxed">
          
          {/* DOC 1: MESAFELİ SATIŞ VE İADE */}
          {activeDoc === 'distance_sales' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-orange-500/10 border border-orange-500/25 text-orange-200 text-xs">
                <strong>Özet Güvence:</strong> 14 günlük ücretsiz deneme süresi boyunca kredi kartı bilgisi alınmaz. Ücretli aboneliklerde ilk 14 gün koşulsuz tam iade garantisi mevcuttur.
              </div>

              <h4 className="text-base font-bold text-white">1. Taraflar ve Hizmet Sağlayıcı</h4>
              <p>
                İşbu B2B Mesafeli Satış ve Abonelik Sözleşmesi; Masalink Bulut Restoran Teknolojileri A.Ş. (bundan böyle <strong>"Masalink"</strong> olarak anılacaktır) ile platforma üye olan restoran/kafe işletmesi (bundan böyle <strong>"Müşteri/İşletme"</strong> olarak anılacaktır) arasında akdedilmiştir.
              </p>

              <h4 className="text-base font-bold text-white">2. Hizmet Kapsamı ve Abonelik Koşulları</h4>
              <p>
                Masalink, Müşteri’ye bulut tabanlı POS, masadan temassız QR sipariş menüsü, mutfak ekranı (KDS), garson el terminalleri ve Vision AI masa analitiği hizmetlerini SaaS (Software-as-a-Service) modeliyle sağlar. Hizmet bedeli seçilen pakete göre (Başlangıç, Pro, Enterprise) aylık veya yıllık olarak tahsil edilir. Tüm faturalar Gelir İdaresi Başkanlığı (GİB) uyumlu E-Arşiv / E-Fatura olarak 24 saat içinde işletmeye iletilir.
              </p>

              <h4 className="text-base font-bold text-white">3. Cayma Hakkı, İptal ve İade Şartları</h4>
              <p>
                İşletme, Masalink ücretli aboneliğini başlattığı tarihten itibaren <strong>14 (on dört) gün içerisinde</strong> hiçbir gerekçe göstermeksizin ve cezai şart ödemeksizin aboneliğini iptal etme ve ödediği tutarı eksiksiz geri alma hakkına sahiptir. İade talebi iletildikten sonra tutar 3 iş günü içinde ödemenin yapıldığı karta/hesaba aktarılır.
              </p>

              <h4 className="text-base font-bold text-white">4. Komisyonsuzluk Garantisi</h4>
              <p>
                Masalink, restoranın yaptığı cirolardan, adisyon kapatmalarından veya QR üzerinden verilen siparişlerden %0 (sıfır) komisyon alır. Müşteri yalnızca sabit abonelik bedelini öder.
              </p>
            </div>
          )}

          {/* DOC 2: KVKK VE GİZLİLİK */}
          {activeDoc === 'kvkk' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-200 text-xs">
                <strong>Vision AI Kamera Gizlilik Bildirimi:</strong> Kameralarımız yüz tanıma yapmaz, biyometrik kimlik verisi işlemez. Yalnızca masadaki oturum ve bekleme süresi koordinatlarını anonim matematiksel veri olarak işler ve kaydetmez.
              </div>

              <h4 className="text-base font-bold text-white">1. Veri Sorumlusu ve Mevzuata Uyum</h4>
              <p>
                Masalink, 6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) ve ilgili mevzuat uyarınca Veri İşleyen ve Veri Sorumlusu yükümlülüklerini eksiksiz yerine getirmektedir. Sunucularımız Türkiye Cumhuriyeti sınırları içerisindeki ISO 27001 sertifikalı veri merkezlerinde barındırılmaktadır.
              </p>

              <h4 className="text-base font-bold text-white">2. İşlenen Veriler ve Amaçları</h4>
              <ul className="list-disc pl-5 space-y-1.5 text-zinc-300">
                <li><strong>İşletme Verileri:</strong> Restoran adı, yetkili iletişim bilgisi, fatura ve vergi detayları.</li>
                <li><strong>Sipariş Verileri:</strong> Masa numarası, sipariş kalemleri, ödeme tutarı ve hazırlık süreleri.</li>
                <li><strong>Vision AI Görüntü İşleme:</strong> Güvenlik kamerası kareleri Edge yapay zeka tarafından gerçek zamanlı analiz edilir; video kayıtları harici sunucuya kopyalanmaz veya saklanmaz.</li>
              </ul>

              <h4 className="text-base font-bold text-white">3. Veri Güvenliği ve Şifreleme</h4>
              <p>
                Tüm veri transferleri 256-bit SSL/TLS şifreleme ile korunur. Çok kiracılı (multi-tenant) veri tabanımızda satır düzeyinde güvenlik (PostgreSQL Row-Level Security - RLS) uygulanır; hiçbir restoran bir diğerinin verisine veya adisyonlarına erişemez.
              </p>
            </div>
          )}

          {/* DOC 3: SLA UPTIME TAAHHÜDÜ */}
          {activeDoc === 'sla' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-200 text-xs">
                <strong>Kurumsal SLA Sözleşmesi:</strong> Restoran operasyonunun aksamaması için %99.9 kesintisiz çalışma garantisi ve 15 dakika içinde acil teknik müdahale taahhüt edilir.
              </div>

              <h4 className="text-base font-bold text-white">1. Hizmet Seviyesi Oranı (%99.9 Uptime)</h4>
              <p>
                Masalink, takvim ayı bazında sistemlerinin en az <strong>%99.9 oranında</strong> erişilebilir olacağını taahhüt eder. Planlı bakım çalışmaları en az 48 saat önceden bildirilir ve yalnızca restoranların kapalı olduğu 03:00 - 06:00 saatleri arasında gerçekleştirilir.
              </p>

              <h4 className="text-base font-bold text-white">2. Kesinti Tazminatı ve İade Kredisi</h4>
              <p>
                Aylık çalışma oranının %99.9'un altına düşmesi halinde Masalink, müşteriye aşağıdaki oranlarda fatura indirimi veya hizmet kredisi sağlar:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                <div className="p-3 rounded-xl bg-zinc-900 border border-white/[0.06] text-center">
                  <div className="font-bold text-white">%99.0 - %99.8</div>
                  <div className="text-emerald-400 font-mono mt-1">%10 Fatura İndirimi</div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900 border border-white/[0.06] text-center">
                  <div className="font-bold text-white">%95.0 - %98.9</div>
                  <div className="text-amber-400 font-mono mt-1">%25 Fatura İndirimi</div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900 border border-white/[0.06] text-center">
                  <div className="font-bold text-white">&lt; %95.0</div>
                  <div className="text-red-400 font-mono mt-1">%50 Fatura İndirimi</div>
                </div>
              </div>

              <h4 className="text-base font-bold text-white">3. Offline-First Kesintisiz Çalışma Güvencesi</h4>
              <p>
                İnternet servis sağlayıcınız kaynaklı bağlantı kopmalarında dahi Masalink PWA mimarisi sayesinde masalardan sipariş alma ve mutfak yazıcılarına fiş iletme işlemleri lokal ağ (Wi-Fi) üzerinden kesintisiz çalışmaya devam eder. İnternet geldiğinde tüm adisyonlar bulutla otomatik senkronize edilir.
              </p>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-white/[0.08] bg-zinc-900/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-zinc-400">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Resmi onaylı kurumsal B2B SaaS standartları</span>
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 text-white font-bold hover:brightness-110 transition-all shadow-md active:scale-95"
          >
            Anladım & Kapat
          </button>
        </div>

      </div>
    </div>
  );
};
