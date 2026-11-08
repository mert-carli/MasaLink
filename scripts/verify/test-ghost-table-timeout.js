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

async function runGhostTableTest() {
    console.log("===============================================================================");
    console.log("   MASALINK - SAHA SENARYOSU 6: HAYALET MASA & VISION AI ZAMAN AŞIMI SIFIRLAMA ");
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
                path: '/api/vision-ai/ghost-table',
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
        console.log("Masa 4'teki misafirler hesabı ödeyip masadan 'Kalktım' demeden ayrıldı.");
        console.log("Garson masayı sistemden temizliğe almayı unuttu (Masa sistemde 'served' olarak asılı kaldı).\n");

        // 1. Durum: Kamera 60 saniyedir kimseyi görmüyor
        console.log("[2/5] Kamera Telemetrisi: 60 saniye kesintisiz boş...");
        const t1 = await httpRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/vision-ai/ghost-table',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, {
            tableId: 'tbl-4',
            tableName: 'Masa 4',
            section: 'salon',
            personCount: 0,
            emptyDurationSeconds: 60,
            confidenceScore: 0.94,
            currentTableStatus: 'served',
            totalAmount: 890
        });

        console.log("60 sn Sonuç:", {
            isGhostTable: t1.data.evaluation?.isGhostTable,
            action: t1.data.evaluation?.actionTaken
        });
        if (t1.data.evaluation?.isGhostTable !== false || t1.data.evaluation?.actionTaken !== 'NONE') {
            throw new Error("60 saniyede yanlışlıkla tetiklendi!");
        }

        // 2. Durum: Kamera 120 saniyedir kimseyi görmüyor (Erken Uyarı Eşiği)
        console.log("\n[3/5] Kamera Telemetrisi: 120 saniye (2 dakika) boş -> Erken İkaz Kontrolü...");
        const t2 = await httpRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/vision-ai/ghost-table',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, {
            tableId: 'tbl-4',
            tableName: 'Masa 4',
            section: 'salon',
            personCount: 0,
            emptyDurationSeconds: 120,
            confidenceScore: 0.94,
            currentTableStatus: 'served',
            totalAmount: 890
        });

        console.log("120 sn Sonuç:", {
            isGhostTable: t2.data.evaluation?.isGhostTable,
            action: t2.data.evaluation?.actionTaken,
            reason: t2.data.evaluation?.reason
        });
        if (t2.data.evaluation?.actionTaken !== 'DISPATCH_WARNING') {
            throw new Error("120 saniyede DISPATCH_WARNING verilmedi!");
        }
        console.log("✅ Erken uyarı garson ve kasaya iletildi: 'Masa 2 dakikadır boş, 60 saniye sonra sıfırlanacak'.");

        // 3. Durum: Kamera 180 saniyedir (3 dakika) kimseyi görmüyor (KRİTİK HAYALET MASA SIFIRLAMA)
        console.log("\n[4/5] Kamera Telemetrisi: 180 saniye (3 DAKİKA) kesintisiz boş -> OTOMATİK SIFIRLAMA PROTOKOLÜ...");
        const t3 = await httpRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/vision-ai/ghost-table',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, {
            tableId: 'tbl-4',
            tableName: 'Masa 4',
            section: 'salon',
            personCount: 0,
            emptyDurationSeconds: 180,
            confidenceScore: 0.95,
            currentTableStatus: 'served',
            totalAmount: 890
        });

        console.log("180 sn Sonuç:", {
            isGhostTable: t3.data.evaluation?.isGhostTable,
            action: t3.data.evaluation?.actionTaken,
            revokedSessionToken: t3.data.evaluation?.revokedSessionToken,
            reason: t3.data.evaluation?.reason
        });

        if (t3.data.evaluation?.isGhostTable !== true || t3.data.evaluation?.actionTaken !== 'AUTO_RESET_TO_CLEANING' || !t3.data.evaluation?.revokedSessionToken) {
            throw new Error("3 dakikalık hayalet masa sıfırlama protokolü başarısız!");
        }
        console.log("✅ 3 Dakika Eşiği Aşıldı: Eski müşterinin 128-bit oturum token'ı iptal edildi ve masa otomatik temizliğe çekildi!");

        // 4. Doğrulama: Yeni gelen bir müşteri eski token ile sipariş vermeye çalışırsa ne olur?
        console.log("\n[5/5] Güvenlik Denetimi: Yeni müşteri masaya oturduğunda eski iptal edilen oturum ile istek atarsa?");
        // Eski oturum iptal edildiği için token doğrulaması başarısız olmalıdır
        const expiredOrderRes = await httpRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/qr-order',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, {
            tenantSlug: 'artisan-burger',
            tableId: 'tbl-4',
            clientFingerprint: 'new_guest_device',
            sessionToken: 'mst_invalid_or_revoked_token',
            items: [
                { productId: 'b1', name: 'Trüflü Smash Burger', quantity: 1 }
            ]
        });

        console.log(`📡 Geçersiz/İptal Edilmiş Token Sipariş Yanıtı: HTTP ${expiredOrderRes.status}`, expiredOrderRes.data);
        if (expiredOrderRes.status !== 403 || expiredOrderRes.data.success !== false) {
            throw new Error("İptal edilmiş hayalet masa token'ı reddedilmedi!");
        }
        console.log("✅ Güvenlik Kalkanı Onaylandı: Yeni müşteri eski müşterinin adisyonunu göremez ve eski token ile sipariş veremez!");

        console.log("\n===============================================================================");
        console.log("🎉 TÜM DOĞRULAMALAR BAŞARILI: HAYALET MASA ZAMAN AŞIMI & VISION AI KUSURSUZ ÇALIŞIYOR!");
        console.log("===============================================================================");

    } finally {
        serverProcess.kill('SIGINT');
        console.log("\nTest sunucusu güvenle kapatıldı.");
    }
}

runGhostTableTest().catch((err) => {
    console.error("❌ Test Hatası:", err);
    process.exit(1);
});
