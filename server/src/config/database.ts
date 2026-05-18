import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from './env.js';

const adapter = new PrismaMariaDb(
  {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    connectionLimit: 10,
    acquireTimeout: 30000,
    idleTimeout: 120,
    minimumIdle: 2,
    minDelayValidation: 500,
    keepAliveDelay: 30000,
    connectTimeout: 10000,
    leakDetectionTimeout: 60000,
    pingTimeout: 3000,
  } as any,
  {
    onConnectionError: (err) => {
      console.error('[DB] 连接错误:', err.message);
    },
  },
);

export const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

// 应用层 Keep-Alive：定期 ping 重置 MySQL wait_timeout
const DB_KEEPALIVE_MS = 45_000;
const dbKeepAlive = setInterval(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.warn('[DB] keepalive ping 失败，连接池将自动重建');
  }
}, DB_KEEPALIVE_MS);

export function stopDbKeepAlive() {
  clearInterval(dbKeepAlive);
}
