import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cm-media.oss-cn-beijing.aliyuncs.com',
      },
    ],
  },
  async headers() {
    const securityHeaders = [
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'Referrer-Policy',
        value: 'no-referrer',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
      },
      {
        key: 'X-Robots-Tag',
        value: 'noindex, nofollow, noarchive, nosnippet',
      },
    ];

    return [
      // 安全响应头（所有路由）
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      // 禁止浏览器缓存 HTML 页面（仅匹配浏览器导航请求）
      // 防止 Deployment 后浏览器缓存的旧 HTML 引用已删除的 chunk
      {
        source: '/:path*',
        has: [
          {
            type: 'header',
            key: 'accept',
            value: 'text/html',
          },
        ],
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, max-age=0, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
