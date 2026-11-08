/**
 * MasaLink Vision AI Ghost Table (Hayalet Masa) & Auto-Timeout Engine
 * 
 * Sahadaki Problem:
 * Müşteri hesabı kasadan veya garsona nakit ödedi; ancak garson masayı sistemden
 * "Temizlik Bekliyor" veya "Boş" durumuna almayı unuttu. Masa sistemde hala dolu
 * ve eski adisyon açık görünür; yeni gelen müşteri masadaki QR'ı okuttuğunda
 * eski müşterinin adisyonuyla karşılaşır veya sipariş veremez.
 * 
 * Çözüm:
 * 1. Kamera (Vision AI NVR / Edge model) masanın koordinatlarında sürekli insan varlığı (bounding box) sayımı yapar.
 * 2. Masa sistemde dolu (served, bill_requested, waiting_menu) iken kesintisiz 3 dakika (180 sn) boyunca
 *    personCount === 0 tespit edilirse masa "Hayalet Masa" (Ghost Table) olarak işaretlenir.
 * 3. Oturum Güvenliği: Masanın eski 128-bit QR oturum token'ı anında iptal edilir (Revocation).
 * 4. Otomatik Durum Geçişi: Masa otomatik olarak 'cleaning' (Temizlik Bekliyor) durumuna çekilir,
 *    eski adisyon arşive kaldırılır.
 * 5. Canlı Görev Dağıtımı: Garson terminaline sesli/titreşimli "Masa Boşaldı - Masayı Silin" görevi fırlatılır.
 * 6. Manuel Override Kalkanı: Personel isterse tek dokunuşla yapay zekayı ezebilir (Manual Override).
 */

import { revokeTableSession, refreshTableSession } from './tableSessionRegistry';
import { syncService } from './syncService';

export interface VisionTableTelemetry {
  tableId: string;
  tableName: string;
  section: 'salon' | 'bahce' | 'teras' | 'bar';
  personCount: number; // 0 = boş, >0 = insan oturuyor
  emptyDurationSeconds: number; // kesintisiz boş kalma süresi (sn)
  confidenceScore: number; // 0.0 - 1.0 (YOLO / MobileNet confidence)
  currentTableStatus: string; // 'served' | 'bill_requested' | 'waiting_menu' | 'empty' | 'cleaning'
  totalAmount?: number;
  assignedWaiter?: string;
}

export interface GhostTableEvaluationResult {
  isGhostTable: boolean;
  actionTaken: 'AUTO_RESET_TO_CLEANING' | 'DISPATCH_WARNING' | 'NONE';
  tableId: string;
  tableName: string;
  emptyDurationSeconds: number;
  emptyMinutes: number;
  reason?: string;
  revokedSessionToken?: boolean;
}

export const GHOST_TABLE_THRESHOLD_SECONDS = 180; // 3 dakika kuralı
export const GHOST_TABLE_WARNING_SECONDS = 120; // 2 dakika erken uyarı kuralı

/**
 * Gelen kamera telemetrisini değerlendirir.
 */
export function evaluateGhostTableTelemetry(
  telemetry: VisionTableTelemetry,
  tenantSlug = 'artisan-burger'
): GhostTableEvaluationResult {
  const {
    tableId,
    tableName,
    section,
    personCount,
    emptyDurationSeconds,
    confidenceScore,
    currentTableStatus,
    assignedWaiter,
  } = telemetry;

  // 1. Masa zaten boş veya temizlikteyse işlem yapma
  if (currentTableStatus === 'empty' || currentTableStatus === 'cleaning') {
    return {
      isGhostTable: false,
      actionTaken: 'NONE',
      tableId,
      tableName,
      emptyDurationSeconds,
      emptyMinutes: Math.floor(emptyDurationSeconds / 60),
    };
  }

  // 2. Kamera insan görüyorsa masa aktiftir
  if (personCount > 0) {
    return {
      isGhostTable: false,
      actionTaken: 'NONE',
      tableId,
      tableName,
      emptyDurationSeconds: 0,
      emptyMinutes: 0,
    };
  }

  // 3. Kamera güven skoru yetersizse (kör nokta, loş ışık toleransı)
  if (confidenceScore < 0.60) {
    return {
      isGhostTable: false,
      actionTaken: 'NONE',
      tableId,
      tableName,
      emptyDurationSeconds,
      emptyMinutes: Math.floor(emptyDurationSeconds / 60),
      reason: 'Kamera tespit güven skoru eşiğin altında (< %60), tolerans tanındı.',
    };
  }

  // 4. 180 Saniye (3 Dakika) Eşiği Aşıldı -> HAYALET MASA SIFIRLAMA
  if (emptyDurationSeconds >= GHOST_TABLE_THRESHOLD_SECONDS) {
    // A) Eski müşterinin QR token'ını iptal et (Yeni gelen eski adisyonu göremez!)
    revokeTableSession(tenantSlug, tableId);

    // B) Canlı WebSocket / SyncBus üzerinden Kasaya ve Garsona fırlat
    syncService.broadcast(
      'GHOST_TABLE_RESET',
      {
        tableId,
        tableName,
        section,
        emptyMinutes: Math.floor(emptyDurationSeconds / 60),
        reason: `Vision AI: Masa ${Math.floor(emptyDurationSeconds / 60)} dakikadır tamamen boş. Eski adisyon arşive alındı ve masa temizliğe çekildi.`,
        assignedWaiter,
        timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      },
      'vision_ai_nvr'
    );

    return {
      isGhostTable: true,
      actionTaken: 'AUTO_RESET_TO_CLEANING',
      tableId,
      tableName,
      emptyDurationSeconds,
      emptyMinutes: Math.floor(emptyDurationSeconds / 60),
      reason: `Vision AI: Masa 3 dakikadır tamamen boş. Oturum sonlandırıldı ve masa temizlik moduna alındı.`,
      revokedSessionToken: true,
    };
  }

  // 5. 120-179 Saniye Arası Erken Uyarı (Garsona Hazırlık İkazı)
  if (emptyDurationSeconds >= GHOST_TABLE_WARNING_SECONDS) {
    return {
      isGhostTable: false,
      actionTaken: 'DISPATCH_WARNING',
      tableId,
      tableName,
      emptyDurationSeconds,
      emptyMinutes: Math.floor(emptyDurationSeconds / 60),
      reason: `Vision AI İkazı: Masa 2 dakikadır boş görünüyor. 60 saniye içinde teyit edilmezse otomatik temizliğe çekilecek.`,
    };
  }

  return {
    isGhostTable: false,
    actionTaken: 'NONE',
    tableId,
    tableName,
    emptyDurationSeconds,
    emptyMinutes: Math.floor(emptyDurationSeconds / 60),
  };
}
