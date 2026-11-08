import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MasaLink Kokpit | Restoran Yönetimi & Kasa POS',
  description: 'MasaLink B2B Restoran Yönetim Paneli, Termal Fiş Yazıcı & Vision AI Canlı Operasyon Kokpiti',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#070a12] text-zinc-100 flex overflow-hidden">
      {children}
    </div>
  );
}
