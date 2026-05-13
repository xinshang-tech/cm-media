import { env } from '../config/env.js';

const cache = new Map<string, { address: string; expireAt: number }>();
const CACHE_TTL = 3600 * 1000; // 1小时缓存

export async function getLocationByIP(ip: string): Promise<string> {
  if (!ip || ip === '0.0.0.0' || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
    return '内网地址';
  }

  // 去除 IPv4-mapped IPv6 前缀
  const cleanIp = ip.replace(/^::ffff:/, '');

  // 检查缓存
  const cached = cache.get(cleanIp);
  if (cached && cached.expireAt > Date.now()) {
    return cached.address;
  }

  if (!env.QQ_MAP_API_KEY) {
    return '';
  }

  try {
    const url = `https://apis.map.qq.com/ws/location/v1/ip?ip=${cleanIp}&key=${env.QQ_MAP_API_KEY}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data: any = await response.json();

    if (data?.status === 0 && data?.result?.ad_info) {
      const info = data.result.ad_info;
      const address = [
        info.nation || '',
        info.province || '',
        info.city || '',
        info.district || '',
      ].join('');

      if (address) {
        cache.set(cleanIp, { address, expireAt: Date.now() + CACHE_TTL });
        return address;
      }
    }
  } catch {
    // 静默失败，返回空字符串
  }

  return '';
}
