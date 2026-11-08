'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ShieldCheck, 
  Delete, 
  RotateCcw, 
  Banknote, 
  ArrowRight, 
  Lock, 
  CheckCircle2, 
  UserCheck, 
  AlertCircle,
  Clock,
  Sparkles
} from 'lucide-react';
import { 
  REGISTERED_CASHIERS, 
  CashierUser, 
  getCashierByPin, 
  savePosShiftSession, 
  getPosShiftSession 
} from '@/utils/posAuth';

export default function PosLoginPage() {
  const router = useRouter();
  const [selectedCashier, setSelectedCashier] = useState<CashierUser | null>(REGISTERED_CASHIERS[0]);
  const [pin, setPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [step, setStep] = useState<'pin' | 'float_cash'>('pin');
  const [authenticatedCashier, setAuthenticatedCashier] = useState<CashierUser | null>(null);
  const [floatCash, setFloatCash] = useState<number>(1000);
  const [customCashInput, setCustomCashInput] = useState<string>('1000');

  // Check if session already open
  useEffect(() => {
    const existing = getPosShiftSession();
    if (existing) {
      router.push('/pos');
    }
  }, [router]);

  const triggerHaptic = () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(40);
    }
  };

  const handleKeyPress = (num: string) => {
    triggerHaptic();
    setErrorMsg(null);
    if (pin.length < 4) {
      const nextPin = pin + num;
      setPin(nextPin);
      if (nextPin.length === 4) {
        verifyPin(nextPin);
      }
    }
  };

  const handleClear = () => {
    triggerHaptic();
    setPin('');
    setErrorMsg(null);
  };

  const handleBackspace = () => {
    triggerHaptic();
    setPin((prev) => prev.slice(0, -1));
    setErrorMsg(null);
  };

  const verifyPin = async (candidatePin: string) => {
    try {
      const res = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: candidatePin, expectedRole: 'cashier' }),
      });
      const data = await res.json();

      if (res.ok && data.success && data.user) {
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate([60, 40, 100]);
        }
        setAuthenticatedCashier({
          id: data.user.id,
          name: data.user.name,
          role: data.user.subRole || data.user.role,
          avatar: data.user.avatar || 'ZK',
        });
        setStep('float_cash');
        return;
      } else {
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate([150, 80, 150]);
        }
        setErrorMsg(data.error || 'Hatalı Kasiyer PIN Kodu! Lütfen tekrar deneyin.');
        setPin('');
        return;
      }
    } catch {
      setErrorMsg('Sunucuya bağlanılamadı. Lütfen ağ bağlantınızı kontrol edin.');
      setPin('');
    }
  };

  const handleOpenShift = () => {
    if (!authenticatedCashier) return;
    const finalCash = parseFloat(customCashInput) || floatCash || 0;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    savePosShiftSession({
      cashierId: authenticatedCashier.id,
      cashierName: authenticatedCashier.name,
      role: authenticatedCashier.role,
      shiftStartTime: timeStr,
      floatCash: finalCash,
    });

    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([80, 40, 120]);
    }
    router.push('/pos');
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-72 h-72 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Container Card */}
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-6 md:p-8 backdrop-blur-xl shadow-2xl relative z-10 flex flex-col items-center">
        
        {/* Brand Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-black text-xl">
            M
          </div>
          <div className="text-left">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
              MasaLink <span className="text-xs bg-amber-500/20 text-amber-400 font-semibold px-2 py-0.5 rounded-full border border-amber-500/30">POS KASA</span>
            </h1>
            <p className="text-xs text-slate-400">Hızlı Tahsilat & Kiosk Terminali</p>
          </div>
        </div>

        {step === 'pin' ? (
          <>
            {/* Cashier Selector Tabs */}
            <div className="w-full mb-6">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-2 text-center">
                Vardiya Kasiyeri Seçin veya PIN Girin
              </label>
              <div className="grid grid-cols-3 gap-2">
                {REGISTERED_CASHIERS.map((cashier) => {
                  const isSelected = selectedCashier?.id === cashier.id;
                  return (
                    <button
                      key={cashier.id}
                      onClick={() => {
                        setSelectedCashier(cashier);
                        setPin('');
                        setErrorMsg(null);
                      }}
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-center transition-all ${
                        isSelected
                          ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 shadow-md shadow-amber-500/10'
                          : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${
                        isSelected ? 'bg-amber-500 text-slate-950' : 'bg-slate-700 text-slate-300'
                      }`}>
                        {cashier.avatar}
                      </div>
                      <span className="text-xs font-medium truncate w-full text-center">{cashier.name.split(' ')[0]}</span>
                      <span className="text-[10px] opacity-75">{cashier.role}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Test Demo Hint (Yalnızca Geliştirme Ortamında) */}
            {process.env.NODE_ENV !== 'production' && (
              <div className="w-full bg-slate-800/40 border border-slate-700/50 rounded-xl p-2.5 mb-5 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Test PIN: <strong className="text-amber-300 font-mono">4321</strong> ({selectedCashier?.name || 'Zeynep Kaya'})</span>
                </div>
                <button
                  onClick={() => {
                    const demoPin = selectedCashier?.pin || '4321';
                    setPin(demoPin);
                    verifyPin(demoPin);
                  }}
                  className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-medium transition-colors"
                >
                  Hızlı Doldur
                </button>
              </div>
            )}

            {/* PIN Display Indicators */}
            <div className="flex items-center justify-center gap-4 mb-6">
              {[0, 1, 2, 3].map((idx) => {
                const filled = pin.length > idx;
                return (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                      filled
                        ? 'bg-amber-400 border-amber-400 scale-125 shadow-lg shadow-amber-400/50'
                        : 'border-slate-600 bg-slate-800/80'
                    }`}
                  />
                );
              })}
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="w-full mb-4 py-2 px-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-xs text-red-400 animate-shake">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Numeric Keypad */}
            <div className="grid grid-cols-3 gap-3 w-full">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  onClick={() => handleKeyPress(digit)}
                  className="h-16 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 active:bg-amber-500 active:text-slate-950 border border-slate-700/80 text-xl font-bold text-white transition-all flex items-center justify-center shadow-md active:scale-95"
                >
                  {digit}
                </button>
              ))}
              <button
                onClick={handleClear}
                className="h-16 rounded-2xl bg-slate-800/40 hover:bg-slate-700/50 text-slate-400 border border-slate-700/40 text-sm font-semibold transition-all flex items-center justify-center active:scale-95"
              >
                <RotateCcw className="w-5 h-5 mr-1" />
                Temizle
              </button>
              <button
                onClick={() => handleKeyPress('0')}
                className="h-16 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 active:bg-amber-500 active:text-slate-950 border border-slate-700/80 text-xl font-bold text-white transition-all flex items-center justify-center shadow-md active:scale-95"
              >
                0
              </button>
              <button
                onClick={handleBackspace}
                className="h-16 rounded-2xl bg-slate-800/40 hover:bg-slate-700/50 text-slate-400 border border-slate-700/40 text-sm font-semibold transition-all flex items-center justify-center active:scale-95"
              >
                <Delete className="w-6 h-6" />
              </button>
            </div>
          </>
        ) : (
          /* Step 2: Vardiya Açılış Kasası (Float Cash) */
          <div className="w-full flex flex-col items-center animate-fadeIn">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mb-4">
              <Banknote className="w-8 h-8" />
            </div>

            <h2 className="text-lg font-bold text-white mb-1">Vardiya Açılış Kasası</h2>
            <p className="text-xs text-slate-400 text-center mb-6">
              Sn. <strong className="text-amber-300">{authenticatedCashier?.name}</strong>, kasayı kaç TL nakit bozuk para ile başlatıyorsunuz?
            </p>

            {/* Quick Amount Pills */}
            <div className="grid grid-cols-4 gap-2 w-full mb-4">
              {[500, 1000, 1500, 2000].map((amt) => {
                const isSelected = floatCash === amt;
                return (
                  <button
                    key={amt}
                    onClick={() => {
                      setFloatCash(amt);
                      setCustomCashInput(amt.toString());
                      triggerHaptic();
                    }}
                    className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-750'
                    }`}
                  >
                    ₺{amt.toLocaleString('tr-TR')}
                  </button>
                );
              })}
            </div>

            {/* Cash Input */}
            <div className="w-full mb-6">
              <label className="text-[11px] font-medium text-slate-400 mb-1.5 block">
                Nakit Kasa Tutarı (₺)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-amber-400">₺</span>
                <input
                  type="number"
                  value={customCashInput}
                  onChange={(e) => {
                    setCustomCashInput(e.target.value);
                    setFloatCash(parseFloat(e.target.value) || 0);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl py-3.5 pl-10 pr-4 text-xl font-bold text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  placeholder="1000"
                />
              </div>
            </div>

            {/* Submit Shift Button */}
            <button
              onClick={handleOpenShift}
              className="w-full h-14 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-98 text-slate-950 font-black text-base rounded-2xl shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 transition-all mb-3"
            >
              <span>Vardiyayı Aç ve Kasaya Gir</span>
              <ArrowRight className="w-5 h-5" />
            </button>

            <button
              onClick={() => {
                setStep('pin');
                setPin('');
              }}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors py-1"
            >
              ← Geri Dön (PIN Ekranı)
            </button>
          </div>
        )}

        {/* Footer info */}
        <div className="mt-6 pt-4 border-t border-slate-800/60 w-full flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <Lock className="w-3.5 h-3.5 text-amber-400" /> 256-bit Kasa Güvenliği
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> 7/24 Senkronizasyon
          </span>
        </div>
      </div>
    </div>
  );
}
