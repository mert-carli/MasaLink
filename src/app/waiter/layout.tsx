import type { Metadata, Viewport } from 'next';
import React from 'react';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';

export const metadata: Metadata = {
  title: 'MasaLink | Garson Mobil Terminali',
  description: 'Garsonlar ve servis personeli için ultra-hızlı dokunmatik mobil sipariş terminali',
  manifest: '/waiter-manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Garson POS',
  },
  icons: {
    icon: '/masalink-logo.png',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#070a12',
};

export default function WaiterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 flex justify-center selection:bg-amber-500/30 selection:text-amber-200">
      {/* Mobile Frame Container */}
      <div className="w-full max-w-md min-h-screen flex flex-col relative bg-[#0a0e19] shadow-2xl border-x border-slate-800/40 select-none touch-manipulation">
        {children}
        <PwaInstallPrompt />
      </div>
    </div>
  );
}
