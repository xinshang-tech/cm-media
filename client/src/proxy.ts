import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 跳过静态资源和内部路由
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 微信浏览器检测
  const userAgent = request.headers.get('user-agent') || '';
  const isWeChat = /MicroMessenger/i.test(userAgent);

  if (isWeChat && pathname !== '/wechat-blocked') {
    return NextResponse.redirect(new URL('/wechat-blocked', request.url));
  }

  // 未登录访问非登录页 → 跳转登录
  const token = request.cookies.get('token')?.value;
  const isLoginPage = pathname === '/login';
  const isBlockedPage = pathname === '/blocked' || pathname === '/wechat-blocked';

  if (!token && !isLoginPage && !isBlockedPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 已登录访问登录页 → 跳转首页
  if (token && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|favicon|.*\\..*).*)'],
};
