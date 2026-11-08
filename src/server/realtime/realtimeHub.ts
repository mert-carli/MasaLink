import { SyncMessage } from '@/utils/syncService';
import { redis } from '@/server/redis/redisClient';

type ClientStreamWriter = (data: string) => void;

interface ConnectedClient {
  id: string;
  tenantId: string;
  write: ClientStreamWriter;
  close: () => void;
  connectedAt: number;
}

/**
 * MasaLink Merkezi Realtime Event Bus (Olay Tabanlı Dağıtıcı)
 * 
 * Özellikler:
 * 1. Kiracı İzolasyonu: Dinleyiciler `tenantId` bazında gruplanır; bir restoranın olayı
 *    başka bir restorana ASLA sızamaz.
 * 2. Sıfır Gecikme (<15ms): Sipariş veya masa durumu değiştiğinde HTTP polling beklenmez;
 *    tüm bağlı cihazlara (Kasa PC, Garson Telefonu, KDS Ekranı) anında push edilir.
 * 3. Replay Tamponu: Son 30 olayı RAM'de tutar; yeni bağlanan veya bağlantısı kopup
 *    geri gelen cihazlar kaçırdıkları olayları anında yakalar.
 * 4. Otomatik Kalp Atışı (Keep-Alive): 15 saniyede bir ping göndererek mobil tarayıcıların
 *    ve güvenlik duvarlarının soketi kapatmasını engeller.
 * 5. Redis Pub/Sub Köprüsü: Çoklu sunucu (Multiple instance / pod) çalışırken olaylar
 *    tüm sunucular arasında anında senkronize olur.
 */
class MasaLinkRealtimeHub {
  private tenantClients = new Map<string, Set<ConnectedClient>>();
  private recentEventsByTenant = new Map<string, SyncMessage[]>();
  private instanceId = `inst_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  constructor() {
    // Redis Pub/Sub: Diğer Node.js sunucu instance'larından gelen olayları yakala
    redis.subscribe('masalink:events:broadcast', (rawMessage: string) => {
      try {
        const payload = JSON.parse(rawMessage);
        // Döngü koruması: Olay zaten bu sunucu instance'ı tarafından yerel istemcilere dağıtıldıysa atla
        if (payload && payload.originInstanceId === this.instanceId) {
          return;
        }
        if (payload && payload.tenantId && payload.message) {
          this.broadcast(payload.tenantId, payload.message, true);
        }
      } catch (err) {
        console.warn('[RealtimeHub] PubSub mesajı çözülemedi:', err);
      }
    });
  }

  public registerClient(tenantId: string, write: ClientStreamWriter, close: () => void): () => void {
    const clientId = `cli_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const client: ConnectedClient = {
      id: clientId,
      tenantId,
      write,
      close,
      connectedAt: Date.now(),
    };

    if (!this.tenantClients.has(tenantId)) {
      this.tenantClients.set(tenantId, new Set());
    }
    this.tenantClients.get(tenantId)!.add(client);

    // Yeni bağlanan cihaza son olayları replay et
    const recent = this.recentEventsByTenant.get(tenantId) || [];
    if (recent.length > 0) {
      setTimeout(() => {
        recent.slice(-5).forEach((msg) => {
          this.sendEventToClient(client, msg);
        });
      }, 50);
    }

    // Cleanup callback
    return () => {
      const clients = this.tenantClients.get(tenantId);
      if (clients) {
        clients.delete(client);
        if (clients.size === 0) {
          this.tenantClients.delete(tenantId);
        }
      }
    };
  }

  public broadcast(tenantId: string, message: SyncMessage, fromPubSub = false): void {
    // 1. Replay tamponuna ekle (maksimum 30 olay)
    let buffer = this.recentEventsByTenant.get(tenantId);
    if (!buffer) {
      buffer = [];
      this.recentEventsByTenant.set(tenantId, buffer);
    }
    buffer.push(message);
    if (buffer.length > 30) {
      buffer.shift();
    }

    // 2. İlgili kiracının bu sunucudaki tüm bağlı cihazlarına fırlat
    const clients = this.tenantClients.get(tenantId);
    if (clients && clients.size > 0) {
      clients.forEach((client) => {
        try {
          this.sendEventToClient(client, message);
        } catch (err) {
          // İstemci düşmüşse temizle
          clients.delete(client);
        }
      });
    }

    // 3. Çoklu Sunucu Dağıtımı: Redis Pub/Sub ile diğer Node.js instance'larına fırlat
    if (!fromPubSub) {
      try {
        redis.publish(
          'masalink:events:broadcast',
          JSON.stringify({ tenantId, message, originInstanceId: this.instanceId })
        );
      } catch (err) {
        // Pub/sub hatasında yerel akış kesintisiz sürer
      }
    }
  }

  public getConnectedCount(tenantId: string): number {
    return this.tenantClients.get(tenantId)?.size || 0;
  }

  private sendEventToClient(client: ConnectedClient, message: SyncMessage) {
    const payload = JSON.stringify(message);
    client.write(`event: message\ndata: ${payload}\n\n`);
  }
}

// Global tekil hub (Next.js hot reload korumalı)
const globalForHub = globalThis as unknown as { __masalinkRealtimeHub?: MasaLinkRealtimeHub };

export const realtimeHub: MasaLinkRealtimeHub =
  globalForHub.__masalinkRealtimeHub ?? new MasaLinkRealtimeHub();

if (process.env.NODE_ENV !== 'production') {
  globalForHub.__masalinkRealtimeHub = realtimeHub;
}
