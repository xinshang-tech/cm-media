import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database.js';
import { redis } from '../config/redis.js';
import {
  getClientIp,
  checkLoginRateLimit,
  recordLoginFailure,
  banIpAndUser,
  handleLoginSuccess,
  createRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  generateToken,
  generateSessionId,
} from '../middleware/auth.js';
import { authenticate } from '../middleware/auth.js';
import { env } from '../config/env.js';
import { sendSmsVerifyCode, sendEmailVerifyCode } from '../services/notification.js';
import type { Request, Response } from 'express';

const router = Router();

// /refresh 专用限流：每 IP 每分钟最多 3 次
const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { message: '请求过于频繁，请稍后再试' },
  store: new RedisStore({
    sendCommand: ((...args: string[]) => (redis as any).call(...args)) as any,
    prefix: 'rl:refresh:',
  }),
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';

    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: '请输入用户名和密码' });
    }

    const rateLimit = await checkLoginRateLimit(ip, username);
    if (!rateLimit.allowed) {
      return res.status(403).json({ message: 'AUTH_IP_BANNED' });
    }

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      const count = await recordLoginFailure(ip, username);

      const { env } = await import('../config/env.js');
      if (count >= env.MAX_LOGIN_ATTEMPTS) {
        await banIpAndUser(ip, username, `登录失败${env.MAX_LOGIN_ATTEMPTS}次`);
        const { notifyBruteForce } = await import('../services/notification.js');
        const { getLocationByIP } = await import('../services/location.js');
        const address = await Promise.race([getLocationByIP(ip).catch(() => ''), new Promise<string>(r => setTimeout(() => r(''), 3000))]);
        notifyBruteForce({
          ip,
          username,
          attempts: count,
          time: new Date().toLocaleString('zh-CN'),
          address,
        }).catch(err => console.error('[通知] 暴力破解通知发送失败:', err));
        return res.status(403).json({ message: 'AUTH_IP_BANNED' });
      }

      return res.status(200).json({
        success: false,
        message: '用户名或密码错误',
      });
    }

    if (user.isPermanentlyBanned) {
      return res.status(403).json({ message: 'AUTH_BANNED' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      const count = await recordLoginFailure(ip, username);

      const { env } = await import('../config/env.js');
      if (count >= env.MAX_LOGIN_ATTEMPTS) {
        await banIpAndUser(ip, username, `登录失败${env.MAX_LOGIN_ATTEMPTS}次`);
        const { notifyBruteForce } = await import('../services/notification.js');
        const { getLocationByIP } = await import('../services/location.js');
        const address = await Promise.race([getLocationByIP(ip).catch(() => ''), new Promise<string>(r => setTimeout(() => r(''), 3000))]);
        notifyBruteForce({
          ip,
          username: user.nickname || user.username,
          attempts: count,
          time: new Date().toLocaleString('zh-CN'),
          address,
        }).catch(err => console.error('[通知] 暴力破解通知发送失败:', err));
        return res.status(403).json({ message: 'AUTH_IP_BANNED' });
      }

      return res.status(200).json({
        success: false,
        message: '用户名或密码错误',
      });
    }

    const result = await handleLoginSuccess(
      { id: user.id, username: user.username, nickname: user.nickname, role: user.role, createdAt: user.createdAt },
      ip,
      ua
    );

    const isSecure = req.secure || req.get('x-forwarded-proto') === 'https';

    // 设置 access token Cookie（2小时）
    res.cookie('token', result.token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      domain: env.COOKIE_DOMAIN || undefined,
      maxAge: 2 * 60 * 60 * 1000,
    });

    // 设置 refresh token Cookie（7天）
    const refreshToken = await createRefreshToken(result.user.id);
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      domain: env.COOKIE_DOMAIN || undefined,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      user: result.user,
    });
  } catch (error) {
    const msg = (error as Error).message || String(error);
    console.error('[Auth] 登录错误:', msg, (error as Error).stack || '');
    res.status(500).json({ message: 'SERVER_ERROR', error: msg });
  }
});

router.post('/refresh', refreshLimiter, async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      return res.status(401).json({ message: 'AUTH_REQUIRED' });
    }

    const userId = await validateRefreshToken(refreshToken);
    if (!userId) {
      res.clearCookie('token', { domain: env.COOKIE_DOMAIN || undefined, secure: req.secure || req.get('x-forwarded-proto') === 'https', sameSite: 'lax' });
      res.clearCookie('refresh_token', { domain: env.COOKIE_DOMAIN || undefined, secure: req.secure || req.get('x-forwarded-proto') === 'https', sameSite: 'lax' });
      return res.status(401).json({ message: 'AUTH_EXPIRED' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, nickname: true, role: true, isPermanentlyBanned: true, createdAt: true },
    });

    if (!user || user.isPermanentlyBanned) {
      res.clearCookie('token', { domain: env.COOKIE_DOMAIN || undefined, secure: req.secure || req.get('x-forwarded-proto') === 'https', sameSite: 'lax' });
      res.clearCookie('refresh_token', { domain: env.COOKIE_DOMAIN || undefined, secure: req.secure || req.get('x-forwarded-proto') === 'https', sameSite: 'lax' });
      return res.status(403).json({ message: 'AUTH_BANNED' });
    }

    // 生成新会话（1小时）
    const sessionId = generateSessionId();
    await redis.set(`session:${userId}`, sessionId, 'EX', 3600);

    await prisma.user.update({
      where: { id: userId },
      data: { sessionId, sessionCreatedAt: new Date() },
    });

    const token = generateToken({ userId, role: user.role, sessionId, userCreatedAt: user.createdAt.getTime() });

    const isSecure = req.secure || req.get('x-forwarded-proto') === 'https';

    res.cookie('token', token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      domain: env.COOKIE_DOMAIN || undefined,
      maxAge: 60 * 60 * 1000,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Auth] 刷新Token错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    if (req.user) {
      await redis.del(`session:${req.user.id}`);
    }
    const refreshToken = req.cookies?.refresh_token;
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    res.clearCookie('token', { domain: env.COOKIE_DOMAIN || undefined, secure: req.secure || req.get('x-forwarded-proto') === 'https', sameSite: 'lax' });
    res.clearCookie('refresh_token', { domain: env.COOKIE_DOMAIN || undefined, secure: req.secure || req.get('x-forwarded-proto') === 'https', sameSite: 'lax' });
    res.json({ success: true });
  } catch (error) {
    console.error('[Auth] 登出错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.post('/clear-session', async (req: Request, res: Response) => {
  const cookieOpts = { domain: env.COOKIE_DOMAIN || undefined, secure: req.secure || req.get('x-forwarded-proto') === 'https', sameSite: 'lax' as const };
  res.clearCookie('token', cookieOpts);
  res.clearCookie('refresh_token', cookieOpts);
  res.json({ success: true });
});

router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatarUrl: true,
        phone: true,
        email: true,
        role: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    res.json({ user });
  } catch (error) {
    console.error('[Auth] 获取用户信息错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.put('/profile', authenticate, async (req: Request, res: Response) => {
  try {
    const { nickname, avatarUrl } = req.body;
    
    const data: Record<string, unknown> = {};
    if (nickname !== undefined) {
      if (!nickname || nickname.trim().length === 0) {
        return res.status(400).json({ message: '昵称不能为空' });
      }
      if (nickname.length > 30) {
        return res.status(400).json({ message: '昵称长度不能超过30个字符' });
      }
      data.nickname = nickname.trim();
    }
    if (avatarUrl !== undefined) {
      data.avatarUrl = avatarUrl || null;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: '没有需要更新的内容' });
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      select: {
        id: true,
        username: true,
        nickname: true,
        avatarUrl: true,
        phone: true,
        email: true,
        role: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    res.json({ success: true, user });
  } catch (error) {
    console.error('[Auth] 更新个人资料错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.put('/password', authenticate, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: '请输入当前密码和新密码' });
    }

    if (newPassword.length < 9) {
      return res.status(400).json({ message: '新密码长度不能少于9位' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });

    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(400).json({ message: '当前密码错误' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { passwordHash },
    });

    // 清除会话，强制重新登录
    const { redis } = await import('../config/redis.js');
    await redis.del(`session:${req.user!.id}`);

    res.json({ success: true, message: '密码修改成功，请重新登录' });
  } catch (error) {
    console.error('[Auth] 修改密码错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

// ==================== 验证码登录 ====================

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// 发送短信验证码（登录用，无需认证）
router.post('/send-sms-code', async (req: Request, res: Response) => {
  try {
    const ip = getClientIp(req);
    const { phone } = req.body;
    if (!phone || !/^1\d{10}$/.test(phone)) {
      return res.status(400).json({ message: '请输入有效的手机号' });
    }

    // IP 维度限流：每 IP 每 5 分钟最多 5 次
    const ipKey = `vc:rate:ip:${ip}`;
    const ipCount = parseInt(await redis.get(ipKey) || '0');
    if (ipCount >= 5) {
      return res.status(429).json({ message: '请求过于频繁，请稍后再试' });
    }
    await redis.incr(ipKey);
    if (ipCount === 0) await redis.expire(ipKey, 300);

    const rateKey = `vc:rate:phone:${phone}`;
    if (await redis.get(rateKey)) {
      return res.status(429).json({ message: '验证码发送过于频繁，请60秒后再试' });
    }

    const code = generateCode();
    await redis.set(`vc:phone:${phone}`, code, 'EX', 300);
    await redis.set(rateKey, '1', 'EX', 60);

    sendSmsVerifyCode(phone, code).catch(err => console.error('[通知] 短信验证码发送失败:', err));

    res.json({ success: true, message: '验证码已发送' });
  } catch (error) {
    console.error('[Auth] 发送短信验证码错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

// 短信验证码登录
router.post('/login-by-phone', async (req: Request, res: Response) => {
  try {
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';
    const { phone, code } = req.body;

    if (!phone || !code) {
      return res.status(400).json({ message: '请输入手机号和验证码' });
    }

    // IP 封禁检查
    const ipBanKey = `ban:ip:${ip}`;
    if (await redis.get(ipBanKey)) {
      return res.status(403).json({ message: 'AUTH_IP_BANNED' });
    }

    const { env } = await import('../config/env.js');
    const failIpKey = `vc:fail:ip:${ip}`;
    const failPhoneKey = `vc:fail:phone:${phone}`;

    const storedCode = await redis.get(`vc:phone:${phone}`);
    if (!storedCode || storedCode !== code) {
      const [ipCount] = await Promise.all([
        redis.incr(failIpKey).then(async n => { if (n === 1) await redis.expire(failIpKey, 86400); return n; }),
        redis.incr(failPhoneKey).then(async n => { if (n === 1) await redis.expire(failPhoneKey, 86400); return n; }),
      ]);
      if (ipCount >= env.MAX_LOGIN_ATTEMPTS) {
        const user = await prisma.user.findUnique({ where: { phone }, select: { username: true } });
        await banIpAndUser(ip, user?.username ?? phone, `手机验证码失败${env.MAX_LOGIN_ATTEMPTS}次`);
        return res.status(403).json({ message: 'AUTH_IP_BANNED' });
      }
      return res.status(400).json({ message: '验证码错误或已过期' });
    }

    // 验证成功，清除失败计数
    await Promise.all([
      redis.del(`vc:phone:${phone}`),
      redis.del(failIpKey),
      redis.del(failPhoneKey),
    ]);

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user || user.isPermanentlyBanned) {
      return res.status(400).json({ message: '验证码错误或已过期' });
    }

    const result = await handleLoginSuccess(
      { id: user.id, username: user.username, nickname: user.nickname, role: user.role, createdAt: user.createdAt },
      ip,
      ua
    );

    const isSecure = req.secure || req.get('x-forwarded-proto') === 'https';

    res.cookie('token', result.token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      domain: env.COOKIE_DOMAIN || undefined,
      maxAge: 2 * 60 * 60 * 1000,
    });

    const refreshToken = await createRefreshToken(result.user.id);
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      domain: env.COOKIE_DOMAIN || undefined,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ success: true, user: result.user });
  } catch (error) {
    console.error('[Auth] 短信验证码登录错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

// 发送邮箱验证码（登录用，无需认证）
router.post('/send-email-code', async (req: Request, res: Response) => {
  try {
    const ip = getClientIp(req);
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: '请输入有效的邮箱地址' });
    }

    // IP 维度限流：每 IP 每 5 分钟最多 5 次
    const ipKey = `vc:rate:ip:${ip}`;
    const ipCount = parseInt(await redis.get(ipKey) || '0');
    if (ipCount >= 5) {
      return res.status(429).json({ message: '请求过于频繁，请稍后再试' });
    }
    await redis.incr(ipKey);
    if (ipCount === 0) await redis.expire(ipKey, 300);

    const rateKey = `vc:rate:email:${email}`;
    if (await redis.get(rateKey)) {
      return res.status(429).json({ message: '验证码发送过于频繁，请60秒后再试' });
    }

    const code = generateCode();
    await redis.set(`vc:email:${email}`, code, 'EX', 300);
    await redis.set(rateKey, '1', 'EX', 60);

    sendEmailVerifyCode(email, code).catch(err => console.error('[通知] 邮箱验证码发送失败:', err));

    res.json({ success: true, message: '验证码已发送' });
  } catch (error) {
    console.error('[Auth] 发送邮箱验证码错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

// 邮箱验证码登录
router.post('/login-by-email', async (req: Request, res: Response) => {
  try {
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: '请输入邮箱和验证码' });
    }

    // IP 封禁检查
    const ipBanKey = `ban:ip:${ip}`;
    if (await redis.get(ipBanKey)) {
      return res.status(403).json({ message: 'AUTH_IP_BANNED' });
    }

    const { env } = await import('../config/env.js');
    const failIpKey = `vc:fail:ip:${ip}`;
    const failEmailKey = `vc:fail:email:${email}`;

    const storedCode = await redis.get(`vc:email:${email}`);
    if (!storedCode || storedCode !== code) {
      const [ipCount] = await Promise.all([
        redis.incr(failIpKey).then(async n => { if (n === 1) await redis.expire(failIpKey, 86400); return n; }),
        redis.incr(failEmailKey).then(async n => { if (n === 1) await redis.expire(failEmailKey, 86400); return n; }),
      ]);
      if (ipCount >= env.MAX_LOGIN_ATTEMPTS) {
        const user = await prisma.user.findUnique({ where: { email }, select: { username: true } });
        await banIpAndUser(ip, user?.username ?? email, `邮箱验证码失败${env.MAX_LOGIN_ATTEMPTS}次`);
        return res.status(403).json({ message: 'AUTH_IP_BANNED' });
      }
      return res.status(400).json({ message: '验证码错误或已过期' });
    }

    // 验证成功，清除失败计数
    await Promise.all([
      redis.del(`vc:email:${email}`),
      redis.del(failIpKey),
      redis.del(failEmailKey),
    ]);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.isPermanentlyBanned) {
      return res.status(400).json({ message: '验证码错误或已过期' });
    }

    const result = await handleLoginSuccess(
      { id: user.id, username: user.username, nickname: user.nickname, role: user.role, createdAt: user.createdAt },
      ip,
      ua
    );

    const isSecure = req.secure || req.get('x-forwarded-proto') === 'https';

    res.cookie('token', result.token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      domain: env.COOKIE_DOMAIN || undefined,
      maxAge: 2 * 60 * 60 * 1000,
    });

    const refreshToken = await createRefreshToken(result.user.id);
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      domain: env.COOKIE_DOMAIN || undefined,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ success: true, user: result.user });
  } catch (error) {
    console.error('[Auth] 邮箱验证码登录错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

// ==================== 修改手机号/邮箱（需登录） ====================

// 发送短信验证码（修改手机号用，需认证）
router.post('/send-phone-verify', authenticate, async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone || !/^1\d{10}$/.test(phone)) {
      return res.status(400).json({ message: '请输入有效的手机号' });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { phone: true },
    });
    if (currentUser?.phone === phone) {
      return res.status(400).json({ message: '新手机号与当前手机号相同' });
    }

    const existing = await prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (existing && existing.id !== req.user!.id) {
      return res.status(400).json({ message: '该手机号已被其他账号绑定' });
    }

    const rateKey = `vc:rate:phone:${phone}`;
    if (await redis.get(rateKey)) {
      return res.status(429).json({ message: '验证码发送过于频繁，请60秒后再试' });
    }

    const code = generateCode();
    await redis.set(`vc:phone:${phone}`, code, 'EX', 300);
    await redis.set(rateKey, '1', 'EX', 60);

    const sent = await sendSmsVerifyCode(phone, code);
    if (!sent) {
      return res.status(500).json({ message: '验证码发送失败，请稍后再试' });
    }

    res.json({ success: true, message: '验证码已发送' });
  } catch (error) {
    console.error('[Auth] 发送手机验证码错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

// 修改手机号（需认证 + 验证码）
router.put('/phone', authenticate, async (req: Request, res: Response) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ message: '请输入手机号和验证码' });
    }

    const storedCode = await redis.get(`vc:phone:${phone}`);
    if (!storedCode || storedCode !== code) {
      return res.status(400).json({ message: '验证码错误或已过期' });
    }

    await redis.del(`vc:phone:${phone}`);

    const existing = await prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (existing && existing.id !== req.user!.id) {
      return res.status(400).json({ message: '该手机号已被其他账号绑定' });
    }

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { phone },
    });

    res.json({ success: true, message: '手机号修改成功' });
  } catch (error) {
    console.error('[Auth] 修改手机号错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

// 发送邮箱验证码（修改邮箱用，需认证）
router.post('/send-email-verify', authenticate, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: '请输入有效的邮箱地址' });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { email: true },
    });
    if (currentUser?.email === email) {
      return res.status(400).json({ message: '新邮箱与当前邮箱相同' });
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing && existing.id !== req.user!.id) {
      return res.status(400).json({ message: '该邮箱已被其他账号绑定' });
    }

    const rateKey = `vc:rate:email:${email}`;
    if (await redis.get(rateKey)) {
      return res.status(429).json({ message: '验证码发送过于频繁，请60秒后再试' });
    }

    const code = generateCode();
    await redis.set(`vc:email:${email}`, code, 'EX', 300);
    await redis.set(rateKey, '1', 'EX', 60);

    const sent = await sendEmailVerifyCode(email, code);
    if (!sent) {
      return res.status(500).json({ message: '验证码发送失败，请稍后再试' });
    }

    res.json({ success: true, message: '验证码已发送' });
  } catch (error) {
    console.error('[Auth] 发送邮箱验证码错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

// 修改邮箱（需认证 + 验证码）
router.put('/email', authenticate, async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ message: '请输入邮箱和验证码' });
    }

    const storedCode = await redis.get(`vc:email:${email}`);
    if (!storedCode || storedCode !== code) {
      return res.status(400).json({ message: '验证码错误或已过期' });
    }

    await redis.del(`vc:email:${email}`);

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing && existing.id !== req.user!.id) {
      return res.status(400).json({ message: '该邮箱已被其他账号绑定' });
    }

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { email },
    });

    res.json({ success: true, message: '邮箱修改成功' });
  } catch (error) {
    console.error('[Auth] 修改邮箱错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

export default router;
