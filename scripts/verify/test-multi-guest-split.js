const { spawn } = require('child_process');
const http = require('http');
const crypto = require('crypto');

function makeSessionToken() {
    const JWT_SECRET = 'masalink_enterprise_jwt_signing_secret_2026';
    const payload = {
        userId: 'cashier-1',
        name: 'Zeynep Kaya',
        role: 'cashier',
        tenantId: 'artisan-burger',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 43200 * 1000,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(encodedPayload).digest('base64url');
    return `${encodedPayload}.${signature}`;
}

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

async function runMultiGuestSplitTest() {
    console.log("===============================================================================");
    console.log("   MASALINK - SAHA SENARYOSU 3: ÇOKLU QR ADİSYON BÖLME & KİŞİ BAZLI TAHSİLAT  ");
    console.log("===============================================================================\n");

    console.log("[1/5] Next.js Sunucusu Başlatılıyor (PORT 3000)...");
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
            // waiting for server
        }
    }

    if (!ready) {
        console.error("❌ Sunucu 30 saniye içinde yanıt vermedi!");
        serverProcess.kill();
        process.exit(1);
    }

    console.log("✅ Next.js Sunucusu Hazır ve Dinlemede.\n");

    try {
        console.log("--- SENARYO CANLANDIRMASI ---");
        console.log("Masa 5'e iki arkadaş oturdu: Ali ve Ayşe.");
        console.log("Her ikisi de masadaki QR kodu telefonlarıyla tarattı ve kendi cihazlarından sepet oluşturdu:\n");

        // 1. Ali'nin Siparişi
        console.log("[2/5] Ali (Misafir 1) kendi telefonundan sipariş veriyor: Trüflü Smash Burger (₺295)...");
        const aliOrderRes = await httpRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/qr-order',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, {
            tenantSlug: 'artisan-burger',
            tableId: 'tbl-5',
            clientFingerprint: 'device_ali_phone_1',
            sessionToken: 'tok_demo_table_5',
            guestName: 'Ali (Misafir 1)',
            items: [
                {
                    productId: 'b1',
                    name: 'Trüflü Smash Burger',
                    quantity: 1,
                    cookingLevel: 'Orta Pişmiş',
                    guestTag: 'Ali (Misafir 1)'
                }
            ]
        });

        console.log(`📡 Ali'nin Sipariş Yanıtı: HTTP ${aliOrderRes.status}`, {
            orderId: aliOrderRes.data.orderId,
            total: aliOrderRes.data.totalAmount + " ₺",
            items: aliOrderRes.data.items?.map(i => `${i.name} [👤 ${i.guestTag}] - ₺${i.itemTotal}`)
        });
        if (!aliOrderRes.data.success) {
            console.error("Ali Order Error Details:", aliOrderRes.data);
            throw new Error("Ali'nin siparişi iletilemedi!");
        }

        // 2. Ayşe'nin Siparişi
        console.log("\n[3/5] Ayşe (Misafir 2) kendi telefonundan sipariş veriyor: Klasik Artisan Burger + Kola (₺325)...");
        const ayseOrderRes = await httpRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/qr-order',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, {
            tenantSlug: 'artisan-burger',
            tableId: 'tbl-5',
            clientFingerprint: 'device_ayse_phone_2',
            sessionToken: 'tok_demo_table_5',
            guestName: 'Ayşe (Misafir 2)',
            items: [
                {
                    productId: 'b3',
                    name: 'Klasik Artisan Burger',
                    quantity: 1,
                    cookingLevel: 'İyi Pişmiş',
                    guestTag: 'Ayşe (Misafir 2)'
                },
                {
                    productId: 'i2',
                    name: 'Kola / Meşrubat 330ml',
                    quantity: 1,
                    guestTag: 'Ayşe (Misafir 2)'
                }
            ]
        });

        console.log(`📡 Ayşe'nin Sipariş Yanıtı: HTTP ${ayseOrderRes.status}`, {
            orderId: ayseOrderRes.data.orderId,
            total: ayseOrderRes.data.totalAmount + " ₺",
            items: ayseOrderRes.data.items?.map(i => `${i.name} [👤 ${i.guestTag}] - ₺${i.itemTotal}`)
        });
        if (!ayseOrderRes.data.success) {
            console.error("Ayse Order Error Details:", ayseOrderRes.data);
            throw new Error("Ayşe'nin siparişi iletilemedi!");
        }

        // 3. Masada Toplanan Adisyon Durumu
        console.log("\n--- MASALINK ADİSYON DURUMU ---");
        console.log("Masa 5 genel toplamı: ₺620.");
        console.log("  • Ali'nin Payı: ₺295 (Trüflü Smash Burger)");
        console.log("  • Ayşe'nin Payı: ₺325 (Klasik Artisan Burger + Kola)");

        const cashierToken = makeSessionToken();

        // 4. Kasiyer POS Terminali: Tek Tıkla Ali'nin Siparişini Tahsil Etme
        console.log("\n[4/5] Kasiyer Zeynep Kaya, Kasa POS ekranında 'Kişi Bazlı' sekmesine tıkladı.");
        console.log("Kasiyer: 'Ali kendi hesabını nakit ödemek istiyor.' -> 'Ali'den Al (Nakit)' butonuna basıldı.");

        const aliPaymentRes = await httpRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/tables/payment',
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Cookie': `masalink_session=${cashierToken}`
            }
        }, {
            tableId: 'tbl-5',
            totalAmount: 620,
            paymentAmount: 295,
            paymentMethod: 'Nakit (Ali - Misafir 1)',
            cashierName: 'Zeynep Kaya'
        });

        console.log(`📡 Ali Tahsilat Yanıtı: HTTP ${aliPaymentRes.status}`, {
            paidAmount: aliPaymentRes.data.paidAmount + " ₺",
            totalPaid: aliPaymentRes.data.totalPaid + " ₺",
            remainingBalance: aliPaymentRes.data.remainingBalance + " ₺",
            isCompleted: aliPaymentRes.data.isCompleted,
            message: aliPaymentRes.data.message
        });

        if (aliPaymentRes.data.remainingBalance !== 325) {
            throw new Error(`Ali'nin ödemesi sonrası kalan bakiye 325 ₺ olmalıydı, ancak ${aliPaymentRes.data.remainingBalance} ₺ geldi!`);
        }
        console.log("✅ Ali'nin ₺295'lik payı başarıyla tahsil edildi. Kalan bakiye tam olarak ₺325 (Ayşe'nin payı)!");

        // 5. Ayşe'nin Hesabının Tahsilatı ve Masanın Kapanması
        console.log("\n[5/5] Ayşe kalan ₺325'i Kredi Kartı ile ödüyor...");
        const aysePaymentRes = await httpRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/tables/payment',
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Cookie': `masalink_session=${cashierToken}`
            }
        }, {
            tableId: 'tbl-5',
            totalAmount: 620,
            paymentAmount: 325,
            paymentMethod: 'Kredi Kartı (Ayşe - Misafir 2)',
            cashierName: 'Zeynep Kaya'
        });

        console.log(`📡 Ayşe Tahsilat Yanıtı: HTTP ${aysePaymentRes.status}`, {
            paidAmount: aysePaymentRes.data.paidAmount + " ₺",
            totalPaid: aysePaymentRes.data.totalPaid + " ₺",
            remainingBalance: aysePaymentRes.data.remainingBalance + " ₺",
            isCompleted: aysePaymentRes.data.isCompleted,
            message: aysePaymentRes.data.message
        });

        if (!aysePaymentRes.data.isCompleted || aysePaymentRes.data.remainingBalance > 0.01) {
            throw new Error("Masa bakiyesi sıfırlanmadı!");
        }
        console.log("✅ Masa 5 hesabı sıfır çakışma, sıfır bakiye farkı ile tamamen kapandı ve temizliğe alındı!");

        console.log("\n===============================================================================");
        console.log("🎉 TÜM DOĞRULAMALAR BAŞARILI: ÇOKLU QR ADİSYON BÖLME KUSURSUZ ÇALIŞIYOR!");
        console.log("===============================================================================");

    } finally {
        serverProcess.kill('SIGINT');
        console.log("\nTest sunucusu kapatıldı.");
    }
}

runMultiGuestSplitTest().catch((err) => {
    console.error("❌ Test Hatası:", err);
    process.exit(1);
});
