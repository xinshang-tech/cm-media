'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui';

export interface Segment {
  start: number;
  end: number;
  at: string;
}

export interface ViewTarget {
  user: { id: number; username: string; nickname: string; avatarUrl: string | null };
  videoId: number | null;
  videoUuid: string;
  videoTitle: string;
  lastPosition: number;
  totalDuration: number;
  actualDuration: number | null;
  viewCount: number;
  lastViewedAt: string;
}

export function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatRelativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}天前`;
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

export function SegmentBar({
  segments,
  duration,
  onSeek,
  currentTime,
}: {
  segments: Segment[];
  duration: number;
  onSeek?: (t: number) => void;
  currentTime?: number;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  if (duration <= 0) return <div className="text-xs text-gray-500">无时长信息</div>;

  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const seg of sorted) {
    if (merged.length === 0 || seg.start > merged[merged.length - 1].end) {
      merged.push({ start: seg.start, end: seg.end });
    } else {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, seg.end);
    }
  }

  const watched = merged.reduce((acc, s) => acc + (s.end - s.start), 0);
  const pct = Math.min(100, Math.round((watched / duration) * 100));

  const handleBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek || !barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(duration, ratio * duration)));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{segments.length} 个片段，已看 {pct}%（{formatTime(watched)} / {formatTime(duration)}）</span>
      </div>
      <div
        ref={barRef}
        className={`relative h-6 bg-gray-800 rounded overflow-hidden ${onSeek ? 'cursor-pointer' : ''}`}
        onClick={handleBarClick}
      >
        {merged.map((seg, i) => (
          <div
            key={i}
            className="absolute top-0 h-full bg-[#ae1a20]/60"
            style={{
              left: `${(seg.start / duration) * 100}%`,
              width: `${((seg.end - seg.start) / duration) * 100}%`,
            }}
          />
        ))}
        {sorted.map((seg, i) => {
          const leftPct = (seg.start / duration) * 100;
          const widthPct = ((seg.end - seg.start) / duration) * 100;
          return (
            <div
              key={i}
              title={`${formatTime(seg.start)} → ${formatTime(seg.end)}${onSeek ? '，点击跳转' : ''}`}
              className={`absolute top-0 h-full bg-[#ae1a20] transition-colors ${onSeek ? 'hover:bg-[#d42029] cursor-pointer' : ''}`}
              style={{ left: `${leftPct}%`, minWidth: '4px', width: `${widthPct}%` }}
              onClick={e => { if (!onSeek) return; e.stopPropagation(); onSeek(seg.start); }}
            />
          );
        })}
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(p => (
          <div key={p} className="absolute top-0 h-full w-px bg-gray-600/40 pointer-events-none" style={{ left: `${p}%` }} />
        ))}
        {currentTime !== undefined && currentTime > 0 && (
          <div
            className="absolute top-0 h-full w-0.5 bg-white/80 pointer-events-none"
            style={{ left: `${Math.min(100, (currentTime / duration) * 100)}%` }}
          />
        )}
      </div>
      <div className="flex justify-between text-xs text-gray-600">
        <span>0:00</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = () => resolve(); s.onerror = reject;
    document.head.appendChild(s);
  });
}
function loadCss(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href;
  document.head.appendChild(l);
}

export default function ViewSegmentsModal({ target, onClose }: { target: ViewTarget; onClose: () => void }) {
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const playerRef = useRef<any>(null);
  const hlsRef = useRef<any>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!target.videoId) { setSegments([]); setLoading(false); return; }
    api.get<{ data: Segment[] }>(`/admin/view-records/segments?userId=${target.user.id}&videoId=${target.videoId}`)
      .then(res => setSegments(res.data))
      .catch(() => setSegments([]))
      .finally(() => setLoading(false));
  }, [target]);

  useEffect(() => {
    if (!target.videoId) return;
    api.get<{ video: { vodVideo?: { vodVideoId?: string; videoUrl?: string } } }>(`/videos/${target.videoUuid}`)
      .then(async res => {
        const vod = res.video?.vodVideo;
        if (vod?.vodVideoId) {
          try {
            const r = await api.get<{ data: { playURL?: string } }>(`/aliyun/video-info/${vod.vodVideoId}`);
            if (r.data?.playURL) { setVideoSrc(r.data.playURL); return; }
          } catch {}
        }
        if (vod?.videoUrl) setVideoSrc(vod.videoUrl);
      })
      .catch(() => {});
  }, [target]);

  useEffect(() => {
    if (!videoSrc || !videoElRef.current) return;
    let destroyed = false;
    (async () => {
      const videoEl = videoElRef.current;
      if (!videoEl) return;

      const isHls = videoSrc.includes('.m3u8');
      if (isHls) {
        const { default: Hls } = await import('hls.js');
        if (destroyed || !videoElRef.current) return;
        if (Hls.isSupported()) {
          const hls = new Hls();
          hlsRef.current = hls;
          hls.loadSource(videoSrc);
          hls.attachMedia(videoEl);
        } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
          videoEl.src = videoSrc;
        }
      } else {
        videoEl.src = videoSrc;
      }

      loadCss('/css/plyr.css');
      await loadScript('/js/plyr.js');
      if (destroyed || !videoElRef.current) return;
      const Plyr = (window as any).Plyr;
      const player = new Plyr(videoElRef.current, {
        iconUrl: '/images/plyr.svg',
        controls: ['play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
        storage: { enabled: false },
      });
      playerRef.current = player;
      player.on('timeupdate', () => setCurrentTime(player.currentTime ?? 0));
    })();
    return () => {
      destroyed = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
      hlsRef.current?.destroy?.();
      hlsRef.current = null;
    };
  }, [videoSrc]);

  const seekTo = useCallback((t: number) => {
    if (playerRef.current) {
      playerRef.current.currentTime = t;
      playerRef.current.play?.();
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-xl border border-border overflow-hidden"
        style={{ background: 'var(--color-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        {videoSrc ? (
          <div className="bg-black">
            <video ref={videoElRef} className="w-full aspect-video" playsInline />
          </div>
        ) : (
          <div className="bg-black aspect-video flex items-center justify-center text-gray-600 text-sm">
            {target.videoId ? '加载播放地址…' : '无关联视频'}
          </div>
        )}

        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white leading-snug">{target.videoTitle}</h2>
              <p className="text-sm text-gray-400 mt-0.5">
                {target.user.nickname || target.user.username} · 共看 {target.viewCount} 次 · 最后 {formatRelativeTime(target.lastViewedAt)}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white mt-0.5 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex gap-3 text-sm">
            <div className="flex-1 bg-black/20 rounded-lg p-3 space-y-1">
              <p className="text-gray-500 text-xs">最后停留</p>
              <p className="text-white font-mono">{formatTime(target.lastPosition)}</p>
            </div>
            <div className="flex-1 bg-black/20 rounded-lg p-3 space-y-1">
              <p className="text-gray-500 text-xs">视频时长</p>
              <p className="text-white font-mono">{target.actualDuration ? formatTime(target.actualDuration) : target.totalDuration > 0 ? formatTime(target.totalDuration) : '未知'}</p>
            </div>
            <div className="flex-1 bg-black/20 rounded-lg p-3 space-y-1">
              <p className="text-gray-500 text-xs">播放次数</p>
              <p className="text-white font-mono">{target.viewCount}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-3">观看区段（点击区段可跳转播放）</p>
            {loading ? (
              <div className="flex justify-center py-6"><Spinner size="sm" /></div>
            ) : segments && segments.length > 0 ? (
              <SegmentBar
                segments={segments}
                duration={target.actualDuration || Math.max(target.totalDuration, ...segments.map(s => s.end))}
                onSeek={videoSrc ? seekTo : undefined}
                currentTime={currentTime}
              />
            ) : (
              <div className="text-sm text-gray-500 py-4 text-center">暂无片段数据</div>
            )}
          </div>

          {segments && segments.length > 0 && (
            <div className="max-h-36 overflow-y-auto space-y-1">
              <p className="text-xs text-gray-500 mb-2">原始片段记录</p>
              {[...segments].sort((a, b) => a.start - b.start).map((seg, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 text-xs font-mono rounded px-1.5 py-0.5 transition-colors ${videoSrc ? 'cursor-pointer hover:bg-white/5 text-gray-400' : 'text-gray-400'}`}
                  onClick={() => videoSrc && seekTo(seg.start)}
                >
                  <span className="w-5 text-gray-600">{i + 1}</span>
                  <span>{formatTime(seg.start)}</span>
                  <span className="text-gray-600">→</span>
                  <span>{formatTime(seg.end)}</span>
                  <span className="text-gray-600 ml-auto">{new Date(seg.at).toLocaleString('zh-CN')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
