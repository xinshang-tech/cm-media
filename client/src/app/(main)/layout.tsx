'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { api, getSignedUrl } from '@/lib/api';
import Protection from '@/components/Protection';

interface User {
  id: number;
  username: string;
  nickname: string;
  avatarUrl: string | null;
  role: string;
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBackTop, setShowBackTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowBackTop(window.scrollY > 200);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await api.get<{ user: User }>('/auth/me');
        const userData = res.user;
        
        if (userData.avatarUrl) {
          userData.avatarUrl = await getSignedUrl(userData.avatarUrl);
        }
        
        setUser(userData);
      } catch {
        router.push('/login');
        return;
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full spinner" />
          <p className="text-sm text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const isAdmin = user.role === 'ADMIN';

  const navItems = [
    { href: '/', label: '首页', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    )},
    { href: '/search', label: '搜索', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    )},
    { href: '/categories', label: '分类', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    )},
    { href: '/history', label: '历史', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )},
    ...(isAdmin ? [{ href: '/admin', label: '管理', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )}] : []),
  ];

  return (
    <div className="min-h-screen bg-background">
      <Protection isAdmin={isAdmin} />

      <header className="sticky top-0 z-50 glass border-b border-border">
        <div className="flex items-center justify-between h-12 container-responsive">
          <Link href="/" className="flex items-center justify-left w-12 h-12 md:w-auto md:h-auto">
            <img src="/images/logo-icon.svg" alt="CM Media" className="w-6 h-6" />
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-normal transition-all ${
                  (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href))
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center md:gap-3">
            <button
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="w-8 h-8 flex items-center justify-center rounded-md hover:text-foreground hover:bg-white/9 transition-all"
              aria-label="切换主题"
            >
              {resolvedTheme === 'dark' ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            <Link
              href="/profile"
              className="flex items-center gap-2 h-12 w-12 md:w-auto md:h-auto justify-end md:justify-center"
            >
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 bg-gray-700 rounded-full flex items-center justify-center">
                  <span className="text-xs text-white">{user.nickname?.[0] || user.username[0]}</span>
                </div>
              )}
              <span className="text-sm text-foreground hidden md:block">{user.nickname || user.username}</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="min-h-[calc(100vh-3rem)] pb-20 md:pb-4">{children}</main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-border">
        <div className="flex h-12">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 items-center justify-center transition-colors ${
                (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)) ? 'text-white' : 'text-gray-500'
              }`}
            >
              {item.icon}
            </Link>
          ))}
          <Link
            href="/profile"
            className={`flex flex-1 items-center justify-center transition-colors ${
              pathname === '/profile' ? 'text-white' : 'text-gray-500'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </Link>
        </div>
      </nav>

      {showBackTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-20 right-4 md:bottom-8 z-[60] w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 backdrop-blur text-gray-300 hover:text-white transition-all"
          aria-label="回到顶部"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}

      <div className="md:hidden h-16" />
    </div>
  );
}
