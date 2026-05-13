'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button, Spinner, PageLoader, ToastContainer, useToast, ConfirmModal } from '@/components/ui';

interface Video {
  id: number;
  uuid: string;
  title: string;
  status: string;
  viewCount: number;
  createdAt: string;
  categories: { category: { name: string } }[];
  posterUrl?: string | null;
  vodVideo?: {
    coverUrl?: string | null;
  } | null;
}

export default function AdminVideosPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; id: number | null; title: string }>({
    isOpen: false, id: null, title: '',
  });
  const { toasts, addToast, removeToast } = useToast();

  const fetchVideos = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      params.set('pageSize', '100');

      const res = await api.get<{ videos: Video[] }>(`/admin/videos?${params}`);
      setVideos(res.videos);
    } catch (err) {
      console.error('加载视频失败:', err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const handleBatch = async (action: string) => {
    if (selected.length === 0) return;
    if (!confirm(`确定对 ${selected.length} 个视频执行此操作？`)) return;

    try {
      await api.post('/admin/videos/batch', { ids: selected, action });
      setSelected([]);
      fetchVideos();
    } catch (err: any) {
      addToast(err.message || '批量操作失败', 'error');
    }
  };

  const confirmDelete = (video: Video) => {
    setConfirmModal({ isOpen: true, id: video.id, title: video.title });
  };

  const handleDelete = async () => {
    const id = confirmModal.id;
    if (!id) return;
    setConfirmModal({ isOpen: false, id: null, title: '' });
    setDeletingId(id);
    try {
      await api.delete(`/admin/videos/${id}`);
      setVideos(prev => prev.filter(v => v.id !== id));
      addToast('删除成功', 'success');
    } catch (err: any) {
      addToast(err.message || '删除失败', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (selected.length === videos.length) {
      setSelected([]);
    } else {
      setSelected(videos.map((v) => v.id));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-semibold text-white">视频管理</h1>
        <Link href="/admin/videos/new">
          <Button size="md">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新增视频
          </Button>
        </Link>
      </div>

      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          placeholder="搜索标题..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 px-3 bg-gray-900 border border-gray-700 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 bg-gray-900 border border-gray-700 rounded-md text-sm text-white focus:outline-none"
        >
          <option value="">全部状态</option>
          <option value="DRAFT">草稿</option>
          <option value="PUBLISHED">已发布</option>
          <option value="ARCHIVED">已归档</option>
        </select>
      </div>

      {selected.length > 0 && (
        <div className="flex gap-2 items-center p-2 bg-gray-900 rounded">
          <span className="text-sm text-gray-400">已选 {selected.length} 项</span>
          <Button size="sm" variant="secondary" onClick={() => handleBatch('publish')}>发布</Button>
          <Button size="sm" variant="secondary" onClick={() => handleBatch('draft')}>草稿</Button>
          <Button size="sm" variant="secondary" onClick={() => handleBatch('archive')}>归档</Button>
          <Button size="sm" variant="danger" onClick={() => handleBatch('delete')}>删除</Button>
        </div>
      )}

      {loading ? (
        <PageLoader />
      ) : (
        <div className="bg-gray-900 rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="px-3 py-2 text-left">
                  <input type="checkbox" checked={selected.length === videos.length && videos.length > 0} onChange={toggleSelectAll} />
                </th>
                <th className="px-3 py-2 text-left text-gray-500 font-normal">ID</th>
                <th className="px-3 py-2 text-left text-gray-500 font-normal">海报</th>
                <th className="px-3 py-2 text-left text-gray-500 font-normal">标题</th>
                <th className="px-3 py-2 text-left text-gray-500 font-normal">分类</th>
                <th className="px-3 py-2 text-left text-gray-500 font-normal">状态</th>
                <th className="px-3 py-2 text-left text-gray-500 font-normal">播放</th>
                <th className="px-3 py-2 text-left text-gray-500 font-normal">操作</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((video) => {
                const posterSrc = video.posterUrl || video.vodVideo?.coverUrl || null;
                const isDeleting = deletingId === video.id;
                return (
                  <tr
                    key={video.id}
                    className={`border-b border-gray-800/50 transition-opacity ${
                      isDeleting ? 'opacity-40 pointer-events-none' : 'table-row'
                    }`}
                  >
                    <td className="px-3 py-1.5">
                      <input type="checkbox" checked={selected.includes(video.id)} onChange={() => toggleSelect(video.id)} />
                    </td>
                    <td className="px-3 py-1.5 text-gray-500 font-mono">{video.id}</td>
                    <td className="px-3 py-1.5">
                      <Link href={`/watch/${video.uuid}`} className="block w-20 h-12 rounded overflow-hidden flex-shrink-0 hover:opacity-80 transition-opacity">
                        {posterSrc ? (
                          <img src={posterSrc} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <svg viewBox="0 0 160 90" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                            <rect width="160" height="90" fill="#1f2937" />
                            <polygon points="62,30 62,60 92,45" fill="#4b5563" />
                          </svg>
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-white max-w-xs truncate">
                      <Link href={`/watch/${video.uuid}`} className="hover:text-blue-400 transition-colors">{video.title}</Link>
                    </td>
                    <td className="px-3 py-1.5 text-gray-400 text-xs">
                      {video.categories.map((c) => c.category.name).join(', ')}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`status-tag px-2 py-0.5 rounded text-xs ${
                        video.status === 'PUBLISHED' ? 'status-published bg-green-500/15 text-green-400' :
                        video.status === 'DRAFT' ? 'status-draft bg-yellow-500/15 text-yellow-400' :
                        'status-archived bg-gray-500/15 text-gray-400'
                      }`}>
                        {video.status === 'PUBLISHED' ? '已发布' : video.status === 'DRAFT' ? '草稿' : '归档'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-gray-400 font-mono">{video.viewCount}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-2 items-center">
                        <Link href={`/admin/videos/${video.id}`} className="text-blue-400 hover:text-blue-300 text-xs">编辑</Link>
                        {isDeleting ? (
                          <span className="text-gray-500 text-xs flex items-center gap-1">
                            <Spinner size="sm" />删除中
                          </span>
                        ) : (
                          <button onClick={() => confirmDelete(video)} className="text-red-400 hover:text-red-300 text-xs">删除</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, id: null, title: '' })}
        onConfirm={handleDelete}
        title="删除视频"
        message={`确定要删除「${confirmModal.title}」吗？\n关联的 VOD 视频、字幕、雪碧图、海报等文件将从阿里云同步删除，操作不可撤销。`}
        confirmText="确认删除"
        variant="danger"
      />

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
