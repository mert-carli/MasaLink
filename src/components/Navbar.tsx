'use client';

import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  ChevronRight, 
  Menu, 
  X, 
  Layers, 
  MonitorSmartphone, 
  Calculator, 
  HelpCircle,
  Radio
} from 'lucide-react';
import { MasaLink3DLogo } from '@/components/MasaLink3DLogo';

interface NavbarProps {
  onOpenOnboarding: (planId?: string) => void;
  onOpenLoginDemo: () => void;
}

interface NavLinkItem {
  label: string;
  href: string;
  icon?: React.ElementType;
  badge?: string;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenOnboarding, onOpenLoginDemo }) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks: NavLinkItem[] = [
    { label: 'Özellikler', href: '#ozellikler', icon: Layers },
    { label: 'Canlı Simülatör', href: '#simulator', icon: MonitorSmartphone },
    { label: 'Demo Paneli', href: '/demo', icon: Sparkles },
    { label: 'Fiyatlandırma', href: '#fiyatlandirma' },
    { label: 'ROI Hesaplayıcı', href: '#roi-hesaplayici', icon: Calculator },
  ];

  const extraMobileLinks: NavLinkItem[] = [
    { label: 'Bulut & Offline Mimari', href: '#mimari', icon: Layers },
    { label: 'Sıkça Sorulan Sorular', href: '#sss', icon: HelpCircle },
  ];

  return (
    <>
      {/* Top Announcement Bar - Sleek, Unified, Perfectly Balanced */}
      <div className="bg-[#0b0b10] border-b border-white/[0.06] py-2 px-4 text-xs text-center flex items-center justify-center gap-2.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 font-bold text-[10px] tracking-wide border border-orange-500/20">
          YENİ SÜRÜM
        </span>
        <span className="text-zinc-300 font-medium text-[11px] sm:text-xs">
          Vision AI Kamera Entegrasyonu & Bulut POS Ekosistemi
        </span>
        <span className="text-zinc-600 hidden md:inline">•</span>
        <button 
          onClick={() => onOpenOnboarding('pro')}
          className="text-orange-400 hover:text-orange-300 font-semibold text-[11px] sm:text-xs inline-flex items-center gap-1 group transition-colors"
        >
          <span>Ücretsiz Keşfet</span>
          <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      <header
        className={`sticky top-0 z-40 transition-all duration-300 ${
          scrolled
            ? 'bg-[#09090b]/85 backdrop-blur-xl border-b border-white/[0.08] shadow-2xl shadow-black/50 py-3'
            : 'bg-transparent py-5'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            {/* Logo with 3D Brand Emblem */}
            <a href="#" className="flex items-center hover:opacity-90 transition-opacity">
              <MasaLink3DLogo size="sm" showText={true} />
            </a>

            {/* Desktop Navigation Links */}
            <nav className="hidden lg:flex items-center gap-1 bg-zinc-900/50 p-1 rounded-full border border-white/[0.08] backdrop-blur-md">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="px-3.5 py-1.5 rounded-full text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-all flex items-center gap-1.5 relative group"
                >
                  <span>{link.label}</span>
                  {link.badge && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                      {link.badge}
                    </span>
                  )}
                </a>
              ))}
            </nav>

            {/* Desktop Action Buttons */}
            <div className="hidden sm:flex items-center gap-2.5">
              <button
                onClick={onOpenLoginDemo}
                className="text-xs font-semibold text-zinc-300 hover:text-white px-3.5 py-2 rounded-xl hover:bg-white/[0.05] transition-colors"
              >
                Giriş Yap
              </button>
              <button
                onClick={() => onOpenOnboarding()}
                className="relative inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white transition-all bg-gradient-to-r from-orange-500 to-amber-600 rounded-xl shadow-md shadow-orange-500/25 hover:shadow-orange-500/40 hover:brightness-110 active:scale-95 group overflow-hidden"
              >
                <span className="relative z-10 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>14 Gün Ücretsiz Başla</span>
                  <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </span>
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              </button>
            </div>

            {/* Mobile Hamburger Button */}
            <div className="flex sm:hidden items-center gap-2">
              <button
                onClick={() => onOpenOnboarding()}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-orange-500 text-white"
              >
                Başla
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 text-zinc-400 hover:text-white rounded-lg bg-zinc-800/80 border border-white/[0.08]"
                aria-label="Menüyü Aç"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-3 px-4 pt-2 pb-6 bg-[#0e0e13] border-b border-white/[0.08] shadow-2xl flex flex-col gap-2">
            {[...navLinks, ...extraMobileLinks].map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-zinc-200 hover:bg-white/[0.06]"
              >
                <span className="flex items-center gap-2">
                  {link.icon && <link.icon className="w-4 h-4 text-orange-400" />}
                  {link.label}
                </span>
                {link.badge && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 font-mono">
                    {link.badge}
                  </span>
                )}
              </a>
            ))}
            <div className="pt-2 border-t border-white/[0.08] flex flex-col gap-2">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenLoginDemo();
                }}
                className="w-full py-2.5 text-center text-sm font-medium text-zinc-300 rounded-lg bg-zinc-800"
              >
                Mevcut Restoran Girişi
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenOnboarding();
                }}
                className="w-full py-2.5 text-center text-sm font-semibold text-white rounded-lg bg-gradient-to-r from-orange-500 to-amber-600 shadow-lg shadow-orange-500/25"
              >
                14 Gün Ücretsiz Başla
              </button>
            </div>
          </div>
        )}
      </header>
    </>
  );
};
