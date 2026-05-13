'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button, Spinner, Card, Badge, Input, PageLoader, ToastContainer, useToast, EmptyState, Modal, ConfirmModal } from '@/components/ui';

interface MediaAsset {
  type: 'CAPTION' | 'SPRITE' | 'SPRITE_VTT' | 'COVER';
  url: string;
}

interface VodVideo {
  id: number;
  uuid: string;
  filename: string;
  filesize: number;
  mimetype: string;
  vodVideoId: string | null;
  videoUrl: string | null;
  coverUrl: string | null;
  videoType: string;
  videoWidth: number | null;
  videoHeight: number | null;
  videoDuration: string | null;
  videoFps: number | null;
  mediaAssets: MediaAsset[];
  tags: any;
  status: string;
  uploader: {
    id: number;
    username: string;
    nickname: string;
  };
  videos: {
    id: number;
    title: string;
    status: string;
  }[];
  previewVideos: {
    id: number;
    title: string;
    status: string;
  }[];
  createdAt: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export default function VodVideosPage() {
  const [vodVideos, setVodVideos] = useState<VodVideo[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const { toasts, addToast, removeToast } = useToast();
  const [deleting, setDeleting] = useState<number | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [syncing, setSyncing] = useState<Set<number>>(new Set());
  const [playingVideo, setPlayingVideo] = useState<{ url: string; title: string; poster?: string } | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<{ isOpen: boolean; vod: VodVideo | null }>({ isOpen: false, vod: null });

  const fetchVodVideos = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      params.set('page', String(page));
      params.set('pageSize', '50');

      const res = await api.get<{ vodVideos: VodVideo[]; pagination: Pagination }>(`/admin/vod-videos?${params}`);
      setVodVideos(res.vodVideos);
      setPagination(res.pagination);
    } catch (err) {
      console.error('加载VOD视频列表失败:', err);
      addToast('加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  const syncVodInfo = useCallback(async (id: number, silent = false) => {
    setSyncing(prev => new Set(prev).add(id));
    try {
      const res = await api.post<{ success: boolean; vodVideo: VodVideo }>(`/admin/vod-videos/${id}/sync-info`, {});
      setVodVideos(prev => prev.map(v => v.id === id ? res.vodVideo : v));
      if (!silent) addToast('同步成功', 'success');
    } catch (err: any) {
      if (!silent) addToast(err.message || '同步失败', 'error');
    } finally {
      setSyncing(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }, []);

  useEffect(() => {
    fetchVodVideos();
  }, [fetchVodVideos]);

  // 页面加载后，自动异步同步缺少信息的记录
  useEffect(() => {
    if (loading || vodVideos.length === 0) return;
    const missing = vodVideos.filter(v =>
      v.vodVideoId && !v.videoDuration
    );
    missing.forEach(v => syncVodInfo(v.id, true));
  }, [loading, vodVideos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id: number) => {
    const vod = vodVideos.find(v => v.id === id);
    if (!vod) return;

    const allRefs = [...vod.videos, ...vod.previewVideos];
    if (allRefs.length > 0) {
      const usedByNames = allRefs.map(v => v.title).join('、');
      addToast(`该视频正在被使用: ${usedByNames}，无法删除`, 'error');
      return;
    }

    if (!confirm(`确定要删除 VOD 视频 ${vod.filename} 吗？此操作不可恢复。`)) {
      return;
    }

    setDeleting(id);
    try {
      await api.delete(`/admin/vod-videos/${id}`);
      addToast('删除成功', 'success');
      fetchVodVideos();
    } catch (err: any) {
      addToast(err.message || '删除失败', 'error');
    } finally {
      setDeleting(null);
    }
  };

  const handleRemoveFromLibrary = (id: number) => {
    const vod = vodVideos.find(v => v.id === id);
    if (!vod) return;
    setRemoveConfirm({ isOpen: true, vod });
  };

  const confirmRemoveFromLibrary = async () => {
    const vod = removeConfirm.vod;
    if (!vod) return;
    setRemoving(vod.id);
    try {
      await api.delete(`/admin/vod-videos/${vod.id}/local-only`);
      addToast('移出库成功', 'success');
      setRemoveConfirm({ isOpen: false, vod: null });
      setVodVideos(prev => prev.filter(v => v.id !== vod.id));
      setPagination(prev => prev ? { ...prev, total: Math.max(0, prev.total - 1) } : prev);
    } catch (err: any) {
      addToast(err.message || '移出库失败', 'error');
    } finally {
      setRemoving(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'READY':
        return <Badge variant="success">就绪</Badge>;
      case 'PROCESSING':
        return <Badge variant="warning">处理中</Badge>;
      case 'FAILED':
        return <Badge variant="danger">失败</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const formatDuration = (duration: string | null) => {
    if (!duration) return '-';
    return duration;
  };

  const formatResolution = (width: number | null, height: number | null) => {
    if (!width || !height) return '-';
    return `${width}×${height}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '-';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const truncateId = (id: string | null, maxLen = 20) => {
    if (!id) return '-';
    if (id.length <= maxLen) return id;
    return id.substring(0, maxLen) + '...';
  };

  const stats = {
    total: pagination?.total || 0,
    ready: vodVideos.filter(v => v.status === 'READY').length,
    processing: vodVideos.filter(v => v.status === 'PROCESSING').length,
    unused: vodVideos.filter(v => v.videos.length === 0 && v.previewVideos.length === 0).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">VOD视频资源</h1>
          <p className="text-xs text-gray-500 mt-0.5">管理阿里云VOD视频资源（主视频和预览视频）</p>
        </div>
        <Link href="/admin/videos/new">
          <Button size="md">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            上传视频
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="text-center">
          <div className="!text-xl font-bold text-white font-mono">{stats.total}</div>
          <div className="text-xs text-gray-500 mt-1">VOD视频总数</div>
        </Card>
        <Card className="text-center">
          <div className="!text-xl font-bold text-green-400 font-mono">{stats.ready}</div>
          <div className="text-xs text-gray-500 mt-1">就绪</div>
        </Card>
        <Card className="text-center">
          <div className="!text-xl font-bold text-yellow-400 font-mono">{stats.processing}</div>
          <div className="text-xs text-gray-500 mt-1">处理中</div>
        </Card>
        <Card className="text-center">
          <div className="!text-xl font-bold text-red-400 font-mono">{stats.unused}</div>
          <div className="text-xs text-gray-500 mt-1">未使用</div>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索文件名或VOD ID..."
            className="w-full"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 px-3 bg-gray-900 border border-gray-700 rounded-md text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">全部状态</option>
          <option value="READY">就绪</option>
          <option value="PROCESSING">处理中</option>
          <option value="FAILED">失败</option>
        </select>
      </div>

      {loading ? (
        <PageLoader />
      ) : vodVideos.length === 0 ? (
        <EmptyState
          icon={
            <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          }
          title="暂无VOD视频"
          description="上传视频到阿里云VOD后将在这里显示"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {vodVideos.map((vod) => {
            const allRefs = [...vod.videos, ...vod.previewVideos];
            const isUnused = allRefs.length === 0;
            return (
              <div key={vod.id} className="bg-gray-900 rounded-md overflow-hidden flex flex-col">
                <div className="relative aspect-video bg-gray-800">
                  {vod.coverUrl ? (
                    <img
                      src={vod.coverUrl}
                      alt={vod.filename}
                      className="w-full h-full object-cover"
                    />
                  ) : syncing.has(vod.id) ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <Spinner size="sm" />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  <span className={`absolute top-2 left-2 text-xs px-1.5 py-0.5 rounded ${vod.videoType === 'PREVIEW' ? 'vod-tag-preview bg-cyan-500/20 text-cyan-300' : 'vod-tag-main bg-blue-500/20 text-blue-300'}`}>
                    {vod.videoType === 'PREVIEW' ? '预览' : '主视频'}
                  </span>
                  {vod.videoDuration && (
                    <span className="absolute bottom-2 right-2 text-xs bg-black/70 text-white px-1.5 py-0.5 rounded font-mono">
                      {vod.videoDuration}
                    </span>
                  )}
                  {vod.videoUrl && (
                    <button
                      onClick={() => setPlayingVideo({ url: vod.videoUrl!, title: vod.filename, poster: vod.coverUrl ?? undefined })}
                      className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 bg-black/40 transition-opacity"
                      title="播放视频"
                    >
                      <svg className="w-12 h-12 text-white drop-shadow-lg" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  )}
                </div>

                <div className="p-3 flex flex-col gap-2 flex-1">
                  <div className="flex flex-col gap-1 text-xs">
                    {vod.videoWidth && vod.videoHeight && (
                      <div className="flex items-baseline gap-1.5 text-gray-400">
                        <span className="text-gray-600 w-14 shrink-0 text-right">分辨率</span>
                        <span className="font-mono">{formatResolution(vod.videoWidth, vod.videoHeight)}</span>
                      </div>
                    )}
                    <div className="flex items-baseline gap-1.5 text-gray-400">
                      <span className="text-gray-600 w-14 shrink-0 text-right">大小</span>
                      <span className="font-mono">{formatFileSize(vod.filesize)}</span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-gray-600 text-xs w-14 shrink-0 text-right">使用状态</span>
                      {getStatusBadge(vod.status)}
                    </div>
                  </div>

                  {vod.vodVideoId && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-600 text-xs w-14 shrink-0 text-right">VOD ID</span>
                      <p className="font-mono text-xs text-gray-500 truncate flex-1" title={vod.vodVideoId}>
                        {vod.vodVideoId}
                      </p>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(vod.vodVideoId!);
                          addToast('VOD ID 已复制', 'success');
                        }}
                        className="text-gray-500 hover:text-gray-300 shrink-0"
                        title="复制 VOD ID"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  )}

                  <div className="flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-gray-600 text-xs w-14 shrink-0 text-right">关联文章</span>
                      {allRefs.length > 0 ? (
                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                          {allRefs.slice(0, 2).map(v => (
                            <Link
                              key={v.id}
                              href={`/admin/videos/${v.id}`}
                              className="text-blue-400 hover:text-blue-300 text-xs truncate block"
                              title={v.title}
                            >
                              {v.title}
                            </Link>
                          ))}
                          {allRefs.length > 2 && (
                            <span className="text-gray-500 text-xs">+{allRefs.length - 2} 更多</span>
                          )}
                        </div>
                      ) : (
                        <Badge variant="warning" className="text-xs">未使用</Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-800 mt-auto">
                    <div className="text-xs text-gray-500">
                      <span>{vod.uploader.nickname || vod.uploader.username}</span>
                      <span className="mx-1">·</span>
                      <span className="font-mono">{new Date(vod.createdAt).toLocaleDateString('zh-CN')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRemoveFromLibrary(vod.id)}
                        disabled={removing === vod.id}
                        className="text-yellow-400 hover:text-yellow-300 text-xs disabled:opacity-50"
                        title="移出库（仅删除数据库记录，保留VOD视频）"
                      >
                        {removing === vod.id ? '移出中...' : '移出库'}
                      </button>
                      {vod.vodVideoId && (
                        <button
                          onClick={() => syncVodInfo(vod.id)}
                          disabled={syncing.has(vod.id)}
                          className="text-blue-400 hover:text-blue-300 text-xs disabled:opacity-50"
                          title="从阿里云同步视频信息"
                        >
                          {syncing.has(vod.id) ? '同步中...' : '同步'}
                        </button>
                      )}
                      {isUnused && (
                        <button
                          onClick={() => handleDelete(vod.id)}
                          disabled={deleting === vod.id}
                          className="text-red-400 hover:text-red-300 text-xs disabled:opacity-50"
                        >
                          {deleting === vod.id ? '删除中...' : '删除'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(page => (
            <button
              key={page}
              onClick={() => fetchVodVideos(page)}
              className={`px-3 py-1 rounded text-sm ${
                page === pagination.page
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {page}
            </button>
          ))}
        </div>
      )}

      <Modal
        isOpen={!!playingVideo}
        onClose={() => setPlayingVideo(null)}
        title={playingVideo?.title || '播放视频'}
        size="xl"
      >
        {playingVideo && (
          <div className="aspect-video bg-black rounded-md overflow-hidden">
            <video
              src={playingVideo.url}
              poster={playingVideo.poster}
              controls
              autoPlay
              className="w-full h-full"
            >
              您的浏览器不支持视频播放
            </video>
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={removeConfirm.isOpen}
        onClose={() => setRemoveConfirm({ isOpen: false, vod: null })}
        onConfirm={confirmRemoveFromLibrary}
        title="移出库"
        message={
          removeConfirm.vod
            ? (() => {
                const refCount = [...removeConfirm.vod.videos, ...removeConfirm.vod.previewVideos].length;
                const refs = refCount > 0
                  ? `该 VOD 视频被 ${refCount} 篇文章引用，移出库后将自动清除这些引用；`
                  : '';
                return `确定要将 ${removeConfirm.vod.filename} 移出库吗？${refs}此操作不会删除阿里云 VOD 中的视频文件。`;
              })()
            : ''
        }
        confirmText="移出库"
        variant="danger"
        isLoading={removing === removeConfirm.vod?.id}
      />

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}

