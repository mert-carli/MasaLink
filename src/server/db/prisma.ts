import { PrismaClient } from '@prisma/client';

/**
 * Tekil PrismaClient.
 * Next.js dev modunda hot-reload her seferinde modülü yeniden yüklediği için
 * istemci globalThis üzerinde saklanır; aksi halde bağlantı havuzu tükenir.
 * Bu modül yalnızca sunucu tarafında (route handler / server component) import edilmelidir.
 */
const globalForPrisma = globalThis as unknown as { __masalinkPrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__masalinkPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__masalinkPrisma = prisma;
}
