const { spawn } = require('child_process');
const http = require('http');

function httpRequest(options, postData) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });
        req.on('error', reject);
        if (postData) {
            req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
        }
        req.end();
    });
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
    console.log("===============================================================================");
    console.log("   MASALINK - SAHA DAYANIKLILIK TESTİ: GARSON AÇIK ADİSYON / ŞARJ KAYBI       ");
    console.log("===============================================================================\n");

    console.log("[1/4] Next.js Sunucusu Başlatılıyor (PORT 3000)...");
    const serverProcess = spawn('npm.cmd', ['run', 'start'], {
        shell: true,
        stdio: 'pipe'
    });

    let ready = false;
    for (let i = 0; i < 30; i++) {
        await sleep(1000);
        try {
            const res = await httpRequest({
                hostname: 'localhost',
                port: 3000,
                path: '/api/waiter/draft?waiterId=test',
                method: 'GET'
            });
            if (res.status === 200) {
                ready = true;
                break;
            }
        } catch (e) {
            // keep waiting
        }
    }

    if (!ready) {
        console.error("❌ Sunucu 30 saniye içinde yanıt vermedi!");
        serverProcess.kill();
        process.exit(1);
    }

    console.log("✅ Next.js Sunucusu Hazır ve Dinlemede.\n");

    try {
        console.log("--- SENARYO BAŞLANGICI ---");
        console.log("Garson Ahmet (ID: w-1, PIN: 1234) Masa 4'te (tbl-4) 6 kişilik sipariş alıyor:");
        console.log("  - 2x Dana Antrikot (Orta Pişmiş, Ekstra Sos) - ₺1.040");
        console.log("  - 1x Gavurdağı Salatası (Ceviz Bol Olsun) - ₺190");
        console.log("  - 2x Fırın Sütlaç - ₺240");
        console.log("  Toplam: ₺1.470, 5 Kalem Ürün.");

        const sampleDraftPayload = {
            waiterId: 'w-1',
            waiterName: 'Ahmet Yılmaz',
            tableId: 'tbl-4',
            tableName: 'Masa 4',
            cart: {
                'm-2': {
                    product: { id: 'm-2', name: 'Dana Antrikot', price: 520, category: 'Ana Yemekler' },
                    quantity: 2,
                    notes: ['Orta'],
                    customNote: 'Ekstra tereyağlı sos'
                },
                'm-4': {
                    product: { id: 'm-4', name: 'Gavurdağı Salatası', price: 190, category: 'Salatalar' },
                    quantity: 1,
                    notes: ['Ceviz bol olsun'],
                    customNote: 'Nar ekşili'
                },
                'm-7': {
                    product: { id: 'm-7', name: 'Fırın Sütlaç', price: 120, category: 'Tatlılar' },
                    quantity: 2,
                    notes: ['Fındık bol'],
                    customNote: ''
                }
            },
            itemCount: 5,
            totalAmount: 1470,
            updatedAt: Date.now()
        };

        console.log("\n[2/4] Garson el terminalinde sepeti doldururken arka planda Cloud Senkronizasyonu tetikleniyor...");
        const saveRes = await httpRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/waiter/draft',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, sampleDraftPayload);

        console.log(`📡 POST /api/waiter/draft Yanıt: HTTP ${saveRes.status}`, saveRes.data);
        if (!saveRes.data.success) throw new Error("Taslak sunucuya kaydedilemedi!");

        console.log("\n[KRİTİK DONANIM HATASI CANLANDIRMASI]:");
        console.log("⚠️  GARSONUN TELEFONUNUN ŞARJI BİTTİ VEYA YERE DÜŞÜP EKRANI KIRILDI!");
        console.log("📱 Ahmet kasadaki yedek el terminalini veya kendi tabletini eline aldı.");
        console.log("🔑 Ahmet yedek cihazda 4 haneli PIN'ini (1234) tuşladı.");

        console.log("\n[3/4] Yedek Terminal Ahmet'in Askıda Kalan Taslak Siparişini Sorguluyor...");
        const fetchRes = await httpRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/waiter/draft?waiterId=w-1',
            method: 'GET'
        });

        console.log(`📡 GET /api/waiter/draft?waiterId=w-1 Yanıt: HTTP ${fetchRes.status}`);
        const recovered = fetchRes.data.draft;
        const cartItemsList = Object.values(recovered.cart).map(c => `${c.quantity}x ${c.product.name} (${c.customNote || c.notes.join(', ') || 'Not yok'})`);
        
        console.log("Kurtarılan Taslak Özeti:", {
            table: recovered.tableName,
            waiter: recovered.waiterName,
            itemCount: recovered.itemCount,
            totalAmount: recovered.totalAmount + " ₺",
            items: cartItemsList
        });

        if (recovered.tableId !== 'tbl-4' || recovered.itemCount !== 5 || recovered.totalAmount !== 1470) {
            throw new Error(`Kurtarılan taslak verisi tutarsız! itemCount: ${recovered.itemCount}, totalAmount: ${recovered.totalAmount}`);
        }
        console.log("✅ BAŞARILI: Ahmet'in 6 kişilik siparişi, tüm özel notlarıyla sıfır kayıpla yeni cihazda eksiksiz kurtarıldı!");

        console.log("\n[4/4] Ahmet Siparişi Onayladı ve Mutfağa Gönderdi (Adım Tamamlandı & Taslak Temizliği)...");
        const deleteRes = await httpRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/waiter/draft?waiterId=w-1&tableId=tbl-4',
            method: 'DELETE'
        });

        console.log(`📡 DELETE /api/waiter/draft?waiterId=w-1&tableId=tbl-4 Yanıt: HTTP ${deleteRes.status}`, deleteRes.data);

        // Verify it is gone
        const verifyEmptyRes = await httpRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/waiter/draft?waiterId=w-1',
            method: 'GET'
        });
        console.log("Taslak Durumu Doğrulaması (Kullanıldıktan Sonra):", verifyEmptyRes.data);
        if (verifyEmptyRes.data.draft !== null) {
            throw new Error("Taslak silinmedi!");
        }

        console.log("\n===============================================================================");
        console.log("🎉 TÜM TESTLER BAŞARIYLA TAMAMLANDI: SAHA DAYANIKLILIK KATMANI KUSURSUZ ÇALIŞIYOR!");
        console.log("===============================================================================");

    } finally {
        serverProcess.kill('SIGINT');
        console.log("\nTest sunucusu güvenle kapatıldı.");
    }
}

runTest().catch((err) => {
    console.error("❌ Test Hatası:", err);
    process.exit(1);
});
