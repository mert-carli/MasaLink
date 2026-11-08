'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  DEFAULT_WAITERS, 
  getStoredWaiterSession, 
  setStoredWaiterSession, 
  WaiterUser 
} from '@/utils/waiterAuth';
import { 
  Lock, 
  Delete, 
  CheckCircle2, 
  AlertCircle, 
  ChefHat, 
  Sparkles,
  ArrowRight,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';

export default function WaiterLoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [successUser, setSuccessUser] = useState<WaiterUser | null>(null);

  // If already logged in, redirect to /waiter
  useEffect(() => {
    const existing = getStoredWaiterSession();
    if (existing) {
      router.replace('/waiter');
    }
  }, [router]);

  // Attempt authentication when 4 digits are typed
  const handleDigit = (digit: string) => {
    if (pin.length >= 4 || successUser) return;
    const newPin = pin + digit;
    setPin(newPin);
    setErrorMsg(null);

    // Haptic tick if supported
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(20);
      } catch (_) {}
    }

    if (newPin.length === 4) {
      verifyPin(newPin);
    }
  };

  const handleBackspace = () => {
    if (pin.length > 0) {
      setPin((prev) => prev.slice(0, -1));
      setErrorMsg(null);
    }
  };

  const handleClear = () => {
    setPin('');
    setErrorMsg(null);
  };

  const verifyPin = async (candidatePin: string) => {
    try {
      const res = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: candidatePin, expectedRole: 'waiter' }),
      });
      const data = await res.json();

      if (res.ok && data.success && data.user) {
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate([40, 40, 60]);
          } catch (_) {}
        }
        const authUser: WaiterUser = {
          id: data.user.id,
          name: data.user.name,
          role: `${data.user.section || 'Salon'} Garsonu`,
          section: data.user.section || 'İç Salon',
          avatar: data.user.avatar || '👨‍🍳',
        };
        setSuccessUser(authUser);
        setStoredWaiterSession(authUser);

        setTimeout(() => {
          router.push('/waiter');
        }, 600);
        return;
      } else {
        // Sunucudan gelen hata mesajını göster
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate([100, 50, 100]);
          } catch (_) {}
        }
        setIsShaking(true);
        setErrorMsg(data.error || 'Geçersiz PIN! Lütfen tekrar deneyin.');
        setTimeout(() => {
          setIsShaking(false);
          setPin('');
        }, 650);
        return;
      }
    } catch {
      // Ağ hatası
      setErrorMsg('Sunucuya bağlanılamadı. Lütfen ağ bağlantınızı kontrol edin.');
      setIsShaking(true);
      setTimeout(() => {
        setIsShaking(false);
        setPin('');
      }, 650);
    }
  };

  const handleQuickSelect = (waiter: WaiterUser) => {
    if ((waiter as any).pin) {
      setPin((waiter as any).pin);
      verifyPin((waiter as any).pin);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-6 select-none bg-gradient-to-b from-[#0a0e19] via-[#070a12] to-[#04060b]">
      {/* Top Header & Branding */}
      <div className="flex flex-col items-center text-center pt-4">
        {/* Glowing Logo Icon */}
        <div className="relative mb-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-400 p-0.5 shadow-lg shadow-amber-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-[#0a0e19] rounded-[14px] flex items-center justify-center text-amber-400">
              <ChefHat className="w-8 h-8 text-amber-400 animate-pulse" />
            </div>
          </div>
          <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-[10px] text-white px-1.5 py-0.5 rounded-full font-bold shadow">
            POS
          </div>
        </div>

        <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
          Masa<span className="text-amber-400">Link</span>
        </h1>
        <p className="text-xs font-medium text-slate-400 mt-0.5">
          Artisan Burger & Bistro • Garson Terminali
        </p>

        {/* PIN Title */}
        <div className="mt-6 flex flex-col items-center">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-slate-400 mb-2">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>4 Haneli Garson PIN Kodu</span>
          </div>

          {/* 4-Dot Indicators */}
          <div className={`flex items-center gap-4 py-2 ${isShaking ? 'animate-bounce' : ''}`}>
            {[0, 1, 2, 3].map((index) => {
              const filled = pin.length > index;
              return (
                <div
                  key={index}
                  className={`w-4 h-4 rounded-full transition-all duration-200 ${
                    filled
                      ? 'bg-amber-400 shadow-md shadow-amber-500/50 scale-125 ring-2 ring-amber-300'
                      : 'bg-slate-800 border border-slate-700'
                  }`}
                />
              );
            })}
          </div>

          {/* Feedback messages */}
          {errorMsg && (
            <div className="mt-2 text-xs font-semibold text-rose-400 flex items-center gap-1 bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successUser && (
            <div className="mt-2 text-xs font-bold text-emerald-400 flex items-center gap-1.5 bg-emerald-500/15 px-3 py-1.5 rounded-full border border-emerald-500/30 animate-pulse">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Giriş Yapıldı: {successUser.name} ({successUser.section})</span>
            </div>
          )}
        </div>
      </div>

      {/* Numeric Touch Keypad (Big 56px+ tactile buttons) */}
      <div className="my-auto py-2">
        <div className="grid grid-cols-3 gap-3 max-w-[320px] mx-auto">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigit(num.toString())}
              disabled={!!successUser}
              className="h-16 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800/80 hover:border-amber-500/40 text-2xl font-bold text-white shadow-lg active:scale-95 active:bg-amber-500/20 active:border-amber-400 transition-all flex items-center justify-center cursor-pointer select-none"
            >
              {num}
            </button>
          ))}

          {/* Clear Button */}
          <button
            type="button"
            onClick={handleClear}
            disabled={!!successUser}
            className="h-16 rounded-2xl bg-slate-900/40 hover:bg-slate-900 text-sm font-bold text-slate-400 hover:text-rose-400 border border-slate-800/50 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          >
            TEMİZLE
          </button>

          {/* Zero Button */}
          <button
            type="button"
            onClick={() => handleDigit('0')}
            disabled={!!successUser}
            className="h-16 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800/80 hover:border-amber-500/40 text-2xl font-bold text-white shadow-lg active:scale-95 active:bg-amber-500/20 active:border-amber-400 transition-all flex items-center justify-center cursor-pointer select-none"
          >
            0
          </button>

          {/* Backspace Button */}
          <button
            type="button"
            onClick={handleBackspace}
            disabled={!!successUser}
            className="h-16 rounded-2xl bg-slate-900/40 hover:bg-slate-900 text-slate-300 hover:text-amber-400 border border-slate-800/50 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          >
            <Delete className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Demo Test Profiles & Shift Select (Yalnızca Geliştirme Ortamında) */}
      {process.env.NODE_ENV !== 'production' && (
        <div className="pt-2 pb-4 border-t border-slate-800/60">
          <p className="text-[11px] font-semibold text-slate-400 text-center mb-2.5 uppercase tracking-wider flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Hızlı Vardiya Girişi (Test PIN'leri)</span>
          </p>

          <div className="grid grid-cols-3 gap-2">
            {DEFAULT_WAITERS.map((waiter) => (
              <button
                key={waiter.id}
                type="button"
                onClick={() => handleQuickSelect(waiter)}
                className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 text-left transition-all flex flex-col items-center text-center group"
              >
                <span className="text-xl mb-1">{waiter.avatar}</span>
                <span className="text-xs font-bold text-white group-hover:text-amber-400 truncate w-full">
                  {waiter.name.split(' ')[0]}
                </span>
                <span className="text-[10px] text-slate-400 truncate w-full">
                  {waiter.section}
                </span>
                <span className="mt-1 text-[10px] font-mono font-bold text-amber-400/90 bg-amber-500/10 px-1.5 py-0.5 rounded">
                  PIN: {waiter.pin}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

        {/* PWA Home Screen Info */}
        <div className="mt-3 text-center">
          <p className="text-[10px] text-slate-500 flex items-center justify-center gap-1 flex-wrap">
            <span>📲 Safari veya Chrome menüsünden</span>
            <span className="text-amber-400 font-bold underline">"Ana Ekrana Ekle"</span>
            <span>ile tam ekran kullanabilirsiniz.</span>
          </p>
        </div>
      </div>
  );
}
