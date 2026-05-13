import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { execSync } from 'child_process';
import { env } from './config/env.js';
import { prisma } from './config/database.js';
import { redis } from './config/redis.js';
import authRoutes from './routes/auth.js';
import videoRoutes from './routes/videos.js';
import categoryRoutes from './routes/categories.js';
import adminRoutes from './routes/admin.js';
import aliyunRoutes from './routes/aliyun.js';
import photoRoutes from './routes/photos.js';
import { banChecker, authenticate, requireAdmin } from './middleware/auth.js';
import { notifyLogin, notifyBruteForce } from './services/notification.js';
import type { Request, Response } from 'express';

// BigInt 序列化支持
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = express();

// Nginx 反向代理：信任第一个代理（nginx），正确获取协议和 IP
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [env.CLIENT_URL, ...env.ALLOWED_ORIGINS];
    // 允许无 origin 的请求（如 Postman、curl）
    if (!origin || allowed.some(a => origin.startsWith(a))) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

// ---- 全局限流（Redis 存储，重启不清零） ----
app.use(rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3000,
  message: { message: '请求过于频繁，请稍后再试' },
  store: new RedisStore({
    sendCommand: ((...args: string[]) => (redis as any).call(...args)) as any,
    prefix: 'rl:global:',
  }),
}));

// ---- 认证路由独立限流（每 IP 每分钟 20 次，防暴力破解） ----
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { message: '请求过于频繁，请稍后再试' },
  store: new RedisStore({
    sendCommand: ((...args: string[]) => (redis as any).call(...args)) as any,
    prefix: 'rl:auth:',
  }),
});

app.get('/api/health', authenticate, requireAdmin, (_req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api/auth', authLimiter, authRoutes);

app.use('/api/videos', banChecker, videoRoutes);
app.use('/api/categories', banChecker, categoryRoutes);
app.use('/api/photos', banChecker, photoRoutes);

app.use('/api/admin', banChecker, adminRoutes);
app.use('/api/aliyun', banChecker, aliyunRoutes);

app.use((err: Error, _req: Request, res: Response, _next: unknown) => {
  const msg = err?.message || String(err);
  console.error('[App] 未捕获错误:', msg, err?.stack || '');
  res.status(500).json({ message: 'SERVER_ERROR', error: msg });
});

async function start() {
  try {
    await prisma.$connect();
    console.log('[数据库] 已连接');

    // 生产模式自动同步数据库表结构（dev 模式用 npm run db:push 手动同步，避免触发 tsx watch 重启）
    if (process.env.NODE_ENV !== 'development') {
      console.log('[数据库] 正在同步表结构...');
      execSync('npx prisma db push', {
        stdio: 'inherit',
        cwd: process.cwd(),
      });
      console.log('[数据库] 表结构已同步');

      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount === 0) {
        console.log('[数据库] 正在初始化数据...');
        execSync('npx prisma db seed', {
          stdio: 'inherit',
          cwd: process.cwd(),
        });
      }
    }

    await redis.ping();
    console.log('[Redis] 已连接');

    (globalThis as any).__notifyLogin = notifyLogin;
    (globalThis as any).__notifyBruteForce = notifyBruteForce;

    app.listen(env.SERVER_PORT, () => {
      console.log(`[服务器] 已启动: http://localhost:${env.SERVER_PORT}`);
      console.log(`[环境] ${process.env.NODE_ENV || 'development'}`);
    });

    // 日志保留策略：每天清理超过 1 年的 login_logs 和 operation_logs
    async function purgeOldLogs() {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const [loginDel, opDel] = await Promise.all([
        prisma.loginLog.deleteMany({ where: { createdAt: { lt: oneYearAgo } } }),
        prisma.operationLog.deleteMany({ where: { createdAt: { lt: oneYearAgo } } }),
      ]);
      if (loginDel.count || opDel.count) {
        console.log(`[日志清理] 登录日志删除 ${loginDel.count} 条，操作日志删除 ${opDel.count} 条`);
      }
    }
    purgeOldLogs().catch(err => console.error('[日志清理] 启动时清理失败:', err));
    setInterval(() => purgeOldLogs().catch(err => console.error('[日志清理] 定时清理失败:', err)), 24 * 60 * 60 * 1000);
  } catch (error) {
    console.error('[服务器] 启动失败:', error);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('[服务器] 正在关闭...');
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[服务器] 正在关闭...');
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
});

start();
