import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database.js';
import { redis, cacheGet, cacheDel } from '../config/redis.js';
import { env } from '../config/env.js';
import type { Request, Response, NextFunction } from 'express';

export interface JwtPayload {
  userId: number;
  role: 'ADMIN' | 'USER';
  sessionId: string;
  userCreatedAt: number; // unix timestamp ms — detects DB reset
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        nickname: string;
        role: 'ADMIN' | 'USER';
        sessionId: string;
      };
    }
  }
}

// app.set('trust proxy', 'loopback') 已配置，req.ip 由 Express 从 Nginx 的 X-Forwarded-For 中安全解析
export function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || '0.0.0.0';
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as any });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

export function generateSessionId(): string {
  return crypto.randomUUID();
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'AUTH_REQUIRED' });
    }

    const decoded = verifyToken(token);

    // 检查Redis中会话是否有效
    const sessionKey = `session:${decoded.userId}`;
    const activeSessionId = await redis.get(sessionKey);

    if (!activeSessionId || activeSessionId !== decoded.sessionId) {
      return res.status(401).json({ message: 'AUTH_EXPIRED' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, username: true, nickname: true, role: true, isPermanentlyBanned: true, createdAt: true },
    });

    if (!user) {
      return res.status(401).json({ message: 'AUTH_REQUIRED' });
    }

    // 防止数据库重置后旧token复用：对比用户创建时间
    if (user.createdAt.getTime() !== decoded.userCreatedAt) {
      return res.status(401).json({ message: 'AUTH_REQUIRED' });
    }

    if (user.isPermanentlyBanned) {
      return res.status(403).json({ message: 'AUTH_BANNED' });
    }

    req.user = {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
      sessionId: decoded.sessionId,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: 'AUTH_EXPIRED' });
    }
    return res.status(401).json({ message: 'AUTH_REQUIRED' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: '权限不足' });
  }
  next();
}

export async function banChecker(req: Request, res: Response, next: NextFunction) {
  const ip = getClientIp(req);


  const ipBanCache = await cacheGet<boolean>(`ban:ip:${ip}`);
  if (ipBanCache === true) {
    return res.status(403).json({ message: 'AUTH_IP_BANNED' });
  }

  const bannedIp = await prisma.bannedIp.findUnique({
    where: { ipAddress: ip },
  });

  if (bannedIp && bannedIp.isPermanent && !bannedIp.unbannedAt) {
    await redis.set(`ban:ip:${ip}`, 'true', 'EX', 86400);
    return res.status(403).json({ message: 'AUTH_IP_BANNED' });
  }

  next();
}

const REFRESH_TOKEN_PREFIX = 'refresh:';
const REFRESH_TOKEN_TTL = 7 * 24 * 3600;

export async function createRefreshToken(userId: number): Promise<string> {
  const token = crypto.randomUUID();
  await redis.set(`${REFRESH_TOKEN_PREFIX}${token}`, String(userId), 'EX', REFRESH_TOKEN_TTL);
  return token;
}

export async function validateRefreshToken(token: string): Promise<number | null> {
  const raw = await redis.get(`${REFRESH_TOKEN_PREFIX}${token}`);
  if (!raw) return null;
  await redis.expire(`${REFRESH_TOKEN_PREFIX}${token}`, REFRESH_TOKEN_TTL);
  return parseInt(raw);
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await redis.del(`${REFRESH_TOKEN_PREFIX}${token}`);
}

const LOGIN_ATTEMPT_IP_PREFIX = 'login:attempt:ip:';
const LOGIN_ATTEMPT_USER_PREFIX = 'login:attempt:user:';
const LOGIN_TTL = 24 * 3600; // 24小时滑动窗口

export async function checkLoginRateLimit(ip: string, username?: string): Promise<{ allowed: boolean; remaining: number }> {
  const ipBanKey = `ban:ip:${ip}`;
  const ipBanned = await redis.get(ipBanKey);
  if (ipBanned) return { allowed: false, remaining: 0 };

  const ipAttemptKey = LOGIN_ATTEMPT_IP_PREFIX + ip;
  const ipCount = parseInt(await redis.get(ipAttemptKey) || '0');
  if (ipCount >= env.MAX_LOGIN_ATTEMPTS) return { allowed: false, remaining: 0 };

  if (username) {
    const userAttemptKey = LOGIN_ATTEMPT_USER_PREFIX + username;
    const userCount = parseInt(await redis.get(userAttemptKey) || '0');
    if (userCount >= env.MAX_LOGIN_ATTEMPTS) return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: env.MAX_LOGIN_ATTEMPTS - ipCount };
}

export async function recordLoginFailure(ip: string, username: string): Promise<number> {
  const ipAttemptKey = LOGIN_ATTEMPT_IP_PREFIX + ip;
  const userAttemptKey = LOGIN_ATTEMPT_USER_PREFIX + username;

  // IP 维度计数，24小时 TTL 滑动窗口
  const ipCount = await redis.incr(ipAttemptKey);
  if (ipCount === 1) await redis.expire(ipAttemptKey, LOGIN_TTL);

  // 账号维度计数，24小时 TTL
  const userCount = await redis.incr(userAttemptKey);
  if (userCount === 1) await redis.expire(userAttemptKey, LOGIN_TTL);

  const log = await prisma.loginLog.create({
    data: {
      username,
      ipAddress: ip,
      success: false,
      failureReason: 'wrong_password',
    },
  });

  // 异步解析IP归属地并更新日志
  resolveAndUpdateAddress(log.id, ip);

  return ipCount;
}

async function resolveAndUpdateAddress(logId: bigint, ip: string) {
  try {
    const { getLocationByIP } = await import('../services/location.js');
    const address = await Promise.race([
      getLocationByIP(ip),
      new Promise<string>(r => setTimeout(() => r(''), 3000)),
    ]);
    if (address) {
      await prisma.loginLog.update({
        where: { id: logId },
        data: { address },
      });
    }
  } catch {
    // 静默失败
  }
}

export async function resetLoginAttempts(ip: string, username?: string): Promise<void> {
  await redis.del(LOGIN_ATTEMPT_IP_PREFIX + ip);
  if (username) await redis.del(LOGIN_ATTEMPT_USER_PREFIX + username);
}

export async function banIpAndUser(ip: string, username: string, reason: string): Promise<void> {
  await prisma.bannedIp.upsert({
    where: { ipAddress: ip },
    create: {
      ipAddress: ip,
      isPermanent: true,
      bannedAt: new Date(),
      reason,
    },
    update: {
      isPermanent: true,
      bannedAt: new Date(),
      unbannedAt: null,
      unbannedBy: null,
      reason,
    },
  });

  const user = await prisma.user.findUnique({ where: { username } });
  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isPermanentlyBanned: true,
        bannedReason: reason,
      },
    });
    await redis.del(`session:${user.id}`);
  }

  await redis.set(`ban:ip:${ip}`, 'true', 'EX', 86400);
}

export async function handleLoginSuccess(user: { id: number; username: string; nickname: string; role: 'ADMIN' | 'USER'; createdAt: Date }, ip: string, ua: string) {
  const sessionId = generateSessionId();

  // 并行：更新用户 + 解析IP归属地
  const [address] = await Promise.all([
    Promise.race([
      (async () => {
        try {
          const { getLocationByIP } = await import('../services/location.js');
          return await getLocationByIP(ip);
        } catch { return ''; }
      })(),
      new Promise<string>(r => setTimeout(() => r(''), 3000)),
    ]),
    prisma.user.update({
      where: { id: user.id },
      data: {
        sessionId,
        sessionCreatedAt: new Date(),
        lastLoginAt: new Date(),
        lastLoginIp: ip,
        lastLoginUa: ua,
        loginAttempts: 0,
      },
    }),
  ]);

  // 在Redis中存储会话（覆盖旧会话 → 踢出其他设备）
  await redis.set(`session:${user.id}`, sessionId, 'EX', 7200);

  await resetLoginAttempts(ip, user.username);

  await prisma.loginLog.create({
    data: {
      username: user.username,
      ipAddress: ip,
      address,
      userAgent: ua,
      success: true,
      userId: user.id,
    },
  });

  const token = generateToken({
    userId: user.id,
    role: user.role,
    sessionId,
    userCreatedAt: user.createdAt.getTime(),
  });

  // 异步发送登录通知（带地址）
  const { notifyLogin } = await import('../services/notification.js');
  notifyLogin({
    username: user.nickname || user.username,
    ip,
    userAgent: ua,
    time: new Date().toLocaleString('zh-CN'),
    address,
  }).catch(err => console.error('[通知] 登录通知发送失败:', err));

  return { token, user: { id: user.id, username: user.username, nickname: user.nickname, role: user.role } };
}
