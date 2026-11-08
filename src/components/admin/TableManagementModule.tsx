'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutGrid,
  Plus,
  Edit3,
  Trash2,
  QrCode,
  Users,
  CheckCircle2,
  X,
  Search,
  ExternalLink,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import { TableSection } from '@prisma/client';

export interface AdminTableItem {
  id: string;
  code: string;
  name: string;
  section: TableSection;
  capacity: number;
  isActive: boolean;
  sortOrder: number;
  qrSlug?: string;
}

export const TableManagementModule: React.FC = () => {
  const [tables, setTables] = useState<AdminTableItem[]>([]);
  const [selectedSection, setSelectedSection] = useState<'all' | TableSection>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<AdminTableItem | null>(null);

  // Form State
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formSection, setFormSection] = useState<TableSection>(TableSection.SALON);
  const [formCapacity, setFormCapacity] = useState('4');
  const [formIsActive, setFormIsActive] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchTables = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/tables');
      if (res.ok) {
        const data = await res.json();
        if (data.tables) {
          setTables(data.tables);
        }
      }
    } catch (err) {
      console.warn('[TableManagement] Masalar yüklenemedi:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  const handleOpenAddModal = () => {
    setEditingTable(null);
    setFormCode(`tbl-${tables.length + 1}`);
    setFormName(`Masa ${tables.length + 1}`);
    setFormSection(TableSection.SALON);
    setFormCapacity('4');
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (t: AdminTableItem) => {
    setEditingTable(t);
    setFormCode(t.code);
    setFormName(t.name);
    setFormSection(t.section);
    setFormCapacity(t.capacity.toString());
    setFormIsActive(t.isActive);
    setIsModalOpen(true);
  };

  const handleSaveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode || !formName) return;

    try {
      if (editingTable) {
        // Güncelle
        const res = await fetch('/api/admin/tables', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingTable.id,
            data: {
              code: formCode,
              name: formName,
              section: formSection,
              capacity: Number(formCapacity) || 4,
              isActive: formIsActive,
            },
          }),
        });

        if (res.ok) {
          setNotice(`${formName} başarıyla güncellendi.`);
          fetchTables();
        }
      } else {
        // Yeni Masa Ekle
        const res = await fetch('/api/admin/tables', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: formCode,
            name: formName,
            section: formSection,
            capacity: Number(formCapacity) || 4,
          }),
        });

        if (res.ok) {
          setNotice(`${formName} sisteme başarıyla eklendi.`);
          fetchTables();
        }
      }

      setIsModalOpen(false);
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      alert('Masa kaydedilemedi: ' + err.message);
    }
  };

  const handleDeleteTable = async (t: AdminTableItem) => {
    if (!confirm(`${t.name} masasını sistemden silmek istediğinize emin misiniz?`)) return;

    try {
      const res = await fetch('/api/admin/tables', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id }),
      });

      if (res.ok) {
        setNotice(`${t.name} silindi.`);
        fetchTables();
        setTimeout(() => setNotice(null), 4000);
      }
    } catch (err: any) {
      alert('Masa silinemedi: ' + err.message);
    }
  };

  const copyQrLink = (tableCode: string) => {
    const url = `${window.location.origin}/r/artisan-burger/${tableCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(tableCode);
      setTimeout(() => setCopiedId(null), 2500);
    });
  };

  const filteredTables = tables.filter((t) => {
    if (selectedSection !== 'all' && t.section !== selectedSection) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Üst Bar: Başlık, İstatistik ve Aksiyonlar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0c101c] p-4 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-base font-extrabold text-white flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-orange-400" />
            <span>Masa ve Bölge Yönetimi</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Kod değiştirmeden yeni masa ekleyin, bölge atayın, kapasiteleri belirleyin ve QR menü bağlantılarını yönetin.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchTables}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Masaları Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleOpenAddModal}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-slate-950 font-black text-xs transition-all shadow-md flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Masa Ekle</span>
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

      {/* Bölge Filtreleri ve Arama */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setSelectedSection('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedSection === 'all'
                ? 'bg-orange-500 text-slate-950 shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Tüm Bölgeler ({tables.length})
          </button>
          <button
            onClick={() => setSelectedSection(TableSection.SALON)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedSection === TableSection.SALON
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            İç Salon
          </button>
          <button
            onClick={() => setSelectedSection(TableSection.BAHCE)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedSection === TableSection.BAHCE
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Açık Bahçe
          </button>
          <button
            onClick={() => setSelectedSection(TableSection.TERAS)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedSection === TableSection.TERAS
                ? 'bg-blue-500 text-white shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Teras Katı
          </button>
          <button
            onClick={() => setSelectedSection(TableSection.BAR)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedSection === TableSection.BAR
                ? 'bg-purple-500 text-white shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Bar Bölgesi
          </button>
        </div>

        <div className="relative sm:w-60">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Masa adı veya kod ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50"
          />
        </div>
      </div>

      {/* Masalar Tablosu / Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {filteredTables.map((t) => {
          return (
            <div
              key={t.id}
              className={`p-3.5 rounded-2xl bg-[#0c101c] border transition-all flex flex-col justify-between ${
                t.isActive ? 'border-slate-800 hover:border-slate-700' : 'border-slate-800/50 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-black text-white">{t.name}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border uppercase ${
                    t.section === TableSection.SALON
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : t.section === TableSection.BAHCE
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : t.section === TableSection.TERAS
                      ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                      : 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                  }`}>
                    {t.section}
                  </span>
                </div>

                <div className="text-xs text-slate-400 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span>Kod:</span>
                    <span className="font-mono text-slate-300">{t.code}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span>Kapasite:</span>
                    <span className="text-slate-300 flex items-center gap-1">
                      <Users className="w-3 h-3 text-slate-400" />
                      {t.capacity} Kişi
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span>Durum:</span>
                    <span className={t.isActive ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                      {t.isActive ? 'Aktif' : 'Pasif'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Aksiyon Butonları */}
              <div className="mt-4 pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-1.5">
                <button
                  type="button"
                  onClick={() => copyQrLink(t.code)}
                  className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] font-bold text-amber-300 transition-colors flex items-center gap-1"
                  title="Masa QR Menü Linkini Kopyala"
                >
                  {copiedId === t.code ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedId === t.code ? 'Kopyalandı' : 'QR Link'}</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEditModal(t)}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                    title="Masayı Düzenle"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteTable(t)}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                    title="Masayı Sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Masa Ekle / Düzenle Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-[#0c101c] border border-slate-800 rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-extrabold text-white">
                {editingTable ? `${editingTable.name} Düzenle` : 'Yeni Masa Tanımla'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTable} className="space-y-3.5 mt-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Masa Adı</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Örn: Masa 18 veya VIP Salon 1"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Masa Kodu (ID)</label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="Örn: tbl-18"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Kapasite (Kişi)</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    required
                    value={formCapacity}
                    onChange={(e) => setFormCapacity(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Restoran Bölgesi</label>
                <select
                  value={formSection}
                  onChange={(e) => setFormSection(e.target.value as TableSection)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-orange-500"
                >
                  <option value={TableSection.SALON}>İç Salon</option>
                  <option value={TableSection.BAHCE}>Açık Bahçe</option>
                  <option value={TableSection.TERAS}>Teras Katı</option>
                  <option value={TableSection.BAR}>Bar Bölgesi</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="tableActiveCheck"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded border-slate-700 text-orange-500"
                />
                <label htmlFor="tableActiveCheck" className="text-xs text-slate-300 font-semibold cursor-pointer">
                  Masa Hizmete Açık (Aktif)
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
                  className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-slate-950 text-xs font-black"
                >
                  {editingTable ? 'Değişiklikleri Kaydet' : 'Masayı Oluştur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
