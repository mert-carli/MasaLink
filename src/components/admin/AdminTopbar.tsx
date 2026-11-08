'use client';

import React, { useState } from 'react';
import { 
  Building2, 
  ChevronDown, 
  Printer, 
  Camera, 
  TrendingUp, 
  CreditCard, 
  LogOut, 
  Radio, 
  Bell, 
  Sparkles,
  Users,
  AlertTriangle,
  Smartphone,
  Store
} from 'lucide-react';
import Link from 'next/link';
import { AuthUser } from '@/utils/auth';
import { formatCurrency } from '@/utils/helpers';

interface AdminTopbarProps {
  user: AuthUser | null;
  totalRevenue: number;
  activeTableCount: number;
  totalTableCount: number;
  printerOnline: boolean;
  printerStatusText?: string;
  failedPrintCount?: number;
  onLogout: () => void;
  onGoToPos: () => void;
  onTestPrint: () => void;
  onTriggerVisionMock: () => void;
  onOpenFailedQueue?: () => void;
}

export const AdminTopbar: React.FC<AdminTopbarProps> = ({
  user,
  totalRevenue,
  activeTableCount,
  totalTableCount,
  printerOnline,
  printerStatusText,
  failedPrintCount = 0,
  onLogout,
  onGoToPos,
  onTestPrint,
  onTriggerVisionMock,
  onOpenFailedQueue,
}) => {
  const [branchOpen, setBranchOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(user?.branchName || 'Kadıköy Merkez');

  const branches = [
    'Kadıköy Merkez Şube',
    'Moda Sahil Şubesi',
    'Nişantaşı Konsept',
  ];

  return (
    <header className="h-16 border-b border-white/[0.08] bg-[#0c101c]/90 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
      
      {/* Left: Branch Selector */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setBranchOpen(!branchOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/90 border border-white/[0.08] hover:border-orange-500/40 text-xs font-bold text-white transition-all shadow-sm"
          >
            <Building2 className="w-4 h-4 text-orange-400 shrink-0" />
            <span className="truncate max-w-[150px] sm:max-w-[200px]">{selectedBranch}</span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </button>

          {branchOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-52 rounded-xl bg-[#111827] border border-white/[0.1] shadow-2xl py-1 z-50 animate-fadeIn">
              <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                Şube Değiştir
              </div>
              {branches.map((b) => (
                <button
                  key={b}
                  onClick={() => {
                    setSelectedBranch(b);
                    setBranchOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between ${
                    selectedBranch === b ? 'bg-orange-500/15 text-orange-400 font-bold' : 'text-zinc-300 hover:bg-white/[0.05]'
                  }`}
                >
                  <span>{b}</span>
                  {selectedBranch === b && <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Live System Status Indicator */}
        <div className="hidden xl:flex items-center gap-2 pl-3 border-l border-white/[0.08] text-xs">
          {/* Printer Status Pill */}
          {printerOnline ? (
            <button
              onClick={onTestPrint}
              title="ESC/POS 80mm Yazıcıyı Test Et"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-mono hover:bg-emerald-500/20 transition-colors"
            >
              <Printer className="w-3 h-3 text-emerald-400" />
              <span>Mutfak Yazıcısı: Online (80mm)</span>
            </button>
          ) : (
            <button
              onClick={onOpenFailedQueue || onTestPrint}
              title="DİKKAT: Mutfak Yazıcısı Kağıt Bitti veya Çevrimdışı!"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/50 text-[11px] font-mono hover:bg-rose-500/30 transition-colors animate-pulse"
            >
              <AlertTriangle className="w-3 h-3 text-rose-400" />
              <span>🔴 Mutfak: {printerStatusText || 'Kağıt Bitti / Çevrimdışı'}</span>
            </button>
          )}

          {/* Failed Print Queue Button if any */}
          {failedPrintCount > 0 && (
            <button
              onClick={onOpenFailedQueue}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-600 text-white font-bold text-[11px] shadow-lg shadow-rose-500/30 animate-bounce"
              title="Yazıcıya iletilemeyen adisyonları incele ve tekrar bas"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{failedPrintCount} Basılamayan Adisyon [Kuyruk]</span>
            </button>
          )}

          <button
            onClick={onTriggerVisionMock}
            title="RTSP Güvenlik Kameraları Bağlı"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[11px] font-mono hover:bg-cyan-500/20 transition-colors"
          >
            <Camera className="w-3 h-3 text-cyan-400" />
            <span>Vision AI: 4 IP Kamera</span>
          </button>

          <div
            title="Supabase Realtime & WebSocket Çoklu Cihaz Senkronizasyonu: Garson Cep, Kasa PC, Vision AI Kutusu"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[11px] font-mono"
          >
            <Radio className="w-3 h-3 text-purple-400 animate-pulse" />
            <span>Bulut Senkron: 4 Cihaz Canlı</span>
          </div>
        </div>
      </div>

      {/* Middle/Right: Quick Metrics Bar */}
      <div className="flex items-center gap-3">
        
        {/* Revenue Metric */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/60 border border-white/[0.06]">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          <div className="text-right">
            <span className="text-[10px] text-zinc-400 block leading-none">Günlük Ciro:</span>
            <span className="text-xs font-black text-white font-mono">{formatCurrency(totalRevenue)}</span>
          </div>
        </div>

        {/* Occupancy Metric */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/60 border border-white/[0.06]">
          <Users className="w-3.5 h-3.5 text-orange-400" />
          <div className="text-right">
            <span className="text-[10px] text-zinc-400 block leading-none">Doluluk:</span>
            <span className="text-xs font-bold text-white font-mono">
              {activeTableCount} / {totalTableCount} Masa
            </span>
          </div>
        </div>

        {/* Quick Kasa POS Button */}
        <button
          onClick={onGoToPos}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold text-xs shadow-md shadow-orange-500/20 active:scale-95 transition-all"
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Kasa POS Ekranı</span>
          <span className="sm:hidden">POS</span>
        </button>

        {/* POS Dedicated Kiosk Terminal Switch */}
        <Link
          href="/pos"
          target="_blank"
          title="Kasa & Hızlı Tahsilat Terminalini Aç (/pos)"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-md shadow-amber-500/20 active:scale-95 transition-all"
        >
          <Store className="w-3.5 h-3.5 text-slate-950" />
          <span className="hidden sm:inline">Kasa Terminali (POS)</span>
        </Link>

        {/* Waiter Mobile Terminal Switch */}
        <Link
          href="/waiter"
          target="_blank"
          title="Garson Mobil Terminalini Aç (/waiter)"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-amber-500/30 hover:border-amber-400 text-amber-300 font-bold text-xs shadow-sm active:scale-95 transition-all"
        >
          <Smartphone className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Garson Mobil</span>
        </Link>

        {/* Logout */}
        <button
          onClick={onLogout}
          title="Güvenli Çıkış Yap"
          className="p-2 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-white/[0.05] transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>

      </div>

    </header>
  );
};
