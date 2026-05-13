'use client';

import Link from 'next/link';
import { useState } from 'react';

interface Album {
  id: number;
  uuid: string;
  title: string;
  coverUrl?: string | null;
  viewCount: number;
  publishedAt: string | null;
  photoCount?: number;
}

function timeAgo(date: string | null): string {
  if (!date) return '';
  const now = Date.now();
  const d = new Date(date).getTime();
  const diff = now - d;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;
  return new Date(date).toLocaleDateString('zh-CN');
}

export default function AlbumCard({ album }: { album: Album }) {
  const [imageError, setImageError] = useState(false);

  return (
    <Link href={`/album/${album.uuid}`}>
      <div className="group cursor-pointer">
        <div className="relative rounded-md overflow-hidden bg-card aspect-video">
          {album.coverUrl && !imageError ? (
            <img
              src={album.coverUrl}
              alt={album.title}
              className="w-full h-full object-cover transition-all duration-300 group-hover:scale-105"
              loading="lazy"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-card">
              <svg className="w-12 h-12 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}

          <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center transform scale-75 group-hover:scale-100 transition-transform">
              <svg className="w-8 h-8 text-gray-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>

          <div className="tag-overlay absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-normal backdrop-blur-sm bg-purple-600/90 text-white flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            相册
          </div>

          {album.photoCount !== undefined && album.photoCount > 0 && (
            <div className="tag-overlay absolute bottom-2 right-2 px-2 py-1 bg-black/80 rounded-md text-xs font-normal text-white backdrop-blur-sm font-mono">
              {album.photoCount} 张
            </div>
          )}
        </div>

        <div className="mt-2 px-1">
          <h3 className="text-base font-normal text-white line-clamp-2 group-hover:text-blue-400 transition-colors leading-snug">
            {album.title}
          </h3>
          <p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
            {album.viewCount > 0 && (
              <>
                <span className="font-mono">{album.viewCount.toLocaleString()} 次浏览</span>
                {album.publishedAt && <span>·</span>}
              </>
            )}
            {album.publishedAt && <span className="font-mono">{timeAgo(album.publishedAt)}</span>}
          </p>
        </div>
      </div>
    </Link>
  );
}

export type { Album };
