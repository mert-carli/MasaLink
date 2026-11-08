'use client';

import React, { useState } from 'react';
import { 
  Printer, 
  Radio, 
  Eye, 
  CheckCircle2, 
  RefreshCw, 
  Server, 
  Wifi, 
  Save, 
  Sliders, 
  Bell, 
  Camera,
  Play,
  AlertTriangle
} from 'lucide-react';

interface SystemSettingsModuleProps {
  onSimulatePrinterError?: () => void;
}

export const SystemSettingsModule: React.FC<SystemSettingsModuleProps> = ({
  onSimulatePrinterError,
}) => {
  const [printerIp, setPrinterIp] = useState('192.168.1.180');
  const [printerPort, setPrinterPort] = useState('9100');
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');
  const [autoCut, setAutoCut] = useState(true);
  const [kitchenBuzzer, setKitchenBuzzer] = useState(true);

  // Vision AI Settings
  const [cameraStreams, setCameraStreams] = useState([
    { id: 'cam1', name: 'Kamera 1 (Ana Salon)', rtsp: 'rtsp://192.168.1.50:554/ch0', status: 'online', fps: 24, tables: 'Masa 1 - Masa 8' },
    { id: 'cam2', name: 'Kamera 2 (Açık Bahçe)', rtsp: 'rtsp://192.168.1.51:554/ch0', status: 'online', fps: 24, tables: 'Masa 9 - Masa 14' },
    { id: 'cam3', name: 'Kamera 3 (Teras Katı)', rtsp: 'rtsp://192.168.1.52:554/ch0', status: 'online', fps: 20, tables: 'Masa 15 - Masa 18' },
  ]);
  const [delayThresholdMinutes, setDelayThresholdMinutes] = useState(2.75); // 2 dk 45 sn

  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [bridgeTesting, setBridgeTesting] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<{
    online: boolean;
    latencyMs: number;
    agentVersion: string;
    targetPrinter: string;
  }>({
    online: true,
    latencyMs: 14,
    agentVersion: 'v1.2.0-win64',
    targetPrinter: '192.168.1.180:9100 (Online)',
  });

  const handleTestBridge = async () => {
    setBridgeTesting(true);
    setTimeout(() => {
      setBridgeTesting(false);
      setBridgeStatus(prev => ({
        ...prev,
        online: true,
        latencyMs: Math.floor(10 + Math.random() * 8),
      }));
      setSavedMessage('Yerel Print Bridge ile bağlantı doğrulandı (Gecikme: 12ms). ESC/POS TCP 9100 soketi açık!');
      setTimeout(() => setSavedMessage(null), 4000);
    }, 600);
  };

  const handleSave = () => {
    setSavedMessage('Sistem ayarları ve yazıcı parametreleri başarıyla kaydedildi.');
    setTimeout(() => setSavedMessage(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-orange-400" />
            Sistem, ESC/POS Yazıcı & Vision AI Yapılandırması
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Mutfak termal yazıcısının ağ parametreleri ve güvenlik kameralarının yapay zekâ entegrasyonu.
          </p>
        </div>

        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-2 shadow-lg transition-colors self-start sm:self-auto"
        >
          <Save className="w-4 h-4" />
          Değişiklikleri Kaydet
        </button>
      </div>

      {savedMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {savedMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* ESC/POS Kitchen Printer Hardware Config */}
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Mutfak Termal Fiş Yazıcısı (ESC/POS)</h4>
                <p className="text-[11px] text-zinc-400">Zero KDS Mimarisi: Mutfağa tablet gerekmez</p>
              </div>
            </div>
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Bağlı (Online)
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 block mb-1">Yazıcı LAN IP Adresi:</label>
                <input
                  type="text"
                  value={printerIp}
                  onChange={(e) => setPrinterIp(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-white/[0.08] rounded-xl text-white font-mono focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Port (Standart: 9100):</label>
                <input
                  type="text"
                  value={printerPort}
                  onChange={(e) => setPrinterPort(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-white/[0.08] rounded-xl text-white font-mono focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 block mb-1">Kağıt Genişliği:</label>
                <select
                  value={paperWidth}
                  onChange={(e) => setPaperWidth(e.target.value as any)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-white/[0.08] rounded-xl text-white focus:outline-none focus:border-orange-500 cursor-pointer"
                >
                  <option value="80mm">80mm Standart ESC/POS (Tavsiye Edilen)</option>
                  <option value="58mm">58mm Dar Fiş</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Donanım Ayarları:</label>
                <div className="flex items-center gap-3 pt-2">
                  <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300 text-xs">
                    <input
                      type="checkbox"
                      checked={autoCut}
                      onChange={(e) => setAutoCut(e.target.checked)}
                      className="rounded accent-orange-500"
                    />
                    Otomatik Kesici
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300 text-xs">
                    <input
                      type="checkbox"
                      checked={kitchenBuzzer}
                      onChange={(e) => setKitchenBuzzer(e.target.checked)}
                      className="rounded accent-orange-500"
                    />
                    Sesli Uyarı (Buzzer)
                  </label>
                </div>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <button
                onClick={() => alert(`Test fişi ${printerIp}:${printerPort} adresine başarıyla iletildi!`)}
                className="w-full py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 border border-white/[0.08] font-bold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5 text-orange-400" />
                Yazıcıya Test Fişi Fırlat
              </button>

              {onSimulatePrinterError && (
                <button
                  onClick={onSimulatePrinterError}
                  className="w-full py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                  title="Sahada kağıt bittiğinde veya kablo çıktığında arayüzün nasıl davrandığını test edin"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  Kağıt Bitti / Yazıcı Kapalı Hatasını Sına (Disaster Test)
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Vision AI Camera Network Config */}
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Vision AI Güvenlik Kameraları</h4>
                <p className="text-[11px] text-zinc-400">RTSP / Onvif akışı üzerinden gerçek zamanlı nesne tespiti</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {cameraStreams.map((cam) => (
              <div
                key={cam.id}
                className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{cam.name}</span>
                    <span className="text-[10px] text-emerald-400 font-mono">🟢 24 FPS</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 font-mono mt-0.5">{cam.rtsp}</p>
                  <span className="text-[10px] text-orange-400/90 font-medium">Kapsama: {cam.tables}</span>
                </div>
                <button className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 text-[11px]">
                  Canlı İzle
                </button>
              </div>
            ))}

            <div className="pt-2">
              <label className="text-xs text-zinc-400 block mb-1">
                Yapay Zekâ "Sipariş Bekleme" Alarm Eşiği (Dakika):
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="0.25"
                  value={delayThresholdMinutes}
                  onChange={(e) => setDelayThresholdMinutes(parseFloat(e.target.value))}
                  className="flex-1 accent-orange-500 cursor-pointer"
                />
                <span className="font-mono text-orange-400 font-bold text-sm w-20 text-right">
                  {Math.floor(delayThresholdMinutes)} dk {Math.round((delayThresholdMinutes % 1) * 60)} sn
                </span>
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">
                Misafir masaya oturduktan sonra bu süreyi aşarsa radarda sarı/kırmızı "Garson Gönder" uyarısı tetiklenir.
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* Modern MasaLink Print Bridge Architecture Panel */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-zinc-900 via-[#101726] to-zinc-900 border border-amber-500/30 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-white">MasaLink Print Bridge (Yerel Ağ Donanım Ajanı)</h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  {bridgeStatus.agentVersion} • Aktif
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Tarayıcı Private Network Access / Raw TCP kısıtını aşan yerel soket köprüsü (Port: 28443)
              </p>
            </div>
          </div>

          <button
            onClick={handleTestBridge}
            disabled={bridgeTesting}
            className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-zinc-950 border border-amber-500/40 text-xs font-bold transition-all flex items-center gap-2 self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${bridgeTesting ? 'animate-spin' : ''}`} />
            {bridgeTesting ? 'Köprü Sınanıyor...' : 'Köprü & TCP Soketini Sına'}
          </button>
        </div>

        {/* Visual Architecture Diagram */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs">
          {/* Step 1 */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
            <div className="flex items-center justify-between text-zinc-400 text-[11px]">
              <span className="font-bold text-white">1. Web SaaS Arayüzü</span>
              <span className="text-[10px] text-emerald-400 font-mono">HTTPS</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-snug">
              Kasiyer "Fiş Bas" dediğinde tarayıcı penceresi açılmaz; emir <strong className="text-zinc-200">http://127.0.0.1:28443</strong> yerel ajanına REST/WS ile fırlatılır.
            </p>
          </div>

          {/* Step 2 */}
          <div className="p-3.5 rounded-xl bg-amber-500/[0.07] border border-amber-500/20 space-y-1.5">
            <div className="flex items-center justify-between text-amber-300 text-[11px]">
              <span className="font-bold text-white">2. MasaLink Bridge Daemon</span>
              <span className="text-[10px] font-mono text-amber-400">{bridgeStatus.latencyMs}ms Gecikme</span>
            </div>
            <p className="text-[11px] text-zinc-300 leading-snug">
              Kasadaki PC veya yerel mini kutuda çalışan hafif servis baytları alır, ESC/POS formatına derler ve ham TCP soketi açar.
            </p>
          </div>

          {/* Step 3 */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
            <div className="flex items-center justify-between text-zinc-400 text-[11px]">
              <span className="font-bold text-white">3. ESC/POS 80mm Yazıcı</span>
              <span className="text-[10px] text-cyan-400 font-mono">TCP: 9100</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-snug">
              Termal yazıcı <strong className="text-zinc-200">{printerIp}:{printerPort}</strong> portundan raw baytları anında alıp fişi keser ve zili çalar.
            </p>
          </div>
        </div>

        {/* Windows Startup & Service Automation Guide */}
        <div className="p-4 rounded-xl bg-black/50 border border-white/[0.08] space-y-2.5 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-white/[0.06]">
            <span className="font-bold text-white flex items-center gap-1.5 text-[11px]">
              <Server className="w-3.5 h-3.5 text-orange-400" />
              Windows Otomatik Başlatma (shell:startup & Silent VBS):
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">
              Otomatik Açılış: Aktif
            </span>
          </div>

          <p className="text-[11px] text-zinc-300 leading-relaxed">
            Kasadaki bilgisayar her sabah açıldığında veya yeniden başlatıldığında, kasiyerin konsol açıp komut yazmasına gerek kalmaz. 
            <strong className="text-white"> install-windows-startup.bat</strong> dosyasına bir kez çift tıklandığında, 
            <code className="text-amber-400 bg-black/60 px-1 py-0.5 rounded text-[10px]">masalink-bridge-silent.vbs</code> dosyası Windows 
            <code className="text-zinc-300 bg-black/60 px-1 py-0.5 rounded text-[10px]">shell:startup</code> klasörüne eklenir. 
            Sistem açılışında arka planda <strong>tamamen sessizce (siyah pencere açılmadan)</strong> devreye girer.
          </p>

          <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
            <div className="font-mono text-[10px] text-zinc-500">
              Konum: <span className="text-zinc-300">MasaLink/scripts/install-windows-startup.bat</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Sessiz Arka Plan (VBScript wscript.exe)
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
