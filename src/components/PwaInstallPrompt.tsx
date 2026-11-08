'use client';

import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Share, 
  PlusSquare, 
  X, 
  Sparkles, 
  Smartphone, 
  CheckCircle2, 
  ArrowUpRight 
} from 'lucide-react';

export const PwaInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIos, setIsIos] = useState<boolean>(false);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [showIosGuide, setShowIosGuide] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  useEffect(() => {
    // 1. Check if already installed & running in standalone mode
    const isStandaloneMode = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    setIsStandalone(isStandaloneMode);
    if (isStandaloneMode) return;

    // 2. Check session dismissal
    const dismissed = sessionStorage.getItem('masalink_pwa_prompt_dismissed');
    if (dismissed) {
      setIsDismissed(true);
    }

    // 3. Register Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('PWA Service Worker kayıt hatası:', err);
      });
    }

    // 4. Detect iOS device
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    // 5. Capture beforeinstallprompt (Android Chrome / Edge / Desktop)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else if (isIos) {
      setShowIosGuide(true);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem('masalink_pwa_prompt_dismissed', 'true');
  };

  // If running as standalone app or dismissed, don't show prompt
  if (isStandalone || isDismissed) return null;

  // Only show if either native prompt is ready or it's iOS Safari
  if (!deferredPrompt && !isIos) return null;

  return (
    <>
      {/* Floating Bottom Installation Banner */}
      <aside 
        aria-label="PWA Kurulum Bildirimi"
        className="sticky bottom-20 z-40 px-4 py-2 pointer-events-none"
      >
        <div className="max-w-md mx-auto bg-gradient-to-r from-amber-500/20 via-[#101728]/95 to-amber-500/15 border border-amber-500/40 backdrop-blur-xl p-3 rounded-2xl shadow-2xl shadow-amber-500/10 flex items-center justify-between gap-3 pointer-events-auto animate-fadeIn">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5 text-amber-400 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black text-white truncate">
                  MasaLink Mobil Uygulama
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/30 text-amber-300 font-mono">
                  PWA
                </span>
              </div>
              <p className="text-[11px] text-slate-300 truncate">
                Tam ekran kullanım için ana ekrana ekleyin
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleInstallClick}
              className="py-1.5 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 text-slate-950 font-black text-xs shadow-md active:scale-95 flex items-center gap-1 transition-transform"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isIos ? 'Nasıl Yüklenir?' : 'Yükle'}</span>
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors"
              title="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* iOS Safari Step-by-Step Installation Modal */}
      {showIosGuide && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center p-3 sm:items-center animate-fadeIn">
          <div className="w-full max-w-sm bg-[#0e1320] border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                  
                </div>
                <h3 className="text-sm font-extrabold text-white">iPhone / iPad Kurulumu</h3>
              </div>
              <button
                onClick={() => setShowIosGuide(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center shrink-0">
                  1
                </div>
                <div>
                  Safari ekranının altındaki <strong className="text-white">Paylaş ( <Share className="w-3.5 h-3.5 inline text-amber-400" /> )</strong> simgesine dokunun.
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center shrink-0">
                  2
                </div>
                <div>
                  Açılan menüde aşağı kaydırıp <strong className="text-white">"Ana Ekrana Ekle" ( <PlusSquare className="w-3.5 h-3.5 inline text-amber-400" /> )</strong> seçeneğine basın.
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center shrink-0">
                  3
                </div>
                <div>
                  Sağ üstteki <strong className="text-amber-400">"Ekle"</strong> butonuna dokunun. MasaLink artık telefonunuzda tam ekran bir uygulama olarak çalışacaktır!
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs shadow-md transition-colors"
            >
              Anladım ✓
            </button>
          </div>
        </div>
      )}
    </>
  );
};
