'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Lock, 
  Mail, 
  ArrowRight, 
  Sparkles, 
  ShieldCheck, 
  ArrowLeft, 
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle2
} from 'lucide-react';
import { MasaLink3DLogo } from '@/components/MasaLink3DLogo';
import { loginWithCredentials, DEMO_ADMIN_USER, setStoredAuthUser } from '@/utils/auth';

export default function LoginPage() {
  const router = useRouter();
  const isDev = process.env.NODE_ENV !== 'production';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await loginWithCredentials(email, password);
    setLoading(false);

    if (res.success) {
      router.push('/admin');
    } else {
      setError(res.error || 'Giriş yapılamadı.');
    }
  };

  const handleQuickDemoLogin = async () => {
    if (!isDev) return;
    setEmail('admin@masalink.com');
    setPassword('demo123');
    setLoading(true);
    const res = await loginWithCredentials('admin@masalink.com', 'demo123');
    setLoading(false);
    if (res.success) {
      router.push('/admin');
    } else {
      setStoredAuthUser(DEMO_ADMIN_USER);
      router.push('/admin');
    }
  };

  return (
    <div className="min-h-screen bg-[#07090e] bg-grid-pattern text-zinc-100 flex flex-col justify-between p-4 sm:p-6 selection:bg-orange-500 selection:text-white relative overflow-hidden">
      
      {/* Background radial ambient lights */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-orange-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Top Bar */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between relative z-10 py-2">
        <Link href="/" className="hover:opacity-90 transition-opacity">
          <MasaLink3DLogo size="sm" badge="POS Cloud" />
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-900/80 border border-white/[0.08] text-xs font-semibold text-zinc-300 hover:text-white transition-all hover:bg-zinc-800"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Tanıtım Sitesine Dön</span>
        </Link>
      </header>

      {/* Login Card Form */}
      <main className="max-w-md w-full mx-auto my-auto relative z-10">
        <div className="rounded-3xl bg-[#0f1422]/90 border border-white/[0.1] shadow-2xl p-6 sm:p-8 backdrop-blur-xl">
          
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-semibold mb-3">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Yönetici & Kasa Girişi</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Masalink Kokpit
            </h1>
            <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
              Restoran salon krokisi, Vision AI radarı ve ESC/POS mutfak fiş sistemine erişin.
            </p>
          </div>

          {/* Quick Demo Login Pill Button (Yalnızca Geliştirme Ortamı) */}
          {isDev && (
            <div className="mb-6 p-3 rounded-2xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-emerald-500/10 border border-orange-500/25 text-xs text-zinc-300 flex flex-col sm:flex-row items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-[11px] leading-snug">
                  Hızlı İnceleme: <strong className="text-white">Artisan Burger</strong> demo hesabı hazır.
                </span>
              </div>
              <button
                type="button"
                onClick={handleQuickDemoLogin}
                className="w-full sm:w-auto px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold text-[11px] shadow-md shadow-orange-500/20 active:scale-95 transition-all whitespace-nowrap"
              >
                Demo Olarak Gir ⚡
              </button>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                Yönetici E-Posta:
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ornek@restoraniniz.com"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-zinc-900/90 border border-white/[0.1] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-zinc-300">
                  Şifre:
                </label>
                {isDev && <span className="text-[10px] text-zinc-500">Demo şifre: demo123</span>}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-zinc-900/90 border border-white/[0.1] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl text-sm font-extrabold text-white bg-gradient-to-r from-orange-500 via-orange-600 to-amber-600 hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-orange-500/25 flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
            >
              {loading ? (
                <span>Doğrulanıyor...</span>
              ) : (
                <>
                  <span>Admin Paneline Giriş Yap</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/[0.08] text-center space-y-2">
            <p className="text-[11px] text-zinc-400">
              Henüz restoranınızı buluta taşımadınız mı?
            </p>
            <Link
              href="/#fiyatlandirma"
              className="text-xs font-bold text-orange-400 hover:text-orange-300 hover:underline block"
            >
              14 Gün Ücretsiz Deneme Başlat &rarr;
            </Link>
          </div>

        </div>
      </main>

      {/* Footer Note */}
      <footer className="text-center text-xs text-zinc-500 py-3 relative z-10">
        Masalink Çok Kiracılı (Multi-Tenant) Restoran İşletim Sistemi • 256-bit SSL Güvenli Giriş
      </footer>

    </div>
  );
}
