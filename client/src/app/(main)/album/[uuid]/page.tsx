'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui';

interface Photo {
  id: number;
  url: string;
  thumbnailUrl?: string | null;
  width?: number | null;
  height?: number | null;
}

interface Album {
  id: number;
  uuid: string;
  title: string;
  content?: string | null;
  coverUrl?: string | null;
  viewCount: number;
  publishedAt: string | null;
  categories: { category: { id: number; name: string; slug: string } }[];
  photos: Photo[];
}

export default function AlbumDetailPage() {
  const params = useParams();
  const router = useRouter();
  const uuid = params.uuid as string;

  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lightboxRef = useRef<any>(null);

  // 加载 PhotoSwipe
  useEffect(() => {
    if (document.getElementById('photoswipe-css')) return;
    const link = document.createElement('link');
    link.id = 'photoswipe-css';
    link.rel = 'stylesheet';
    link.href = '/css/photoswipe.min.css';
    document.head.appendChild(link);

    const loadScript = (src: string) => new Promise<void>((resolve) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      document.head.appendChild(s);
    });
    loadScript('/js/photoswipe.umd.min.js').then(() =>
      loadScript('/js/photoswipe-lightbox.umd.min.js')
    );
  }, []);

  useEffect(() => {
    const fetchAlbum = async () => {
      try {
        setLoading(true);
        const res = await api.get<{ album: Album }>(`/photos/${uuid}`);
        setAlbum(res.album);

        api.post(`/photos/${uuid}/view`).catch(() => {});
      } catch (err: any) {
        setError(err.message || '加载失败');
      } finally {
        setLoading(false);
      }
    };

    fetchAlbum();
  }, [uuid]);

  // 初始化 PhotoSwipe
  useEffect(() => {
    if (!album || album.photos.length === 0) return;

    const initPhotoSwipe = () => {
      const PSL = (window as any).PhotoSwipeLightbox;
      if (!PSL) {
        setTimeout(initPhotoSwipe, 100);
        return;
      }

      if (lightboxRef.current) {
        lightboxRef.current.destroy();
      }

      const lightbox = new PSL({
        gallery: '#album-gallery',
        children: 'a[data-pswp-width]',
        pswpModule: (window as any).PhotoSwipe,
        bgOpacity: 0.95,
        showHideAnimationType: 'fade',
      });

      lightbox.init();
      lightboxRef.current = lightbox;
    };

    initPhotoSwipe();

    return () => {
      if (lightboxRef.current) {
        lightboxRef.current.destroy();
        lightboxRef.current = null;
      }
    };
  }, [album]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !album) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <svg className="w-16 h-16 text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <p className="text-gray-400 text-lg">{error || '相册不存在'}</p>
        <button
          onClick={() => router.push('/')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          返回首页
        </button>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-8">
      <div className="container-responsive pb-6">
        <h1 className="text-2xl font-semibold text-white mb-2">{album.title}</h1>

        {album.categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {album.categories.map((cat) => (
              <a
                key={cat.category.id}
                href={`/categories/${cat.category.slug}`}
                className="px-2 py-0.5 bg-white/10 rounded-full text-xs text-gray-400 hover:text-white hover:bg-white/20 transition-colors"
              >
                {cat.category.name}
              </a>
            ))}
          </div>
        )}

        {album.content && (
          <p className="text-gray-400 text-sm mb-3 max-w-2xl">{album.content}</p>
        )}

        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="font-mono">{album.photos.length} 张图片</span>
          {album.viewCount > 0 && (
            <span className="font-mono">{album.viewCount.toLocaleString()} 次浏览</span>
          )}
          {album.publishedAt && (
            <span className="font-mono">
              {new Date(album.publishedAt).toLocaleDateString('zh-CN')}
            </span>
          )}
        </div>
      </div>

      <div className="container-responsive">
        {album.photos.length > 0 ? (
          <div id="album-gallery" className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 gap-3">
            {album.photos.map((photo, index) => (
              <a
                key={photo.id}
                href={photo.url}
                data-pswp-width={photo.width || 1200}
                data-pswp-height={photo.height || 800}
                target="_blank"
                rel="noopener noreferrer"
                className="block mb-3 break-inside-avoid group"
              >
                <div className="relative rounded-md overflow-hidden bg-gray-800">
                  <img
                    src={photo.thumbnailUrl || photo.url}
                    alt={`${album.title} - ${index + 1}`}
                    className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            <svg className="w-16 h-16 text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-400 text-lg">暂无图片</p>
            <p className="text-gray-500 text-sm mt-1">相册还没有上传图片</p>
          </div>
        )}
      </div>
    </div>
  );
}
