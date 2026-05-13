'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Spinner, Badge, Modal, PageLoader, ToastContainer, useToast } from '@/components/ui';

function HlsVideoPlayer({ url, poster, isHls }: { url: string; poster?: string; isHls: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    let hlsInstance: any = null;

    const setup = async () => {
      if (isHls) {
        const { default: Hls } = await import('hls.js');
        if (Hls.isSupported()) {
          hlsInstance = new Hls();
          hlsInstance.loadSource(url);
          hlsInstance.attachMedia(videoEl);
          hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => videoEl.play().catch(() => {}));
        } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
          videoEl.src = url;
          videoEl.play().catch(() => {});
        }
      } else {
        videoEl.src = url;
        videoEl.play().catch(() => {});
      }
    };

    setup();
    return () => {
      if (hlsInstance) { hlsInstance.destroy(); }
      videoEl.src = '';
    };
  }, [url, isHls]);

  return (
    <div className="aspect-video bg-black rounded-md overflow-hidden">
      <video ref={videoRef} poster={poster} controls className="w-full h-full" />
    </div>
  );
}

interface VodCategory {
  cateId: number;
  cateName: string;
}

interface CloudVideo {
  videoId: string;
  title: string;
  coverUrl: string | null;
  duration: number | null;
  status: string;
  createdAt: string;
  cateId: number | null;
  cateName: string | null;
  inLocalDb: boolean;
  localId: number | null;
  usedInVideos: { id: number; title: string }[];
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface VodConfig {
  accessKey: string;
  accessSecret: string;
  endpoint: string;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function VodCloudPage() {
  const [config, setConfig] = useState<VodConfig | null>(null);
  const [categories, setCategories] = useState<VodCategory[]>([]);
  const [selectedCateId, setSelectedCateId] = useState(() => localStorage.getItem('vodCloud_cateId') ?? '');
  const [videos, setVideos] = useState<CloudVideo[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPlay, setLoadingPlay] = useState<string | null>(null);
  const [playingVideo, setPlayingVideo] = useState<{ url: string; title: string; poster?: string; isHls: boolean } | null>(null);
  const [pageSize, setPageSize] = useState(() => Number(localStorage.getItem('vodCloud_pageSize') ?? '20'));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    api.get<VodConfig>('/admin/vod-cloud/config').then(setConfig).catch(() => {});
    api.get<{ categories: VodCategory[] }>('/admin/vod-cloud/categories')
      .then(res => setCategories(res.categories))
      .catch(() => {});
  }, []);

  const fetchVideos = useCallback(async (page = 1) => {
    setLoading(true);
    setSelected(new Set());
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (selectedCateId) params.set('cateId', selectedCateId);
      const res = await api.get<{ videos: CloudVideo[]; pagination: Pagination }>(`/admin/vod-cloud/videos?${params}`);
      setVideos(res.videos);
      setPagination(res.pagination);
    } catch (err: any) {
      addToast(err.message || '加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedCateId, pageSize]);

  useEffect(() => {
    fetchVideos(1);
  }, [fetchVideos]);

  const handlePlay = async (video: CloudVideo) => {
    setLoadingPlay(video.videoId);
    try {
      const res = await api.get<{ playURL: string; isHls: boolean }>(`/admin/vod-cloud/play/${video.videoId}`);
      setPlayingVideo({ url: res.playURL, title: video.title, poster: video.coverUrl ?? undefined, isHls: res.isHls ?? false });
    } catch (err: any) {
      addToast(err.message || '获取播放地址失败', 'error');
    } finally {
      setLoadingPlay(null);
    }
  };

  const toggleSelect = (videoId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === videos.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(videos.map(v => v.videoId)));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.delete('/admin/vod-cloud/videos', { body: JSON.stringify({ videoIds: confirmDelete }) });
      addToast(`已删除 ${confirmDelete.length} 个视频`, 'success');
      const deletedSet = new Set(confirmDelete);
      setVideos(prev => prev.filter(v => !deletedSet.has(v.videoId)));
      setPagination(prev => prev ? { ...prev, total: Math.max(0, prev.total - deletedSet.size) } : prev);
      setSelected(new Set());
      setConfirmDelete(null);
    } catch (err: any) {
      addToast(err.message || '删除失败', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const allSelected = videos.length > 0 && selected.size === videos.length;
  const someSelected = selected.size > 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-white">VOD云端视频列表</h1>
        <p className="text-xs text-gray-500 mt-0.5">直接读取阿里云VOD账号中的视频，并与本系统数据库对比</p>
      </div>

      {config && (
        <div className="bg-gray-900 border border-gray-800 rounded-md p-4 flex flex-wrap gap-6 text-xs font-mono">
          <div>
            <span className="text-gray-500 mr-2">Access Key</span>
            <span className="text-gray-300">{config.accessKey}</span>
          </div>
          <div>
            <span className="text-gray-500 mr-2">Access Secret</span>
            <span className="text-gray-300">{config.accessSecret}</span>
          </div>
          <div>
            <span className="text-gray-500 mr-2">Endpoint</span>
            <span className="text-gray-300">{config.endpoint}</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-gray-400 shrink-0">分类筛选</span>
        <select
          value={selectedCateId}
          onChange={e => { setSelectedCateId(e.target.value); localStorage.setItem('vodCloud_cateId', e.target.value); }}
          className="h-8 px-3 bg-gray-900 border border-gray-700 rounded-md text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">全部分类</option>
          {categories.map(c => (
            <option key={c.cateId} value={String(c.cateId)}>{c.cateName}</option>
          ))}
        </select>
        <select
          value={pageSize}
          onChange={e => { setPageSize(Number(e.target.value)); localStorage.setItem('vodCloud_pageSize', e.target.value); }}
          className="h-8 px-3 bg-gray-900 border border-gray-700 rounded-md text-sm text-white focus:outline-none focus:border-blue-500"
        >
          {[1, 10, 20, 30, 40, 50].map(n => (
            <option key={n} value={n}>每页 {n}</option>
          ))}
        </select>
        {pagination && (
          <span className="text-xs text-gray-500">共 {pagination.total} 条</span>
        )}

        {videos.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={toggleSelectAll}
              className="h-8 px-3 bg-gray-800 border border-gray-700 rounded-md text-xs text-gray-300 hover:bg-gray-700 transition-colors"
            >
              {allSelected ? '取消全选' : '全选'}
            </button>
            {someSelected && (
              <button
                onClick={() => setConfirmDelete(Array.from(selected))}
                className="h-8 px-3 bg-red-600 rounded-md text-xs text-white hover:bg-red-500 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                删除 {selected.size} 个
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <PageLoader />
      ) : videos.length === 0 ? (
        <div className="text-center py-20 text-gray-500 text-sm">暂无视频</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 [@media(min-width:1360px)]:grid-cols-5 gap-4">
          {videos.map(video => {
            const isSelected = selected.has(video.videoId);
            return (
              <div
                key={video.videoId}
                className={`bg-gray-900 rounded-md overflow-hidden flex flex-col relative ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
              >
                <div
                  className="absolute top-2 left-2 z-10"
                  onClick={e => { e.stopPropagation(); toggleSelect(video.videoId); }}
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-600' : 'bg-white/80 border border-gray-300 hover:border-blue-400'
                  }`}>
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>

                <div className="relative aspect-video bg-gray-800 cursor-pointer group" onClick={() => handlePlay(video)}>
                  {video.coverUrl ? (
                    <img src={video.coverUrl} alt={video.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  {video.duration && (
                    <span className="absolute bottom-2 right-2 text-xs bg-black/70 text-white px-1.5 py-0.5 rounded font-mono">
                      {formatDuration(video.duration)}
                    </span>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    {loadingPlay === video.videoId ? (
                      <Spinner size="sm" />
                    ) : (
                      <svg className="w-12 h-12 text-white drop-shadow-lg" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </div>
                </div>

                <div className="p-3 flex flex-col gap-2 flex-1">
                  <p className="text-sm text-white truncate" title={video.title}>{video.title}</p>

                  <div className="flex flex-wrap gap-1.5 items-center">
                    {video.inLocalDb ? (
                      video.usedInVideos.length > 0 ? (
                        <Badge variant="success">已使用</Badge>
                      ) : (
                        <Badge variant="warning">已入库/未使用</Badge>
                      )
                    ) : (
                      <Badge variant="danger">未入库</Badge>
                    )}
                    {video.cateName && (
                      <span className="text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">{video.cateName}</span>
                    )}
                  </div>

                  {video.usedInVideos.length > 0 && (
                    <div className="text-xs text-gray-500 truncate" title={video.usedInVideos.map(v => v.title).join('、')}>
                      关联: {video.usedInVideos.slice(0, 2).map(v => v.title).join('、')}
                      {video.usedInVideos.length > 2 && ` +${video.usedInVideos.length - 2}`}
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-800">
                    <span
                      className="text-xs text-gray-600 font-mono truncate flex-1 cursor-pointer hover:text-gray-300 transition-colors"
                      title={`点击复制: ${video.videoId}`}
                      onClick={() => {
                        navigator.clipboard.writeText(video.videoId);
                        addToast('VOD ID 已复制', 'success');
                      }}
                    >
                      {video.videoId.substring(0, 16)}…
                    </span>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <span className="text-xs text-gray-600">
                        {new Date(video.createdAt).toLocaleDateString('zh-CN')}
                      </span>
                      <button
                        onClick={() => setConfirmDelete([video.videoId])}
                        className="text-gray-600 hover:text-red-400 transition-colors"
                        title="删除"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2 flex-wrap">
          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              onClick={() => fetchVideos(p)}
              className={`px-3 py-1 rounded text-sm ${
                p === pagination.page ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {p}
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
          <HlsVideoPlayer url={playingVideo.url} poster={playingVideo.poster} isHls={playingVideo.isHls} />
        )}
      </Modal>

      <Modal
        isOpen={!!confirmDelete}
        onClose={() => !deleting && setConfirmDelete(null)}
        title="确认删除"
        size="sm"
      >
        {confirmDelete && (
          <div className="space-y-4">
            <p className="text-sm text-gray-300">
              确定要从阿里云VOD中永久删除 <span className="text-white font-semibold">{confirmDelete.length}</span> 个视频吗？此操作不可恢复。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-md text-sm bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="px-4 py-2 rounded-md text-sm bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 flex items-center gap-2"
              >
                {deleting && <Spinner size="sm" />}
                确认删除
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
