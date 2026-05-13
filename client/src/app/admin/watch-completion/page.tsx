'use client';

import { Fragment, useEffect, useState, useCallback } from 'react';
import { api, getSignedUrls } from '@/lib/api';
import { Spinner, PageLoader } from '@/components/ui';
import ViewSegmentsModal, { formatTime, formatRelativeTime, type ViewTarget } from '@/components/ViewSegmentsModal';

interface VideoRow {
  videoId: number;
  uuid: string | null;
  title: string;
  posterUrl: string | null;
  duration: number;
  uniqueViewers: number;
  avgCompletion: number;
  maxCompletion: number;
  lastViewedAt: string | null;
}

interface UserRow {
  userId: number;
  user: { id: number; username: string; nickname: string; avatarUrl: string | null };
  completion: number;
  watchedDuration: number;
  lastPosition: number;
  viewCount: number;
  segmentCount: number;
  lastViewedAt: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function CompletionBar({ value, accent = 'red' }: { value: number; accent?: 'red' | 'gray' }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: accent === 'red' ? 'var(--color-danger)' : 'var(--color-muted)' }}
        />
      </div>
      <span className="text-gray-400 text-xs w-9 text-right font-mono">{pct}%</span>
    </div>
  );
}

function Pager({ pagination, onPage }: { pagination: Pagination; onPage: (p: number) => void }) {
  const { page, totalPages, total, pageSize } = pagination;
  if (totalPages <= 1) return null;
  const pages: number[] = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) pages.push(i);
  return (
    <div className="flex items-center justify-between text-sm text-gray-400 mt-4">
      <span>共 {total} 个视频</span>
      <div className="flex gap-1">
        {page > 1 && (
          <button onClick={() => onPage(page - 1)} className="px-2.5 py-1 rounded hover:bg-white/5">上一页</button>
        )}
        {pages.map(p => (
          <button
            key={p}
            onClick={() => onPage(p)}
            className={`px-2.5 py-1 rounded ${p === page ? 'bg-[#ae1a20] text-white' : 'hover:bg-white/5'}`}
          >{p}</button>
        ))}
        {page < totalPages && (
          <button onClick={() => onPage(page + 1)} className="px-2.5 py-1 rounded hover:bg-white/5">下一页</button>
        )}
      </div>
      <span>第 {page}/{totalPages} 页，{pageSize} 条/页</span>
    </div>
  );
}

function UserList({ video }: { video: VideoRow }) {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ViewTarget | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get<{ data: UserRow[] }>(`/admin/watch-completion/videos/${video.videoId}/users`)
      .then(async res => {
        const uniqueUrls = [...new Set(res.data.map(r => r.user.avatarUrl).filter(Boolean))] as string[];
        if (uniqueUrls.length > 0) {
          const signed = await getSignedUrls(uniqueUrls);
          const urlMap = new Map(uniqueUrls.map((u, i) => [u, signed[i]]));
          res.data.forEach(r => {
            if (r.user.avatarUrl) r.user.avatarUrl = urlMap.get(r.user.avatarUrl) || r.user.avatarUrl;
          });
        }
        if (!cancelled) setUsers(res.data);
      })
      .catch(() => { if (!cancelled) setUsers([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [video.videoId]);

  if (loading) return <div className="flex justify-center py-6"><Spinner size="sm" /></div>;
  if (!users || users.length === 0) return <div className="py-4 text-sm text-gray-500 text-center">暂无观看用户</div>;

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500">
            <th className="text-left px-4 py-2 font-normal">用户</th>
            <th className="text-left px-4 py-2 font-normal">观看完整度</th>
            <th className="text-left px-4 py-2 font-normal hidden md:table-cell">已看时长</th>
            <th className="text-left px-4 py-2 font-normal hidden sm:table-cell">片段</th>
            <th className="text-left px-4 py-2 font-normal hidden sm:table-cell">次数</th>
            <th className="text-left px-4 py-2 font-normal hidden lg:table-cell">最后观看</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {users.map(u => (
            <tr key={u.userId} className="hover:bg-white/3 transition-colors">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-800 flex-shrink-0">
                    {u.user.avatarUrl ? (
                      <img src={u.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-xs text-gray-500">{(u.user.nickname || u.user.username)[0]}</span>
                      </div>
                    )}
                  </div>
                  <span className="text-gray-300 truncate max-w-[140px]">{u.user.nickname || u.user.username}</span>
                </div>
              </td>
              <td className="px-4 py-2.5">
                <CompletionBar value={u.completion} />
              </td>
              <td className="px-4 py-2.5 hidden md:table-cell text-gray-400 font-mono text-xs">
                {formatTime(u.watchedDuration)}
              </td>
              <td className="px-4 py-2.5 hidden sm:table-cell text-gray-500 text-xs">{u.segmentCount}</td>
              <td className="px-4 py-2.5 hidden sm:table-cell text-gray-400">{u.viewCount}</td>
              <td className="px-4 py-2.5 hidden lg:table-cell text-gray-500 text-xs">
                {formatRelativeTime(u.lastViewedAt)}
              </td>
              <td className="px-4 py-2.5">
                <button
                  onClick={() => setSelected({
                    user: u.user,
                    videoId: video.videoId,
                    videoUuid: video.uuid || '',
                    videoTitle: video.title,
                    lastPosition: u.lastPosition,
                    totalDuration: video.duration,
                    actualDuration: video.duration || null,
                    viewCount: u.viewCount,
                    lastViewedAt: u.lastViewedAt,
                  })}
                  className="text-xs px-2.5 py-1 rounded border border-border text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                >
                  查看区段
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected && <ViewSegmentsModal target={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

export default function WatchCompletionPage() {
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchVideos = useCallback(async (page: number, q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (q) params.set('search', q);
      const res = await api.get<{ data: VideoRow[]; pagination: Pagination }>(`/admin/watch-completion/videos?${params}`);

      const uniqueUrls = [...new Set(res.data.map(v => v.posterUrl).filter(Boolean))] as string[];
      if (uniqueUrls.length > 0) {
        const signed = await getSignedUrls(uniqueUrls);
        const urlMap = new Map(uniqueUrls.map((u, i) => [u, signed[i]]));
        res.data.forEach(v => {
          if (v.posterUrl) v.posterUrl = urlMap.get(v.posterUrl) || v.posterUrl;
        });
      }

      setVideos(res.data);
      setPagination(res.pagination);
    } catch {
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos(1, search);
    setExpandedId(null);
  }, [fetchVideos, search]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white">观看完整度</h1>
          <p className="text-xs text-gray-500 mt-0.5">基于观看片段去重合并计算，反映每位用户实际看过的独特内容比例</p>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="搜索视频标题..."
            className="px-3 py-1.5 text-sm bg-surface border border-border rounded-md text-foreground placeholder-muted focus:outline-none focus:border-primary w-52"
          />
          <button type="submit" className="px-3 py-1.5 text-sm bg-white/5 hover:bg-white/10 text-gray-300 rounded-md border border-border">
            搜索
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setSearchInput(''); }}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-white rounded-md"
            >
              清除
            </button>
          )}
        </form>
      </div>

      <div className="rounded-xl border border-border overflow-hidden" style={{ background: 'var(--color-surface)' }}>
        {loading ? (
          <PageLoader />
        ) : videos.length === 0 ? (
          <div className="text-center py-16 text-gray-500">暂无观看记录</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-gray-500">
                <th className="text-left px-4 py-2.5 font-normal" colSpan={2}>视频</th>
                <th className="text-left px-4 py-2.5 font-normal hidden sm:table-cell">观看人数</th>
                <th className="text-left px-4 py-2.5 font-normal">平均完整度</th>
                <th className="text-left px-4 py-2.5 font-normal hidden md:table-cell">最高</th>
                <th className="text-left px-4 py-2.5 font-normal hidden lg:table-cell">时长</th>
                <th className="text-left px-4 py-2.5 font-normal hidden lg:table-cell">最后观看</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {videos.map(v => {
                const expanded = expandedId === v.videoId;
                return (
                  <Fragment key={v.videoId}>
                    <tr
                      className="hover:bg-white/3 transition-colors cursor-pointer"
                      onClick={() => setExpandedId(expanded ? null : v.videoId)}
                    >
                      <td className="pl-4 py-3 w-[80px]">
                        <div className="w-16 aspect-video rounded bg-gray-800 overflow-hidden flex-shrink-0">
                          {v.posterUrl ? (
                            <img src={v.posterUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-700">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-foreground truncate max-w-[280px] block">{v.title}</span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-gray-300">{v.uniqueViewers}</td>
                      <td className="px-4 py-3"><CompletionBar value={v.avgCompletion} /></td>
                      <td className="px-4 py-3 hidden md:table-cell text-gray-400 text-xs font-mono">
                        {Math.round(v.maxCompletion * 100)}%
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-gray-500 text-xs font-mono">
                        {v.duration > 0 ? formatTime(v.duration) : '—'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-gray-500 text-xs">
                        {v.lastViewedAt ? formatRelativeTime(v.lastViewedAt) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={e => { e.stopPropagation(); setExpandedId(expanded ? null : v.videoId); }}
                          className="text-xs px-2.5 py-1 rounded border border-border text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                        >
                          {expanded ? '收起' : '展开'}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={8} className="bg-black/20 p-0">
                          <div className="border-t border-border">
                            <UserList video={v} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && <Pager pagination={pagination} onPage={p => fetchVideos(p, search)} />}
    </div>
  );
}
