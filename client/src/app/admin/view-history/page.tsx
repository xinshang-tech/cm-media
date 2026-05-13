'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, getSignedUrls } from '@/lib/api';
import { PageLoader, ConfirmModal } from '@/components/ui';
import ViewSegmentsModal, { formatRelativeTime, type ViewTarget } from '@/components/ViewSegmentsModal';
import { Trash2 } from 'lucide-react';

interface ViewRecord {
  id: number;
  user: { id: number; username: string; nickname: string; avatarUrl: string | null };
  videoId: number | null;
  videoUuid: string;
  videoTitle: string;
  video: { id: number; uuid: string; title: string; posterUrl: string | null } | null;
  lastPosition: number;
  totalDuration: number;
  actualDuration: number | null;
  viewCount: number;
  lastViewedAt: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function Pager({ pagination, onPage }: { pagination: Pagination; onPage: (p: number) => void }) {
  const { page, totalPages, total, pageSize } = pagination;
  if (totalPages <= 1) return null;
  const pages: number[] = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) pages.push(i);
  return (
    <div className="flex items-center justify-between text-sm text-gray-400 mt-4">
      <span>共 {total} 条</span>
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

export default function ViewHistoryPage() {
  const [records, setRecords] = useState<ViewRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selected, setSelected] = useState<ViewTarget | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmIds, setConfirmIds] = useState<number[] | null>(null);

  const fetchRecords = useCallback(async (page: number, q: string) => {
    setLoading(true);
    setCheckedIds(new Set());
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (q) params.set('search', q);
      const res = await api.get<{ data: ViewRecord[]; pagination: Pagination }>(`/admin/view-records?${params}`);

      const uniqueUrls = [...new Set(res.data.map(r => r.user.avatarUrl).filter(Boolean))] as string[];
      if (uniqueUrls.length > 0) {
        const signedUrls = await getSignedUrls(uniqueUrls);
        const urlMap = new Map(uniqueUrls.map((url, i) => [url, signedUrls[i]]));
        res.data.forEach(r => {
          if (r.user.avatarUrl) {
            r.user.avatarUrl = urlMap.get(r.user.avatarUrl) || r.user.avatarUrl;
          }
        });
      }

      setRecords(res.data);
      setPagination(res.pagination);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords(1, search);
    setCurrentPage(1);
  }, [fetchRecords, search]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const handlePage = (p: number) => {
    setCurrentPage(p);
    fetchRecords(p, search);
  };

  const toggleAll = () => {
    if (checkedIds.size === records.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(records.map(r => r.id)));
    }
  };

  const toggleOne = (id: number) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDelete = async (ids: number[]) => {
    if (ids.length === 0) return;
    setConfirmIds(ids);
  };

  const doDelete = async () => {
    if (!confirmIds) return;
    setDeleting(true);
    setDeletingIds(new Set(confirmIds));
    setConfirmIds(null);
    try {
      await api.delete('/admin/view-records', { method: 'DELETE', body: JSON.stringify({ ids: confirmIds }) });
      // 短暂延迟让淡出动画播完
      await new Promise(r => setTimeout(r, 350));
      fetchRecords(currentPage, search);
    } catch {
      setDeletingIds(new Set());
    } finally {
      setDeleting(false);
      setDeletingIds(new Set());
    }
  };

  const allChecked = records.length > 0 && checkedIds.size === records.length;
  const someChecked = checkedIds.size > 0 && checkedIds.size < records.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-white">观看记录</h1>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="搜索用户/视频..."
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

      {checkedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-white/5 border border-border">
          {deleting ? (
            <span className="text-xs text-gray-400 flex items-center gap-2">
              <span className="inline-block w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin" />
              删除中…
            </span>
          ) : (
            <>
              <span className="text-xs text-gray-400">已选 <span className="text-white font-medium">{checkedIds.size}</span> 条</span>
              <button
                onClick={() => handleDelete([...checkedIds])}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-red-900/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 border border-red-900/50 transition-colors"
              >
                <Trash2 size={12} />
                删除所选
              </button>
              <button onClick={() => setCheckedIds(new Set())} className="text-xs text-gray-500 hover:text-white ml-auto">取消</button>
            </>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden" style={{ background: 'var(--color-surface)' }}>
        {loading ? (
          <PageLoader />
        ) : records.length === 0 ? (
          <div className="text-center py-16 text-gray-500">暂无观看记录</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-gray-500">
                <th className="px-4 py-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked; }}
                    onChange={toggleAll}
                    className="accent-[#ae1a20] cursor-pointer"
                  />
                </th>
                <th className="text-left px-4 py-2.5 font-normal">用户</th>
                <th className="text-left px-4 py-2.5 font-normal">视频</th>
                <th className="text-left px-4 py-2.5 font-normal hidden md:table-cell">进度</th>
                <th className="text-left px-4 py-2.5 font-normal hidden sm:table-cell">次数</th>
                <th className="text-left px-4 py-2.5 font-normal hidden lg:table-cell">最后观看</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {records.map(record => {
                const effDuration = record.actualDuration || record.totalDuration;
                const progress = effDuration > 0
                  ? Math.min(100, Math.round((record.lastPosition / effDuration) * 100))
                  : 0;
                const isChecked = checkedIds.has(record.id);
                const isDeleting = deletingIds.has(record.id);
                return (
                  <tr key={record.id} className={`transition-all duration-300 ${isDeleting ? 'opacity-30 scale-[0.99] pointer-events-none' : 'hover:bg-white/3'} ${isChecked && !isDeleting ? 'bg-white/5' : ''}`}>
                    <td className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOne(record.id)}
                        className="accent-[#ae1a20] cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-800 flex-shrink-0">
                          {record.user.avatarUrl ? (
                            <img src={record.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-xs text-gray-500">
                                {(record.user.nickname || record.user.username)[0]}
                              </span>
                            </div>
                          )}
                        </div>
                        <span className="text-gray-300 truncate max-w-[100px]">
                          {record.user.nickname || record.user.username}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-foreground truncate max-w-[200px] block">
                        {!record.video && <span className="mr-1.5 text-xs text-gray-500 font-normal">已删除</span>}
                        {record.videoTitle}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${progress}%`, backgroundColor: 'var(--color-danger)' }}
                          />
                        </div>
                        <span className="text-gray-500 text-xs w-8 text-right">{progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-gray-400">{record.viewCount}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-gray-500 text-xs">
                      {formatRelativeTime(record.lastViewedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelected({
                            user: record.user,
                            videoId: record.videoId,
                            videoUuid: record.videoUuid,
                            videoTitle: record.videoTitle,
                            lastPosition: record.lastPosition,
                            totalDuration: record.totalDuration,
                            actualDuration: record.actualDuration,
                            viewCount: record.viewCount,
                            lastViewedAt: record.lastViewedAt,
                          })}
                          className="text-xs px-2.5 py-1 rounded border border-border text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                        >
                          查看区段
                        </button>
                        <button
                          onClick={() => handleDelete([record.id])}
                          disabled={deleting}
                          className="p-1 rounded text-gray-600 hover:text-red-400 transition-colors disabled:opacity-50"
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && <Pager pagination={pagination} onPage={handlePage} />}

      {selected && <ViewSegmentsModal target={selected} onClose={() => setSelected(null)} />}

      <ConfirmModal
        isOpen={confirmIds !== null}
        onClose={() => setConfirmIds(null)}
        onConfirm={doDelete}
        title="删除观看记录"
        message={`确认删除 ${confirmIds?.length ?? 0} 条观看记录？此操作不可恢复。`}
        confirmText="删除"
        variant="danger"
        isLoading={deleting}
      />
    </div>
  );
}
