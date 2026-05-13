'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, getSignedUrls, getSignedUrl } from '@/lib/api';
import { Modal, Button, Input, Spinner, Badge } from '@/components/ui';

interface MediaItem {
  id: string;
  type: string;
  url: string;
  thumbUrl?: string;
  title: string;
  originalFilename?: string;
  filename?: string;
  filesize?: number;
  mimetype?: string;
  width?: number;
  height?: number;
  createdAt: string;
}

interface MediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 选中后回调，rawUrl 用于存库，displayUrl 用于页面展示（签名后），originalFilename 原始文件名 */
  onSelect: (rawUrl: string, displayUrl: string, originalFilename?: string) => void;
  title?: string;
  /** 媒体库展示的类型过滤，e.g. ['poster','image'] */
  typeFilters?: string[];
  /** 上传时的 file input accept */
  accept?: string;
  /** 上传到 OSS 的目录 */
  uploadFolder?: string;
  /** 上传接口路径，默认 /aliyun/upload/image */
  uploadEndpoint?: string;
}

const TYPE_LABELS: Record<string, string> = {
  image: '图片',
  poster: '海报',
  avatar: '头像',
  subtitle: '字幕',
  sprite: '雪碧图',
  sprite_vtt: '雪碧图VTT',
};

const isImageType = (type: string) =>
  ['avatar', 'poster', 'image', 'sprite'].includes(type);

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function MediaPickerModal({
  isOpen,
  onClose,
  onSelect,
  title = '从媒体库选择',
  typeFilters,
  accept = 'image/*',
  uploadFolder = 'images',
  uploadEndpoint = '/aliyun/upload/image',
}: MediaPickerModalProps) {
  const [tab, setTab] = useState<'library' | 'upload'>('library');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const searchRef = useRef(search);
  searchRef.current = search;

  const fetchMedia = useCallback(async () => {
    setLoading(true);
    try {
      const currentSearch = searchRef.current;
      const typeParam = typeFilters?.length === 1 ? `type=${typeFilters[0]}` : '';
      const searchParam = currentSearch ? `&search=${encodeURIComponent(currentSearch)}` : '';
      const res = await api.get<{ media: MediaItem[] }>(
        `/admin/media?${typeParam}${searchParam}`
      );

      let items = res.media;
      if (typeFilters && typeFilters.length > 1) {
        items = items.filter((m) => typeFilters.includes(m.type));
      }

      const urls = items.map((m) => m.url);
      const thumbUrls = items.map((m) => m.thumbUrl || m.url);
      const signed = await getSignedUrls([...urls, ...thumbUrls]);
      const n = items.length;
      items = items.map((m, i) => ({
        ...m,
        url: signed[i] || m.url,
        thumbUrl: signed[n + i] || m.thumbUrl || m.url,
      }));

      setMedia(items);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [typeFilters]);

  // 弹窗打开时初始化
  useEffect(() => {
    if (isOpen) {
      setSelected(null);
      setSearch('');
      setUploadError('');
      fetchMedia();
    }
  }, [isOpen]);

  // 搜索防抖
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => fetchMedia(), 400);
    return () => clearTimeout(t);
  }, [search]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', uploadFolder);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}${uploadEndpoint}`,
        { method: 'POST', credentials: 'include', body: formData }
      );
      if (!res.ok) throw new Error('上传失败');
      const data = await res.json();

      const rawUrl: string = data.data.url;
      const displayUrl: string = data.data.signedUrl || data.data.url;
      const originalFilename: string = data.data.originalFilename || file.name;

      // 刷新媒体库并切换到库标签
      await fetchMedia();
      setTab('library');

      // 直接回调，不用再手动点确认
      onSelect(rawUrl, displayUrl, originalFilename);
      onClose();
    } catch (err: any) {
      setUploadError(err.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async () => {
    if (!selected) return;
    const rawUrl = selected.url.split('?')[0];
    const signed = await getSignedUrl(rawUrl);
    onSelect(rawUrl, signed || selected.url, selected.originalFilename || selected.filename);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
      <div className="flex flex-col gap-4" style={{ minHeight: 480 }}>
        <div className="flex border-b border-white/10">
          {(['library', 'upload'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-normal border-b-2 transition-colors ${
                tab === t
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {t === 'library' ? '从媒体库选择' : '上传新文件'}
            </button>
          ))}
        </div>

        {tab === 'library' ? (
          <>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索..."
              className="w-full"
            />

            {loading ? (
              <div className="flex items-center justify-center flex-1 py-10">
                <Spinner size="lg" />
              </div>
            ) : media.length === 0 ? (
              <div className="flex items-center justify-center flex-1 py-10 text-gray-500 text-sm">
                没有媒体资源，请上传新文件
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 overflow-y-auto" style={{ maxHeight: 360 }}>
                {media.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className={`relative cursor-pointer rounded-md overflow-hidden border-2 transition-all ${
                      selected?.id === item.id
                        ? 'border-blue-500 ring-2 ring-blue-500/30'
                        : 'border-transparent hover:border-white/20'
                    }`}
                    style={{ background: 'var(--color-card)' }}
                  >
                    <div className="aspect-square flex items-center justify-center">
                      {isImageType(item.type) ? (
                        <img
                          src={item.thumbUrl || item.url}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1 p-2">
                          <svg className="w-8 h-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="text-xs text-gray-400 text-center truncate w-full px-1">
                            {item.filename?.split('.').pop()?.toUpperCase() || TYPE_LABELS[item.type] || item.type}
                          </span>
                        </div>
                      )}
                    </div>
                    {selected?.id === item.id && (
                      <div className="absolute top-1 right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1.5 py-1 space-y-0.5">
                      <p className="text-xs text-white truncate leading-tight">
                        {item.originalFilename || item.filename || (TYPE_LABELS[item.type] || item.type)}
                      </p>
                      <p className="text-xs text-white/60 truncate leading-tight">
                        {new Date(item.createdAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selected && (
              <div className="flex items-center gap-3 p-3 rounded-md bg-white/5 text-sm text-gray-300">
                <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="truncate flex-1">{selected.title}</span>
                {selected.filesize && <span className="text-gray-500">{formatFileSize(selected.filesize)}</span>}
                {selected.width && selected.height && (
                  <span className="text-gray-500">{selected.width}×{selected.height}</span>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-auto pt-2 border-t border-white/10">
              <Button variant="ghost" onClick={onClose}>取消</Button>
              <Button onClick={handleConfirm} disabled={!selected}>
                确认选择
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col flex-1 w-full gap-4">
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = '';
              }}
            />
            <div
              className="w-full flex-1 border-2 border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-blue-500/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Spinner size="lg" />
              ) : (
                <>
                  <svg className="w-10 h-10 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-gray-400">点击选择文件</p>
                  <p className="text-xs text-gray-600">{accept}</p>
                </>
              )}
            </div>
            {uploadError && (
              <p className="text-sm text-red-400">{uploadError}</p>
            )}
            <Button variant="ghost" onClick={onClose}>取消</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
