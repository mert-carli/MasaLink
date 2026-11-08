const http = require('http');

async function testDraftRecovery() {
    console.log("=== WAITER DRAFT CLOUD & DEVICE RESILIENCE TEST ===");

    // We can test the API by starting a quick test or calling the Next.js server if running,
    // or we can test the draft route logic directly.
    // Let's check if localhost:3000 is running or start it.
    const isRunning = await checkPort(3000);
    console.log(`Port 3000 status: ${isRunning ? 'RUNNING' : 'NOT RUNNING'}`);

    if (!isRunning) {
        console.log("Starting Next.js production server for testing...");
        // If not running, we'll verify via direct node test or let the main runner start it.
    }
}

function checkPort(port) {
    return new Promise((resolve) => {
        const req = http.get(`http://localhost:${port}/api/waiter/draft?waiterId=test`, (res) => {
            resolve(true);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(1000, () => {
            req.abort();
            resolve(false);
        });
    });
}

testDraftRecovery();
