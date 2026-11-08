# Masalink | Çok Kiracılı Bulut Restoran POS & QR Sipariş Ekosistemi

**Masalink**, restoran, kafe ve zincir gastronomi işletmeleri için tasarlanmış; donanım bağımlılığını sıfırlayan, %0 komisyonlu QR sipariş, anlık mutfak KDS ekranı, garson terminalleri, gramajlı reçete/stok yönetimi ve çok kiracılı (multi-tenant) bulut mimarisine sahip yeni nesil bir restoran işletim sistemidir (Simpra alternatifi).

---

## 🚀 Öne Çıkan Özellikler

### 1. Etkileşimli Rol Simülatörü (Interactive Demo Playground)
Sayfa üzerinde canlı ve senkronize çalışan 3 farklı rol modu:
- **📱 Müşteri QR Menü**: Masa seçimi (Masa 04, Masa 07, Bahçe 02), kategori filtreleme, ürün varyasyonları (pişme derecesi, ekstra malzeme), sepet yönetimi ve *"Siparişi Mutfak ve Kasaya Gönder"* akışı.
- **👨‍🍳 Mutfak KDS Ekranı**: Gerçek zamanlı sayaçlı biletler (Hazırlanıyor -> Hazır -> Teslim Edildi), istasyon filtreleri (Izgara & Sıcak, Fırın & Pizza, Bar) ve geciken sipariş uyarıları.
- **💼 Kasa & Yönetici Kokpiti**: Canlı ciro takibi (müşteri sipariş verdikçe anında artar), açık adisyon listesi ile tek tıkla tahsilat, otomatik gramajlı reçete ve hammadde stok düşüm widget'ı.

### 2. Bento Grid Özellik Mimarisi
- **QR Menü & Masadan Anlık Sipariş**: Mobil web üzerinden uygulama indirmeden 42 saniyede sipariş tamamlama.
- **KDS (Mutfak Ekranı)**: Renk kodlu sayaçlar, şef istasyon yönlendirmesi, tek tıkla servis bildirimi.
- **Garson / Servis Terminali (PWA)**: Masa krokisi, adisyon bölme (kelle başı / ürün bazlı), masa taşıma/birleştirme.
- **Gelişmiş Stok & Reçete Takibi**: Satılan her porsiyonda köfte, ekmek, sos ve içecek stoğunun miligramına kadar otomatik düşüşü.
- **WebSocket & Offline-First Senkronizasyon**: Masa-Mutfak-Kasa arasında < 400ms senkronizasyon, internet kesilse dahi lokal ağda kesintisiz çalışma.

### 3. İnteraktif ROI (Kârlılık & Tasarruf) Hesaplama Aracı
İşletmecilerin kendi verilerini girdiği 3 dinamik slider:
- Günlük Hizmet Verilen Masa Sayısı (10 - 200 masa)
- Ortalama Masa Hesabı (₺150 - ₺2.500)
- Çalışan Garson Sayısı (2 - 20 personel)
- **Çıktı**: %18 masa devir hızı artışından doğan aylık ek ciro, %35 garson zaman optimizasyonu iş gücü kazancı, %3.5 reçete/stok kaçak önleme tasarrufu ve **Net Aylık ROI Çarpanı (örn: 24.6x)**.

### 4. Şeffaf Fiyatlandırma & Paketler
- Aylık / Yıllık toggle (%20 İndirim + 2 Ay Hediye rozetiyle).
- **Başlangıç**: Butik mekanlar için QR menü & temel POS.
- **Pro**: KDS, Garson terminalleri, otomatik reçete & stok düşümü.
- **Enterprise**: Çoklu şube konsolidasyonu, ERP (Logo, Mikro, SAP) entegrasyonu ve özel API erişimi.

### 5. 3 Adımlı İnteraktif Onboarding Akışı
"Hemen Başla" butonuna tıklandığında açılan hafif modal:
- 1. Adım: Restoran Adı, Mutfak Konsepti, Şube ve Masa Sayısı.
- 2. Adım: Marka/Tema Rengi (Turuncu, Zümrüt, Mavi, Mor, Kırmızı) ve Logo yükleme alanı.
- 3. Adım: Seçilen paket onayı, 14 gün ücretsiz kart gerektirmeyen aktivasyon ve konfeti animasyonu.

---

## 🛠️ Teknik Mimari

- **Framework:** Next.js 14 (App Router)
- **Stil & Tasarım:** Tailwind CSS (Linear/Vercel estetiğinde bento grid, glassmorphism, glowing micro-borders)
- **Animasyon & Efektler:** Framer Motion ilkeleri, CSS keyframes, Canvas Confetti
- **İkonografi:** Lucide React
- **Dil:** TypeScript (Tam tip güvenliği, sıfır derleme hatası)

---

## 💻 Çalıştırma Talimatları

Geliştirme sunucusunu başlatmak için:

```bash
npm run dev
```

Tarayıcınızda açın:
`http://localhost:3000`

Üretim derlemesi için:

```bash
npm run build
npm run start
```
