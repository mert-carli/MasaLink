'use client';

import React from 'react';
import { Radio, ShieldCheck, Heart, FileText, Lock, Server } from 'lucide-react';
import { MasaLink3DLogo } from '@/components/MasaLink3DLogo';
import { LegalDocType } from '@/components/LegalModal';

interface FooterProps {
  onOpenLegal?: (doc: LegalDocType) => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenLegal }) => {
  const handleOpenDoc = (e: React.MouseEvent, doc: LegalDocType) => {
    e.preventDefault();
    if (onOpenLegal) {
      onOpenLegal(doc);
    }
  };

  return (
    <footer className="border-t border-white/[0.08] bg-[#07070a] pt-16 pb-12 text-zinc-400 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-white/[0.06]">
          
          {/* Brand Info with 3D Logo */}
          <div className="lg:col-span-2 space-y-4">
            <MasaLink3DLogo size="lg" badge="Official" />

            <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">
              Restoran, kafe ve zincir gastronomi işletmeleri için bulut tabanlı POS, temassız masadan QR sipariş, anlık mutfak KDS ekranı ve gramajlı reçete takip platformu.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button 
                onClick={(e) => handleOpenDoc(e, 'sla')}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-mono hover:bg-emerald-500/20 transition-all cursor-pointer"
              >
                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>Sistemler Aktif • %99.98 SLA Garantisi</span>
              </button>

              <span className="flex items-center gap-1 text-[11px] text-zinc-500 border border-white/[0.06] px-2 py-0.5 rounded-full">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>256-bit SSL • GİB Uyumlu</span>
              </span>
            </div>
          </div>

          {/* Links: Platform */}
          <div>
            <h4 className="text-xs uppercase font-bold text-white tracking-wider mb-3">
              Platform
            </h4>
            <ul className="space-y-2">
              <li><a href="#ozellikler" className="hover:text-white transition-colors">QR Menü & Sipariş</a></li>
              <li><a href="#ozellikler" className="hover:text-white transition-colors">KDS Mutfak Ekranı</a></li>
              <li><a href="#ozellikler" className="hover:text-white transition-colors">Garson Terminali (PWA)</a></li>
              <li><a href="#ozellikler" className="hover:text-white transition-colors">Gramajlı Reçete & Stok</a></li>
              <li><a href="/demo" className="text-orange-400 hover:text-orange-300 transition-colors font-medium">Canlı Demo Laboratuvarı</a></li>
            </ul>
          </div>

          {/* Links: Çözümler */}
          <div>
            <h4 className="text-xs uppercase font-bold text-white tracking-wider mb-3">
              Çözümler
            </h4>
            <ul className="space-y-2">
              <li><a href="#fiyatlandirma" className="hover:text-white transition-colors">Butik Kafeler</a></li>
              <li><a href="#fiyatlandirma" className="hover:text-white transition-colors">Bistro & Restoranlar</a></li>
              <li><a href="#fiyatlandirma" className="hover:text-white transition-colors">Zincir & Franchising</a></li>
              <li><a href="#roi-hesaplayici" className="hover:text-white transition-colors">ROI Hesaplayıcı</a></li>
              <li><a href="#mimari" className="hover:text-white transition-colors">Bulut & Offline Mimari</a></li>
            </ul>
          </div>

          {/* Links: Kurumsal & Yasal Güvenlik (B2B SaaS Güveni) */}
          <div>
            <h4 className="text-xs uppercase font-bold text-white tracking-wider mb-3">
              Yasal & Kurumsal Güven
            </h4>
            <ul className="space-y-2">
              <li>
                <button 
                  onClick={(e) => handleOpenDoc(e, 'distance_sales')}
                  className="hover:text-orange-400 text-left transition-colors flex items-center gap-1.5"
                >
                  <FileText className="w-3 h-3 text-zinc-500" />
                  <span>Mesafeli Satış & İade Şartları</span>
                </button>
              </li>
              <li>
                <button 
                  onClick={(e) => handleOpenDoc(e, 'kvkk')}
                  className="hover:text-orange-400 text-left transition-colors flex items-center gap-1.5"
                >
                  <Lock className="w-3 h-3 text-zinc-500" />
                  <span>KVKK ve Gizlilik Politikası</span>
                </button>
              </li>
              <li>
                <button 
                  onClick={(e) => handleOpenDoc(e, 'sla')}
                  className="hover:text-emerald-400 text-left transition-colors flex items-center gap-1.5 font-semibold text-zinc-300"
                >
                  <Server className="w-3 h-3 text-emerald-400" />
                  <span>SLA Taahhüdü (%99.9 Uptime)</span>
                </button>
              </li>
              <li>
                <span className="text-[11px] text-zinc-500 block pt-1">
                  E-Fatura & GİB Entegrasyon Uyumluluğu
                </span>
              </li>
              <li>
                <a href="mailto:kurumsal@masalink.com" className="text-orange-400 hover:text-orange-300 font-semibold block pt-1">
                  Destek: kurumsal@masalink.com
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-zinc-500 text-[11px]">
          <div>
            &copy; {new Date().getFullYear()} Masalink Bulut Restoran Teknolojileri A.Ş. Tüm hakları saklıdır.
          </div>
          <div className="flex items-center gap-2">
            <span>Türkiye'nin ilk Vision AI entegreli restoran işletim sistemi.</span>
            <span>•</span>
            <span className="text-emerald-400 font-mono">ISO 27001 Güvenlik Standardı</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
