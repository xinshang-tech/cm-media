'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui';
import type { Video } from '@/components/video/VideoCard';

interface MediaAsset {
  type: 'CAPTION' | 'SPRITE' | 'SPRITE_VTT' | 'COVER';
  url: string;
}

interface PlayQuality {
  definition: string;
  label: string;
  height: number;
  width: number;
  url: string;
  format: string;
  bitrate: number;
}

interface VodVideoDetail {
  id: number;
  vodVideoId: string | null;
  videoUrl: string | null;
  coverUrl?: string | null;
  videoWidth: number | null;
  videoHeight: number | null;
  videoDuration: string | null;
  mediaAssets: MediaAsset[];
}

interface VideoDetail extends Video {
  content: string | null;
  lastPosition: number;
  spriteVttContent?: string | null;
  categories: { id: number; name: string; slug: string }[];
  vodVideo?: VodVideoDetail | null;
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
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return minutes < 1 ? '刚刚' : `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;
  return new Date(date).toLocaleDateString('zh-CN');
}

function RelatedVideoCard({ video }: { video: Video }) {
  const duration = formatDuration(video.vodVideo?.videoDuration || null);
  const [imgError, setImgError] = useState(false);
  const w = video.vodVideo?.videoWidth;
  const h = video.vodVideo?.videoHeight;
  const thumbHeight = w && h ? Math.round(160 * h / w) : 90;

  return (
    <Link href={`/watch/${video.uuid}`}>
      <div className="flex gap-2.5 group py-2">
        <div
          className="relative w-40 shrink-0 rounded-md overflow-hidden bg-gray-800"
          style={{ height: thumbHeight }}
        >
          {video.posterUrl && !imgError ? (
            <img
              src={video.posterUrl}
              alt={video.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          {duration && (
            <div className="tag-overlay absolute bottom-1 right-1 px-1 py-px bg-black/80 rounded !text-[11px] text-white font-mono">
              {duration}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 pt-0.5">
          <h3 className="text-sm text-white line-clamp-2 group-hover:text-blue-400 transition-colors leading-snug">
            {video.title}
          </h3>
          <div className="mt-1.5 space-y-0.5">
            {video.viewCount > 0 && (
              <p className="text-xs text-gray-500 font-mono">{video.viewCount.toLocaleString()} 次播放</p>
            )}
            {video.publishedAt && (
              <p className="text-xs text-gray-500 font-mono">{timeAgo(video.publishedAt)}</p>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function WatchPage() {
  const params = useParams();
  const uuid = params.uuid as string;
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [related, setRelated] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoQualities, setVideoQualities] = useState<PlayQuality[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  const playerRef = useRef<any>(null);
  const hlsRef = useRef<any>(null);
  const posterOverlayRef = useRef<HTMLImageElement>(null);
  const viewRecorded = useRef(false);
  const positionTimer = useRef<NodeJS.Timeout>(null);
  const segStartRef = useRef<number>(0);
  const playedSecondsRef = useRef<number>(0);
  const isSeekingRef = useRef(false);

  useEffect(() => {
    api.get<{ user: { role: string } }>('/auth/me').then(res => {
      if (res.user.role === 'ADMIN') setIsAdmin(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const fetchVideo = async () => {
      try {
        setLoading(true);
        const res = await api.get<{ video: VideoDetail }>(`/videos/${uuid}`);
        console.log('[Sprite Debug] spriteVttContent:', res.video.spriteVttContent ? res.video.spriteVttContent.slice(0, 500) : null);
        console.log('[Sprite Debug] mediaAssets:', res.video.vodVideo?.mediaAssets);
        setVideo(res.video);

        if (res.video.vodVideo?.vodVideoId) {
          try {
            const vodRes = await api.get<{ data: any }>(`/aliyun/video-info/${res.video.vodVideo.vodVideoId}`);
            if (vodRes.data.playURL) {
              setVideoSrc(vodRes.data.playURL);
              setVideoQualities(vodRes.data.qualities || []);
            }
          } catch {
            setVideoSrc(res.video.vodVideo.videoUrl);
          }
        } else {
          setVideoSrc(res.video.vodVideo?.videoUrl || null);
        }

        const relatedRes = await api.get<{ videos: Video[] }>(`/videos/${uuid}/related`);
        setRelated(relatedRes.videos);
      } catch (err: any) {
        setError(err.message || '加载失败');
      } finally {
        setLoading(false);
      }
    };
    fetchVideo();
  }, [uuid]);

  // 初始化播放器（Plyr + hls.js）
  useEffect(() => {
    if (loading || !video || !videoSrc) return;

    let destroyed = false;
    let spriteVttBlob: string | null = null;

    const init = async () => {
      if (destroyed) return;

      const videoEl = document.getElementById('player') as HTMLVideoElement;
      if (!videoEl) return;

      // 客户端拼装雪碧图 VTT：把图片路径替换为签名的绝对 OSS URL
      let spriteVtt: string | null = null;
      const vttAssetUrl = video.vodVideo?.mediaAssets?.find((a: MediaAsset) => a.type === 'SPRITE_VTT')?.url;
      const spriteAssetUrl = video.vodVideo?.mediaAssets?.find((a: MediaAsset) => a.type === 'SPRITE')?.url;
      if (vttAssetUrl && spriteAssetUrl) {
        try {
          const vttResp = await fetch(vttAssetUrl);
          if (vttResp.ok) {
            let vttText = await vttResp.text();
            console.log('[Sprite Debug] VTT raw (first 300):', vttText.slice(0, 300));
            // 将 VTT 里的图片引用替换为签名的绝对 OSS URL
            vttText = vttText.replace(/^(\S+\.(webp|png|jpg|jpeg))(.*)$/gm, (_m, _file, _ext, rest) => spriteAssetUrl + rest);
            console.log('[Sprite Debug] VTT after replace (first 300):', vttText.slice(0, 300));
            const vttBlobUrl = URL.createObjectURL(new Blob([vttText], { type: 'text/vtt' }));
            spriteVttBlob = vttBlobUrl;
            spriteVtt = vttBlobUrl;
          } else {
            console.warn('[Sprite Debug] VTT fetch failed:', vttResp.status);
          }
        } catch (e) {
          console.warn('[Sprite Debug] fetch error:', e);
        }
      }
      const captionUrl = video.vodVideo?.mediaAssets?.find(a => a.type === 'CAPTION')?.url || null;

      const isHlsSrc = videoQualities.some(q => q.format === 'm3u8') || videoSrc.includes('.m3u8');
      // 阿里云每个清晰度是独立 m3u8，按分辨率降序排列
      const hlsQualities = videoQualities
        .filter(q => q.format === 'm3u8' && q.url && q.height > 0)
        .sort((a, b) => b.height - a.height);
      const primaryHlsUrl = hlsQualities[0]?.url || videoSrc;
      const mp4Qualities = videoQualities.filter(q => q.format !== 'm3u8' && q.url && q.height > 0);

      let HlsClass: any = null;

      if (isHlsSrc) {
        const { default: Hls } = await import('hls.js');
        HlsClass = Hls;
        if (Hls.isSupported()) {
          const hls = new Hls({ startLevel: -1 });
          hlsRef.current = hls;
          hls.loadSource(primaryHlsUrl);
          hls.attachMedia(videoEl);

          await new Promise<void>(resolve => {
            hls.on(Hls.Events.MANIFEST_PARSED, () => resolve());
            setTimeout(resolve, 8000);
          });

          if (destroyed) {
            hls.destroy();
            hlsRef.current = null;
            return;
          }
        } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
          videoEl.src = primaryHlsUrl;
        }
      }

      // URL 切换函数：销毁旧 hls 实例，用新 URL 重建
      const switchHlsUrl = (targetUrl: string) => {
        if (!videoEl || !HlsClass || !HlsClass.isSupported()) return;
        const currentTime = videoEl.currentTime;
        const wasPaused = videoEl.paused;
        if (hlsRef.current) hlsRef.current.destroy();
        const newHls = new HlsClass({ startLevel: -1 });
        hlsRef.current = newHls;
        newHls.loadSource(targetUrl);
        newHls.attachMedia(videoEl);
        newHls.once(HlsClass.Events.MANIFEST_PARSED, () => {
          videoEl.currentTime = currentTime;
          if (!wasPaused) videoEl.play().catch(() => {});
        });
      };

      const i18n = {
        restart: '重新播放', rewind: '后退 {seektime} 秒', play: '播放', pause: '暂停',
        fastForward: '快进 {seektime} 秒', seek: '跳转', seekLabel: '{currentTime} / {duration}',
        played: '已播放', buffered: '已缓冲', currentTime: '当前时间', duration: '总时长',
        volume: '音量', mute: '静音', unmute: '取消静音',
        enableCaptions: '启用字幕', disableCaptions: '禁用字幕',
        enterFullscreen: '进入全屏', exitFullscreen: '退出全屏',
        captions: '字幕', settings: '设置', speed: '倍速', normal: '正常',
        quality: '画质', loop: '循环', reset: '重置', disabled: '已禁用', enabled: '已启用',
        qualityBadge: { 2160: '4K', 1440: 'HD', 1080: 'HD', 720: 'HD', 576: 'SD', 480: 'SD' },
      };

      const plyrConfig: any = {
        blankVideo: '/video/blank.mp4',
        iconUrl: '/images/plyr.svg',
        controls: ['play-large', 'play', 'progress', 'current-time', 'captions', 'settings', 'fullscreen'],
        settings: ['captions', 'speed'],
        captions: { active: !!captionUrl, language: 'zh', update: false },
        previewThumbnails: spriteVtt ? { enabled: true, src: [spriteVtt] } : { enabled: false },
        storage: { enabled: true, key: 'cm-fv-player' },
        i18n,
      };

      if (isHlsSrc && hlsQualities.length > 0) {
        plyrConfig.settings = ['captions', 'speed', 'quality'];
        plyrConfig.quality = {
          default: hlsQualities[0].height,
          options: hlsQualities.map(q => q.height),
          forced: true,
          onChange: (selectedHeight: number) => {
            const target = hlsQualities.find(q => q.height === selectedHeight) || hlsQualities[0];
            switchHlsUrl(target.url);
          },
        };
      }

      if (!isHlsSrc && mp4Qualities.length > 1) {
        plyrConfig.settings = ['captions', 'speed', 'quality'];
        plyrConfig.quality = {
          default: mp4Qualities[0].height,
          options: mp4Qualities.map(q => q.height),
        };
      }

      const player: any = new Plyr(videoEl, plyrConfig);
      playerRef.current = player;

      // Overlay covers the DOM manipulation flash during Plyr init; hide it once ready
      player.once('ready', () => {
        if (posterOverlayRef.current) posterOverlayRef.current.style.opacity = '0';
      });

      if (isHlsSrc) {
        // hls.js 已经 attachMedia，或 Safari 已设置 src，Plyr 直接包装即可
        player.once('ready', () => {
          if (video.lastPosition > 0) player.currentTime = video.lastPosition;
        });
      } else if (mp4Qualities.length > 1) {
        // 多画质 MP4：通过 player.source 注入所有画质，Plyr 自动切换
        player.source = {
          type: 'video',
          sources: mp4Qualities.map(q => ({
            src: q.url,
            type: 'video/mp4',
            size: q.height,
          })),
        };
        player.once('ready', () => {
          if (video.lastPosition > 0) player.currentTime = video.lastPosition;
        });
      } else {
        videoEl.src = videoSrc;
        player.once('ready', () => {
          if (video.lastPosition > 0) player.currentTime = video.lastPosition;
        });
      }

      const MAX_SEG_GAP = 7;

      const recordSegment = (segStart: number, segEnd: number, position: number, countView: boolean) => {
        if (isSeekingRef.current || segEnd - segStart > MAX_SEG_GAP) return;
        api.post(`/videos/${uuid}/view`, { position, segStart, segEnd, countView }).catch(() => {});
      };

      const startTimer = () => {
        if (positionTimer.current) return;
        segStartRef.current = player.currentTime;
        positionTimer.current = setInterval(() => {
          const segEnd = player.currentTime;
          playedSecondsRef.current += 3;
          const countView = !viewRecorded.current && playedSecondsRef.current >= 3;
          if (countView) viewRecorded.current = true;
          recordSegment(segStartRef.current, segEnd, segEnd, countView);
          segStartRef.current = segEnd;
        }, 3000);
      };

      const stopTimer = (savePosition = true) => {
        if (positionTimer.current) {
          clearInterval(positionTimer.current);
          positionTimer.current = null;
        }
        if (savePosition) {
          recordSegment(segStartRef.current, player.currentTime, player.currentTime, false);
        }
      };

      player.on('play', () => {
        if (posterOverlayRef.current) posterOverlayRef.current.style.opacity = '0';
        startTimer();
      });
      player.on('pause', () => stopTimer(true));
      player.on('ended', () => stopTimer(true));
      player.on('seeking', () => {
        isSeekingRef.current = true;
        segStartRef.current = player.currentTime;
      });
      player.on('seeked', () => {
        isSeekingRef.current = false;
        segStartRef.current = player.currentTime;
      });
    };

    init();

    return () => {
      destroyed = true;
      if (spriteVttBlob) URL.revokeObjectURL(spriteVttBlob);
      if (positionTimer.current) clearInterval(positionTimer.current);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [loading, video, videoSrc, videoQualities, uuid]);

  if (loading) {
    return (
      <div className="pb-8">
        <div className="lg:max-w-[1400px] lg:mx-auto lg:px-4 lg:pt-4 lg:flex lg:gap-6 lg:items-start">
          <div className="lg:flex-1 lg:min-w-0">
            <div className="w-full overflow-hidden skeleton" style={{ aspectRatio: '16/9' }}>
              <div className="w-full h-full flex items-center justify-center">
                <Spinner size="lg" />
              </div>
            </div>
            <div className="px-4 py-3 space-y-2">
              <div className="h-6 skeleton rounded w-2/3" />
              <div className="h-4 skeleton rounded w-1/4" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-500">
        {error || '视频不存在'}
      </div>
    );
  }

  const posterUrl = video.posterUrl || video.vodVideo?.coverUrl || null;
  const captionUrl = video.vodVideo?.mediaAssets?.find(a => a.type === 'CAPTION')?.url || null;
  const rawDuration = video.vodVideo?.videoDuration || null;
  const videoDuration = rawDuration && rawDuration !== '00:00:00'
    ? (() => {
        const parts = rawDuration.split(':');
        if (parts.length === 3) {
          const [h, m, s] = parts;
          return h === '00' ? `${parseInt(m)}:${s}` : `${parseInt(h)}:${m}:${s}`;
        }
        return rawDuration;
      })()
    : null;

  return (
    <div className="pb-8">
      <div className="lg:max-w-[1400px] lg:mx-auto lg:px-4 lg:pt-4 lg:flex lg:gap-6 lg:items-start">

        <div className="lg:flex-1 lg:min-w-0">
          <div
            className="w-full bg-neutral-800 overflow-hidden relative"
            style={{
              aspectRatio: video.vodVideo?.videoWidth && video.vodVideo?.videoHeight
                ? `${video.vodVideo.videoWidth}/${video.vodVideo.videoHeight}`
                : '16/9',
            }}
          >
            <video
              id="player"
              crossOrigin="anonymous"
              playsInline
              preload="metadata"
              poster={posterUrl || undefined}
            >
              {captionUrl && (
                <track kind="captions" src={captionUrl} srcLang="zh" label="中文字幕" default />
              )}
            </video>
            {posterUrl && (
              <img
                ref={posterOverlayRef}
                src={posterUrl}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                style={{ transition: 'opacity 0.3s ease' }}
              />
            )}
          </div>

          <div className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-lg font-semibold text-white">{video.title}</h1>
              {isAdmin && (
                <Link
                  href={`/admin/videos/${video.id}`}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-surface-hover border border-border rounded-md text-xs text-muted hover:text-foreground transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  编辑
                </Link>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
              <span className="font-mono">{video.viewCount} 次播放</span>
              {videoDuration && (
                <>
                  <span>·</span>
                  <span className="font-mono">{videoDuration}</span>
                </>
              )}
            </div>

            {video.categories.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {video.categories.map((cat) => (
                  <a
                    key={cat.id}
                    href={`/categories/${cat.slug}`}
                    className="px-3 py-1 bg-surface hover:bg-surface-hover border border-border rounded-full text-xs text-muted hover:text-foreground transition-colors"
                  >
                    {cat.name}
                  </a>
                ))}
              </div>
            )}

            {video.content && (
              <div className="mt-4 p-3 bg-gray-900 rounded-md">
                <p className="text-xs text-gray-400 whitespace-pre-wrap">{video.content}</p>
              </div>
            )}
          </div>

          {related.length > 0 && (
            <div className="lg:hidden px-4 mt-2">
              <h2 className="text-base font-semibold text-white mb-1">相关视频</h2>
              <div className="divide-y divide-gray-800">
                {related.map((v) => (
                  <RelatedVideoCard key={v.uuid} video={v} />
                ))}
              </div>
            </div>
          )}
        </div>

        {related.length > 0 && (
          <div className="hidden lg:block w-80 shrink-0">
            <h2 className="text-sm font-semibold text-white mb-1">相关视频</h2>
            <div className="divide-y divide-gray-800">
              {related.map((v) => (
                <RelatedVideoCard key={v.uuid} video={v} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
