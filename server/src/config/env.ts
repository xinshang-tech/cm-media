import { resolve } from 'path';
import { config } from 'dotenv';

// process.cwd() = server/ directory (where the process is started from)
config({ path: resolve(process.cwd(), '.env') });

export const env = {
  DB_HOST: process.env.DB_HOST || '127.0.0.1',
  DB_PORT: Number(process.env.DB_PORT || 3306),
  DB_NAME: process.env.DB_NAME || 'cm-media_2026',
  DB_USER: process.env.DB_USER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD || 'root',
  DATABASE_URL: process.env.DATABASE_URL || '',

  REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',

  JWT_SECRET: process.env.JWT_SECRET || 'change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '2h',

  SERVER_PORT: Number(process.env.SERVER_PORT || 4800),
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:4900',
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:4900').split(',').filter(Boolean),

  MAX_LOGIN_ATTEMPTS: Number(process.env.MAX_LOGIN_ATTEMPTS || 10),

  PAGE_SIZE: Number(process.env.PAGE_SIZE || 20),

  CDN_AUTH_KEY: process.env.CDN_AUTH_KEY || '',

  ALIYUN_VOD_ACCESS_KEY: process.env.ALIYUN_VOD_ACCESS_KEY || '',
  ALIYUN_VOD_ACCESS_SECRET: process.env.ALIYUN_VOD_ACCESS_SECRET || '',
  ALIYUN_VOD_ENDPOINT: process.env.ALIYUN_VOD_ENDPOINT || '',
  ALIYUN_ACCOUNT_ID: process.env.ALIYUN_ACCOUNT_ID || '',

  ALIYUN_OSS_ACCESS_KEY: process.env.ALIYUN_OSS_ACCESS_KEY || '',
  ALIYUN_OSS_ACCESS_SECRET: process.env.ALIYUN_OSS_ACCESS_SECRET || '',
  ALIYUN_OSS_BUCKET: process.env.ALIYUN_OSS_BUCKET || '',
  ALIYUN_OSS_ENDPOINT: process.env.ALIYUN_OSS_ENDPOINT || '',
  ALIYUN_OSS_CNAME: process.env.ALIYUN_OSS_CNAME || '',

  SMS_ACCESS_KEY: process.env.SMS_ACCESS_KEY || '',
  SMS_ACCESS_SECRET: process.env.SMS_ACCESS_SECRET || '',
  SMS_SIGN_NAME: process.env.SMS_SIGN_NAME || '',
  SMS_TEMPLATE_CODE: process.env.SMS_TEMPLATE_CODE || '',
  SMS_VERIFY_TEMPLATE_CODE: process.env.SMS_VERIFY_TEMPLATE_CODE || '',
  SMS_ADMIN_PHONE: process.env.SMS_ADMIN_PHONE || '',

  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: Number(process.env.SMTP_PORT || 465),
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || '',
  SMTP_ADMIN_EMAIL: process.env.SMTP_ADMIN_EMAIL || '',

  NOTIFY_ON_LOGIN: process.env.NOTIFY_ON_LOGIN === 'true',
  NOTIFY_ON_BRUTE_FORCE: process.env.NOTIFY_ON_BRUTE_FORCE === 'true',

  QQ_MAP_API_KEY: process.env.QQ_MAP_API_KEY || '',

  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || '', // 跨子域共享 cookie，如 .example.com
} as const;
