'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  UtensilsCrossed, 
  Layers, 
  QrCode, 
  AlertTriangle, 
  CheckCircle2, 
  Plus, 
  Edit3, 
  Printer, 
  Download, 
  Scale, 
  Package, 
  Search, 
  Sparkles, 
  Wifi, 
  Trash2, 
  TrendingDown, 
  Flame, 
  Check, 
  X,
  History,
  Tag,
  DollarSign,
  Coffee,
  CheckSquare
} from 'lucide-react';
import { formatCurrency } from '@/utils/helpers';
import { MasaLink3DLogo } from '@/components/MasaLink3DLogo';
import { getStoredAuthUser } from '@/utils/auth';

export interface RawIngredient {
  id: string;
  name: string;
  currentStock: number;
  unit: string;
  criticalThreshold: number;
  costPerUnit: number; // TL
  wasteFactorPercent: number; // Pişme, çekme veya hazırlık firesi oranı (%3 - %8)
}

export interface MenuItemWithRecipe {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  margin: number;
  station?: string;
  recipe: {
    ingredientName: string;
    netAmount: number;
    unit: string;
    wastePercent: number;
    grossDeduction: number; // Efektif düşüm = net * (1 + waste%)
  }[];
}

export interface WasteEntry {
  id: string;
  ingredientId: string;
  ingredientName: string;
  amount: number;
  unit: string;
  reason: 'burnt' | 'dropped' | 'expired' | 'return';
  costTl: number;
  timestamp: string;
  chefName: string;
}

export interface DynamicCategoryItem {
  id: string;
  name: string;
  sortOrder: number;
  isActive?: boolean;
}

export interface DynamicExtraItem {
  id: string;
  name: string;
  extraPrice: number;
  isActive?: boolean;
}

const INITIAL_INGREDIENTS: RawIngredient[] = [
  { id: 'ing1', name: 'Dana Kıyma (%20 Yağlı)', currentStock: 8.5, unit: 'kg', criticalThreshold: 5.0, costPerUnit: 420, wasteFactorPercent: 5 },
  { id: 'ing2', name: 'Brioche Burger Ekmeği', currentStock: 32, unit: 'adet', criticalThreshold: 40, costPerUnit: 14, wasteFactorPercent: 3 },
  { id: 'ing3', name: 'Trüf Aromalı Mayonez', currentStock: 1.2, unit: 'kg', criticalThreshold: 1.5, costPerUnit: 280, wasteFactorPercent: 6 },
  { id: 'ing4', name: 'Cheddar Peyniri Dilim', currentStock: 65, unit: 'dilim', criticalThreshold: 50, costPerUnit: 6, wasteFactorPercent: 2 },
  { id: 'ing5', name: 'Patates (Dondurulmuş Özel Kesim)', currentStock: 24, unit: 'kg', criticalThreshold: 15, costPerUnit: 45, wasteFactorPercent: 8 },
  { id: 'ing6', name: 'Karamelize Soğan Harcı', currentStock: 3.4, unit: 'kg', criticalThreshold: 2.0, costPerUnit: 90, wasteFactorPercent: 4 },
];

const INITIAL_PRODUCTS: MenuItemWithRecipe[] = [
  {
    id: 'p1',
    name: 'Trüflü Smash Burger (160g)',
    category: 'Burgerler',
    price: 295,
    cost: 103.4,
    margin: 64.9,
    station: 'GRILL',
    recipe: [
      { ingredientName: 'Dana Kıyma (%20 Yağlı)', netAmount: 160, unit: 'gr', wastePercent: 5, grossDeduction: 168 },
      { ingredientName: 'Brioche Burger Ekmeği', netAmount: 1, unit: 'adet', wastePercent: 3, grossDeduction: 1.03 },
      { ingredientName: 'Trüf Aromalı Mayonez', netAmount: 30, unit: 'gr', wastePercent: 6, grossDeduction: 31.8 },
      { ingredientName: 'Cheddar Peyniri Dilim', netAmount: 2, unit: 'dilim', wastePercent: 2, grossDeduction: 2.04 },
    ]
  },
  {
    id: 'p2',
    name: 'Double Cheddar Bacon Burger',
    category: 'Burgerler',
    price: 340,
    cost: 128.1,
    margin: 62.3,
    station: 'GRILL',
    recipe: [
      { ingredientName: 'Dana Kıyma (%20 Yağlı)', netAmount: 220, unit: 'gr', wastePercent: 5, grossDeduction: 231 },
      { ingredientName: 'Brioche Burger Ekmeği', netAmount: 1, unit: 'adet', wastePercent: 3, grossDeduction: 1.03 },
      { ingredientName: 'Cheddar Peyniri Dilim', netAmount: 3, unit: 'dilim', wastePercent: 2, grossDeduction: 3.06 },
    ]
  },
  {
    id: 'p3',
    name: 'Baharatlı Kajun Patates (200g)',
    category: 'Yanlar',
    price: 110,
    cost: 23.7,
    margin: 78.5,
    station: 'GRILL',
    recipe: [
      { ingredientName: 'Patates (Dondurulmuş Özel Kesim)', netAmount: 200, unit: 'gr', wastePercent: 8, grossDeduction: 216 },
    ]
  },
];

const INITIAL_WASTE_LOGS: WasteEntry[] = [
  {
    id: 'w-1',
    ingredientId: 'ing1',
    ingredientName: 'Dana Kıyma (%20 Yağlı)',
    amount: 0.32,
    unit: 'kg',
    reason: 'burnt',
    costTl: 134.4,
    timestamp: 'Bugün 14:20',
    chefName: 'Şef Serkan',
  },
  {
    id: 'w-2',
    ingredientId: 'ing5',
    ingredientName: 'Patates (Dondurulmuş Özel Kesim)',
    amount: 0.6,
    unit: 'kg',
    reason: 'dropped',
    costTl: 27.0,
    timestamp: 'Bugün 18:45',
    chefName: 'Mutfak Ekibi',
  },
];

export const MenuRecipeModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'products' | 'categories' | 'recipes' | 'ingredients' | 'waste' | 'qr'>('products');
  const [ingredients, setIngredients] = useState<RawIngredient[]>(INITIAL_INGREDIENTS);
  const [products, setProducts] = useState<MenuItemWithRecipe[]>(INITIAL_PRODUCTS);
  const [categories, setCategories] = useState<DynamicCategoryItem[]>([
    { id: 'cat-1', name: 'Burgerler', sortOrder: 1 },
    { id: 'cat-2', name: 'Yanlar', sortOrder: 2 },
    { id: 'cat-3', name: 'İçecekler', sortOrder: 3 },
    { id: 'cat-4', name: 'Tatlılar', sortOrder: 4 },
  ]);
  const [extras, setExtras] = useState<DynamicExtraItem[]>([
    { id: 'ex-1', name: 'Ekstra Eritilmiş Cheddar', extraPrice: 35 },
    { id: 'ex-2', name: 'Çıtır Dana Füme Bacon', extraPrice: 55 },
    { id: 'ex-3', name: 'Trüflü Mayonez Sosu', extraPrice: 30 },
    { id: 'ex-4', name: 'Karamelize Çıtır Soğan', extraPrice: 25 },
    { id: 'ex-5', name: 'Jalapeno Acı Biber Turşusu', extraPrice: 20 },
  ]);
  const [wasteLogs, setWasteLogs] = useState<WasteEntry[]>(INITIAL_WASTE_LOGS);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Ürün Ekle / Düzenle Modal State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<MenuItemWithRecipe | null>(null);
  const [formProdName, setFormProdName] = useState('');
  const [formProdCategory, setFormProdCategory] = useState('Burgerler');
  const [formProdPrice, setFormProdPrice] = useState('295');
  const [formProdStation, setFormProdStation] = useState('GRILL');

  // Kategori Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [formCategoryName, setFormCategoryName] = useState('');

  // Ekstra Modal State
  const [isExtraModalOpen, setIsExtraModalOpen] = useState(false);
  const [editingExtra, setEditingExtra] = useState<DynamicExtraItem | null>(null);
  const [formExtraName, setFormExtraName] = useState('');
  const [formExtraPrice, setFormExtraPrice] = useState('35');

  // Hammadde Ekle Modal State
  const [isIngredientModalOpen, setIsIngredientModalOpen] = useState(false);
  const [formIngName, setFormIngName] = useState('');
  const [formIngUnit, setFormIngUnit] = useState('kg');
  const [formIngStock, setFormIngStock] = useState('10');
  const [formIngMinStock, setFormIngMinStock] = useState('3');
  const [formIngCost, setFormIngCost] = useState('150');

  // Waste Entry Modal State
  const [isWasteModalOpen, setIsWasteModalOpen] = useState(false);
  const [selectedIngredientId, setSelectedIngredientId] = useState<string>(INITIAL_INGREDIENTS[0].id);
  const [wasteAmount, setWasteAmount] = useState<string>('0.5');
  const [wasteReason, setWasteReason] = useState<'burnt' | 'dropped' | 'expired' | 'return'>('burnt');

  // QR Print State
  const [selectedQrTable, setSelectedQrTable] = useState<string>('Masa 4');
  const [qrStyle, setQrStyle] = useState<'amber' | 'dark' | 'minimal'>('amber');

  // Sunucudan Dinamik Menü Verilerini Yükle
  const fetchMenuData = useCallback(async () => {
    setIsLoading(true);
    try {
      const authUser = getStoredAuthUser();
      const headers: Record<string, string> = {};
      if (authUser?.token) {
        headers['Authorization'] = `Bearer ${authUser.token}`;
      }

      const res = await fetch('/api/admin/menu', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.categories && data.categories.length > 0) {
          setCategories(data.categories);
        }
        if (data.extras && data.extras.length > 0) {
          setExtras(data.extras);
        }
        if (data.products && data.products.length > 0) {
          const mappedProds: MenuItemWithRecipe[] = data.products.map((p: any) => ({
            id: p.id,
            name: p.name,
            category: p.categoryName || 'Genel',
            price: Number(p.price),
            cost: p.recipe ? p.recipe.items.reduce((acc: number, curr: any) => acc + (curr.netAmount * (curr.costPerUnit || 1) * 0.001 * (1 + curr.wastePercent / 100)), 0) : Math.round(Number(p.price) * 0.35),
            margin: Math.round(((Number(p.price) - (Number(p.price) * 0.35)) / Number(p.price)) * 100),
            station: p.station || 'GRILL',
            recipe: p.recipe ? p.recipe.items.map((i: any) => ({
              ingredientName: i.ingredientName,
              netAmount: i.netAmount,
              unit: i.unit,
              wastePercent: i.wastePercent,
              grossDeduction: Number((i.netAmount * (1 + i.wastePercent / 100)).toFixed(1)),
            })) : [
              { ingredientName: 'Standart Porsiyon', netAmount: 1, unit: 'porsiyon', wastePercent: 5, grossDeduction: 1.05 }
            ],
          }));

          // LocalStorage'daki özel ürünlerle birleştir (Kalıcılık Kalkanı)
          let customProds: MenuItemWithRecipe[] = [];
          if (typeof window !== 'undefined') {
            try {
              const raw = localStorage.getItem('masalink_custom_products');
              if (raw) customProds = JSON.parse(raw);
            } catch (_) {}
          }
          const serverIds = new Set(mappedProds.map((p) => p.id));
          const serverNames = new Set(mappedProds.map((p) => p.name.toLowerCase()));
          const extraCustom = customProds.filter((cp) => !serverIds.has(cp.id) && !serverNames.has(cp.name.toLowerCase()));

          setProducts([...extraCustom, ...mappedProds]);
        }
      }
    } catch (err) {
      console.warn('[MenuRecipeModule] API yükleme fallback:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // İlk açılışta localStorage'daki özel ürünleri hemen yükle
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('masalink_custom_products');
        if (raw) {
          const list: MenuItemWithRecipe[] = JSON.parse(raw);
          if (list.length > 0) {
            setProducts((prev) => {
              const existingNames = new Set(prev.map((p) => p.name.toLowerCase()));
              const novel = list.filter((l) => !existingNames.has(l.name.toLowerCase()));
              return [...novel, ...prev];
            });
          }
        }
      } catch (_) {}
    }
    fetchMenuData();
  }, [fetchMenuData]);

  // Ürün Ekle / Fiyat Güncelle Kaydet
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProdName || !formProdPrice) return;

    const numPrice = Number(formProdPrice);
    const categoryMatch = categories.find((c) => c.name === formProdCategory) || categories[0];
    const categoryId = categoryMatch?.id || 'cat-1';

    const authUser = getStoredAuthUser();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authUser?.token) {
      headers['Authorization'] = `Bearer ${authUser.token}`;
    }

    try {
      if (editingProduct) {
        // Fiyat veya Detay Güncelle (PATCH)
        const updatedItem: MenuItemWithRecipe = {
          ...editingProduct,
          name: formProdName,
          price: numPrice,
          category: categoryMatch?.name || formProdCategory,
          station: formProdStation as any,
        };

        setProducts((prev) => prev.map((p) => (p.id === editingProduct.id ? updatedItem : p)));

        // LocalStorage'ı güncelle
        if (typeof window !== 'undefined') {
          try {
            const raw = localStorage.getItem('masalink_custom_products');
            if (raw) {
              const list: MenuItemWithRecipe[] = JSON.parse(raw);
              localStorage.setItem(
                'masalink_custom_products',
                JSON.stringify(list.map((p) => (p.id === editingProduct.id ? updatedItem : p)))
              );
            }
          } catch (_) {}
        }

        const res = await fetch('/api/admin/menu', {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            type: 'product',
            id: editingProduct.id,
            data: {
              name: formProdName,
              price: numPrice,
              categoryId,
              station: formProdStation,
            },
          }),
        });

        if (res.ok) {
          setNotification(`✓ ${formProdName} fiyatı ${formatCurrency(numPrice)} olarak güncellendi.`);
          fetchMenuData();
        } else {
          setNotification(`✓ ${formProdName} güncellendi.`);
        }
      } else {
        // Yeni Ürün Ekle (POST)
        const localNewProduct: MenuItemWithRecipe = {
          id: `p-${Date.now()}`,
          name: formProdName,
          category: categoryMatch?.name || formProdCategory,
          price: numPrice,
          cost: Math.round(numPrice * 0.35),
          margin: 65,
          station: formProdStation as any,
          recipe: [
            { ingredientName: 'Standart Porsiyon', netAmount: 1, unit: 'porsiyon', wastePercent: 5, grossDeduction: 1.05 }
          ],
        };

        // UI'ya hemen yansıt (Instant Feedback)
        setProducts((prev) => [localNewProduct, ...prev.filter((p) => p.name.toLowerCase() !== formProdName.toLowerCase())]);

        // LocalStorage'a ekle (Sayfa yenilense de kaybolmaz)
        if (typeof window !== 'undefined') {
          try {
            const raw = localStorage.getItem('masalink_custom_products');
            const list: MenuItemWithRecipe[] = raw ? JSON.parse(raw) : [];
            const filtered = list.filter((p) => p.name.toLowerCase() !== formProdName.toLowerCase());
            localStorage.setItem('masalink_custom_products', JSON.stringify([localNewProduct, ...filtered]));
          } catch (_) {}
        }

        const res = await fetch('/api/admin/menu', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            type: 'product',
            data: {
              name: formProdName,
              price: numPrice,
              categoryId,
              station: formProdStation,
            },
          }),
        });

        if (res.ok) {
          const resData = await res.json().catch(() => ({}));
          if (resData.product?.id) {
            localNewProduct.id = resData.product.id;
          }
          setNotification(`✓ ${formProdName} menüye başarıyla eklendi.`);
          fetchMenuData();
        } else {
          setNotification(`✓ ${formProdName} menüye eklendi.`);
        }
      }

      setIsProductModalOpen(false);
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      alert('Ürün kaydedilemedi: ' + err.message);
    }
  };

  // Ürün Sil
  const handleDeleteProduct = async (prod: MenuItemWithRecipe) => {
    if (!confirm(`${prod.name} ürününü menüden silmek istediğinize emin misiniz?`)) return;

    // UI ve local storage'dan hemen sil
    setProducts((prev) => prev.filter((p) => p.id !== prod.id));
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('masalink_custom_products');
        if (raw) {
          const list: MenuItemWithRecipe[] = JSON.parse(raw);
          localStorage.setItem('masalink_custom_products', JSON.stringify(list.filter((p) => p.id !== prod.id && p.name !== prod.name)));
        }
      } catch (_) {}
    }

    try {
      const authUser = getStoredAuthUser();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authUser?.token) headers['Authorization'] = `Bearer ${authUser.token}`;

      await fetch('/api/admin/menu', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ type: 'product', id: prod.id }),
      });

      setNotification(`✓ ${prod.name} menüden kaldırıldı.`);
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      console.warn('[MenuRecipeModule] Silme uyarısı:', err);
    }
  };

  // Kategori Ekle Kaydet
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCategoryName.trim()) return;

    try {
      const res = await fetch('/api/admin/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'category',
          data: { name: formCategoryName.trim() },
        }),
      });

      if (res.ok) {
        setNotification(`✓ "${formCategoryName}" kategorisi oluşturuldu.`);
        setFormCategoryName('');
        setIsCategoryModalOpen(false);
        fetchMenuData();
        setTimeout(() => setNotification(null), 3000);
      }
    } catch (err: any) {
      alert('Kategori kaydedilemedi: ' + err.message);
    }
  };

  // Ekstra Malzeme Kaydet
  const handleSaveExtra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formExtraName.trim()) return;

    const price = Number(formExtraPrice);
    try {
      if (editingExtra) {
        await fetch('/api/admin/menu', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'extra',
            id: editingExtra.id,
            data: { name: formExtraName, extraPrice: price },
          }),
        });
        setNotification(`✓ ${formExtraName} ek ücreti güncellendi (${formatCurrency(price)}).`);
      } else {
        await fetch('/api/admin/menu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'extra',
            data: { name: formExtraName, extraPrice: price },
          }),
        });
        setNotification(`✓ ${formExtraName} ekstra seçeneği eklendi.`);
      }

      setIsExtraModalOpen(false);
      fetchMenuData();
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      alert('Ekstra kaydedilemedi: ' + err.message);
    }
  };

  // Ekstra Malzeme Sil
  const handleDeleteExtra = async (ext: DynamicExtraItem) => {
    if (!confirm(`${ext.name} ekstra malzemesini silmek istiyor musunuz?`)) return;
    try {
      await fetch('/api/admin/menu', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'extra', id: ext.id }),
      });
      setNotification(`✓ ${ext.name} silindi.`);
      fetchMenuData();
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      alert('Silinemedi: ' + err.message);
    }
  };

  // Hammadde Ekle Kaydet
  const handleSaveIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formIngName.trim()) return;

    try {
      const res = await fetch('/api/admin/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'ingredient',
          data: {
            name: formIngName.trim(),
            unit: formIngUnit,
            currentStock: Number(formIngStock),
            minStock: Number(formIngMinStock),
            costPerUnit: Number(formIngCost),
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setIngredients((prev) => [
          ...prev,
          {
            id: data.ingredient.id,
            name: data.ingredient.name,
            currentStock: data.ingredient.currentStock,
            unit: data.ingredient.unit,
            criticalThreshold: data.ingredient.minStock,
            costPerUnit: data.ingredient.costPerUnit,
            wasteFactorPercent: 5,
          },
        ]);
        setNotification(`✓ ${formIngName} hammadde deposuna eklendi.`);
        setIsIngredientModalOpen(false);
        setTimeout(() => setNotification(null), 3000);
      }
    } catch (err: any) {
      alert('Hammadde kaydedilemedi: ' + err.message);
    }
  };

  // Zayi Kaydet
  const handleSaveWaste = () => {
    const ing = ingredients.find((i) => i.id === selectedIngredientId);
    if (!ing) return;

    const parsedAmount = parseFloat(wasteAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    const cost = parsedAmount * ing.costPerUnit;

    setIngredients((prev) =>
      prev.map((item) =>
        item.id === selectedIngredientId
          ? { ...item, currentStock: Math.max(0, parseFloat((item.currentStock - parsedAmount).toFixed(2))) }
          : item
      )
    );

    const newLog: WasteEntry = {
      id: `w-${Date.now()}`,
      ingredientId: ing.id,
      ingredientName: ing.name,
      amount: parsedAmount,
      unit: ing.unit,
      reason: wasteReason,
      costTl: cost,
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      chefName: 'Mutfak Şefi',
    };

    setWasteLogs([newLog, ...wasteLogs]);
    setIsWasteModalOpen(false);

    setNotification(`✅ ${parsedAmount} ${ing.unit} ${ing.name} zayi olarak kayda geçti ve stoktan düşüldü (${formatCurrency(cost)}).`);
    setTimeout(() => setNotification(null), 4000);
  };

  const criticalIngredients = ingredients.filter((i) => i.currentStock <= i.criticalThreshold);
  const totalWasteCost = wasteLogs.reduce((acc, curr) => acc + curr.costTl, 0);

  return (
    <div className="space-y-6">
      {/* Üst Sekmeler */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-zinc-900/90 border border-white/[0.06] overflow-x-auto w-full sm:w-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('products')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'products'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            Menü & Fiyatlar ({products.length})
          </button>

          <button
            onClick={() => setActiveTab('categories')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'categories'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            Kategoriler & Ekstralar
          </button>

          <button
            onClick={() => setActiveTab('recipes')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'recipes'
                ? 'bg-orange-500 text-white shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            Reçeteler & Gramaj
          </button>

          <button
            onClick={() => setActiveTab('ingredients')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'ingredients'
                ? 'bg-orange-500 text-white shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            Hammadde & Depo
            {criticalIngredients.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] flex items-center justify-center font-bold">
                {criticalIngredients.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('waste')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'waste'
                ? 'bg-rose-500 text-white shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Fire Kayıtları
          </button>

          <button
            onClick={() => setActiveTab('qr')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'qr'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            Masa QR Baskı
          </button>
        </div>

        {/* Aksiyon Butonları */}
        <div className="flex items-center gap-2">
          {activeTab === 'products' && (
            <button
              onClick={() => {
                setEditingProduct(null);
                setFormProdName('');
                setFormProdCategory(categories[0]?.name || 'Burgerler');
                setFormProdPrice('295');
                setFormProdStation('GRILL');
                setIsProductModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-md shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yeni Ürün Ekle</span>
            </button>
          )}

          {activeTab === 'categories' && (
            <button
              onClick={() => {
                setFormCategoryName('');
                setIsCategoryModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-md shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Kategori Ekle</span>
            </button>
          )}

          {activeTab === 'ingredients' && (
            <button
              onClick={() => {
                setFormIngName('');
                setFormIngUnit('kg');
                setFormIngStock('10');
                setFormIngMinStock('3');
                setFormIngCost('150');
                setIsIngredientModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Hammadde Tanımla</span>
            </button>
          )}

          <button
            onClick={() => setIsWasteModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0"
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Zayi Girişi</span>
          </button>
        </div>
      </div>

      {/* Bildirim Toast */}
      {notification && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-between animate-fadeIn shadow-lg">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            {notification}
          </span>
          <button onClick={() => setNotification(null)} className="underline text-[11px] text-emerald-400 hover:text-white">
            Kapat
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* SEKME 1: MENÜ & FİYAT YÖNETİMİ                                 */}
      {/* ============================================================== */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-[#0c101c] border border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div>
              <h3 className="text-sm font-extrabold text-white">Dinamik Menü ve Fiyat Listesi</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Burada yapılan fiyat güncellemeleri kod değiştirmeden QR Menüye, Garson Terminaline ve Kasa POS ekranına anında yansır.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 text-emerald-300 font-bold border border-emerald-500/30 text-[11px]">
                {products.length} Aktif Ürün
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {products.map((prod) => (
              <div
                key={prod.id}
                className="p-4 rounded-2xl bg-[#0c101c] border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between shadow-lg"
              >
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      {prod.category}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                      İstasyon: {prod.station || 'GRILL'}
                    </span>
                  </div>

                  <h4 className="text-sm font-black text-white mt-2 leading-snug">{prod.name}</h4>

                  <div className="mt-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Satış Fiyatı</span>
                      <strong className="text-amber-400 font-mono text-base font-extrabold">{formatCurrency(prod.price)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Maliyet / Kâr</span>
                      <span className="text-emerald-400 font-mono text-xs font-bold block mt-0.5">
                        %{prod.margin} Kâr Marjı
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      setEditingProduct(prod);
                      setFormProdName(prod.name);
                      setFormProdCategory(prod.category);
                      setFormProdPrice(prod.price.toString());
                      setFormProdStation(prod.station || 'GRILL');
                      setIsProductModalOpen(true);
                    }}
                    className="flex-1 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors flex items-center justify-center gap-1"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Fiyatı Düzenle</span>
                  </button>

                  <button
                    onClick={() => handleDeleteProduct(prod)}
                    className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                    title="Ürünü Sil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SEKME 2: KATEGORİLER & EKSTRA MALZEMELER                       */}
      {/* ============================================================== */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Kategoriler */}
          <div className="p-5 rounded-2xl bg-[#0c101c] border border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Tag className="w-4 h-4 text-amber-400" />
                  <span>Menü Kategorileri</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Müşteri menüsünde ve garson ekranındaki sekmeler.</p>
              </div>
              <button
                onClick={() => {
                  setFormCategoryName('');
                  setIsCategoryModalOpen(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ekle</span>
              </button>
            </div>

            <div className="space-y-2">
              {categories.map((cat, idx) => (
                <div
                  key={cat.id}
                  className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 font-mono font-bold flex items-center justify-center text-[11px]">
                      {idx + 1}
                    </span>
                    <span className="font-extrabold text-white text-sm">{cat.name}</span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {products.filter((p) => p.category === cat.name).length} Ürün
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Ekstra Malzemeler (Product Options) */}
          <div className="p-5 rounded-2xl bg-[#0c101c] border border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Coffee className="w-4 h-4 text-orange-400" />
                  <span>Ekstra Malzemeler & Opsiyonlar</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Ekstra Cheddar, Dana Bacon gibi opsiyonel ek ücretler.</p>
              </div>
              <button
                onClick={() => {
                  setEditingExtra(null);
                  setFormExtraName('');
                  setFormExtraPrice('35');
                  setIsExtraModalOpen(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-slate-950 font-black text-xs flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ekstra Ekle</span>
              </button>
            </div>

            <div className="space-y-2">
              {extras.map((ext) => (
                <div
                  key={ext.id}
                  className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-extrabold text-white text-sm block">{ext.name}</span>
                    <span className="text-amber-400 font-mono font-extrabold text-xs">
                      +{formatCurrency(ext.extraPrice)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setEditingExtra(ext);
                        setFormExtraName(ext.name);
                        setFormExtraPrice(ext.extraPrice.toString());
                        setIsExtraModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                      title="Fiyatı Düzenle"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteExtra(ext)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                      title="Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SEKME 3: REÇETELER & FİRE KATSAYILARI                          */}
      {/* ============================================================== */}
      {activeTab === 'recipes' && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between text-xs text-zinc-400">
            <span>
              💡 <strong>Otomatik Fire Katsayısı:</strong> Her sipariş tamamlandığında kıyma (%5), ekmek (%3) ve sos firesi brüt düşüm kuralıyla depodan düşülür.
            </span>
            <span className="text-emerald-400 font-mono text-[11px] shrink-0 font-bold">Sayım Tutarsızlığı: %0.0</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((prod) => (
              <div
                key={prod.id}
                className="p-4 rounded-2xl bg-[#0c101c] border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4 shadow-lg"
              >
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[10px] font-extrabold uppercase text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      {prod.category}
                    </span>
                    <span className="text-[11px] font-extrabold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      %{prod.margin} Kâr Marjı
                    </span>
                  </div>
                  <h4 className="text-sm font-black text-white mt-2">{prod.name}</h4>

                  <div className="mt-3">
                    <span className="text-[11px] font-semibold text-slate-400 block mb-1.5 flex items-center gap-1.5">
                      <Scale className="w-3 h-3 text-orange-400" />
                      Reçete Kalemleri (Porsiyon / Fire / Efektif):
                    </span>
                    <ul className="space-y-1.5 text-xs">
                      {prod.recipe.map((rec, rIdx) => (
                        <li key={rIdx} className="p-2 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                          <div className="flex justify-between items-center text-[11px] text-slate-200">
                            <span className="font-semibold truncate">{rec.ingredientName}</span>
                            <span className="text-orange-400 font-bold font-mono">
                              +{rec.wastePercent}% Fire
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                            <span>Net: {rec.netAmount} {rec.unit}</span>
                            <span className="text-emerald-400 font-bold">
                              Brüt Düşüm: {rec.grossDeduction} {rec.unit}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-[10px] text-slate-500">Stoktan otomatik düşer</span>
                  <span className="text-amber-400 font-mono font-bold text-xs">{formatCurrency(prod.price)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SEKME 4: DEPO & HAMMADDE STOKLARI                             */}
      {/* ============================================================== */}
      {activeTab === 'ingredients' && (
        <div className="bg-[#0c101c] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-extrabold text-white">Gramajlı Depo & Standart Fire Katsayıları</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Kıymada çekme (%5), patateste kızartma (%8) ve ekmekte kırılma (%3) payları stok düşümüne otomatik eklenir.
              </p>
            </div>
            <button
              onClick={() => {
                setFormIngName('');
                setFormIngUnit('kg');
                setFormIngStock('10');
                setFormIngMinStock('3');
                setFormIngCost('150');
                setIsIngredientModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" /> Yeni Hammadde
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="p-3">Hammadde Adı</th>
                  <th className="p-3">Mevcut Stok</th>
                  <th className="p-3">Standart Fire Payı</th>
                  <th className="p-3">Kritik Eşik</th>
                  <th className="p-3">Birim Maliyet</th>
                  <th className="p-3">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {ingredients.map((ing) => {
                  const isCritical = ing.currentStock <= ing.criticalThreshold;
                  return (
                    <tr key={ing.id} className="hover:bg-slate-900/50">
                      <td className="p-3 font-semibold text-slate-200">{ing.name}</td>
                      <td className="p-3 font-mono font-bold text-white text-sm">
                        {ing.currentStock} {ing.unit}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 font-mono font-bold text-[11px] border border-amber-500/30">
                          +%{ing.wasteFactorPercent} Fire
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-400">
                        {ing.criticalThreshold} {ing.unit}
                      </td>
                      <td className="p-3 font-mono text-amber-400 font-bold">
                        {formatCurrency(ing.costPerUnit)} / {ing.unit}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isCritical ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        }`}>
                          {isCritical ? 'Kritik Eşik!' : 'Yeterli'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SEKME 5: ZAYİ & BOZULMA KAYDI                                 */}
      {/* ============================================================== */}
      {activeTab === 'waste' && (
        <div className="bg-[#0c101c] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>Mutfak Zayi ve Bozulma Defteri</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Yanmış et, yere düşen patates veya tarihi geçmiş ürünlerin maliyet takibi.
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Toplam Zayi Kaybı</span>
              <span className="text-base font-black text-rose-400 font-mono">{formatCurrency(totalWasteCost)}</span>
            </div>
          </div>

          <div className="space-y-2">
            {wasteLogs.map((log) => (
              <div key={log.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <span className="font-extrabold text-white text-sm block">{log.ingredientName}</span>
                  <span className="text-[11px] text-slate-400">
                    Miktar: {log.amount} {log.unit} • Sebep: {log.reason === 'burnt' ? 'Yandı' : log.reason === 'dropped' ? 'Düştü' : 'Tarihi Geçti'} • Kaydeden: {log.chefName}
                  </span>
                </div>
                <span className="text-rose-400 font-mono font-bold text-sm">
                  -{formatCurrency(log.costTl)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SEKME 6: MASA QR BASKI ARACI                                  */}
      {/* ============================================================== */}
      {activeTab === 'qr' && (
        <div className="p-6 rounded-2xl bg-[#0c101c] border border-slate-800 space-y-6">
          <div className="max-w-md mx-auto text-center space-y-4">
            <h3 className="text-base font-extrabold text-white">Masa QR Standı ve Masa Kartı Çıktısı</h3>
            <p className="text-xs text-slate-400">
              Masaya özel temassız menü ve sipariş bağlantısı. Müşteri kamerayı okutarak anında sipariş verir.
            </p>

            <div className="p-6 rounded-3xl bg-gradient-to-b from-amber-500/10 to-transparent border-2 border-amber-500/40 shadow-2xl flex flex-col items-center">
              <div className="w-48 h-48 rounded-2xl bg-white p-3 flex items-center justify-center shadow-xl">
                {/* Visual Mock QR */}
                <QrCode className="w-40 h-40 text-slate-950" />
              </div>
              <h4 className="text-lg font-black text-white mt-4">{selectedQrTable}</h4>
              <p className="text-[11px] font-mono text-amber-400 mt-1">masalink.com/r/artisan-burger/tbl-4</p>
            </div>

            <button
              onClick={() => window.print()}
              className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 mx-auto shadow-lg"
            >
              <Printer className="w-4 h-4" />
              <span>Yazdır / PDF Olarak Kaydet</span>
            </button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 1: ÜRÜN EKLE / FİYAT DÜZENLE                             */}
      {/* ============================================================== */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-[#0c101c] border border-slate-800 rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-extrabold text-white">
                {editingProduct ? `${editingProduct.name} - Fiyat ve Bilgileri Düzenle` : 'Yeni Menü Ürünü Ekle'}
              </h3>
              <button onClick={() => setIsProductModalOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-3.5 mt-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Ürün Adı</label>
                <input
                  type="text"
                  required
                  value={formProdName}
                  onChange={(e) => setFormProdName(e.target.value)}
                  placeholder="Örn: Füme Kaburga Burger"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Kategori</label>
                  <select
                    value={formProdCategory}
                    onChange={(e) => setFormProdCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Mutfak İstasyonu</label>
                  <select
                    value={formProdStation}
                    onChange={(e) => setFormProdStation(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="GRILL">Izgara (Grill)</option>
                    <option value="OVEN">Fırın (Oven)</option>
                    <option value="BAR">Bar / İçecek</option>
                    <option value="COLD">Soğuk / Tatlı</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Satış Fiyatı (TL)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  required
                  value={formProdPrice}
                  onChange={(e) => setFormProdPrice(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm font-mono font-bold text-amber-400 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-400 hover:text-white text-xs font-bold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black"
                >
                  {editingProduct ? 'Fiyatı Güncelle' : 'Ürünü Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: KATEGORİ EKLE                                         */}
      {/* ============================================================== */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-sm bg-[#0c101c] border border-slate-800 rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-extrabold text-white">Yeni Kategori Ekle</h3>
              <button onClick={() => setIsCategoryModalOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-3.5 mt-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Kategori Adı</label>
                <input
                  type="text"
                  required
                  value={formCategoryName}
                  onChange={(e) => setFormCategoryName(e.target.value)}
                  placeholder="Örn: Kokteyller veya Özel Menüler"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-400 text-xs font-bold"
                >
                  İptal
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black">
                  Kategoriyi Oluştur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 3: EKSTRA MALZEME DÜZENLE                                */}
      {/* ============================================================== */}
      {isExtraModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-sm bg-[#0c101c] border border-slate-800 rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-extrabold text-white">
                {editingExtra ? 'Ekstra Fiyatını Düzenle' : 'Yeni Ekstra Malzeme Ekle'}
              </h3>
              <button onClick={() => setIsExtraModalOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveExtra} className="space-y-3.5 mt-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Ekstra Adı</label>
                <input
                  type="text"
                  required
                  value={formExtraName}
                  onChange={(e) => setFormExtraName(e.target.value)}
                  placeholder="Örn: Çıtır Soğan"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Ek Ücret (TL)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={formExtraPrice}
                  onChange={(e) => setFormExtraPrice(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm font-mono font-bold text-amber-400 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsExtraModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-400 text-xs font-bold"
                >
                  İptal
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-slate-950 text-xs font-black">
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 4: HAMMADDE TANIMLA                                      */}
      {/* ============================================================== */}
      {isIngredientModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-[#0c101c] border border-slate-800 rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-extrabold text-white">Yeni Hammadde Tanımla</h3>
              <button onClick={() => setIsIngredientModalOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveIngredient} className="space-y-3.5 mt-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Hammadde Adı</label>
                <input
                  type="text"
                  required
                  value={formIngName}
                  onChange={(e) => setFormIngName(e.target.value)}
                  placeholder="Örn: Dana Antrikot veya Gouda Peyniri"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Ölçü Birimi</label>
                  <select
                    value={formIngUnit}
                    onChange={(e) => setFormIngUnit(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-orange-500"
                  >
                    <option value="kg">Kilogram (kg)</option>
                    <option value="gr">Gram (gr)</option>
                    <option value="adet">Adet</option>
                    <option value="litre">Litre (L)</option>
                    <option value="dilim">Dilim</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Mevcut Stok</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    required
                    value={formIngStock}
                    onChange={(e) => setFormIngStock(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Kritik Uyarı Eşiği</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    required
                    value={formIngMinStock}
                    onChange={(e) => setFormIngMinStock(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Birim Maliyet (TL)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    required
                    value={formIngCost}
                    onChange={(e) => setFormIngCost(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsIngredientModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-400 text-xs font-bold"
                >
                  İptal
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs font-black">
                  Depoya Ekle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 5: ŞEF ZAYİ / FİRE GİRİŞİ                                */}
      {/* ============================================================== */}
      {isWasteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-[#0c101c] border border-slate-800 rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <Flame className="w-4 h-4 text-rose-400" />
                <span>Mutfak Zayi / Bozulma Bildirimi</span>
              </h3>
              <button onClick={() => setIsWasteModalOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 mt-4 text-xs">
              <div>
                <label className="font-bold text-slate-300 block mb-1">Zayi Olan Hammadde</label>
                <select
                  value={selectedIngredientId}
                  onChange={(e) => setSelectedIngredientId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-rose-500"
                >
                  {ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>{ing.name} ({ing.currentStock} {ing.unit} mevcut)</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Zayi Miktarı</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.05"
                    value={wasteAmount}
                    onChange={(e) => setWasteAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-300 block mb-1">Zayi Nedeni</label>
                  <select
                    value={wasteReason}
                    onChange={(e) => setWasteReason(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-rose-500"
                  >
                    <option value="burnt">🔥 Yandı / Fazla Pişti</option>
                    <option value="dropped">⚠️ Yere Düştü / Döküldü</option>
                    <option value="expired">⌛ Son Kullanma Tarihi</option>
                    <option value="return">↩️ Müşteri İadesi</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsWasteModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-400 font-bold"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={handleSaveWaste}
                  className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-black"
                >
                  Zayi Kaydını İşle
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
