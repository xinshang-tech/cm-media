'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageLoader } from '@/components/ui';

interface DashboardData {
  stats: {
    totalVideos: number;
    totalUsers: number;
    totalViews: number;
    todayViews: number;
  };
  recentVideos: { id: number; uuid: string; title: string; viewCount: number; createdAt: string }[];
  recentLogins: { username: string; ipAddress: string; success: boolean; createdAt: string; user?: { nickname: string } | null }[];
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const fetchDashboard = async () => {
    try {
      const res = await api.get<DashboardData>('/admin/dashboard');
      setData(res);
    } catch (err) {
      console.error('加载仪表盘失败:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  async function handleClearLoginLogs() {
    if (!confirm('确定要清空所有登录日志吗？')) return;
    setClearing(true);
    try {
      await api.delete('/admin/login-logs');
      await fetchDashboard();
    } catch (err) {
      console.error('清空登录日志失败:', err);
    } finally {
      setClearing(false);
    }
  }

  if (loading) return <PageLoader />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-white">数据概览</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: '视频总数', value: data.stats.totalVideos },
          { label: '用户总数', value: data.stats.totalUsers },
          { label: '总播放量', value: data.stats.totalViews },
          { label: '今日播放', value: data.stats.todayViews },
        ].map((item) => (
          <div key={item.label} className="p-4 rounded-md border border-border" style={{ background: 'var(--color-surface)' }}>
            <p className="text-sm text-muted">{item.label}</p>
            <p className="font-bold text-foreground mt-1 font-mono !text-xl ">{item.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-white">最近登录</h2>
          <button
            onClick={handleClearLoginLogs}
            disabled={clearing}
            className="px-4 py-1.5 text-sm rounded bg-red-500/15 text-red-500 hover:bg-red-500/25 disabled:opacity-50 transition-colors"
          >
            {clearing ? '清空中...' : '清空日志'}
          </button>
        </div>
        <div className="rounded-md overflow-hidden border border-border" style={{ background: 'var(--color-surface)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left text-muted font-normal">用户</th>
                <th className="px-4 py-2 text-left text-muted font-normal hidden sm:table-cell">IP</th>
                <th className="px-4 py-2 text-left text-muted font-normal">状态</th>
                <th className="px-4 py-2 text-left text-muted font-normal">时间</th>
              </tr>
            </thead>
            <tbody>
              {data.recentLogins.map((log, i) => (
                <tr key={i} className="border-b border-border table-row">
                  <td className="px-4 py-2 text-foreground whitespace-nowrap">{log.user?.nickname || log.username}</td>
                  <td className="px-4 py-2 text-muted font-mono hidden sm:table-cell">{log.ipAddress}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${log.success ? 'bg-green-500/20 text-green-600' : 'bg-red-500/20 text-red-500'}`}>
                      {log.success ? '成功' : '失败'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted font-mono whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('zh-CN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
