import { env } from '../config/env.js';

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!env.SMTP_HOST || !env.SMTP_USER) {
    console.warn('[通知] SMTP未配置，跳过邮件发送');
    return false;
  }

  try {
    // 使用 nodemailer 动态导入（按需加载）
    const nodemailer = await import('nodemailer');

    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      html,
    });

    console.log('[通知] 邮件已发送:', to);
    return true;
  } catch (error) {
    console.error('[通知] 邮件发送失败:', error);
    return false;
  }
}

export async function sendSms(phone: string, templateParam: Record<string, string>): Promise<boolean> {
  if (!env.SMS_ACCESS_KEY || !env.SMS_TEMPLATE_CODE) {
    console.warn('[通知] 短信未配置，跳过短信发送');
    return false;
  }

  try {
    const SMS = await import('@alicloud/dysmsapi20170525');
    const { Config } = await import('@alicloud/openapi-client');

    const config = new Config({
      accessKeyId: env.SMS_ACCESS_KEY,
      accessKeySecret: env.SMS_ACCESS_SECRET,
    });
    config.endpoint = 'dysmsapi.aliyuncs.com';

    const client = new SMS.default(config);
    const sendReq = new SMS.SendSmsRequest({
      phoneNumbers: phone,
      signName: env.SMS_SIGN_NAME,
      templateCode: env.SMS_TEMPLATE_CODE,
      templateParam: JSON.stringify(templateParam),
    });

    await client.sendSms(sendReq);
    console.log('[通知] 短信已发送:', phone);
    return true;
  } catch (error) {
    console.error('[通知] 短信发送失败:', error);
    return false;
  }
}

export async function notifyLogin(params: {
  username: string;
  ip: string;
  userAgent: string;
  time: string;
  address?: string;
}): Promise<void> {
  if (!env.NOTIFY_ON_LOGIN) return;

  const subject = `【登录通知】CM Media - ${params.username}`;
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:12px 8px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
        <tr><td style="background:linear-gradient(135deg,#1e40af,#2563eb);border-radius:8px 8px 0 0;padding:16px 18px;">
          <div style="color:#fff;font-size:16px;font-weight:700;">登录通知 · ${params.username}</div>
        </td></tr>
        <tr><td style="background:#fff;padding:16px 18px;">
          <p style="margin:0 0 12px;color:#374151;font-size:13px;line-height:1.6;">
            检测到以下账号刚刚登录了 <strong style="color:#1d4ed8;">CM Media</strong>，请确认是否为本人操作。
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:8px 12px;color:#64748b;font-size:12px;">登录时间</td>
              <td style="padding:8px 12px;color:#0f172a;font-size:13px;">${params.time}</td>
            </tr>
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:8px 12px;color:#64748b;font-size:12px;">IP 地址</td>
              <td style="padding:8px 12px;color:#0f172a;font-size:13px;font-family:monospace;">${params.ip}${params.address ? `&nbsp;<span style="color:#64748b;font-size:11px;">${params.address}</span>` : ''}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;color:#64748b;font-size:12px;">浏览器</td>
              <td style="padding:8px 12px;color:#0f172a;font-size:11px;word-break:break-all;">${params.userAgent}</td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;">
            <tr>
              <td style="padding:10px 12px;">
                <span style="color:#92400e;font-size:11px;">如非本人操作，请立即登录管理后台封禁该 IP。</span>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 8px 8px;padding:10px 18px;text-align:center;">
          <p style="margin:0;color:#94a3b8;font-size:11px;">CM Media 系统自动发送，请勿回复</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail(env.SMTP_ADMIN_EMAIL, subject, html);
}

export async function notifyBruteForce(params: {
  ip: string;
  username: string;
  attempts: number;
  time: string;
  address?: string;
}): Promise<void> {
  if (!env.NOTIFY_ON_BRUTE_FORCE) return;

  const subject = `【安全告警】疑似暴力破解 - IP: ${params.ip}`;
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:12px 8px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
        <tr><td style="background:linear-gradient(135deg,#991b1b,#ef4444);border-radius:8px 8px 0 0;padding:16px 18px;">
          <div style="color:#fff;font-size:16px;font-weight:700;">暴力破解告警</div>
          <div style="color:#fecaca;font-size:11px;margin-top:2px;">IP 已自动封禁</div>
        </td></tr>
        <tr><td style="background:#fff;padding:16px 18px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;">
            <tr style="border-bottom:1px solid #fecaca;">
              <td style="padding:8px 12px;color:#9f1239;font-size:12px;">攻击来源 IP</td>
              <td style="padding:8px 12px;color:#0f172a;font-size:13px;font-weight:700;font-family:monospace;">${params.ip}${params.address ? `&nbsp;<span style="color:#64748b;font-size:11px;font-weight:400;">${params.address}</span>` : ''}</td>
            </tr>
            <tr style="border-bottom:1px solid #fecaca;">
              <td style="padding:8px 12px;color:#9f1239;font-size:12px;">目标账号</td>
              <td style="padding:8px 12px;color:#0f172a;font-size:13px;font-weight:600;">${params.username}</td>
            </tr>
            <tr style="border-bottom:1px solid #fecaca;">
              <td style="padding:8px 12px;color:#9f1239;font-size:12px;">失败次数</td>
              <td style="padding:8px 12px;color:#ef4444;font-size:16px;font-weight:800;">${params.attempts} 次</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;color:#9f1239;font-size:12px;">触发时间</td>
              <td style="padding:8px 12px;color:#0f172a;font-size:13px;">${params.time}</td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;">
            <tr>
              <td style="padding:10px 12px;">
                <span style="color:#14532d;font-size:11px;">如需解除封禁，请登录管理后台 → 用户管理操作。</span>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 8px 8px;padding:10px 18px;text-align:center;">
          <p style="margin:0;color:#94a3b8;font-size:11px;">CM Media 系统自动发送，请勿回复</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail(env.SMTP_ADMIN_EMAIL, subject, html);

  if (env.SMS_ADMIN_PHONE) {
    const maskedUser = params.username.length > 4
      ? params.username.slice(0, 2) + '***' + params.username.slice(-2)
      : params.username;

    await sendSms(env.SMS_ADMIN_PHONE, {
      name: maskedUser,
      time: params.time,
    });
  }
}

export async function sendSmsVerifyCode(phone: string, code: string): Promise<boolean> {
  if (!env.SMS_ACCESS_KEY || !env.SMS_VERIFY_TEMPLATE_CODE) {
    console.warn('[通知] 短信验证码未配置，跳过发送');
    return false;
  }

  try {
    const SMS = await import('@alicloud/dysmsapi20170525');
    const { Config } = await import('@alicloud/openapi-client');

    const config = new Config({
      accessKeyId: env.SMS_ACCESS_KEY,
      accessKeySecret: env.SMS_ACCESS_SECRET,
    });
    config.endpoint = 'dysmsapi.aliyuncs.com';

    const client = new SMS.default(config);
    const sendReq = new SMS.SendSmsRequest({
      phoneNumbers: phone,
      signName: env.SMS_SIGN_NAME,
      templateCode: env.SMS_VERIFY_TEMPLATE_CODE,
      templateParam: JSON.stringify({ code }),
    });

    await client.sendSms(sendReq);
    console.log('[通知] 验证码短信已发送:', phone);
    return true;
  } catch (error) {
    console.error('[通知] 验证码短信发送失败:', error);
    return false;
  }
}

export async function sendEmailVerifyCode(to: string, code: string): Promise<boolean> {
  const subject = '【CM Media】邮箱验证码';
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;box-shadow:0 4px 24px rgba(0,0,0,0.08);border-radius:12px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1e40af 0%,#3b82f6 100%);padding:20px 28px;">
          <div style="color:#fff;font-size:16px;font-weight:700;letter-spacing:0.3px;">CM Media</div>
          <div style="color:#bfdbfe;font-size:12px;margin-top:2px;">安全验证</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="background:#fff;padding:28px;">
          <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">您正在进行邮箱验证，验证码为：</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
            <tr><td style="background:#f0f7ff;border-left:3px solid #2563eb;border-radius:0 6px 6px 0;padding:14px 20px;">
              <span style="font-size:32px;font-weight:800;color:#1d4ed8;letter-spacing:10px;font-family:'Courier New',monospace;">${code}</span>
            </td></tr>
          </table>
          <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">验证码 <strong style="color:#374151;">5 分钟</strong>内有效。如非本人操作，请忽略此邮件。</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:12px 28px;">
          <p style="margin:0;color:#9ca3af;font-size:11px;">此邮件由系统自动发送，请勿回复</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return sendEmail(to, subject, html);
}
