/**
 * MasaLink POS Desktop Kiosk Wrapper (Electron Enterprise Shell)
 * 
 * Amaç:
 * 1. Chromium Private Network Access (PNA) ve Mixed Content kısıtlamalarını tamamen bypass eder.
 * 2. Kasadaki dokunmatik monitörü tam ekran (Kiosk Mode) olarak kilitler; kasiyerin uygulamayı simge durumuna küçültmesini veya masaüstüne çıkmasını engeller.
 * 3. Donanım seviyesinde raw TCP/IP (9100) ve USB ESC/POS soketlerini doğrudan yönetir.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const net = require('net');

let mainWindow = null;

const POS_URL = process.env.POS_URL || 'http://localhost:3000/pos';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    kiosk: process.env.NODE_ENV === 'production', // Üretimde tam ekran kiosk kilidi
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: '#070a12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true, // Güvenlik açıklarını engeller, IPC üzerinden donanıma erişir
    },
  });

  mainWindow.loadURL(POS_URL);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Kiosk güvenliği: Yeni pencere açılmasını veya harici sayfalara gidilmesini engelle
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
}

// ---------------------------------------------------------------------------
// IPC Donanım Köprüsü: Web Arayüzünden Gelen ESC/POS Baytlarını Doğrudan Bas
// DONANIM BUFFER KORUMASI: Serialized FIFO Kuyruk & 300ms Soğuma
// ---------------------------------------------------------------------------
const DESKTOP_PRINT_QUEUE = [];
let isDesktopQueueRunning = false;
const DESKTOP_COOLDOWN_MS = 300;

function processNextDesktopJob() {
  if (DESKTOP_PRINT_QUEUE.length === 0) {
    isDesktopQueueRunning = false;
    return;
  }

  isDesktopQueueRunning = true;
  const current = DESKTOP_PRINT_QUEUE.shift();
  const { targetIp = '192.168.1.180', targetPort = 9100, dataBase64, jobId, resolve } = current;

  if (!dataBase64) {
    resolve({ success: false, error: 'ESC/POS veri paketi eksik.' });
    return processNextDesktopJob();
  }

  const rawBuffer = Buffer.from(dataBase64, 'base64');
  console.log(`[MasaLink Desktop FIFO] Yazıcıya bağlanılıyor -> ${targetIp}:${targetPort} (İş: #${jobId})`);

  const client = new net.Socket();
  client.setTimeout(3000);

  let finished = false;
  const finish = (result) => {
    if (finished) return;
    finished = true;
    client.destroy();
    resolve(result);
    setTimeout(() => processNextDesktopJob(), DESKTOP_COOLDOWN_MS);
  };

  client.connect(targetPort, targetIp, () => {
    client.write(rawBuffer, () => {
      console.log(`[MasaLink Desktop FIFO] ${rawBuffer.length} bayt başarıyla aktarıldı. Tampon için 300ms bekleniyor...`);
      finish({ success: true, bytesWritten: rawBuffer.length });
    });
  });

  client.on('error', (err) => {
    console.error(`[MasaLink Desktop FIFO] Soket hatası:`, err.message);
    finish({ success: false, error: `Yazıcıya bağlanılamadı: ${err.message}` });
  });

  client.on('timeout', () => {
    console.error(`[MasaLink Desktop FIFO] Soket zaman aşımı`);
    finish({ success: false, error: 'Yazıcı bağlantı zaman aşımı (ETIMEDOUT)' });
  });
}

ipcMain.handle('print-escpos', async (event, payload) => {
  return new Promise((resolve) => {
    DESKTOP_PRINT_QUEUE.push({
      ...payload,
      resolve,
    });
    if (!isDesktopQueueRunning) {
      processNextDesktopJob();
    }
  });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
