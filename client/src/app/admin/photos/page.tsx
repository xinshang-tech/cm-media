'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button, Spinner, PageLoader, ToastContainer, useToast, ConfirmModal } from '@/components/ui';

interface PhotoAlbum {
  id: number;
  uuid: string;
  title: string;
  status: string;
  viewCount: number;
  createdAt: string;
  categories: { category: { name: string } }[];
  coverUrl?: string | null;
  _count: { photos: number };
}

export default function AdminPhotoAlbumsPage() {
  const [albums, setAlbums] = useState<PhotoAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; id: number | null; title: string }>({
    isOpen: false, id: null, title: '',
  });
  const { toasts, addToast, removeToast } = useToast();

  const fetchAlbums = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      params.set('pageSize', '100');

      const res = await api.get<{ albums: PhotoAlbum[] }>(`/admin/photo-albums?${params}`);
      setAlbums(res.albums);
    } catch (err) {
      console.error('加载相册失败:', err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchAlbums();
  }, [fetchAlbums]);

  const handleBatch = async (action: string) => {
    if (selected.length === 0) return;
    if (!confirm(`确定对 ${selected.length} 个相册执行此操作？`)) return;

    try {
      await api.post('/admin/photo-albums/batch', { ids: selected, action });
      setSelected([]);
      fetchAlbums();
    } catch (err: any) {
      addToast(err.message || '批量操作失败', 'error');
    }
  };

  const confirmDelete = (album: PhotoAlbum) => {
    setConfirmModal({ isOpen: true, id: album.id, title: album.title });
  };

  const handleDelete = async () => {
    const id = confirmModal.id;
    if (!id) return;
    setConfirmModal({ isOpen: false, id: null, title: '' });
    setDeletingId(id);
    try {
      await api.delete(`/admin/photo-albums/${id}`);
      setAlbums(prev => prev.filter(a => a.id !== id));
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
    if (selected.length === albums.length) {
      setSelected([]);
    } else {
      setSelected(albums.map((a) => a.id));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-semibold text-white">相册管理</h1>
        <Link href="/admin/photos/new">
          <Button size="md">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新增相册
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
                  <input type="checkbox" checked={selected.length === albums.length && albums.length > 0} onChange={toggleSelectAll} />
                </th>
                <th className="px-3 py-2 text-left text-gray-500 font-normal">ID</th>
                <th className="px-3 py-2 text-left text-gray-500 font-normal">封面</th>
                <th className="px-3 py-2 text-left text-gray-500 font-normal">标题</th>
                <th className="px-3 py-2 text-left text-gray-500 font-normal">分类</th>
                <th className="px-3 py-2 text-left text-gray-500 font-normal">图片数</th>
                <th className="px-3 py-2 text-left text-gray-500 font-normal">状态</th>
                <th className="px-3 py-2 text-left text-gray-500 font-normal">浏览</th>
                <th className="px-3 py-2 text-left text-gray-500 font-normal">操作</th>
              </tr>
            </thead>
            <tbody>
              {albums.map((album) => {
                const isDeleting = deletingId === album.id;
                return (
                  <tr
                    key={album.id}
                    className={`border-b border-gray-800/50 transition-opacity ${
                      isDeleting ? 'opacity-40 pointer-events-none' : 'table-row'
                    }`}
                  >
                    <td className="px-3 py-1.5">
                      <input type="checkbox" checked={selected.includes(album.id)} onChange={() => toggleSelect(album.id)} />
                    </td>
                    <td className="px-3 py-1.5 text-gray-500 font-mono">{album.id}</td>
                    <td className="px-3 py-1.5">
                      <Link href={`/admin/photos/${album.id}`} className="block w-20 h-12 rounded overflow-hidden flex-shrink-0 hover:opacity-80 transition-opacity">
                        {album.coverUrl ? (
                          <img src={album.coverUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                            <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-white max-w-xs truncate">
                      <Link href={`/admin/photos/${album.id}`} className="hover:text-blue-400 transition-colors">{album.title}</Link>
                    </td>
                    <td className="px-3 py-1.5 text-gray-400 text-xs">
                      {album.categories.map((c) => c.category.name).join(', ')}
                    </td>
                    <td className="px-3 py-1.5 text-gray-400 font-mono">{album._count.photos}</td>
                    <td className="px-3 py-1.5">
                      <span className={`status-tag px-2 py-0.5 rounded text-xs ${
                        album.status === 'PUBLISHED' ? 'status-published bg-green-500/15 text-green-400' :
                        album.status === 'DRAFT' ? 'status-draft bg-yellow-500/15 text-yellow-400' :
                        'status-archived bg-gray-500/15 text-gray-400'
                      }`}>
                        {album.status === 'PUBLISHED' ? '已发布' : album.status === 'DRAFT' ? '草稿' : '归档'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-gray-400 font-mono">{album.viewCount}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-2 items-center">
                        <Link href={`/admin/photos/${album.id}`} className="text-blue-400 hover:text-blue-300 text-xs">编辑</Link>
                        {isDeleting ? (
                          <span className="text-gray-500 text-xs flex items-center gap-1">
                            <Spinner size="sm" />删除中
                          </span>
                        ) : (
                          <button onClick={() => confirmDelete(album)} className="text-red-400 hover:text-red-300 text-xs">删除</button>
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
        title="删除相册"
        message={`确定要删除「${confirmModal.title}」吗？\n相册内的所有图片将被删除，操作不可撤销。`}
        confirmText="确认删除"
        variant="danger"
      />

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
