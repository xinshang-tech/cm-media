'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import ContentCard from '@/components/video/ContentCard';
import { VideoGridSkeleton } from '@/components/ui';
import type { ContentItem } from '@/components/video/ContentCard';

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export default function HomePage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const observerRef = useRef<HTMLDivElement>(null);

  const fetchItems = useCallback(async (page: number = 1) => {
    try {
      if (page === 1) setLoading(true);
      else setLoadingMore(true);

      const res = await api.get<{ videos: ContentItem[]; pagination: Pagination }>(
        `/videos?page=${page}`
      );

      if (page === 1) {
        setItems(res.videos);
      } else {
        setItems((prev) => [...prev, ...res.videos]);
      }
      setPagination(res.pagination);
    } catch (err) {
      console.error('加载内容失败:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchItems(1);
  }, [fetchItems]);

  // 无限滚动
  useEffect(() => {
    if (!observerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && pagination && pagination.page < pagination.totalPages && !loadingMore) {
          fetchItems(pagination.page + 1);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(observerRef.current);

    return () => observer.disconnect();
  }, [pagination, loadingMore, fetchItems]);

  if (loading) {
    return (
      <div className="container-responsive py-6">
        <VideoGridSkeleton count={15} />
      </div>
    );
  }

  return (
    <div className="pt-4 pb-8">
      {pagination && (
        <div className="container-responsive pb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold text-white">最新内容</h1>
            <span className="text-xs text-gray-500 font-mono">{pagination.total} 个内容</span>
          </div>
        </div>
      )}

      <div className="container-responsive">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {items.map((item, index) => (
              <div key={`${item.type}-${item.uuid}`} className="animate-fade-in" style={{ animationDelay: `${Math.min(index, 30) * 40}ms` }}>
              <ContentCard item={item} />
            </div>
          ))}
        </div>
      </div>

      <div ref={observerRef} className="h-10" />

      {loadingMore && (
        <div className="flex justify-center py-8">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full spinner" />
            <span className="text-sm text-gray-500">加载更多...</span>
          </div>
        </div>
      )}

      {pagination && pagination.page >= pagination.totalPages && items.length > 0 && (
        <div className="text-center py-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-gray-500">已加载全部内容</span>
          </div>
        </div>
      )}

      {items.length === 0 && !loading && (
        <div className="container-responsive">
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-gray-500 text-lg">暂无内容</p>
            <p className="text-gray-600 text-sm mt-1">稍后再来看看吧</p>
          </div>
        </div>
      )}
    </div>
  );
}
