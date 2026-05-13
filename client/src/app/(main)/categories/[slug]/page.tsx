'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import ContentCard from '@/components/video/ContentCard';
import { VideoGridSkeleton, Spinner } from '@/components/ui';
import type { ContentItem } from '@/components/video/ContentCard';

interface Category {
  id: number;
  name: string;
  slug: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const [category, setCategory] = useState<Category | null>(null);
  const [videos, setVideos] = useState<ContentItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const observerRef = useRef<HTMLDivElement>(null);

  const fetchVideos = useCallback(async (page: number = 1) => {
    try {
      if (page === 1) setLoading(true);
      else setLoadingMore(true);

      const res = await api.get<{ category: Category; videos: ContentItem[]; pagination: Pagination }>(
        `/categories/${slug}/videos?page=${page}`
      );

      if (page === 1) {
        setCategory(res.category);
        setVideos(res.videos);
      } else {
        setVideos(prev => [...prev, ...res.videos]);
      }
      setPagination(res.pagination);
    } catch (err) {
      console.error('加载分类视频失败:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchVideos(1);
  }, [fetchVideos]);

  useEffect(() => {
    if (!observerRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && pagination && pagination.page < pagination.totalPages && !loadingMore) {
          fetchVideos(pagination.page + 1);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [pagination, loadingMore, fetchVideos]);

  if (loading) {
    return (
      <div className="container-responsive py-6">
        <VideoGridSkeleton count={12} />
      </div>
    );
  }

  return (
    <div className="pt-4 pb-8">
      <div className="container-responsive pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/categories" className="text-gray-500 hover:text-white text-sm transition-colors">
            分类
          </Link>
          <span className="text-gray-600">/</span>
          <h1 className="text-base font-semibold text-white">{category?.name}</h1>
        </div>
        {pagination && (
          <span className="text-xs text-gray-500 font-mono">{pagination.total} 个内容</span>
        )}
      </div>

      {videos.length === 0 ? (
        <div className="container-responsive text-center text-gray-500 py-16">该分类暂无内容</div>
      ) : (
        <div className="container-responsive">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {videos.map((item, index) => (
              <div key={item.uuid} className="animate-fade-in" style={{ animationDelay: `${index % 12 * 50}ms` }}>
                <ContentCard item={item} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div ref={observerRef} className="h-8 mt-4" />
      {loadingMore && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}
    </div>
  );
}
