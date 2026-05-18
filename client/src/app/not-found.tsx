'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Home } from 'lucide-react';

export default function NotFound() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.replace('/');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white text-black dark:bg-black dark:text-white">
      <div className="text-center">
        <h1 className="text-6xl font-bold mb-4">404</h1>
        <p className="text-xl text-gray-500 dark:text-gray-400 mb-8">页面不存在</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
          {countdown} 秒后自动跳转到首页
        </p>
        <a
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg transition hover:opacity-90"
          style={{
            backgroundColor: 'var(--color-foreground)',
            color: 'var(--color-background)',
          }}
        >
          <Home className="w-4 h-4" />
          返回首页
        </a>
      </div>
    </div>
  );
}
