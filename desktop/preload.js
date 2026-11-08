/**
 * MasaLink Desktop Preload Script (Context Isolation Secure Bridge)
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('masalinkDesktop', {
  isDesktop: true,
  environment: 'kiosk_runtime',
  version: '1.0.0-Production',
  printDirect: (jobPayload) => ipcRenderer.invoke('print-escpos', jobPayload),
});
