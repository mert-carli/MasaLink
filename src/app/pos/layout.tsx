import type { Metadata, Viewport } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'MasaLink Kasa & Hızlı Tahsilat Terminali | POS',
  description: 'Dokunmatik Kasa Monitörü, Hızlı Tahsilat, ESC/POS Termal Baskı ve Parçalı Hesap Terminali',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MasaLink POS',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col font-sans select-none touch-manipulation antialiased overflow-hidden">
      {children}
    </div>
  );
}
