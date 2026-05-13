'use client';

import Link from 'next/link';
import { useState, useRef, useEffect, useCallback } from 'react';

interface VodVideoInfo {
  videoWidth: number | null;
  videoHeight: number | null;
  videoDuration: string | null;
}

interface PreviewVodVideo {
  videoUrl?: string | null;
}

interface Video {
  id: number;
  uuid: string;
  title: string;
  posterUrl?: string | null;
  vodVideo?: VodVideoInfo | null;
  previewVodVideo?: PreviewVodVideo | null;
  viewCount: number;
  publishedAt: string | null;
}

function getQualityLabel(height: number | null): { label: string; className: string } {
  if (!height) return { label: '', className: '' };
  if (height >= 2160) return { label: '4K', className: 'bg-purple-600/90 text-white' };
  if (height >= 1080) return { label: '1080P', className: 'bg-blue-600/90 text-white' };
  if (height >= 720) return { label: '720P', className: 'bg-green-600/90 text-white' };
  return { label: '480P', className: 'bg-gray-600/90 text-white' };
}

function formatDuration(duration: string | null): string {
  if (!duration) return '';
  const parts = duration.split(':');
  if (parts.length === 3) {
    const [h, m, s] = parts;
    if (h === '00') return `${parseInt(m)}:${s}`;
    return `${parseInt(h)}:${m}:${s}`;
  }
  return duration;
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

function parseDurationToSeconds(duration: string | null): number {
  if (!duration) return 0;
  const parts = duration.split(':');
  if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  }
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(duration) || 0;
}

export default function VideoCard({ video }: { video: Video }) {
  const posterUrl = video.posterUrl || null;
  const videoWidth = video.vodVideo?.videoWidth || null;
  const videoHeight = video.vodVideo?.videoHeight || null;
  const videoDuration = video.vodVideo?.videoDuration || null;
  const previewUrl = video.previewVodVideo?.videoUrl || null;
  const aspectStyle = videoWidth && videoHeight
    ? { aspectRatio: `${videoWidth}/${videoHeight}` }
    : undefined;

  const quality = getQualityLabel(videoHeight);
  const [imageError, setImageError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isTouchDevice = useRef<boolean>(false);
  const playTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isTouchDevice.current = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }, []);

  const startPreview = useCallback(() => {
    if (!previewUrl || !videoRef.current) return;
    const video = videoRef.current;
    const totalSecs = parseDurationToSeconds(videoDuration);
    if (totalSecs > 5) {
      // random start within first 80% of video, leaving at least 5s to play
      const maxStart = totalSecs * 0.8;
      video.currentTime = Math.random() * maxStart;
    } else {
      video.currentTime = 0;
    }
    video.play().catch(() => {});
    setIsPlaying(true);
  }, [previewUrl, videoDuration]);

  const stopPreview = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    videoRef.current.currentTime = 0;
    setIsPlaying(false);
    setVideoReady(false);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (isTouchDevice.current) return;
    playTimeoutRef.current = setTimeout(() => startPreview(), 200);
  }, [startPreview]);

  const handleMouseLeave = useCallback(() => {
    if (isTouchDevice.current) return;
    if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
    stopPreview();
  }, [stopPreview]);

  // Mobile: IntersectionObserver for middle 80% zone
  useEffect(() => {
    if (!previewUrl) return;

    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!isTouchDevice.current) return;
        const entry = entries[0];
        if (entry.isIntersecting) {
          startPreview();
        } else {
          if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
          stopPreview();
        }
      },
      {
        // middle 80%: top margin 10vh, bottom margin 10vh
        rootMargin: '-10% 0px -10% 0px',
        threshold: 0.5,
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [previewUrl, startPreview, stopPreview]);

  useEffect(() => {
    return () => {
      if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
    };
  }, []);

  return (
    <Link href={`/watch/${video.uuid}`}>
      <div
        ref={cardRef}
        className="group cursor-pointer"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="relative rounded-md overflow-hidden bg-card" style={aspectStyle ?? { aspectRatio: '16/9' }}>
          {posterUrl && !imageError ? (
            <img
              src={posterUrl}
              alt={video.title}
              className={`w-full h-full object-cover transition-all duration-300 group-hover:scale-105 ${isPlaying && videoReady ? 'opacity-0' : 'opacity-100'}`}
              loading="lazy"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className={`w-full h-full flex items-center justify-center bg-card transition-opacity duration-300 ${isPlaying && videoReady ? 'opacity-0' : 'opacity-100'}`}>
              <svg className="w-12 h-12 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
          )}

          {previewUrl && (
            <video
              ref={videoRef}
              src={previewUrl}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isPlaying && videoReady ? 'opacity-100' : 'opacity-0'}`}
              muted
              playsInline
              loop
              preload="none"
              onCanPlay={() => setVideoReady(true)}
            />
          )}

          {/* 播放按钮悬浮效果（无预览视频时才显示） */}
          {!previewUrl && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
              <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center transform scale-75 group-hover:scale-100 transition-transform">
                <svg className="w-6 h-6 text-black ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          )}

          {videoDuration && (
            <div className="tag-overlay absolute bottom-2 right-2 px-2 py-1 bg-black/80 rounded-md text-xs font-normal text-white backdrop-blur-sm font-mono">
              {formatDuration(videoDuration)}
            </div>
          )}

          {quality.label && (
            <div className={`tag-overlay absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-normal backdrop-blur-sm ${quality.className}`}>
              {quality.label}
            </div>
          )}

        </div>

        <div className="mt-2 px-1">
          <h3 className="text-base font-normal text-white line-clamp-2 group-hover:text-blue-400 transition-colors leading-snug">
            {video.title}
          </h3>
          <p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
            {video.viewCount > 0 && (
              <>
                <span className="font-mono">{video.viewCount.toLocaleString()} 次播放</span>
                {video.publishedAt && <span>·</span>}
              </>
            )}
            {video.publishedAt && <span className="font-mono">{timeAgo(video.publishedAt)}</span>}
          </p>
        </div>
      </div>
    </Link>
  );
}

export { VideoCard };
export type { Video };
