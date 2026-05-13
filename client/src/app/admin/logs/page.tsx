'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageLoader } from '@/components/ui';

interface LoginLog {
  id: number;
  username: string;
  ipAddress: string;
  address: string;
  success: boolean;
  failureReason: string | null;
  createdAt: string;
  user: { nickname: string } | null;
}

interface OperationLog {
  id: number;
  action: string;
  targetType: string | null;
  details: unknown;
  ipAddress: string;
  createdAt: string;
  user: { username: string; nickname: string };
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const PAGE_SIZES = [1, 10, 30, 50, 100, 200, 500];
const LS_KEY = 'admin_logs_page_size';

function getStoredPageSize(): number {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v) {
      const n = parseInt(v);
      if (PAGE_SIZES.includes(n)) return n;
    }
  } catch {}
  return 50;
}

function Pager({ pagination, onPage }: { pagination: Pagination; onPage: (p: number) => void }) {
  const { page, totalPages, total } = pagination;
  if (totalPages <= 1) return null;

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="text-gray-500 mr-2">共 {total} 条</span>
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 1}
        className="px-2 py-1 rounded text-muted disabled:opacity-30 hover:bg-surface-hover transition-colors"
      >
        ‹
      </button>
      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="px-2 text-gray-600">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onPage(p as number)}
            className={`px-2.5 py-1 rounded transition-colors ${p === page ? 'bg-primary text-white' : 'text-muted hover:bg-surface-hover hover:text-foreground'}`}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onPage(page + 1)}
        disabled={page === totalPages}
        className="px-2 py-1 rounded text-muted disabled:opacity-30 hover:bg-surface-hover transition-colors"
      >
        ›
      </button>
    </div>
  );
}

export default function AdminLogsPage() {
  const [tab, setTab] = useState<'login' | 'operation'>('login');
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [pageSize, setPageSize] = useState<number>(50);
  const [loginPage, setLoginPage] = useState(1);
  const [operationPage, setOperationPage] = useState(1);
  const [loginPagination, setLoginPagination] = useState<Pagination | null>(null);
  const [operationPagination, setOperationPagination] = useState<Pagination | null>(null);

  useEffect(() => {
    setPageSize(getStoredPageSize());
  }, []);

  const page = tab === 'login' ? loginPage : operationPage;

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        if (tab === 'login') {
          const res = await api.get<{ logs: LoginLog[]; pagination: Pagination }>(
            `/admin/login-logs?page=${loginPage}&pageSize=${pageSize}`
          );
          setLoginLogs(res.logs);
          setLoginPagination(res.pagination);
        } else {
          const res = await api.get<{ logs: OperationLog[]; pagination: Pagination }>(
            `/admin/operation-logs?page=${operationPage}&pageSize=${pageSize}`
          );
          setOperationLogs(res.logs);
          setOperationPagination(res.pagination);
        }
      } catch (err) {
        console.error('加载日志失败:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [tab, loginPage, operationPage, pageSize]);

  async function handleClearLogs() {
    const label = tab === 'login' ? '登录日志' : '操作日志';
    if (!confirm(`确定要清空所有${label}吗？`)) return;
    setClearing(true);
    try {
      const endpoint = tab === 'login' ? '/admin/login-logs' : '/admin/operation-logs';
      await api.delete(endpoint);
      if (tab === 'login') {
        setLoginLogs([]);
        setLoginPagination(null);
        setLoginPage(1);
      } else {
        setOperationLogs([]);
        setOperationPagination(null);
        setOperationPage(1);
      }
    } catch (err) {
      console.error('清空日志失败:', err);
    } finally {
      setClearing(false);
    }
  }

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    setLoginPage(1);
    setOperationPage(1);
    try { localStorage.setItem(LS_KEY, String(size)); } catch {}
  }

  function handlePage(p: number) {
    if (tab === 'login') setLoginPage(p);
    else setOperationPage(p);
  }

  const pagination = tab === 'login' ? loginPagination : operationPagination;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-white">日志</h1>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-1 bg-gray-900 rounded-md p-1">
          <button
            onClick={() => setTab('login')}
            className={`px-4 py-1.5 rounded text-sm transition-colors ${tab === 'login' ? 'bg-primary text-white' : 'text-muted hover:text-foreground'}`}
          >
            登录日志
          </button>
          <button
            onClick={() => setTab('operation')}
            className={`px-4 py-1.5 rounded text-sm transition-colors ${tab === 'operation' ? 'bg-primary text-white' : 'text-muted hover:text-foreground'}`}
          >
            操作日志
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          每页
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(parseInt(e.target.value))}
            className="bg-gray-900 border border-gray-700 text-white rounded px-2 py-1.5 text-sm"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          条
        </div>

        <button
          onClick={handleClearLogs}
          disabled={clearing}
          className="ml-auto px-4 py-1.5 text-sm rounded bg-red-500/15 text-red-500 hover:bg-red-500/25 disabled:opacity-50 transition-colors"
        >
          {clearing ? '清空中...' : '清空日志'}
        </button>
      </div>

      {loading ? (
        <PageLoader />
      ) : tab === 'login' ? (
        <div className="space-y-3">
          <div className="bg-gray-900 rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="px-4 py-2 text-left text-gray-500 font-normal">用户</th>
                  <th className="px-4 py-2 text-left text-gray-500 font-normal hidden sm:table-cell">IP</th>
                  <th className="px-4 py-2 text-left text-gray-500 font-normal hidden md:table-cell">位置</th>
                  <th className="px-4 py-2 text-left text-gray-500 font-normal">状态</th>
                  <th className="px-4 py-2 text-left text-gray-500 font-normal hidden sm:table-cell">原因</th>
                  <th className="px-4 py-2 text-left text-gray-500 font-normal">时间</th>
                </tr>
              </thead>
              <tbody>
                {loginLogs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-800/50">
                    <td className="px-4 py-2 text-white whitespace-nowrap">{log.user?.nickname || log.username}</td>
                    <td className="px-4 py-2 text-gray-400 font-mono hidden sm:table-cell">{log.ipAddress}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs hidden md:table-cell">{log.address || '-'}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${log.success ? 'bg-green-500/20 text-green-600' : 'bg-red-500/20 text-red-500'}`}>
                        {log.success ? '成功' : '失败'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs hidden sm:table-cell">{log.failureReason || '-'}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs font-mono whitespace-nowrap">{new Date(log.createdAt).toLocaleString('zh-CN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {loginPagination && <Pager pagination={loginPagination} onPage={handlePage} />}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-gray-900 rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="px-4 py-2 text-left text-gray-500 font-normal">用户</th>
                  <th className="px-4 py-2 text-left text-gray-500 font-normal">操作</th>
                  <th className="px-4 py-2 text-left text-gray-500 font-normal hidden md:table-cell">目标</th>
                  <th className="px-4 py-2 text-left text-gray-500 font-normal hidden lg:table-cell">详细</th>
                  <th className="px-4 py-2 text-left text-gray-500 font-normal hidden sm:table-cell">IP</th>
                  <th className="px-4 py-2 text-left text-gray-500 font-normal">时间</th>
                </tr>
              </thead>
              <tbody>
                {operationLogs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-800/50">
                    <td className="px-4 py-2 text-white whitespace-nowrap">{log.user?.nickname || '-'}</td>
                    <td className="px-4 py-2 text-gray-400">{log.action}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs hidden md:table-cell">{log.targetType || '-'}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs font-mono hidden lg:table-cell">
                      {(() => {
                        try {
                          const d = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
                          if (!d || typeof d !== 'object') return String(log.details ?? '-');
                          return Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(' | ');
                        } catch {
                          return String(log.details ?? '-');
                        }
                      })()}
                    </td>
                    <td className="px-4 py-2 text-gray-500 font-mono hidden sm:table-cell">{log.ipAddress}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs font-mono whitespace-nowrap">{new Date(log.createdAt).toLocaleString('zh-CN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {operationPagination && <Pager pagination={operationPagination} onPage={handlePage} />}
        </div>
      )}
    </div>
  );
}
