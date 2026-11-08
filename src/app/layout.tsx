import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Masalink | Yeni Nesil Bulut Restoran POS & QR Sipariş Ekosistemi',
  description: 'Restoran ve kafeler için sıfır komisyonlu QR sipariş, anlık mutfak KDS ekranı, garson terminalleri, reçete/stok yönetimi ve çok kiracılı bulut POS mimarisi.',
  keywords: ['Restoran POS', 'QR Menü', 'QR Sipariş', 'KDS Mutfak Ekranı', 'Garson Terminali', 'Adisyon Sistemi', 'Stok Takibi', 'Simpra Alternatifi'],
  authors: [{ name: 'Masalink Systems' }],
  icons: {
    icon: [
      { url: '/masalink-logo-sm.webp', type: 'image/webp' },
      { url: '/MasaLink Logosu.png', type: 'image/png' },
    ],
    shortcut: '/masalink-logo-sm.webp',
    apple: '/masalink-logo.webp',
  },
  manifest: '/manifest.json',
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
  viewportFit: 'cover',
  themeColor: '#09090b',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" className="dark scroll-smooth overflow-x-hidden">
      <head>
        <link rel="icon" href="/masalink-logo-sm.webp" type="image/webp" />
        <link rel="apple-touch-icon" href="/masalink-logo.webp" />
        <link rel="preload" href="/masalink-logo.webp" as="image" type="image/webp" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-[#09090b] text-zinc-100 antialiased selection:bg-orange-500/30 selection:text-orange-200">
        {children}
      </body>
    </html>
  );
}
