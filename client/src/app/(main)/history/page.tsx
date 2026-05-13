'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui';

interface HistoryItem {
  uuid: string | null;
  title: string;
  posterUrl: string | null;
  lastPosition: number;
  totalDuration: number;
  viewCount: number;
  lastViewedAt: string;
  videoExists: boolean;
  videoDuration: string | null;
  videoHeight: number | null;
  videoWidth: number | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function formatDuration(raw: string | null): string | null {
  if (!raw || raw === '00:00:00') return null;
  const parts = raw.split(':');
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h === '00' ? `${parseInt(m)}:${s}` : `${parseInt(h)}:${m}:${s}`;
  }
  return raw;
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}秒`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m < 60) return `${m}分${s > 0 ? s + '秒' : ''}`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}小时${rem > 0 ? rem + '分' : ''}`;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

function qualityLabel(height: number | null): string | null {
  if (!height) return null;
  if (height >= 2160) return '4K';
  if (height >= 1080) return '1080P';
  if (height >= 720) return '720P';
  if (height >= 480) return '480P';
  return null;
}

function HistoryCard({ item }: { item: HistoryItem }) {
  const duration = formatDuration(item.videoDuration);
  const quality = qualityLabel(item.videoHeight);
  const progressPct = duration && item.lastPosition > 0
    ? Math.min(100, (item.lastPosition / (item.totalDuration || 1)) * 100)
    : 0;

  const aspectRatio = item.videoWidth && item.videoHeight
    ? item.videoWidth / item.videoHeight
    : 16 / 9;
  const thumbWidth = 128;
  const thumbHeight = Math.round(thumbWidth / aspectRatio);

  const cardContent = (
      <div className={`flex gap-3 p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] transition-colors ${item.videoExists ? 'hover:bg-[var(--color-card-hover)] cursor-pointer' : 'opacity-60'}`}>
      <div
        className="relative flex-shrink-0 rounded-md overflow-hidden bg-gray-800"
        style={{ width: thumbWidth, height: thumbHeight }}
      >
        {item.posterUrl ? (
          <img
            src={item.posterUrl}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {item.videoExists ? (
              <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
          </div>
        )}
        {duration && (
          <span className="absolute bottom-1 right-1 bg-black/70 text-white !text-[10px] px-1 rounded font-mono">
            {duration}
          </span>
        )}
        {quality && (
          <span className="absolute top-1 left-1 bg-black/70 text-white !text-[10px] px-1 rounded font-mono">
            {quality}
          </span>
        )}
        {item.lastPosition > 0 && item.videoExists && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-700">
            <div className="h-full bg-red-500" style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          <p className="text-sm text-white line-clamp-2 leading-snug">{item.title}</p>
          {!item.videoExists && (
            <span className="inline-block mt-1 text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">已删除</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
          <span>{formatRelativeTime(item.lastViewedAt)}</span>
          {item.lastPosition > 0 && (
            <span>看到 {formatSeconds(item.lastPosition)}</span>
          )}
          {item.viewCount > 1 && (
            <span>共看 {item.viewCount} 次</span>
          )}
        </div>
      </div>
    </div>
  );

  if (!item.videoExists || !item.uuid) {
    return <div className="block">{cardContent}</div>;
  }

  return (
    <Link href={`/watch/${item.uuid}`} className="block">
      {cardContent}
    </Link>
  );
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);

  const fetchHistory = useCallback(async (p: number, append = false) => {
    try {
      if (!append) setLoading(true);
      else setLoadingMore(true);

      const res = await api.get<{ history: HistoryItem[]; pagination: Pagination }>(
        `/videos/history?page=${p}&pageSize=20`
      );

      setHistory(prev => append ? [...prev, ...res.history] : res.history);
      setPagination(res.pagination);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(1);
  }, [fetchHistory]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchHistory(next, true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <h1 className="text-base font-semibold text-white mb-4">播放历史</h1>

      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm">还没有播放记录</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {history.map((item, i) => (
              <HistoryCard key={`${item.uuid}-${i}`} item={item} />
            ))}
          </div>

          {pagination && page < pagination.totalPages && (
            <div className="flex justify-center mt-4">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              >
                {loadingMore ? <Spinner size="sm" /> : '加载更多'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
