'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui';

interface Category {
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
  sortOrder: number;
  coverUrl: string | null;
  videoCount: number;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ categories: Category[] }>('/categories/with-covers')
      .then(res => setCategories(res.categories))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <Spinner />
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="container-responsive py-8 text-center text-gray-500">
        暂无分类
      </div>
    );
  }

  return (
    <div className="container-responsive py-6">
      <h1 className="text-lg font-semibold text-foreground mb-4">全部分类</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {categories.map(cat => (
          <Link
            key={cat.id}
            href={`/categories/${cat.slug}`}
            className="group relative rounded-lg overflow-hidden aspect-[4/3] bg-card hover:ring-2 hover:ring-blue-500 transition-all"
          >
            {cat.coverUrl ? (
              <img
                src={cat.coverUrl}
                alt={cat.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-2">
              <span className="text-white text-sm font-medium leading-tight line-clamp-1 block">{cat.name}</span>
              {cat.parentId !== null && (
                <p className="text-gray-400 text-xs mt-0.5">子分类</p>
              )}
              <p className="text-gray-400 text-xs">{cat.videoCount} 个视频</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
