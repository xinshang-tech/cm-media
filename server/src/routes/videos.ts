import { Router } from 'express';
import { prisma } from '../config/database.js';
import { cacheGet, cacheSet, cacheDelPattern } from '../config/redis.js';
import { authenticate } from '../middleware/auth.js';
import { signVideoWithVod, signVodVideoUrls, signUrl, generateSignedURL } from '../services/aliyun-oss.js';
import { env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
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

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize as string) || env.PAGE_SIZE);
    const categorySlug = req.query.category as string;
    const search = req.query.search as string;
    const skip = (page - 1) * pageSize;

    const videoWhere: Prisma.VideoWhereInput = {
      status: 'PUBLISHED',
    };

    const albumWhere: Prisma.PhotoAlbumWhereInput = {
      status: 'PUBLISHED',
    };

    if (req.user!.role !== 'ADMIN') {
      videoWhere.allowedUsers = null;
      albumWhere.allowedUsers = null;
    }

    if (categorySlug) {
      videoWhere.categories = {
        some: {
          category: { slug: categorySlug },
        },
      };
      albumWhere.categories = {
        some: {
          category: { slug: categorySlug },
        },
      };
    }

    if (search) {
      videoWhere.OR = [
        { title: { contains: search } },
        { content: { contains: search } },
      ];
      albumWhere.OR = [
        { title: { contains: search } },
        { content: { contains: search } },
      ];
    }

    const cacheKey = `videos:v2:${page}:${pageSize}:${categorySlug || ''}:${search || ''}:${req.user!.role}`;
    const cached = await cacheGet<{ items: unknown[]; total: number }>(cacheKey);

    if (cached) {
      const itemsWithProgress = await injectUserProgress(cached.items as AnyItem[], req.user!.id);
      return res.json({
        videos: itemsWithProgress,
        pagination: {
          page,
          pageSize,
          total: cached.total,
          totalPages: Math.ceil(cached.total / pageSize),
        },
      });
    }

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
          status: true,
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
          status: true,
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

    await cacheSet(cacheKey, { items: paginatedItems, total }, 30);

    const itemsWithProgress = await injectUserProgress(paginatedItems, req.user!.id);

    res.json({
      videos: itemsWithProgress,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('[Videos] 列表错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.get('/search', authenticate, async (req: Request, res: Response) => {
  try {
    const keywords = (req.query.q as string || '').trim();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize as string) || env.PAGE_SIZE));
    const skip = (page - 1) * pageSize;

    if (!keywords) {
      return res.json({ videos: [], total: 0, pagination: { page, pageSize, total: 0, totalPages: 0 } });
    }

    const words = keywords.split(/\s+/).filter(Boolean);

    const orConditions: Prisma.VideoWhereInput[] = [];
    for (const word of words) {
      orConditions.push(
        { title: { contains: word } },
        { content: { contains: word } },
      );
    }

    const where: Prisma.VideoWhereInput = {
      status: 'PUBLISHED',
      OR: orConditions,
    };

    const [videos, total] = await Promise.all([
      prisma.video.findMany({
        where,
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
        },
        orderBy: { publishedAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.video.count({ where }),
    ]);

    const signedVideos = videos.map(v => signVideoWithVod(v));

    res.json({
      videos: signedVideos,
      total,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('[Videos] 搜索错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.get('/history', authenticate, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const skip = (page - 1) * pageSize;

    const [records, total] = await Promise.all([
      prisma.viewRecord.findMany({
        where: { userId: req.user!.id },
        orderBy: { lastViewedAt: 'desc' },
        skip,
        take: pageSize,
        select: {
          videoUuid: true,
          videoTitle: true,
          lastPosition: true,
          totalDuration: true,
          viewCount: true,
          lastViewedAt: true,
          video: {
            select: {
              uuid: true,
              title: true,
              posterUrl: true,
              status: true,
              vodVideo: {
                select: {
                  videoWidth: true,
                  videoHeight: true,
                  videoDuration: true,
                  coverUrl: true,
                },
              },
            },
          },
        },
      }),
      prisma.viewRecord.count({ where: { userId: req.user!.id } }),
    ]);

    const history = records.map(r => {
      const videoExists = !!r.video && r.video.status === 'PUBLISHED';
      const uuid = r.video?.uuid || r.videoUuid;
      const title = r.video?.title || r.videoTitle || '已删除的视频';
      const posterUrl = videoExists ? r.video!.posterUrl : null;
      const vodCoverUrl = videoExists ? r.video!.vodVideo?.coverUrl : null;
      const duration = r.video?.vodVideo?.videoDuration || null;
      const videoHeight = r.video?.vodVideo?.videoHeight || null;
      const videoWidth = r.video?.vodVideo?.videoWidth || null;

      const signedPoster = posterUrl ? signVideoWithVod({ posterUrl } as any).posterUrl : null;
      const signedCover = vodCoverUrl ? signVodVideoUrls({ coverUrl: vodCoverUrl }).coverUrl : null;

      return {
        uuid,
        title,
        posterUrl: signedPoster || signedCover || null,
        lastPosition: Number(r.lastPosition),
        totalDuration: Number(r.totalDuration),
        viewCount: r.viewCount,
        lastViewedAt: r.lastViewedAt,
        videoExists,
        videoDuration: duration,
        videoHeight,
        videoWidth,
      };
    });

    res.json({
      history,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('[Videos] 播放历史错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.get('/:uuid', authenticate, async (req: Request, res: Response) => {
  try {
    const { uuid } = req.params as { uuid: string };

    const video = await prisma.video.findUnique({
      where: { uuid },
      include: {
        categories: {
          include: { category: true },
        },
        vodVideo: { include: { mediaAssets: { select: { type: true, url: true } } } },
        previewVodVideo: true,
      },
    });

    if (!video) {
      return res.status(404).json({ message: 'VIDEO_NOT_FOUND' });
    }

    if (video.status !== 'PUBLISHED' && req.user!.role !== 'ADMIN') {
      return res.status(404).json({ message: 'VIDEO_NOT_FOUND' });
    }

    if (video.allowedUsers && req.user!.role !== 'ADMIN') {
      const allowed = JSON.parse(video.allowedUsers) as number[];
      if (!allowed.includes(req.user!.id)) {
        return res.status(403).json({ message: 'VIDEO_NO_PERMISSION' });
      }
    }

    let lastPosition = 0;
    const viewRecord = await prisma.viewRecord.findUnique({
      where: {
        userId_videoId: {
          userId: req.user!.id,
          videoId: video.id,
        },
      },
    });
    if (viewRecord) {
      lastPosition = Number(viewRecord.lastPosition);
    }

    const signedVideo = signVideoWithVod(video);

    // 处理雪碧图 VTT：将图片引用替换为签名绝对 URL
    let spriteVttContent: string | null = null;
    const vttAsset = video.vodVideo?.mediaAssets?.find(a => a.type === 'SPRITE_VTT');
    const spriteAsset = video.vodVideo?.mediaAssets?.find(a => a.type === 'SPRITE');
    console.log('[Sprite] vodVideo id:', video.vodVideo?.id, 'mediaAssets:', JSON.stringify(video.vodVideo?.mediaAssets?.map((a: { type: string; url: string }) => ({ type: a.type, url: a.url.slice(0, 80) }))));
    if (vttAsset && spriteAsset) {
      try {
        const signedVttUrl = generateSignedURL(vttAsset.url);
        const vttResp = await fetch(signedVttUrl);
        if (vttResp.ok) {
          const signedSpriteUrl = generateSignedURL(spriteAsset.url);
          let content = await vttResp.text();
          console.log('[Sprite VTT] raw (first 300):', content.slice(0, 300));
          // 将 VTT 中所有图片引用（相对路径或绝对路径）替换为已签名的雪碧图 URL
          content = content.replace(/^(\S+\.(webp|png|jpg|jpeg))(.*)$/gm, (_m, _file, _ext, rest) => {
            return signedSpriteUrl + rest;
          });
          console.log('[Sprite VTT] after replace (first 300):', content.slice(0, 300));
          spriteVttContent = content;
        } else {
          console.error('[Sprite VTT] fetch failed:', vttResp.status, signedVttUrl.slice(0, 100));
        }
      } catch (e) {
        console.error('[Sprite VTT] error:', e);
      }
    }

    res.json({
      video: {
        ...signedVideo,
        lastPosition,
        spriteVttContent,
        categories: (video as any).categories.map((vc: any) => vc.category),
      },
    });
  } catch (error) {
    console.error('[Videos] 详情错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.post('/:uuid/view', authenticate, async (req: Request, res: Response) => {
  try {
    const { uuid } = req.params as { uuid: string };
    const { position, segStart, segEnd, countView } = req.body;

    const video = await prisma.video.findUnique({
      where: { uuid },
      include: { vodVideo: { select: { videoDuration: true } } },
    });
    if (!video) {
      return res.status(404).json({ message: 'VIDEO_NOT_FOUND' });
    }

    const parseDuration = (d: string | null | undefined): number => {
      if (!d) return 0;
      const parts = d.split(':').map(Number);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      return parts[0] || 0;
    };
    const videoDuration = parseDuration(video.vodVideo?.videoDuration);

    const viewInc = countView === true ? 1 : 0;
    const ops: Promise<unknown>[] = [
      prisma.$executeRaw`
        INSERT INTO view_records (user_id, video_id, video_uuid, video_title, last_position, total_duration, view_count, last_viewed_at, created_at, updated_at)
        VALUES (${req.user!.id}, ${video.id}, ${video.uuid}, ${video.title}, ${position || 0}, ${videoDuration}, ${viewInc}, NOW(), NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          video_title     = VALUES(video_title),
          last_position   = VALUES(last_position),
          total_duration  = GREATEST(total_duration, VALUES(total_duration)),
          view_count      = view_count + ${viewInc},
          last_viewed_at  = NOW(),
          updated_at      = NOW()
      `,
    ];

    if (countView === true) {
      ops.push(
        prisma.$executeRaw`UPDATE videos SET view_count = view_count + 1 WHERE id = ${video.id}`
      );
    }

    // 记录观看片段（segStart < segEnd 且非零长度且间隔合理才写入，防止跳转产生脏数据）
    if (typeof segStart === 'number' && typeof segEnd === 'number' && segEnd > segStart && segEnd - segStart <= 7) {
      ops.push(
        prisma.viewSegment.create({
          data: {
            userId: req.user!.id,
            videoId: video.id,
            segStart,
            segEnd,
          },
        })
      );
    }

    await Promise.all(ops);

    res.json({ success: true });
  } catch (error) {
    console.error('[Videos] 记录播放错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.get('/:uuid/related', authenticate, async (req: Request, res: Response) => {
  try {
    const { uuid } = req.params as { uuid: string };

    const video = await prisma.video.findUnique({
      where: { uuid },
      include: { categories: { select: { categoryId: true } } },
    });

    if (!video) {
      return res.status(404).json({ message: 'VIDEO_NOT_FOUND' });
    }

    const categoryIds = (video as any).categories.map((vc: any) => vc.categoryId);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const videoSelect = {
      uuid: true,
      title: true,
      posterUrl: true,
      vodVideo: { select: { videoWidth: true, videoHeight: true, videoDuration: true, coverUrl: true } },
      viewCount: true,
      publishedAt: true,
    };

    let related: any[];

    if (categoryIds.length > 0) {
      // 拉取候选池（含分类信息用于评分）
      const candidates = await prisma.video.findMany({
        where: {
          status: 'PUBLISHED',
          id: { not: video.id },
          categories: { some: { categoryId: { in: categoryIds } } },
        },
        select: { ...videoSelect, categories: { select: { categoryId: true } } },
        take: 60,
      });

      // 综合评分：共同分类数（权重最高）+ 播放量贡献 + 近7天新鲜度加成
      related = candidates
        .map(v => {
          const sharedCats = v.categories.filter((vc: any) => categoryIds.includes(vc.categoryId)).length;
          const recency = v.publishedAt && new Date(v.publishedAt) > sevenDaysAgo ? 5 : 0;
          const score = sharedCats * 10 + Math.min(v.viewCount / 500, 10) + recency;
          const { categories: _cats, ...rest } = v;
          return { ...rest, _score: score };
        })
        .sort((a, b) => b._score - a._score)
        .slice(0, 20)
        .map(({ _score, ...v }) => v);
    } else {
      // 无分类时退化为播放量排行
      related = await prisma.video.findMany({
        where: { status: 'PUBLISHED', id: { not: video.id } },
        select: videoSelect,
        orderBy: { viewCount: 'desc' },
        take: 20,
      });
    }

    res.json({ videos: related.map(v => signVideoWithVod(v)) });
  } catch (error) {
    console.error('[Videos] 相关视频错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

export default router;
