'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Plus,
  Edit3,
  Trash2,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  X,
  Search,
  RefreshCw,
  Building2,
  Smartphone,
  Lock,
} from 'lucide-react';
import { RoleKey, TableSection } from '@prisma/client';

export interface AdminStaffItem {
  id: string;
  name: string;
  email?: string;
  roleKey: RoleKey;
  roleName: string;
  section?: TableSection;
  avatar?: string;
  isActive: boolean;
  lastLoginAt?: string;
}

export const StaffManagementModule: React.FC = () => {
  const [staffList, setStaffList] = useState<AdminStaffItem[]>([]);
  const [selectedRole, setSelectedRole] = useState<'all' | RoleKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<AdminStaffItem | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<RoleKey>(RoleKey.WAITER);
  const [formSection, setFormSection] = useState<TableSection | ''>(TableSection.SALON);
  const [formPin, setFormPin] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchStaff = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/staff');
      if (res.ok) {
        const data = await res.json();
        if (data.staff) {
          setStaffList(data.staff);
        }
      }
    } catch (err) {
      console.warn('[StaffManagement] Personel yüklenemedi:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleOpenAddModal = () => {
    setEditingStaff(null);
    setFormName('');
    setFormEmail('');
    setFormRole(RoleKey.WAITER);
    setFormSection(TableSection.SALON);
    setFormPin('1234');
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (s: AdminStaffItem) => {
    setEditingStaff(s);
    setFormName(s.name);
    setFormEmail(s.email || '');
    setFormRole(s.roleKey);
    setFormSection(s.section || '');
    setFormPin(''); // Boş bırakılırsa değişmez
    setFormIsActive(s.isActive);
    setIsModalOpen(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName) return;

    try {
      if (editingStaff) {
        // Güncelle
        const res = await fetch('/api/admin/staff', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingStaff.id,
            data: {
              name: formName,
              email: formEmail,
              roleKey: formRole,
              section: formSection || undefined,
              pin: formPin.trim().length > 0 ? formPin.trim() : undefined,
              isActive: formIsActive,
            },
          }),
        });

        if (res.ok) {
          setNotice(`${formName} bilgileri başarıyla güncellendi.`);
          fetchStaff();
        }
      } else {
        // Yeni Personel Ekle
        const res = await fetch('/api/admin/staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName,
            email: formEmail,
            roleKey: formRole,
            section: formSection || undefined,
            pin: formPin || '1234',
          }),
        });

        if (res.ok) {
          setNotice(`${formName} sisteme başarıyla eklendi.`);
          fetchStaff();
        }
      }

      setIsModalOpen(false);
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      alert('Personel kaydedilemedi: ' + err.message);
    }
  };

  const handleDeleteStaff = async (s: AdminStaffItem) => {
    if (!confirm(`${s.name} isimli personeli sistemden kaldırmak istediğinize emin misiniz?`)) return;

    try {
      const res = await fetch('/api/admin/staff', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s.id }),
      });

      if (res.ok) {
        setNotice(`${s.name} kaldırıldı.`);
        fetchStaff();
        setTimeout(() => setNotice(null), 4000);
      }
    } catch (err: any) {
      alert('Personel silinemedi: ' + err.message);
    }
  };

  const filteredStaff = staffList.filter((s) => {
    if (selectedRole !== 'all' && s.roleKey !== selectedRole) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return s.name.toLowerCase().includes(q) || (s.email && s.email.toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Üst Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0c101c] p-4 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-base font-extrabold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-400" />
            <span>Personel ve Rol Yönetimi</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Garson, kasiyer, şef aşçı ve yöneticileri tanımlayın; 4 haneli hızlı giriş PIN kodlarını ve sorumlu oldukları bölgeleri belirleyin.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchStaff}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Listeyi Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleOpenAddModal}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs transition-all shadow-md flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Personel Ekle</span>
          </button>
        </div>
      </div>

      {/* Bildirim Toast */}
      {notice && (
        <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4" />
          <span>{notice}</span>
        </div>
      )}

      {/* Filtre ve Arama */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setSelectedRole('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedRole === 'all'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Tüm Kadro ({staffList.length})
          </button>
          <button
            onClick={() => setSelectedRole(RoleKey.WAITER)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedRole === RoleKey.WAITER
                ? 'bg-blue-500 text-white shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Garsonlar
          </button>
          <button
            onClick={() => setSelectedRole(RoleKey.CASHIER)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedRole === RoleKey.CASHIER
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Kasiyerler
          </button>
          <button
            onClick={() => setSelectedRole(RoleKey.KITCHEN)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedRole === RoleKey.KITCHEN
                ? 'bg-orange-500 text-slate-950 shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Mutfak Ekibi
          </button>
          <button
            onClick={() => setSelectedRole(RoleKey.ADMIN)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedRole === RoleKey.ADMIN
                ? 'bg-purple-500 text-white shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Yöneticiler
          </button>
        </div>

        <div className="relative sm:w-60">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="İsim veya e-posta ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
          />
        </div>
      </div>

      {/* Personel Tablosu */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredStaff.map((s) => {
          return (
            <div
              key={s.id}
              className={`p-4 rounded-2xl bg-[#0c101c] border transition-all flex flex-col justify-between ${
                s.isActive ? 'border-slate-800 hover:border-slate-700' : 'border-slate-800/40 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center font-bold text-sm text-amber-300">
                      {s.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-white leading-tight">{s.name}</h4>
                      <p className="text-[11px] text-slate-400">{s.email || 'PIN ile giriş'}</p>
                    </div>
                  </div>

                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg border uppercase ${
                    s.roleKey === RoleKey.ADMIN
                      ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                      : s.roleKey === RoleKey.WAITER
                      ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                      : s.roleKey === RoleKey.CASHIER
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-orange-500/15 text-orange-300 border-orange-500/30'
                  }`}>
                    {s.roleName || s.roleKey}
                  </span>
                </div>

                <div className="text-xs text-slate-400 space-y-1.5 mt-3 pt-3 border-t border-slate-800/60">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-slate-500" />
                      Sorumlu Bölge:
                    </span>
                    <span className="font-bold text-slate-200">
                      {s.section || 'Tüm Restoran'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1">
                      <KeyRound className="w-3 h-3 text-slate-500" />
                      Terminal PIN:
                    </span>
                    <span className="font-mono text-emerald-400 font-bold">
                      •••• (Bcrypt Hash)
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span>Durum:</span>
                    <span className={s.isActive ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                      {s.isActive ? 'Görevde (Aktif)' : 'İzinli / Pasif'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Aksiyonlar */}
              <div className="mt-4 pt-2.5 border-t border-slate-800/80 flex items-center justify-end gap-1.5">
                <button
                  onClick={() => handleOpenEditModal(s)}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Düzenle / PIN</span>
                </button>
                <button
                  onClick={() => handleDeleteStaff(s)}
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                  title="Personeli Sil"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Personel Ekle / Düzenle Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-[#0c101c] border border-slate-800 rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-extrabold text-white">
                {editingStaff ? `${editingStaff.name} Düzenle` : 'Yeni Personel Tanımla'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStaff} className="space-y-3.5 mt-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Ad Soyad</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Örn: Caner Demir"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">E-Posta (İsteğe Bağlı)</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="caner@masalink.com"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Görevi / Rolü</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as RoleKey)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value={RoleKey.WAITER}>Garson</option>
                    <option value={RoleKey.CASHIER}>Kasiyer</option>
                    <option value={RoleKey.KITCHEN}>Mutfak / Şef</option>
                    <option value={RoleKey.ADMIN}>Yönetici</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Atanan Bölge</label>
                  <select
                    value={formSection}
                    onChange={(e) => setFormSection(e.target.value as TableSection)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Tüm Restoran</option>
                    <option value={TableSection.SALON}>İç Salon</option>
                    <option value={TableSection.BAHCE}>Açık Bahçe</option>
                    <option value={TableSection.TERAS}>Teras Katı</option>
                    <option value={TableSection.BAR}>Bar Bölgesi</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Terminal 4 Haneli PIN Kodu {editingStaff && '(Değiştirmek istemiyorsanız boş bırakın)'}
                </label>
                <div className="relative">
                  <KeyRound className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    maxLength={6}
                    value={formPin}
                    onChange={(e) => setFormPin(e.target.value)}
                    placeholder={editingStaff ? 'Mevcut PIN korunur' : 'Örn: 1234'}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white font-mono tracking-widest focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="staffActiveCheck"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded border-slate-700 text-amber-500"
                />
                <label htmlFor="staffActiveCheck" className="text-xs text-slate-300 font-semibold cursor-pointer">
                  Personel Aktif (Giriş Yapabilir)
                </label>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-400 hover:text-white text-xs font-bold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black"
                >
                  {editingStaff ? 'Değişiklikleri Kaydet' : 'Personeli Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
