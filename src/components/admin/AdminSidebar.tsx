'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  LayoutDashboard, 
  CreditCard, 
  UtensilsCrossed, 
  BarChart3, 
  Settings, 
  LogOut, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Printer, 
  Eye, 
  Radio, 
  ShieldCheck,
  Building2,
  ExternalLink,
  Smartphone,
  ChefHat,
  LayoutGrid,
  Users
} from 'lucide-react';
import { MasaLink3DLogo } from '@/components/MasaLink3DLogo';
import { AuthUser } from '@/utils/auth';

export type AdminModuleType = 'floor' | 'pos' | 'menu' | 'tables' | 'staff' | 'finance' | 'settings';

interface AdminSidebarProps {
  activeModule: AdminModuleType;
  onChangeModule: (module: AdminModuleType) => void;
  user: AuthUser | null;
  onLogout: () => void;
  activeTableCount?: number;
  aiAlertCount?: number;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeModule,
  onChangeModule,
  user,
  onLogout,
  activeTableCount = 8,
  aiAlertCount = 2,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = [
    {
      id: 'floor' as AdminModuleType,
      label: 'Salon & Canlı Radar',
      icon: LayoutDashboard,
      badge: activeTableCount > 0 ? `${activeTableCount} Masa` : undefined,
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
      description: 'Vision AI & Canlı Masa Krokisi'
    },
    {
      id: 'pos' as AdminModuleType,
      label: 'Kasa & Hızlı POS',
      icon: CreditCard,
      badge: 'Dokunmatik',
      badgeColor: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
      description: 'Nakit, Kart & Parçalı Hesap Kapatma'
    },
    {
      id: 'menu' as AdminModuleType,
      label: 'Menü, Reçete & QR',
      icon: UtensilsCrossed,
      badge: 'Stok Düşüm',
      badgeColor: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
      description: 'Gramajlı Hammadde & Masa QR Baskı'
    },
    {
      id: 'tables' as AdminModuleType,
      label: 'Masalar & Bölgeler',
      icon: LayoutGrid,
      badge: 'CRUD',
      badgeColor: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
      description: 'Masa Ekle, Bölge & QR Yönetimi'
    },
    {
      id: 'staff' as AdminModuleType,
      label: 'Personel & Roller',
      icon: Users,
      badge: 'PIN Yetki',
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
      description: 'Garson, Kasiyer & PIN Tanımlama'
    },
    {
      id: 'finance' as AdminModuleType,
      label: 'Finans & Kârlılık',
      icon: BarChart3,
      badge: 'Gerçek Kâr',
      badgeColor: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
      description: 'Ciro, Maliyet & Saatlik Heatmap'
    },
    {
      id: 'settings' as AdminModuleType,
      label: 'Sistem & Yazıcılar',
      icon: Settings,
      description: 'ESC/POS 80mm & Vision AI Kamera'
    },
  ];

  return (
    <aside
      className={`relative z-30 flex flex-col justify-between border-r border-white/[0.08] bg-[#0c101c]/95 backdrop-blur-md transition-all duration-300 h-screen select-none ${
        collapsed ? 'w-20' : 'w-72'
      }`}
    >
      {/* Top Branding */}
      <div>
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          {!collapsed ? (
            <div className="flex items-center gap-3 overflow-hidden">
              <MasaLink3DLogo size="sm" showText={false} className="shrink-0" />
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
                    KOKPİT
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">v2.4</span>
                </div>
                <span className="text-xs font-semibold text-zinc-300 truncate mt-0.5">
                  {user?.restaurantName || 'Artisan Burger'}
                </span>
              </div>
            </div>
          ) : (
            <div className="mx-auto">
              <MasaLink3DLogo size="xs" showText={false} />
            </div>
          )}

          {/* Collapse Toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
            title={collapsed ? 'Genişlet' : 'Daralt'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Tenant Details (When Expanded) */}
        {!collapsed && (
          <div className="px-4 py-3 mx-3 my-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-orange-400" />
                Tenant ID:
              </span>
              <span className="font-mono text-zinc-300 text-[10px] bg-black/40 px-1.5 py-0.5 rounded">
                {user?.tenantId || 'artisan_kadikoy_01'}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-zinc-400">
                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                Vision AI Radarı:
              </span>
              <span className="text-emerald-400 font-medium text-[10px]">3 Kamera Aktif</span>
            </div>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="p-3 space-y-1.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onChangeModule(item.id)}
                className={`w-full group relative flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-orange-500/20 to-amber-500/10 text-white font-medium border border-orange-500/30 shadow-[0_0_20px_rgba(249,115,22,0.15)]'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] border border-transparent'
                }`}
                title={collapsed ? item.label : undefined}
              >
                {/* Active Indicator Bar */}
                {isActive && (
                  <div className="absolute left-0 top-2 bottom-2 w-1 bg-gradient-to-b from-orange-400 to-amber-500 rounded-r-full shadow-[0_0_8px_#f97316]" />
                )}

                <div
                  className={`p-2 rounded-lg transition-colors shrink-0 ${
                    isActive
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'bg-white/[0.04] text-zinc-400 group-hover:text-zinc-200 group-hover:bg-white/[0.08]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>

                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold truncate">{item.label}</span>
                      {item.badge && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${item.badgeColor || 'bg-white/[0.08] text-zinc-300'}`}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-[10px] text-zinc-500 truncate mt-0.5 font-normal">
                        {item.description}
                      </p>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Profile & Actions */}
      <div className="p-3 border-t border-white/[0.06] space-y-1.5">
        {/* KDS Kitchen Display Station Link */}
        <Link
          href="/kds"
          target="_blank"
          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-orange-300 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/25 transition-all shadow-sm ${
            collapsed ? 'justify-center' : ''
          }`}
          title="Mutfak Ekranını Aç (/kds)"
        >
          <ChefHat className="w-4 h-4 text-orange-400 shrink-0" />
          {!collapsed && <span className="truncate">KDS Mutfak Ekranı 👨‍🍳</span>}
        </Link>

        {/* Waiter Mobile Terminal Link */}
        <Link
          href="/waiter"
          target="_blank"
          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 transition-all shadow-sm ${
            collapsed ? 'justify-center' : ''
          }`}
          title="Garson Mobil Terminalini Aç (/waiter)"
        >
          <Smartphone className="w-4 h-4 text-amber-400 shrink-0" />
          {!collapsed && <span className="truncate">Garson Mobil Terminali 📱</span>}
        </Link>

        {/* Landing Page Link */}
        <Link
          href="/"
          target="_blank"
          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors ${
            collapsed ? 'justify-center' : ''
          }`}
          title="Tanıtım Sayfasını Aç"
        >
          <ExternalLink className="w-4 h-4 text-zinc-500 shrink-0" />
          {!collapsed && <span className="truncate">Tanıtım Sitesine Git</span>}
        </Link>

        {/* User Card */}
        <div
          className={`p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center ${
            collapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-orange-500 to-amber-400 text-zinc-950 font-black flex items-center justify-center text-xs shadow-md shrink-0">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'ML'}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold text-zinc-200 truncate">{user?.name || 'Murat Yılmaz'}</p>
                  <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    PRO
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 truncate">{user?.email || 'admin@masalink.com'}</p>
              </div>
            )}
          </div>

          {!collapsed && (
            <button
              onClick={onLogout}
              className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
              title="Çıkış Yap"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={onLogout}
            className="w-full py-2 flex items-center justify-center text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
            title="Çıkış Yap"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </aside>
  );
};
