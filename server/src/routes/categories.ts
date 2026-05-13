import { Router } from 'express';
import { prisma } from '../config/database.js';
import { cacheGet, cacheSet, cacheDel } from '../config/redis.js';
import { authenticate } from '../middleware/auth.js';
import { signVideoWithVod, signVodVideoUrls, signUrl } from '../services/aliyun-oss.js';
import { env } from '../config/env.js';
import type { Request, Response } from 'express';

const router = Router();

type AnyItem = { uuid: string; type?: string; [key: string]: unknown };

async function injectUserProgress(items: AnyItem[], userId: number): Promise<AnyItem[]> {
  const videoItems = items.filter(i => i.type === 'video' || !i.type);
  if (videoItems.length === 0) return items;

  const uuids = videoItems.map(i => i.uuid);
  const records = await prisma.viewRecord.findMany({
    where: { userId, videoUuid: { in: uuids } },
    select: { videoUuid: true, lastPosition: true, totalDuration: true },
  });

  if (records.length === 0) return items;

  const progressMap = new Map(
    records.map(r => [r.videoUuid, { lastPosition: Number(r.lastPosition), totalDuration: Number(r.totalDuration) }])
  );

  return items.map(item => {
    if (item.type !== 'video' && item.type !== undefined) return item;
    const prog = progressMap.get(item.uuid);
    if (!prog || prog.lastPosition <= 0 || prog.totalDuration <= 0) return item;
    return { ...item, lastPosition: prog.lastPosition, totalDuration: prog.totalDuration };
  });
}

router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const cached = await cacheGet<unknown[]>('categories:all');
    if (cached) {
      return res.json({ categories: cached });
    }

    const categories = await prisma.category.findMany({
      where: { parentId: null },
      include: {
        children: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    await cacheSet('categories:all', categories, 300);

    res.json({ categories });
  } catch (error) {
    console.error('[Categories] 列表错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.get('/with-covers', authenticate, async (_req: Request, res: Response) => {
  try {
    const CACHE_KEY = 'categories:covers';
    const cached = await cacheGet<unknown[]>(CACHE_KEY);
    if (cached) {
      return res.json({ categories: cached });
    }

    const categories = await prisma.category.findMany({
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        parentId: true,
        sortOrder: true,
      },
    });

    // 为每个分类随机取一个视频或相册的封面
    const result = await Promise.all(
      categories.map(async (cat) => {
        const childIds = categories.filter(c => c.parentId === cat.id).map(c => c.id);
        const categoryIds = [cat.id, ...childIds];

        const videoCount = await prisma.videoCategory.count({
          where: { categoryId: { in: categoryIds }, video: { status: 'PUBLISHED' } },
        });

        const albumCount = await prisma.photoAlbumCategory.count({
          where: { categoryId: { in: categoryIds }, album: { status: 'PUBLISHED' } },
        });

        let coverUrl: string | null = null;

        // 优先从视频获取封面（posterUrl → vodVideo.coverUrl 回退）
        if (videoCount > 0) {
          const skip = Math.floor(Math.random() * videoCount);
          const vc = await prisma.videoCategory.findFirst({
            where: { categoryId: { in: categoryIds }, video: { status: 'PUBLISHED' } },
            skip,
            select: { video: { select: { posterUrl: true, vodVideo: { select: { coverUrl: true } } } } },
          });
          const rawPoster = vc?.video?.posterUrl ?? null;
          const rawVodCover = vc?.video?.vodVideo?.coverUrl ?? null;
          if (rawPoster) {
            coverUrl = signVideoWithVod({ posterUrl: rawPoster } as any).posterUrl ?? null;
          } else if (rawVodCover) {
            coverUrl = signVodVideoUrls({ coverUrl: rawVodCover }).coverUrl ?? null;
          }
        }

        // 如果视频没有封面，从相册获取（coverUrl → 第一张图片 回退）
        if (!coverUrl && albumCount > 0) {
          const skip = Math.floor(Math.random() * albumCount);
          const ac = await prisma.photoAlbumCategory.findFirst({
            where: { categoryId: { in: categoryIds }, album: { status: 'PUBLISHED' } },
            skip,
            select: {
              album: {
                select: {
                  coverUrl: true,
                  photos: {
                    select: { thumbnailUrl: true, url: true },
                    orderBy: { sortOrder: 'asc' },
                    take: 1,
                  },
                },
              },
            },
          });
          const rawAlbumCover = ac?.album?.coverUrl ?? null;
          const rawFirstPhoto = ac?.album?.photos[0]?.thumbnailUrl || ac?.album?.photos[0]?.url || null;
          if (rawAlbumCover) {
            coverUrl = signUrl(rawAlbumCover);
          } else if (rawFirstPhoto) {
            coverUrl = signUrl(rawFirstPhoto);
          }
        }

        return { ...cat, coverUrl, videoCount: videoCount + albumCount };
      })
    );

    await cacheSet(CACHE_KEY, result, 300);
    res.json({ categories: result });
  } catch (error) {
    console.error('[Categories] 封面列表错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.get('/:slug/videos', authenticate, async (req: Request, res: Response) => {
  try {
    const { slug } = req.params as { slug: string };
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize as string) || env.PAGE_SIZE);
    const skip = (page - 1) * pageSize;

    const category = await prisma.category.findUnique({ where: { slug } });
    if (!category) {
      return res.status(404).json({ message: '分类不存在' });
    }

    const childCategories = await prisma.category.findMany({
      where: { parentId: category.id },
      select: { id: true },
    });
    const categoryIds = [category.id, ...childCategories.map(c => c.id)];

    const videoWhere = {
      status: 'PUBLISHED' as const,
      categories: {
        some: {
          categoryId: { in: categoryIds },
        },
      },
    };

    const albumWhere = {
      status: 'PUBLISHED' as const,
      categories: {
        some: {
          categoryId: { in: categoryIds },
        },
      },
    };

    const [videos, videoTotal, albums, albumTotal] = await Promise.all([
      prisma.video.findMany({
        where: videoWhere,
        select: {
          id: true,
          uuid: true,
          title: true,
          posterUrl: true,
          vodVideo: {
            select: {
              videoWidth: true,
              videoHeight: true,
              videoDuration: true,
              coverUrl: true,
            },
          },
          previewVodVideo: {
            select: {
              videoUrl: true,
            },
          },
          viewCount: true,
          publishedAt: true,
          isPickup: true,
        },
        orderBy: [
          { isPickup: 'desc' },
          { publishedAt: 'desc' },
        ],
      }),
      prisma.video.count({ where: videoWhere }),
      prisma.photoAlbum.findMany({
        where: albumWhere,
        select: {
          id: true,
          uuid: true,
          title: true,
          coverUrl: true,
          viewCount: true,
          publishedAt: true,
          isPickup: true,
          _count: { select: { photos: true } },
          photos: {
            select: { thumbnailUrl: true, url: true },
            orderBy: { sortOrder: 'asc' },
            take: 1,
          },
        },
        orderBy: [
          { isPickup: 'desc' },
          { publishedAt: 'desc' },
        ],
      }),
      prisma.photoAlbum.count({ where: albumWhere }),
    ]);

    const signedVideos = videos.map(v => ({
      ...signVideoWithVod(v),
      type: 'video' as const,
    }));

    const signedAlbums = albums.map(a => {
      const firstPhotoRaw = a.photos[0]?.thumbnailUrl || a.photos[0]?.url || null;
      const { photos: _photos, _count, ...rest } = a;
      return {
        ...rest,
        coverUrl: a.coverUrl ? signUrl(a.coverUrl) : null,
        firstPhotoUrl: firstPhotoRaw ? signUrl(firstPhotoRaw) : null,
        type: 'album' as const,
        photoCount: _count.photos,
      };
    });

    const allItems = [...signedVideos, ...signedAlbums].sort((a, b) => {
      if (a.isPickup && !b.isPickup) return -1;
      if (!a.isPickup && b.isPickup) return 1;
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return dateB - dateA;
    });

    const total = videoTotal + albumTotal;

    const paginatedItems = allItems.slice(skip, skip + pageSize);

    const itemsWithProgress = await injectUserProgress(paginatedItems, req.user!.id);

    res.json({
      category,
      videos: itemsWithProgress,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('[Categories] 分类视频错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

export default router;
