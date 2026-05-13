'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X, Clock, Film, Images } from 'lucide-react';
import { api } from '@/lib/api';
import VideoCard from '@/components/video/VideoCard';
import AlbumCard from '@/components/album/AlbumCard';
import { Spinner } from '@/components/ui';
import type { Video } from '@/components/video/VideoCard';
import type { Album } from '@/components/album/AlbumCard';

const HISTORY_KEY = 'search_history';
const MAX_HISTORY = 8;
const DEBOUNCE_MS = 400;

type Tab = 'all' | 'videos' | 'albums';

function getHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveHistory(q: string) {
  const prev = getHistory().filter((h) => h !== q);
  localStorage.setItem(HISTORY_KEY, JSON.stringify([q, ...prev].slice(0, MAX_HISTORY)));
}

function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQ);
  const [videos, setVideos] = useState<Video[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setSearched(true);
    setTab('all');

    try {
      const [videoRes, albumRes] = await Promise.all([
        api.get<{ videos: Video[] }>(`/videos/search?q=${encodeURIComponent(q)}`, { signal: controller.signal }),
        api.get<{ albums: Album[] }>(`/photos/search?q=${encodeURIComponent(q)}`, { signal: controller.signal }),
      ]);
      setVideos(videoRes.videos);
      setAlbums(albumRes.albums);
      saveHistory(q);
      setHistory(getHistory());
    } catch (err: unknown) {
      if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('abort'))) return;
      console.error('搜索失败:', err);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  // trigger search from URL on mount
  useEffect(() => {
    if (initialQ.length >= 2) doSearch(initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length >= 2) {
      debounceRef.current = setTimeout(() => {
        router.replace(`/search?q=${encodeURIComponent(value.trim())}`, { scroll: false });
        doSearch(value.trim());
      }, DEBOUNCE_MS);
    } else if (!value.trim()) {
      router.replace('/search', { scroll: false });
      setSearched(false);
      setVideos([]);
      setAlbums([]);
    }
  };

  const handleSubmit = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) return;
    setShowHistory(false);
    router.replace(`/search?q=${encodeURIComponent(q)}`, { scroll: false });
    doSearch(q);
  };

  const handleHistoryClick = (h: string) => {
    setQuery(h);
    setShowHistory(false);
    router.replace(`/search?q=${encodeURIComponent(h)}`, { scroll: false });
    doSearch(h);
  };

  const handleClearHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearHistory();
    setHistory([]);
  };

  const visibleVideos = tab === 'albums' ? [] : videos;
  const visibleAlbums = tab === 'videos' ? [] : albums;
  const hasResults = videos.length > 0 || albums.length > 0;

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
      {/* Search header */}
      <div className="mb-8">
        {!searched && (
          <div className="text-center mb-8 pt-8">
            <Search className="mx-auto mb-3 text-gray-600" size={40} strokeWidth={1.5} />
            <p className="text-gray-500 text-sm">输入关键词搜索视频或相册</p>
          </div>
        )}

        {/* Search input */}
        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                onFocus={() => setShowHistory(true)}
                onBlur={() => setTimeout(() => setShowHistory(false), 150)}
                placeholder="输入关键词搜索视频或相册..."
                className="w-full pl-9 pr-9 py-2.5 input-field rounded-md text-foreground placeholder-muted focus:outline-none focus:border-blue-500 transition-colors"
              />
              {query && (
                <button
                  onClick={() => { setQuery(''); setSearched(false); setVideos([]); setAlbums([]); router.replace('/search', { scroll: false }); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={handleSubmit}
              disabled={loading || !query.trim()}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-surface disabled:text-muted text-white rounded-md transition-colors"
            >
              搜索
            </button>
          </div>

          {/* Search history dropdown */}
          {showHistory && history.length > 0 && !query && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-md shadow-xl z-50 overflow-hidden border border-border" style={{ right: '80px', background: 'var(--color-surface)' }}>
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs text-muted">最近搜索</span>
                <button onClick={handleClearHistory} className="text-xs text-muted hover:text-foreground transition-colors">清除</button>
              </div>
              {history.map((h) => (
                <button
                  key={h}
                  onMouseDown={() => handleHistoryClick(h)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-white/5 text-left transition-colors"
                >
                  <Clock size={13} className="text-muted shrink-0" />
                  <span className="truncate">{h}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : searched ? (
        hasResults ? (
          <div>
            {/* Tabs */}
            <div className="flex items-center gap-1 mb-6 border-b border-border pb-0">
              {([
                { key: 'all', label: '全部', count: videos.length + albums.length, icon: undefined },
                { key: 'videos', label: '视频', count: videos.length, icon: Film },
                { key: 'albums', label: '相册', count: albums.length, icon: Images },
              ] as const).map(({ key, label, count, icon: Icon }) => (
                count > 0 || key === 'all' ? (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
                      tab === key
                        ? 'border-blue-500 text-foreground'
                        : 'border-transparent text-muted hover:text-foreground'
                    }`}
                  >
                    {Icon && <Icon size={14} />}
                    {label}
                    <span className={`text-xs ${tab === key ? 'text-blue-400' : 'text-gray-600'}`}>
                      {count}
                    </span>
                  </button>
                ) : null
              ))}
            </div>

            <div className="space-y-8">
              {visibleVideos.length > 0 && (
                <section>
                  {tab === 'all' && (
                    <h2 className="flex items-center gap-2 text-sm text-gray-400 mb-3">
                      <Film size={14} /> 视频
                    </h2>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {visibleVideos.map((video) => (
                      <VideoCard key={video.uuid} video={video} />
                    ))}
                  </div>
                </section>
              )}
              {visibleAlbums.length > 0 && (
                <section>
                  {tab === 'all' && (
                    <h2 className="flex items-center gap-2 text-sm text-gray-400 mb-3">
                      <Images size={14} /> 相册
                    </h2>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {visibleAlbums.map((album) => (
                      <AlbumCard key={album.uuid} album={album} />
                    ))}
                  </div>
                </section>
              )}
              {tab !== 'all' && visibleVideos.length === 0 && visibleAlbums.length === 0 && (
                <div className="text-center py-16 text-gray-600 text-sm">该分类无匹配结果</div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-20">
            <Search className="mx-auto mb-3 text-gray-700" size={36} strokeWidth={1.5} />
            <p className="text-muted">未找到与 <span className="text-foreground">"{query}"</span> 相关的结果</p>
          </div>
        )
      ) : null}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageInner />
    </Suspense>
  );
}
