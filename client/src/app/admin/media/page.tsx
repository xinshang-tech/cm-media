'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api, getSignedUrls, getSignedUrl } from '@/lib/api';
import { Button, Spinner, Card, Badge, Tabs, ConfirmModal, PageLoader, ToastContainer, useToast, EmptyState, Input, Modal, ProgressBar } from '@/components/ui';

interface MediaItem {
  id: string;
  type: 'image' | 'poster' | 'avatar' | 'subtitle' | 'sprite' | 'sprite_vtt' | 'photos';
  url: string;
  thumbUrl?: string;
  vodId?: string;
  title: string;
  originalFilename?: string;
  source: string;
  sourceId: number;
  sourceTitle: string;
  isReferenced: boolean;
  createdAt: string;
  filename?: string;
  filesize?: number;
  mimetype?: string;
  width?: number;
  height?: number;
}

interface MediaStats {
  total: number;
  images: number;
  posters: number;
  avatars: number;
  sprites: number;
  subtitles: number;
  spriteVtts: number;
  photos: number;
}

export default function AdminMediaPage() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [stats, setStats] = useState<MediaStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; item: MediaItem | null }>({
    isOpen: false,
    item: null,
  });
  const [detailModal, setDetailModal] = useState<{ isOpen: boolean; item: MediaItem | null; signedUrl: string; thumbSignedUrl: string }>({
    isOpen: false,
    item: null,
    signedUrl: '',
    thumbSignedUrl: '',
  });
  const [deleting, setDeleting] = useState(false);
  const { toasts, addToast, removeToast } = useToast();
  
  // 上传状态
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchMedia = useCallback(async () => {
    setLoading(true);
    try {
      const typeParam = activeTab === 'all' ? '' : activeTab;
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
      const res = await api.get<{ media: MediaItem[]; stats: MediaStats }>(
        `/admin/media?type=${typeParam}${searchParam}`
      );
      
      const urls = res.media.map(item => item.url);
      const thumbUrls = res.media.map(item => item.thumbUrl || item.url);
      const allUrls = [...urls, ...thumbUrls];
      const signedUrls = await getSignedUrls(allUrls);
      
      const mediaCount = res.media.length;
      const mediaWithSignedUrls = res.media.map((item, index) => ({
        ...item,
        url: signedUrls[index] || item.url,
        thumbUrl: signedUrls[mediaCount + index] || item.thumbUrl || item.url,
      }));
      
      setMedia(mediaWithSignedUrls);
      setStats(res.stats);
    } catch (err) {
      console.error('加载媒体列表失败:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, search]);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // 根据文件类型选择上传接口和目录
      let endpoint = '/aliyun/upload/image';
      let folder = 'files';
      
      if (file.type.startsWith('image/')) {
        folder = 'images';
      } else if (file.name.endsWith('.vtt') || file.name.endsWith('.srt') || file.name.endsWith('.txt')) {
        folder = 'subtitles';
      }

      formData.append('folder', folder);

      // 使用XMLHttpRequest获取上传进度
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      const response = await new Promise<any>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error('上传失败'));
          }
        };
        xhr.onerror = () => reject(new Error('上传失败'));
        xhr.open('POST', `${process.env.NEXT_PUBLIC_API_URL}${endpoint}`);
        xhr.withCredentials = true;
        xhr.send(formData);
      });

      addToast('上传成功', 'success');
      fetchMedia();
    } catch (err: any) {
      addToast(err.message || '上传失败', 'error');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const showDetail = async (item: MediaItem) => {
    const signedUrl = await getSignedUrl(item.url.split('?')[0]);
    const thumbSignedUrl = item.thumbUrl ? await getSignedUrl(item.thumbUrl.split('?')[0]) : signedUrl;
    setDetailModal({ 
      isOpen: true, 
      item, 
      signedUrl: signedUrl || item.url,
      thumbSignedUrl: thumbSignedUrl || item.thumbUrl || item.url,
    });
  };

  const handleDelete = async () => {
    if (!deleteModal.item) return;

    setDeleting(true);
    try {
      const { type, id } = deleteModal.item;
      await api.delete(`/admin/media/${type}/${id}`);
      
      if (deleteModal.item.url && !deleteModal.item.vodId) {
        try {
          await fetch(`${process.env.NEXT_PUBLIC_API_URL}/aliyun/oss/file`, {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: deleteModal.item.url.split('?')[0] }),
          });
        } catch {
          // 忽略OSS删除失败
        }
      }

      addToast('删除成功', 'success');
      setDeleteModal({ isOpen: false, item: null });
      fetchMedia();
    } catch (err: any) {
      addToast(err.message || '删除失败', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, { label: string; variant: 'default' | 'info' | 'success' | 'warning' }> = {
      video: { label: '视频', variant: 'info' },
      image: { label: '图片', variant: 'success' },
      poster: { label: '海报', variant: 'warning' },
      avatar: { label: '头像', variant: 'default' },
      subtitle: { label: '字幕文件', variant: 'info' },
      sprite: { label: '雪碧图', variant: 'success' },
      sprite_vtt: { label: '雪碧图VTT', variant: 'warning' },
      photos: { label: '相册图片', variant: 'success' },
    };
    return labels[type] || { label: type, variant: 'default' as const };
  };

  const getTypeIcon = (type: string) => {
    const icons: Record<string, React.ReactNode> = {
      video: (
        <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      ),
      image: (
        <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      poster: (
        <svg className="w-8 h-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      avatar: (
        <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      subtitle: (
        <svg className="w-8 h-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
      ),
      sprite: (
        <svg className="w-8 h-8 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      sprite_vtt: (
        <svg className="w-8 h-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      photos: (
        <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    };
    return icons[type] || icons.image;
  };

  const isImageType = (type: string) => {
    return type === 'avatar' || type === 'poster' || type === 'image' || type === 'sprite' || type === 'photos';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileExtension = (filename: string) => {
    return filename.split('.').pop()?.toUpperCase() || '';
  };

  const tabs = [
    { key: 'all', label: '全部', count: stats?.total },
    { key: 'image', label: '图片', count: stats?.images },
    { key: 'poster', label: '海报', count: stats?.posters },
    { key: 'avatar', label: '头像', count: stats?.avatars },
    { key: 'photos', label: '相册图片', count: stats?.photos },
    { key: 'sprite', label: '雪碧图', count: stats?.sprites },
    { key: 'sprite_vtt', label: '雪碧图VTT', count: stats?.spriteVtts },
    { key: 'subtitle', label: '字幕文件', count: stats?.subtitles },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">媒体管理</h1>
          <p className="text-xs text-gray-500 mt-0.5">管理所有视频、图片、海报和头像资源</p>
        </div>
        <div className="flex gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.gif,.webp,.svg,.srt,.vtt,.txt"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = '';
            }}
            className="hidden"
          />
          <Button onClick={() => fileInputRef.current?.click()} isLoading={uploading}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            上传文件
          </Button>
        </div>
      </div>

      {uploading && (
        <Card>
          <div className="flex items-center gap-4">
            <Spinner size="sm" />
            <div className="flex-1">
              <p className="text-sm text-gray-400 mb-1">上传中...</p>
              <ProgressBar value={uploadProgress} showLabel />
            </div>
          </div>
        </Card>
      )}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="text-center">
            <div className="font-bold text-white font-mono !text-xl">{stats.total}</div>
            <div className="text-xs text-gray-500 mt-1">总资源数</div>
          </Card>
          <Card className="text-center">
            <div className="font-bold text-green-400 font-mono !text-xl">{stats.images}</div>
            <div className="text-xs text-gray-500 mt-1">图片</div>
          </Card>
          <Card className="text-center">
            <div className="font-bold text-yellow-400 font-mono !text-xl">{stats.posters}</div>
            <div className="text-xs text-gray-500 mt-1">海报</div>
          </Card>
          <Card className="text-center">
            <div className="font-bold text-purple-400 font-mono !text-xl">{stats.avatars}</div>
            <div className="text-xs text-gray-500 mt-1">头像</div>
          </Card>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 min-w-[200px]">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索媒体资源..."
            className="w-full"
          />
        </div>
        <Tabs items={tabs} activeKey={activeTab} onChange={setActiveTab} />
      </div>

      {loading ? (
        <PageLoader />
      ) : media.length === 0 ? (
        <EmptyState
          icon={
            <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
          title="暂无媒体资源"
          description="上传视频或图片后将在这里显示"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {media.map((item) => {
            const typeInfo = getTypeLabel(item.type);
            return (
              <div key={item.id} className="cursor-pointer" onClick={() => showDetail(item)}>
                <Card hover className="group">
                  <div className="flex gap-4">
                    <div 
                      className="flex-shrink-0 w-20 h-20 rounded-md overflow-hidden flex items-center justify-center"
                      style={{ background: 'var(--color-card)' }}
                    >
                      {isImageType(item.type) ? (
                        <img src={item.thumbUrl || item.url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        getTypeIcon(item.type)
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-normal text-white truncate">{item.title}</h3>
                      {(item.originalFilename || item.filename) && (
                        <p className="text-xs text-gray-400 truncate mt-0.5" title={item.originalFilename || item.filename}>
                          {item.originalFilename || item.filename}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>
                        {item.filename && (
                          <span className="text-xs text-gray-600">{getFileExtension(item.filename)}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1 truncate font-mono">
                        {item.filesize ? formatFileSize(item.filesize) : ''}
                        {item.width && item.height ? ` · ${item.width}×${item.height}` : ''}
                        {item.filesize || (item.width && item.height) ? ' · ' : ''}
                        {new Date(item.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteModal({ isOpen: true, item });
                        }}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      <Modal 
        isOpen={detailModal.isOpen} 
        onClose={() => setDetailModal({ isOpen: false, item: null, signedUrl: '', thumbSignedUrl: '' })} 
        title="媒体详情"
        size="lg"
      >
        {detailModal.item && (
          <div className="space-y-4">
            {isImageType(detailModal.item.type) && (
              <div className="flex justify-center bg-gray-900 rounded-md p-4">
                <img 
                  src={detailModal.signedUrl} 
                  alt={detailModal.item.title} 
                  className="max-w-full max-h-[50vh] object-contain rounded"
                />
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500">类型</label>
                  <p className="text-sm text-white">{getTypeLabel(detailModal.item.type).label}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">来源</label>
                  <p className="text-sm text-white">{detailModal.item.sourceTitle}</p>
                </div>
                {detailModal.item.filename && (
                  <div>
                    <label className="text-xs text-gray-500">文件名</label>
                    <p className="text-sm text-white truncate">{detailModal.item.filename}</p>
                  </div>
                )}
                {detailModal.item.filesize && (
                  <div>
                    <label className="text-xs text-gray-500">文件大小</label>
                    <p className="text-sm text-white font-mono">{formatFileSize(detailModal.item.filesize)}</p>
                  </div>
                )}
                {detailModal.item.width && detailModal.item.height && (
                  <div>
                    <label className="text-xs text-gray-500">尺寸</label>
                    <p className="text-sm text-white font-mono">{detailModal.item.width} × {detailModal.item.height}</p>
                  </div>
                )}
                {detailModal.item.mimetype && (
                  <div>
                    <label className="text-xs text-gray-500">MIME类型</label>
                    <p className="text-sm text-white">{detailModal.item.mimetype}</p>
                  </div>
                )}
                <div>
                  <label className="text-xs text-gray-500">创建时间</label>
                  <p className="text-sm text-white font-mono">{new Date(detailModal.item.createdAt).toLocaleString('zh-CN')}</p>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500">原始URL</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={detailModal.item.url.split('?')[0]}
                    readOnly
                    className="flex-1 px-3 py-2 text-xs bg-white/5 border border-white/10 rounded text-gray-400"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(detailModal.item!.url.split('?')[0]);
                      addToast('已复制', 'success');
                    }}
                  >
                    复制
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500">签名URL（1小时有效）</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={detailModal.signedUrl}
                    readOnly
                    className="flex-1 px-3 py-2 text-xs bg-white/5 border border-white/10 rounded text-gray-400 truncate"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(detailModal.signedUrl);
                      addToast('已复制', 'success');
                    }}
                  >
                    复制
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, item: null })}
        onConfirm={handleDelete}
        title="删除媒体资源"
        message={`确定要删除 "${deleteModal.item?.title}" 吗？此操作不可撤销。`}
        confirmText="删除"
        variant="danger"
        isLoading={deleting}
      />

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}

