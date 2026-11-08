import React from 'react';
import { Metadata } from 'next';
import DemoClientPage from './DemoClientPage';

export const metadata: Metadata = {
  title: 'Masalink Canlı Demo | Bulut POS, KDS ve Vision AI Simülatörü',
  description: 'Masalink restoran işletim sistemini canlı test edin. Müşteri QR menü, Mutfak KDS ekranı ve Vision AI kamera analitiği gerçek oturum arabelleğinde çalışır.',
};

export default function DemoPage() {
  return <DemoClientPage />;
}
