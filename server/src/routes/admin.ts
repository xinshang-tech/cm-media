import { Router } from 'express';
import { prisma } from '../config/database.js';
import { cacheDelPattern, cacheDel } from '../config/redis.js';
import { authenticate, requireAdmin, getClientIp } from '../middleware/auth.js';
import { signVodVideoUrls, signVideoWithVod, signUrl } from '../services/aliyun-oss.js';
import { env } from '../config/env.js';
import { createVodClient } from '../services/aliyun-vod.js';
import type { Request, Response } from 'express';

const router = Router();

// 所有管理路由需要认证+管理员权限
router.use(authenticate, requireAdmin);

router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const [totalVideos, totalVodVideos, totalUsers, totalViews, recentVideos, recentLogins] = await Promise.all([
      prisma.video.count({ where: { status: 'PUBLISHED' } }),
      prisma.vodVideo.count({ where: { status: 'READY' } }),
      prisma.user.count(),
      prisma.video.aggregate({ _sum: { viewCount: true } }),
      prisma.video.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, uuid: true, title: true, viewCount: true, createdAt: true },
      }),
      prisma.loginLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { username: true, ipAddress: true, success: true, createdAt: true, user: { select: { nickname: true } } },
      }),
    ]);

    // 今日播放量
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayViews = await prisma.viewRecord.count({
      where: { lastViewedAt: { gte: today } },
    });

    res.json({
      stats: {
        totalVideos,
        totalVodVideos,
        totalUsers,
        totalViews: totalViews._sum.viewCount || 0,
        todayViews,
      },
      recentVideos,
      recentLogins,
    });
  } catch (error) {
    console.error('[Admin] 仪表盘错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.get('/vod-videos', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const status = req.query.status as string;
    const search = req.query.search as string;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (status) where.status = status.toUpperCase();
    if (search) {
      where.OR = [
        { filename: { contains: search } },
        { vodVideoId: { contains: search } },
      ];
    }

    const [vodVideos, total] = await Promise.all([
      prisma.vodVideo.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          uploader: { select: { id: true, username: true, nickname: true } },
          videos: { where: { status: 'PUBLISHED' }, select: { id: true, title: true, status: true } },
          previewVideos: { where: { status: 'PUBLISHED' }, select: { id: true, title: true, status: true } },
          mediaAssets: { select: { type: true, url: true } },
        },
      }),
      prisma.vodVideo.count({ where }),
    ]);

    const signedVodVideos = vodVideos.map(v => signVodVideoUrls(v));

    res.json({
      vodVideos: signedVodVideos,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error('[Admin] VOD视频列表错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.get('/vod-videos/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);

    const vodVideo = await prisma.vodVideo.findUnique({
      where: { id },
      include: {
        uploader: { select: { id: true, username: true, nickname: true } },
        videos: { where: { status: 'PUBLISHED' }, select: { id: true, title: true, status: true, createdAt: true } },
      },
    });

    if (!vodVideo) {
      return res.status(404).json({ message: 'VOD视频不存在' });
    }

    res.json({ vodVideo: signVodVideoUrls(vodVideo) });
  } catch (error) {
    console.error('[Admin] VOD视频详情错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.post('/vod-videos', async (req: Request, res: Response) => {
  try {
    const { v7: uuidv7 } = await import('uuid');
    const data = req.body;

    const assetEntries: { type: 'CAPTION' | 'SPRITE' | 'SPRITE_VTT'; url: string }[] = [];
    if (data.captionUrl) assetEntries.push({ type: 'CAPTION', url: data.captionUrl });
    if (data.spriteUrl) assetEntries.push({ type: 'SPRITE', url: data.spriteUrl });
    if (data.spriteVttUrl) assetEntries.push({ type: 'SPRITE_VTT', url: data.spriteVttUrl });

    const vodVideo = await prisma.vodVideo.create({
      data: {
        uuid: uuidv7(),
        filename: data.filename || 'untitled',
        filesize: data.filesize || 0,
        mimetype: data.mimetype || '',
        vodVideoId: data.vodVideoId,
        videoUrl: data.videoUrl,
        videoWidth: data.videoWidth,
        videoHeight: data.videoHeight,
        videoDuration: data.videoDuration,
        videoFps: data.videoFps,
        tags: data.tags,
        videoType: data.videoType === 'PREVIEW' ? 'PREVIEW' : 'MAIN',
        status: data.status || 'READY',
        uploaderId: req.user!.id,
        mediaAssets: assetEntries.length
          ? { create: assetEntries }
          : undefined,
      },
    });

    await prisma.operationLog.create({
      data: {
        userId: req.user!.id,
        action: 'vod_video_create',
        targetType: 'vod_video',
        targetId: vodVideo.id,
        details: JSON.stringify({ filename: vodVideo.filename, vodVideoId: vodVideo.vodVideoId }),
        ipAddress: getClientIp(req),
      },
    });

    res.json({ success: true, vodVideo });
  } catch (error) {
    console.error('[Admin] 创建VOD视频错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.put('/vod-videos/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const data = req.body;

    const vodVideo = await prisma.vodVideo.update({
      where: { id },
      data: {
        filename: data.filename,
        tags: data.tags,
        status: data.status,
      },
    });

    // upsert media assets
    const assetMap: Record<string, { type: 'CAPTION' | 'SPRITE' | 'SPRITE_VTT'; filenameField: string }> = {
      captionUrl:   { type: 'CAPTION',    filenameField: 'captionFilename' },
      spriteUrl:    { type: 'SPRITE',     filenameField: 'spriteFilename' },
      spriteVttUrl: { type: 'SPRITE_VTT', filenameField: 'spriteVttFilename' },
    };
    for (const [field, cfg] of Object.entries(assetMap)) {
      if (data[field] !== undefined) {
        if (data[field]) {
          const originalFilename = data[cfg.filenameField] || null;
          await prisma.mediaAsset.upsert({
            where: { vodVideoId_type: { vodVideoId: id, type: cfg.type } },
            update: { url: data[field], ...(originalFilename ? { originalFilename } : {}) },
            create: { vodVideoId: id, type: cfg.type, url: data[field], originalFilename },
          });
        } else {
          await prisma.mediaAsset.deleteMany({ where: { vodVideoId: id, type: cfg.type } });
        }
      }
    }

    await prisma.operationLog.create({
      data: {
        userId: req.user!.id,
        action: 'vod_video_update',
        targetType: 'vod_video',
        targetId: id,
        details: JSON.stringify({ filename: vodVideo.filename }),
        ipAddress: getClientIp(req),
      },
    });

    res.json({ success: true, vodVideo });
  } catch (error) {
    console.error('[Admin] 更新VOD视频错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.post('/vod-videos/:id/sync-info', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);

    const vodVideo = await prisma.vodVideo.findUnique({ where: { id } });
    if (!vodVideo) {
      return res.status(404).json({ message: 'VOD视频不存在' });
    }
    if (!vodVideo.vodVideoId) {
      return res.status(400).json({ message: '该记录没有VOD ID，无法同步' });
    }

    const { getVODVideoInfo } = await import('../services/aliyun-vod.js');
    const info = await getVODVideoInfo(vodVideo.vodVideoId);

    const updated = await prisma.vodVideo.update({
      where: { id },
      data: {
        videoUrl: info.playURL || vodVideo.videoUrl,
        coverUrl: info.coverUrl || vodVideo.coverUrl,
        videoWidth: info.width || vodVideo.videoWidth,
        videoHeight: info.height || vodVideo.videoHeight,
        videoDuration: info.duration || vodVideo.videoDuration,
        videoFps: info.fps || vodVideo.videoFps,
        status: info.isProcessing ? 'PROCESSING' : 'READY',
      },
      include: {
        uploader: { select: { id: true, username: true, nickname: true } },
        videos: { where: { status: 'PUBLISHED' }, select: { id: true, title: true, status: true } },
        previewVideos: { where: { status: 'PUBLISHED' }, select: { id: true, title: true, status: true } },
        mediaAssets: { select: { type: true, url: true } },
      },
    });

    const { signVodVideoUrls } = await import('../services/aliyun-oss.js');
    res.json({ success: true, vodVideo: signVodVideoUrls(updated), statusMessage: info.statusMessage });
  } catch (error) {
    console.error('[Admin] 同步VOD视频信息错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.delete('/vod-videos/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);

    const vodVideo = await prisma.vodVideo.findUnique({
      where: { id },
      include: { videos: { select: { id: true, title: true } }, previewVideos: { select: { id: true, title: true } } },
    });

    if (!vodVideo) {
      return res.status(404).json({ message: 'VOD视频不存在' });
    }

    // 删除阿里云VOD视频（异步，不阻塞）
    if (vodVideo.vodVideoId) {
      import('../services/aliyun-vod.js').then(({ deleteVodVideos }) => {
        deleteVodVideos([vodVideo.vodVideoId!]).catch((err: unknown) => console.error('[Admin] 删除VOD失败:', err));
      });
    }

    await prisma.vodVideo.delete({ where: { id } });

    await prisma.operationLog.create({
      data: {
        userId: req.user!.id,
        action: 'vod_video_delete',
        targetType: 'vod_video',
        targetId: id,
        details: JSON.stringify({ filename: vodVideo.filename, vodVideoId: vodVideo.vodVideoId }),
        ipAddress: getClientIp(req),
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] 删除VOD视频错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.delete('/vod-videos/:id/local-only', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);

    const vodVideo = await prisma.vodVideo.findUnique({
      where: { id },
      include: { videos: { select: { id: true, title: true } }, previewVideos: { select: { id: true, title: true } } },
    });

    if (!vodVideo) {
      return res.status(404).json({ message: 'VOD视频不存在' });
    }

    await prisma.video.updateMany({
      where: { vodVideoId: id },
      data: { vodVideoId: null },
    });
    await prisma.video.updateMany({
      where: { previewVodVideoId: id },
      data: { previewVodVideoId: null },
    });

    await prisma.vodVideo.delete({ where: { id } });

    await prisma.operationLog.create({
      data: {
        userId: req.user!.id,
        action: 'vod_video_remove_from_library',
        targetType: 'vod_video',
        targetId: id,
        details: JSON.stringify({
          filename: vodVideo.filename,
          vodVideoId: vodVideo.vodVideoId,
          clearedRefs: {
            main: vodVideo.videos.length,
            preview: vodVideo.previewVideos.length,
          },
        }),
        ipAddress: getClientIp(req),
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] 移出库错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.post('/vod-videos/batch', async (req: Request, res: Response) => {
  try {
    const { ids, action } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: '请选择VOD视频' });
    }

    let result;
    switch (action) {
      case 'delete':
        const referenced = await prisma.vodVideo.findMany({
          where: { id: { in: ids }, videos: { some: {} } },
          select: { id: true, filename: true },
        });
        if (referenced.length > 0) {
          return res.status(400).json({
            message: '部分VOD视频已被引用，无法删除',
            referenced,
          });
        }
        result = await prisma.vodVideo.deleteMany({ where: { id: { in: ids } } });
        break;
      case 'ready':
        result = await prisma.vodVideo.updateMany({
          where: { id: { in: ids } },
          data: { status: 'READY' },
        });
        break;
      case 'failed':
        result = await prisma.vodVideo.updateMany({
          where: { id: { in: ids } },
          data: { status: 'FAILED' },
        });
        break;
      default:
        return res.status(400).json({ message: '不支持的操作' });
    }

    await prisma.operationLog.create({
      data: {
        userId: req.user!.id,
        action: `vod_video_batch_${action}`,
        targetType: 'vod_video',
        details: JSON.stringify({ ids, count: ids.length }),
        ipAddress: getClientIp(req),
      },
    });

    res.json({ success: true, affected: result.count ?? ids.length });
  } catch (error) {
    console.error('[Admin] VOD视频批量操作错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.get('/videos', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const status = req.query.status as string;
    const search = req.query.search as string;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (status) where.status = status.toUpperCase();
    if (search) {
      where.OR = [
        { title: { contains: search } },
      ];
    }

    const [videos, total] = await Promise.all([
      prisma.video.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          categories: { include: { category: true } },
          vodVideo: {
            select: {
              id: true,
              uuid: true,
              filename: true,
              vodVideoId: true,
              videoUrl: true,
              coverUrl: true,
              videoDuration: true,
              videoType: true,
            },
          },
          previewVodVideo: {
            select: {
              id: true,
              uuid: true,
              filename: true,
              vodVideoId: true,
              videoUrl: true,
              videoType: true,
            },
          },
        },
      }),
      prisma.video.count({ where }),
    ]);

    const signedVideos = videos.map(v => signVideoWithVod(v));

    res.json({
      videos: signedVideos,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error('[Admin] 视频列表错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.get('/videos/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);

    const video = await prisma.video.findUnique({
      where: { id },
      include: {
        categories: { include: { category: true } },
        vodVideo: { include: { mediaAssets: true } },
        previewVodVideo: true,
      },
    });

    if (!video) {
      return res.status(404).json({ message: '视频不存在' });
    }

    const signedVideo = signVideoWithVod(video);

    res.json({ video: signedVideo });
  } catch (error) {
    console.error('[Admin] 视频详情错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.post('/videos', async (req: Request, res: Response) => {
  try {
    const { v7: uuidv7 } = await import('uuid');
    const data = req.body;

    const allowedUsers = Array.isArray(data.allowedUsers)
      ? JSON.stringify(data.allowedUsers)
      : (data.allowedUsers || null);

    const video = await prisma.video.create({
      data: {
        uuid: uuidv7(),
        title: data.title,
        content: data.content,
        vodVideoId: data.vodVideoId || null,
        previewVodVideoId: data.previewVodVideoId || null,
        posterUrl: data.posterUrl || null,
        status: data.status || 'DRAFT',
        isPickup: data.isPickup || false,
        allowedUsers,
        publishedAt: data.publishedAt
          ? new Date(data.publishedAt)
          : (data.status === 'PUBLISHED' ? new Date() : null),
        categories: data.categoryIds?.length
          ? { create: data.categoryIds.filter(Boolean).map((id: number) => ({ categoryId: id })) }
          : undefined,
      },
    });

    await cacheDelPattern('videos:*');
    await cacheDel('categories:covers');

    await prisma.operationLog.create({
      data: {
        userId: req.user!.id,
        action: 'video_create',
        targetType: 'video',
        targetId: video.id,
        details: JSON.stringify({ title: video.title }),
        ipAddress: getClientIp(req),
      },
    });

    res.json({ success: true, video });
  } catch (error) {
    console.error('[Admin] 创建视频错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.put('/videos/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const data = req.body;

    const allowedUsersUpdate = data.allowedUsers !== undefined
      ? (Array.isArray(data.allowedUsers) ? JSON.stringify(data.allowedUsers) : (data.allowedUsers || null))
      : undefined;

    const existing = await prisma.video.findUnique({ where: { id }, select: { status: true, vodVideoId: true } });

    const video = await prisma.video.update({
      where: { id },
      data: {
        title: data.title,
        content: data.content,
        vodVideoId: data.vodVideoId !== undefined ? (data.vodVideoId || null) : undefined,
        previewVodVideoId: data.previewVodVideoId !== undefined ? (data.previewVodVideoId || null) : undefined,
        posterUrl: data.posterUrl !== undefined ? (data.posterUrl || null) : undefined,
        status: data.status,
        isPickup: data.isPickup,
        allowedUsers: allowedUsersUpdate,
        publishedAt: data.publishedAt !== undefined
          ? (data.publishedAt ? new Date(data.publishedAt) : null)
          : (data.status === 'PUBLISHED' ? new Date() : undefined),
      },
    });

    // 发布时删除同一 vodVideoId 下其他草稿
    if (data.status === 'PUBLISHED' && existing?.status !== 'PUBLISHED') {
      const vodVideoId = data.vodVideoId !== undefined ? (data.vodVideoId || null) : existing?.vodVideoId;
      if (vodVideoId) {
        await prisma.video.deleteMany({
          where: { id: { not: id }, status: 'DRAFT', vodVideoId },
        });
      }
    }

    // 更新分类关联
    if (data.categoryIds) {
      await prisma.videoCategory.deleteMany({ where: { videoId: id } });
      const validCategoryIds = data.categoryIds.filter(Boolean);
      if (validCategoryIds.length > 0) {
        await prisma.videoCategory.createMany({
          data: validCategoryIds.map((categoryId: number) => ({ videoId: id, categoryId })),
        });
      }
    }

    await cacheDelPattern('videos:*');
    await cacheDel('categories:covers');

    await prisma.operationLog.create({
      data: {
        userId: req.user!.id,
        action: 'video_update',
        targetType: 'video',
        targetId: id,
        details: JSON.stringify({ title: video.title }),
        ipAddress: getClientIp(req),
      },
    });

    res.json({ success: true, video });
  } catch (error) {
    console.error('[Admin] 更新视频错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.delete('/videos/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);

    const video = await prisma.video.findUnique({
      where: { id },
      include: {
        vodVideo: {
          include: {
            mediaAssets: { select: { id: true, url: true } },
            videos: { select: { id: true } },
            previewVideos: { select: { id: true } },
          },
        },
        previewVodVideo: {
          include: {
            mediaAssets: { select: { id: true, url: true } },
            videos: { select: { id: true } },
            previewVideos: { select: { id: true } },
          },
        },
      },
    });
    if (!video) {
      return res.status(404).json({ message: '视频不存在' });
    }

    // 找出仅被本视频独占引用的 vodVideo（删除后无其他引用）
    const exclusiveVodVideos = [video.vodVideo, video.previewVodVideo].filter(vv => {
      if (!vv) return false;
      return vv.videos.length + vv.previewVideos.length === 1;
    }) as NonNullable<typeof video.vodVideo>[];

    const { deleteFromOSS, deleteOSSFolder } = await import('../services/aliyun-oss.js');
    const { deleteVodVideos } = await import('../services/aliyun-vod.js');

    // 收集所有要删除的文件 URL（media_assets + 海报）
    const assetUrls = exclusiveVodVideos.flatMap(vv => vv.mediaAssets.map(a => a.url));
    const posterUrl = video.posterUrl;
    const allFileUrls = [...assetUrls, ...(posterUrl ? [posterUrl] : [])];

    // 查找 upload_logs 中对应的缩略图（thumbUrl）
    const uploadLogs = allFileUrls.length > 0
      ? await prisma.uploadLog.findMany({ where: { url: { in: allFileUrls } }, select: { id: true, thumbUrl: true } })
      : [];
    const thumbUrls = uploadLogs.map(l => l.thumbUrl).filter(Boolean) as string[];

    // 第一步：从阿里云 VOD 删除（已不存在视为成功；其他错误终止）
    const vodIds = exclusiveVodVideos.map(vv => vv.vodVideoId).filter(Boolean) as string[];
    if (vodIds.length > 0) {
      try {
        await deleteVodVideos(vodIds);
      } catch {
        return res.status(500).json({ message: '阿里云VOD视频删除失败，已终止操作' });
      }
    }

    // 第二步：通过 uuid 删除 OSS 整个文件夹（视频切片等）
    for (const vv of exclusiveVodVideos) {
      await deleteOSSFolder(vv.uuid).catch(err =>
        console.error('[Admin] 删除OSS文件夹失败:', vv.uuid, err)
      );
    }

    // 第三步：删除零散 OSS 文件（media_assets、海报、缩略图）
    for (const url of [...allFileUrls, ...thumbUrls]) {
      await deleteFromOSS(url).catch(err =>
        console.error('[Admin] 删除OSS文件失败:', url, err)
      );
    }

    // 第四步：清理数据库（upload_logs → vod_videos[cascade media_assets] → video）
    if (uploadLogs.length > 0) {
      await prisma.uploadLog.deleteMany({ where: { id: { in: uploadLogs.map(l => l.id) } } });
    }
    for (const vv of exclusiveVodVideos) {
      await prisma.vodVideo.delete({ where: { id: vv.id } });
    }
    await prisma.video.delete({ where: { id } });
    await cacheDelPattern('videos:*');
    await cacheDel('categories:covers');

    await prisma.operationLog.create({
      data: {
        userId: req.user!.id,
        action: 'video_delete',
        targetType: 'video',
        targetId: id,
        details: JSON.stringify({ title: video.title }),
        ipAddress: getClientIp(req),
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] 删除视频错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.post('/videos/batch', async (req: Request, res: Response) => {
  try {
    const { ids, action } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: '请选择视频' });
    }

    let result;
    switch (action) {
      case 'delete': {
        const deletingIdSet = new Set(ids as number[]);

        // 查询所有待删除视频及其 vodVideo 引用情况
        const videosToDelete = await prisma.video.findMany({
          where: { id: { in: ids } },
          include: {
            vodVideo: {
              include: {
                mediaAssets: { select: { id: true, url: true } },
                videos: { select: { id: true } },
                previewVideos: { select: { id: true } },
              },
            },
            previewVodVideo: {
              include: {
                mediaAssets: { select: { id: true, url: true } },
                videos: { select: { id: true } },
                previewVideos: { select: { id: true } },
              },
            },
          },
        });

        // 找出所有引用方均在本批次内的独占 vodVideo（去重）
        const exclusiveVodVideoMap = new Map<number, NonNullable<typeof videosToDelete[0]['vodVideo']>>();
        for (const video of videosToDelete) {
          for (const vv of [video.vodVideo, video.previewVodVideo]) {
            if (!vv || exclusiveVodVideoMap.has(vv.id)) continue;
            const allRefsInBatch =
              vv.videos.every(v => deletingIdSet.has(v.id)) &&
              vv.previewVideos.every(v => deletingIdSet.has(v.id));
            if (allRefsInBatch) exclusiveVodVideoMap.set(vv.id, vv);
          }
        }
        const exclusiveVodVideos = [...exclusiveVodVideoMap.values()];

        const { deleteFromOSS, deleteOSSFolder } = await import('../services/aliyun-oss.js');
        const { deleteVodVideos: deleteVodVideosBatch } = await import('../services/aliyun-vod.js');

        // 收集所有要删除的文件 URL（media_assets + 海报）
        const batchAssetUrls = exclusiveVodVideos.flatMap(vv => vv.mediaAssets.map(a => a.url));
        const batchPosterUrls = videosToDelete.map(v => v.posterUrl).filter(Boolean) as string[];
        const batchAllFileUrls = [...batchAssetUrls, ...batchPosterUrls];

        // 查找 upload_logs 中对应的缩略图
        const batchUploadLogs = batchAllFileUrls.length > 0
          ? await prisma.uploadLog.findMany({ where: { url: { in: batchAllFileUrls } }, select: { id: true, thumbUrl: true } })
          : [];
        const batchThumbUrls = batchUploadLogs.map(l => l.thumbUrl).filter(Boolean) as string[];

        // 第一步：从阿里云 VOD 删除（已不存在视为成功；其他错误终止）
        const vodIds = exclusiveVodVideos.map(vv => vv.vodVideoId).filter(Boolean) as string[];
        if (vodIds.length > 0) {
          try {
            await deleteVodVideosBatch(vodIds);
          } catch {
            return res.status(500).json({ message: '阿里云VOD视频删除失败，已终止操作' });
          }
        }

        // 第二步：通过 uuid 删除 OSS 整个文件夹（视频切片等）
        for (const vv of exclusiveVodVideos) {
          await deleteOSSFolder(vv.uuid).catch(err =>
            console.error('[Admin] 批量删除OSS文件夹失败:', vv.uuid, err)
          );
        }

        // 第三步：删除零散 OSS 文件（media_assets、海报、缩略图）
        for (const url of [...batchAllFileUrls, ...batchThumbUrls]) {
          await deleteFromOSS(url).catch(err =>
            console.error('[Admin] 批量删除OSS文件失败:', url, err)
          );
        }

        // 第四步：清理数据库（upload_logs → vod_videos[cascade] → videos）
        if (batchUploadLogs.length > 0) {
          await prisma.uploadLog.deleteMany({ where: { id: { in: batchUploadLogs.map(l => l.id) } } });
        }
        for (const vv of exclusiveVodVideos) {
          await prisma.vodVideo.delete({ where: { id: vv.id } });
        }
        result = await prisma.video.deleteMany({ where: { id: { in: ids } } });
        break;
      }
      case 'publish':
        result = await prisma.video.updateMany({
          where: { id: { in: ids } },
          data: { status: 'PUBLISHED', publishedAt: new Date() },
        });
        break;
      case 'draft':
        result = await prisma.video.updateMany({
          where: { id: { in: ids } },
          data: { status: 'DRAFT' },
        });
        break;
      case 'archive':
        result = await prisma.video.updateMany({
          where: { id: { in: ids } },
          data: { status: 'ARCHIVED' },
        });
        break;
      default:
        return res.status(400).json({ message: '不支持的操作' });
    }

    await cacheDelPattern('videos:*');
    await cacheDel('categories:covers');

    await prisma.operationLog.create({
      data: {
        userId: req.user!.id,
        action: `video_batch_${action}`,
        targetType: 'video',
        details: JSON.stringify({ ids, count: ids.length }),
        ipAddress: getClientIp(req),
      },
    });

    res.json({ success: true, affected: result.count ?? ids.length });
  } catch (error) {
    console.error('[Admin] 批量操作错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.get('/users', async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        nickname: true,
        avatarUrl: true,
        role: true,
        isPermanentlyBanned: true,
        bannedReason: true,
        lastLoginAt: true,
        lastLoginIp: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ users });
  } catch (error) {
    console.error('[Admin] 用户列表错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.post('/users', async (req: Request, res: Response) => {
  try {
    const bcrypt = await import('bcryptjs');
    const { v7: uuidv7 } = await import('uuid');
    const { username, password, nickname, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: '请输入用户名和密码' });
    }

    if (password.length < 9) {
      return res.status(400).json({ message: '密码长度不能少于9位' });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(400).json({ message: '用户名已存在' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        uuid: uuidv7(),
        username,
        passwordHash,
        nickname: nickname || username,
        role: role || 'USER',
      },
      select: { id: true, uuid: true, username: true, nickname: true, role: true, createdAt: true },
    });

    await prisma.operationLog.create({
      data: {
        userId: req.user!.id,
        action: 'user_create',
        targetType: 'user',
        targetId: user.id,
        details: JSON.stringify({ username: user.username, nickname: user.nickname, role: user.role }),
        ipAddress: getClientIp(req),
      },
    });

    res.json({ success: true, user });
  } catch (error) {
    console.error('[Admin] 创建用户错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.put('/users/:id', async (req: Request, res: Response) => {
  try {
    const bcrypt = await import('bcryptjs');
    const id = parseInt(req.params.id as string);
    const { nickname, role, password, avatarUrl } = req.body;

    const data: Record<string, unknown> = {};
    if (nickname !== undefined) data.nickname = nickname;
    if (role !== undefined) data.role = role;
    if (avatarUrl !== undefined) data.avatarUrl = avatarUrl || null;
    if (password) {
      if (password.length < 9) {
        return res.status(400).json({ message: '密码长度不能少于9位' });
      }
      data.passwordHash = await bcrypt.hash(password, 12);
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, username: true, nickname: true, role: true, avatarUrl: true },
    });

    await prisma.operationLog.create({
      data: {
        userId: req.user!.id,
        action: 'user_update',
        targetType: 'user',
        targetId: id,
        details: JSON.stringify({ username: user.username, nickname: user.nickname, role: user.role }),
        ipAddress: getClientIp(req),
      },
    });

    res.json({ success: true, user });
  } catch (error) {
    console.error('[Admin] 更新用户错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);

    if (id === req.user!.id) {
      return res.status(400).json({ message: '不能删除自己' });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { username: true, nickname: true },
    });

    await prisma.user.delete({ where: { id } });

    await prisma.operationLog.create({
      data: {
        userId: req.user!.id,
        action: 'user_delete',
        targetType: 'user',
        targetId: id,
        details: JSON.stringify({ username: user?.username, nickname: user?.nickname }),
        ipAddress: getClientIp(req),
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] 删除用户错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.post('/users/:id/unban', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);

    const { redis } = await import('../config/redis.js');

    const user = await prisma.user.update({
      where: { id },
      data: {
        isPermanentlyBanned: false,
        bannedReason: null,
        loginAttempts: 0,
      },
      select: { username: true, nickname: true },
    });

    await redis.del(`session:${id}`);

    await prisma.operationLog.create({
      data: {
        userId: req.user!.id,
        action: 'user_unban',
        targetType: 'user',
        targetId: id,
        details: JSON.stringify({ username: user.username, nickname: user.nickname }),
        ipAddress: getClientIp(req),
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] 解禁用户错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.get('/banned-ips', async (_req: Request, res: Response) => {
  try {
    const bannedIps = await prisma.bannedIp.findMany({
      where: { isPermanent: true, unbannedAt: null },
      orderBy: { bannedAt: 'desc' },
    });

    res.json({ bannedIps });
  } catch (error) {
    console.error('[Admin] 封禁IP列表错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.post('/banned-ips/:ip/unban', async (req: Request, res: Response) => {
  try {
    const ip = req.params.ip as string;
    const { cacheDel } = await import('../config/redis.js');

    await prisma.bannedIp.update({
      where: { ipAddress: ip },
      data: {
        unbannedAt: new Date(),
        unbannedBy: req.user!.id,
        isPermanent: false,
      },
    });

    await cacheDel(`ban:ip:${ip}`);

    await prisma.operationLog.create({
      data: {
        userId: req.user!.id,
        action: 'ip_unban',
        targetType: 'ip',
        details: JSON.stringify({ ip }),
        ipAddress: getClientIp(req),
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] 解禁IP错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        children: {
          include: {
            _count: {
              select: {
                videoCategories: true,
                photoAlbumCategories: true,
              },
            },
          },
        },
        _count: {
          select: {
            videoCategories: true,
            photoAlbumCategories: true,
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ categories });
  } catch (error) {
    console.error('[Admin] 分类列表错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.post('/categories', async (req: Request, res: Response) => {
  try {
    const { name, slug, parentId, sortOrder } = req.body;

    const existing = await prisma.category.findFirst({ where: { name } });
    if (existing) return void res.status(400).json({ message: `分类名称"${name}"已存在` });

    const category = await prisma.category.create({
      data: { name, slug, parentId, sortOrder },
    });

    const { cacheDel } = await import('../config/redis.js');
    await cacheDel('categories:all');

    res.json({ success: true, category });
  } catch (error) {
    console.error('[Admin] 创建分类错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.put('/categories-sort', async (req: Request, res: Response) => {
  try {
    const { categories } = req.body;
    if (!Array.isArray(categories)) {
      return res.status(400).json({ message: '无效的数据' });
    }

    await prisma.$transaction(
      categories.map((item: { id: number; sortOrder: number; parentId?: number | null }) =>
        prisma.category.update({
          where: { id: item.id },
          data: {
            sortOrder: item.sortOrder,
            ...(item.parentId !== undefined ? { parentId: item.parentId } : {}),
          },
        })
      )
    );

    const { cacheDelPattern } = await import('../config/redis.js');
    await cacheDelPattern('categories:*');

    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] 更新分类排序错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.put('/categories/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { name, slug, parentId, sortOrder } = req.body;

    const existing = await prisma.category.findFirst({ where: { name, id: { not: id } } });
    if (existing) return void res.status(400).json({ message: `分类名称"${name}"已存在` });

    const category = await prisma.category.update({
      where: { id },
      data: { name, slug, parentId, sortOrder },
    });

    const { cacheDel } = await import('../config/redis.js');
    await cacheDel('categories:all');

    res.json({ success: true, category });
  } catch (error) {
    console.error('[Admin] 更新分类错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.delete('/categories/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);

    await prisma.category.delete({ where: { id } });

    const { cacheDel } = await import('../config/redis.js');
    await cacheDel('categories:all');

    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] 删除分类错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.get('/login-logs', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize as string) || 50));
    const skip = (page - 1) * pageSize;

    const [logs, total] = await Promise.all([
      prisma.loginLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: { user: { select: { nickname: true } } },
      }),
      prisma.loginLog.count(),
    ]);

    res.json({ logs, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch (error) {
    console.error('[Admin] 登录日志错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.get('/operation-logs', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize as string) || 50));
    const skip = (page - 1) * pageSize;

    const [logs, total] = await Promise.all([
      prisma.operationLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: { user: { select: { username: true, nickname: true } } },
      }),
      prisma.operationLog.count(),
    ]);

    res.json({ logs, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch (error) {
    console.error('[Admin] 操作日志错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.delete('/login-logs', async (req: Request, res: Response) => {
  try {
    const result = await prisma.loginLog.deleteMany();
    await prisma.operationLog.create({
      data: {
        userId: req.user!.id,
        action: 'login_logs_clear',
        targetType: 'login_log',
        details: JSON.stringify({ deleted: result.count }),
        ipAddress: getClientIp(req),
      },
    });
    res.json({ success: true, deleted: result.count });
  } catch (error) {
    console.error('[Admin] 清空登录日志错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.delete('/operation-logs', async (req: Request, res: Response) => {
  try {
    const result = await prisma.operationLog.deleteMany();
    res.json({ success: true, deleted: result.count });
  } catch (error) {
    console.error('[Admin] 清空操作日志错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.get('/media', async (req: Request, res: Response) => {
  try {
    const type = req.query.type as string;
    const search = req.query.search as string;

    const assets = await prisma.mediaAsset.findMany({
      include: {
        vodVideo: {
          select: {
            id: true,
            filename: true,
            videos: { select: { id: true, title: true } },
            previewVideos: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const videosWithPoster = await prisma.video.findMany({
      where: { posterUrl: { not: null } },
      select: { id: true, title: true, posterUrl: true, createdAt: true },
    });

    const albumsWithCover = await prisma.photoAlbum.findMany({
      where: { coverUrl: { not: null } },
      select: { id: true, title: true, coverUrl: true, createdAt: true },
    });

    const users = await prisma.user.findMany({
      where: { avatarUrl: { not: null } },
      select: { id: true, username: true, nickname: true, avatarUrl: true },
    });

    const mediaItems: any[] = [];

    const typeMap: Record<string, { label: string; mediaType: string }> = {
      CAPTION:    { label: '字幕文件',    mediaType: 'subtitle' },
      SPRITE:     { label: '雪碧图',      mediaType: 'sprite' },
      SPRITE_VTT: { label: '雪碧图VTT',  mediaType: 'sprite_vtt' },
    };

    for (const asset of assets) {
      if (asset.type === 'COVER') continue;
      const vod = asset.vodVideo;
      const refVideos = [...vod.videos, ...vod.previewVideos];
      const titles = refVideos.map(v => v.title).join(', ') || vod.filename;
      const meta = typeMap[asset.type] || { label: asset.type, mediaType: 'image' };
      mediaItems.push({
        id: `asset-${asset.id}`,
        type: meta.mediaType,
        url: asset.url,
        title: `${titles} (${meta.label})`,
        originalFilename: asset.originalFilename || null,
        source: 'vod_video',
        sourceId: vod.id,
        sourceTitle: vod.filename,
        isReferenced: refVideos.length > 0,
        createdAt: asset.createdAt,
      });
    }

    for (const video of videosWithPoster) {
      mediaItems.push({
        id: `poster-${video.id}`,
        type: 'poster',
        url: video.posterUrl!,
        title: `${video.title} (海报)`,
        source: 'video',
        sourceId: video.id,
        sourceTitle: video.title,
        isReferenced: true,
        createdAt: video.createdAt,
      });
    }

    for (const album of albumsWithCover) {
      // 检查是否已存在（避免与upload_logs重复）
      const exists = mediaItems.some(item => item.url === album.coverUrl || item.url.split('?')[0] === album.coverUrl);
      if (!exists) {
        mediaItems.push({
          id: `album-cover-${album.id}`,
          type: 'poster',
          url: album.coverUrl!,
          title: `${album.title} (相册封面)`,
          source: 'photo_album',
          sourceId: album.id,
          sourceTitle: album.title,
          isReferenced: true,
          createdAt: album.createdAt,
        });
      }
    }

    for (const user of users) {
      if (user.avatarUrl) {
        mediaItems.push({
          id: `avatar-${user.id}`,
          type: 'avatar',
          url: user.avatarUrl,
          title: `${user.nickname || user.username} 的头像`,
          source: 'user',
          sourceId: user.id,
          sourceTitle: user.nickname || user.username,
          isReferenced: true,
          createdAt: new Date(),
        });
      }
    }

    const uploadLogs = await prisma.uploadLog.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { username: true, nickname: true },
        },
      },
    });

    for (const log of uploadLogs) {
      const exists = mediaItems.some(item => item.url === log.url || item.url.split('?')[0] === log.url);
      if (!exists) {
        mediaItems.push({
          id: `upload-${log.id}`,
          type: log.type as 'avatar' | 'poster' | 'image',
          url: log.url,
          thumbUrl: log.thumbUrl,
          title: log.filename || `${log.user.nickname || log.user.username} 上传的${log.type === 'avatar' ? '头像' : log.type === 'poster' ? '海报' : '图片'}`,
          originalFilename: log.filename || null,
          source: 'upload',
          sourceId: Number(log.id),
          sourceTitle: log.user.nickname || log.user.username,
          isReferenced: false,
          createdAt: log.createdAt,
          filename: log.filename,
          filesize: log.filesize,
          mimetype: log.mimetype,
          width: log.width,
          height: log.height,
        });
      }
    }

    let filtered = mediaItems;
    if (type) {
      filtered = mediaItems.filter(item => item.type === type);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(item =>
        item.title.toLowerCase().includes(searchLower) ||
        item.url.toLowerCase().includes(searchLower)
      );
    }

    const stats = {
      total: mediaItems.length,
      images: mediaItems.filter(i => i.type === 'image').length,
      posters: mediaItems.filter(i => i.type === 'poster').length,
      avatars: mediaItems.filter(i => i.type === 'avatar').length,
      sprites: mediaItems.filter(i => i.type === 'sprite').length,
      subtitles: mediaItems.filter(i => i.type === 'subtitle').length,
      spriteVtts: mediaItems.filter(i => i.type === 'sprite_vtt').length,
      photos: mediaItems.filter(i => i.type === 'photos').length,
    };

    res.json({ media: filtered, stats });
  } catch (error) {
    console.error('[Admin] 媒体列表错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.get('/media/check-refs', async (req: Request, res: Response) => {
  try {
    const url = req.query.url as string;

    if (!url) {
      return res.status(400).json({ message: '缺少URL参数' });
    }

    const assetRefs = await prisma.mediaAsset.findMany({
      where: { url },
      select: { id: true, type: true, vodVideo: { select: { id: true, uuid: true, filename: true } } },
    });

    const vodRefs = await prisma.vodVideo.findMany({
      where: { videoUrl: url },
      select: { id: true, uuid: true, filename: true },
    });

    const posterRefs = await prisma.video.findMany({
      where: { posterUrl: url },
      select: { id: true, uuid: true, title: true },
    });

    const avatarRefs = await prisma.user.findMany({
      where: { avatarUrl: url },
      select: { id: true, username: true, nickname: true },
    });

    const references = {
      assets: assetRefs,
      vodVideos: vodRefs,
      posters: posterRefs,
      avatars: avatarRefs,
      isReferenced: assetRefs.length > 0 || vodRefs.length > 0 || posterRefs.length > 0 || avatarRefs.length > 0,
    };

    res.json({ references });
  } catch (error) {
    console.error('[Admin] 检查引用错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.delete('/media/:type/:id', async (req: Request, res: Response) => {
  try {
    const type = req.params.type as string;
    const id = req.params.id as string;

    const dashIdx = id.indexOf('-');
    if (dashIdx === -1) {
      return res.status(400).json({ message: '无效的资源ID' });
    }

    const idPrefix = id.substring(0, dashIdx);
    const resourceId = parseInt(id.substring(dashIdx + 1));
    const details: Record<string, any> = { type, resourceId };

    if (idPrefix === 'poster') {
      const video = await prisma.video.update({
        where: { id: resourceId },
        data: { posterUrl: null },
        select: { title: true },
      });
      details.title = video.title;
    } else if (idPrefix === 'asset') {
      const asset = await prisma.mediaAsset.delete({
        where: { id: resourceId },
        include: { vodVideo: { select: { filename: true } } },
      });
      details.filename = asset.vodVideo.filename;
      details.assetType = asset.type;
    } else if (idPrefix === 'avatar') {
      const user = await prisma.user.update({
        where: { id: resourceId },
        data: { avatarUrl: null },
        select: { username: true, nickname: true },
      });
      details.username = user.username;
      details.nickname = user.nickname;
    } else if (idPrefix === 'upload') {
      const uploadLog = await prisma.uploadLog.delete({
        where: { id: BigInt(resourceId) },
        select: { filename: true, url: true, type: true },
      });
      details.filename = uploadLog.filename;
      details.url = uploadLog.url;
      details.mediaType = uploadLog.type;
    } else if (idPrefix === 'vod' || type === 'video') {
      // vod- 前缀：删除整个 VodVideo 记录（无引用才可删除）
      const vodVideo = await prisma.vodVideo.findUnique({
        where: { id: resourceId },
        include: {
          videos: { select: { id: true, title: true } },
          previewVideos: { select: { id: true, title: true } },
          mediaAssets: { select: { url: true } },
        },
      });
      if (!vodVideo) {
        return res.status(404).json({ message: 'VOD视频不存在' });
      }
      const refs = [...vodVideo.videos, ...vodVideo.previewVideos];
      if (refs.length > 0) {
        return res.status(400).json({
          message: '该VOD视频已被视频文章引用，无法删除',
          references: refs,
        });
      }
      // 先从数据库删除，再异步清理远程资源
      await prisma.vodVideo.delete({ where: { id: resourceId } });
      details.filename = vodVideo.filename;

      // 异步删除所有关联的远程资源（不阻塞响应）
      const ossUrls = [
        vodVideo.videoUrl,
        ...vodVideo.mediaAssets.map(a => a.url),
      ].filter(Boolean) as string[];

      Promise.all([
        vodVideo.vodVideoId
          ? import('../services/aliyun-vod.js').then(({ deleteVodVideos }) =>
              deleteVodVideos([vodVideo.vodVideoId!])
            ).catch((err: unknown) => console.error('[Admin] 删除VOD失败:', err))
          : Promise.resolve(),
        ossUrls.length > 0
          ? import('../services/aliyun-oss.js').then(({ deleteFromOSS }) =>
              Promise.all(ossUrls.map(url => deleteFromOSS(url).catch((err: unknown) => console.error('[Admin] 删除OSS文件失败:', url, err))))
            ).catch((err: unknown) => console.error('[Admin] 删除OSS资源失败:', err))
          : Promise.resolve(),
      ]);
    }

    await cacheDelPattern('videos:*');
    await cacheDel('categories:covers');

    await prisma.operationLog.create({
      data: {
        userId: req.user!.id,
        action: 'media_delete',
        targetType: type,
        targetId: resourceId,
        details: JSON.stringify(details),
        ipAddress: getClientIp(req),
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] 删除媒体错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});


// GET /admin/videos/:id/watch-segments?userId=&date=&page=&pageSize=
router.get('/videos/:id/watch-segments', async (req: Request, res: Response) => {
  try {
    const videoId = parseInt(req.params.id as string);
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    const date = req.query.date as string; // YYYY-MM-DD
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize as string) || 100));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { videoId };
    if (userId) where.userId = userId;
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      where.createdAt = { gte: start, lt: end };
    }

    const [segments, total] = await Promise.all([
      prisma.viewSegment.findMany({
        where,
        include: {
          user: { select: { id: true, username: true, nickname: true } },
        },
        orderBy: [{ userId: 'asc' }, { createdAt: 'asc' }],
        skip,
        take: pageSize,
      }),
      prisma.viewSegment.count({ where }),
    ]);

    const grouped: Record<number, { user: { id: number; username: string; nickname: string }; segments: { start: number; end: number; at: Date }[] }> = {};
    for (const seg of segments) {
      if (!grouped[seg.userId]) {
        grouped[seg.userId] = { user: seg.user, segments: [] };
      }
      grouped[seg.userId].segments.push({
        start: Number(seg.segStart),
        end: Number(seg.segEnd),
        at: seg.createdAt,
      });
    }

    res.json({
      data: Object.values(grouped),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error('[Admin] 观看片段查询错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});


// GET /admin/users/:id/watch-segments?videoId=&date=&page=&pageSize=
router.get('/users/:id/watch-segments', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id as string);
    const videoId = req.query.videoId ? parseInt(req.query.videoId as string) : undefined;
    const date = req.query.date as string;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize as string) || 100));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { userId };
    if (videoId) where.videoId = videoId;
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      where.createdAt = { gte: start, lt: end };
    }

    const [segments, total] = await Promise.all([
      prisma.viewSegment.findMany({
        where,
        include: {
          video: { select: { id: true, uuid: true, title: true } },
        },
        orderBy: [{ videoId: 'asc' }, { createdAt: 'asc' }],
        skip,
        take: pageSize,
      }),
      prisma.viewSegment.count({ where }),
    ]);

    const grouped: Record<number, { video: { id: number; uuid: string; title: string }; segments: { start: number; end: number; at: Date }[] }> = {};
    for (const seg of segments) {
      if (!grouped[seg.videoId]) {
        grouped[seg.videoId] = { video: seg.video, segments: [] };
      }
      grouped[seg.videoId].segments.push({
        start: Number(seg.segStart),
        end: Number(seg.segEnd),
        at: seg.createdAt,
      });
    }

    res.json({
      data: Object.values(grouped),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error('[Admin] 用户观看片段查询错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});


// GET /admin/view-records?page=&pageSize=&userId=&videoId=&search=
router.get('/view-records', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    const videoId = req.query.videoId ? parseInt(req.query.videoId as string) : undefined;
    const search = req.query.search as string;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (videoId) where.videoId = videoId;
    if (search) {
      where.OR = [
        { videoTitle: { contains: search } },
        { user: { username: { contains: search } } },
        { user: { nickname: { contains: search } } },
      ];
    }

    const [records, total] = await Promise.all([
      prisma.viewRecord.findMany({
        where,
        orderBy: { lastViewedAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          user: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
          video: {
            select: {
              id: true, uuid: true, title: true, posterUrl: true,
              vodVideo: { select: { videoDuration: true } },
            },
          },
        },
      }),
      prisma.viewRecord.count({ where }),
    ]);

    res.json({
      data: records.map(r => ({
        id: Number(r.id),
        user: r.user,
        videoId: r.videoId,
        videoUuid: r.videoUuid,
        videoTitle: r.videoTitle,
        video: r.video ? { id: r.video.id, uuid: r.video.uuid, title: r.video.title, posterUrl: r.video.posterUrl } : null,
        lastPosition: Number(r.lastPosition),
        totalDuration: Number(r.totalDuration),
        actualDuration: r.video?.vodVideo?.videoDuration ? Number(r.video.vodVideo.videoDuration) : null,
        viewCount: r.viewCount,
        lastViewedAt: r.lastViewedAt,
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error('[Admin] 观看记录列表错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

// DELETE /admin/view-records  批量删除（body: { ids: number[] }）
router.delete('/view-records', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body as { ids: number[] };
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'INVALID_PARAMS' });
    const numIds = ids.map(Number).filter(n => !isNaN(n) && n > 0);
    if (numIds.length === 0) return res.status(400).json({ message: 'INVALID_PARAMS' });

    // 先查出对应的 userId+videoId，再删关联片段
    const toDelete = await prisma.viewRecord.findMany({
      where: { id: { in: numIds } },
      select: { userId: true, videoId: true },
    });
    for (const r of toDelete) {
      if (r.videoId) {
        await prisma.viewSegment.deleteMany({ where: { userId: r.userId, videoId: r.videoId } });
      }
    }
    const { count } = await prisma.viewRecord.deleteMany({ where: { id: { in: numIds } } });
    res.json({ count });
  } catch (error) {
    console.error('[Admin] 删除观看记录错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

// GET /admin/view-records/segments?userId=&videoId= 查询某用户某视频的片段
router.get('/view-records/segments', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.query.userId as string);
    const videoId = parseInt(req.query.videoId as string);
    if (!userId || !videoId) return res.status(400).json({ message: 'INVALID_PARAMS' });

    const segments = await prisma.viewSegment.findMany({
      where: { userId, videoId },
      orderBy: { createdAt: 'asc' },
      select: { segStart: true, segEnd: true, createdAt: true },
    });

    res.json({
      data: segments.map(s => ({
        start: Number(s.segStart),
        end: Number(s.segEnd),
        at: s.createdAt,
      })),
    });
  } catch (error) {
    console.error('[Admin] 观看片段查询错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});


// 合并去重后求观看时长
function mergeWatchedDuration(segs: { start: number; end: number }[]): number {
  if (segs.length === 0) return 0;
  const sorted = [...segs].sort((a, b) => a.start - b.start);
  let watched = 0;
  let curStart = sorted[0].start;
  let curEnd = sorted[0].end;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start > curEnd) {
      watched += curEnd - curStart;
      curStart = sorted[i].start;
      curEnd = sorted[i].end;
    } else if (sorted[i].end > curEnd) {
      curEnd = sorted[i].end;
    }
  }
  watched += curEnd - curStart;
  return watched;
}

// GET /admin/watch-completion/videos?page=&pageSize=&search=
// 列出有观看记录的视频，按视频聚合完整度统计
router.get('/watch-completion/videos', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const search = (req.query.search as string) || '';
    const skip = (page - 1) * pageSize;

    // 用 raw SQL 按 videoId 分组并按观看人数排序，避免 Prisma groupBy 在 LongText 字段上的限制
    const searchClause = search ? `AND (vr.video_title LIKE ? OR v.title LIKE ?)` : '';
    const params: unknown[] = [];
    if (search) {
      const like = `%${search}%`;
      params.push(like, like);
    }

    const grouped = await prisma.$queryRawUnsafe<Array<{ video_id: number; viewers: bigint }>>(
      `SELECT vr.video_id, COUNT(DISTINCT vr.user_id) AS viewers
       FROM view_records vr
       LEFT JOIN videos v ON v.id = vr.video_id
       WHERE vr.video_id IS NOT NULL ${searchClause}
       GROUP BY vr.video_id
       ORDER BY viewers DESC, vr.video_id DESC`,
      ...params
    );

    const total = grouped.length;
    const paged = grouped.slice(skip, skip + pageSize);
    const videoIds = paged.map(g => Number(g.video_id));

    if (videoIds.length === 0) {
      return res.json({
        data: [],
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    }

    const videos = await prisma.video.findMany({
      where: { id: { in: videoIds } },
      select: {
        id: true, uuid: true, title: true, posterUrl: true,
        vodVideo: { select: { videoDuration: true } },
      },
    });
    const videoMap = new Map(videos.map(v => [v.id, v]));

    const allSegments = await prisma.viewSegment.findMany({
      where: { videoId: { in: videoIds } },
      select: { userId: true, videoId: true, segStart: true, segEnd: true },
    });
    const segGroups = new Map<string, { start: number; end: number }[]>();
    for (const s of allSegments) {
      const key = `${s.userId}:${s.videoId}`;
      const arr = segGroups.get(key);
      const seg = { start: Number(s.segStart), end: Number(s.segEnd) };
      if (arr) arr.push(seg); else segGroups.set(key, [seg]);
    }

    const records = await prisma.viewRecord.findMany({
      where: { videoId: { in: videoIds } },
      select: { userId: true, videoId: true, lastViewedAt: true },
    });
    const userByVideo = new Map<number, Set<number>>();
    const lastViewByVideo = new Map<number, Date>();
    for (const r of records) {
      const vid = r.videoId!;
      if (!userByVideo.has(vid)) userByVideo.set(vid, new Set());
      userByVideo.get(vid)!.add(r.userId);
      const prev = lastViewByVideo.get(vid);
      if (!prev || r.lastViewedAt > prev) lastViewByVideo.set(vid, r.lastViewedAt);
    }

    const data = paged.map(g => {
      const vid = Number(g.video_id);
      const v = videoMap.get(vid);
      const duration = v?.vodVideo?.videoDuration ? Number(v.vodVideo.videoDuration) : 0;
      const users = userByVideo.get(vid) || new Set<number>();

      let sumCompletion = 0;
      let maxCompletion = 0;
      let withSegments = 0;
      for (const userId of users) {
        const segs = segGroups.get(`${userId}:${vid}`);
        if (!segs || segs.length === 0) continue;
        const watched = mergeWatchedDuration(segs);
        const completion = duration > 0 ? Math.min(1, watched / duration) : 0;
        sumCompletion += completion;
        if (completion > maxCompletion) maxCompletion = completion;
        withSegments++;
      }
      const avgCompletion = withSegments > 0 ? sumCompletion / withSegments : 0;

      return {
        videoId: vid,
        uuid: v?.uuid ?? null,
        title: v?.title ?? '(已删除)',
        posterUrl: v?.posterUrl ?? null,
        duration,
        uniqueViewers: users.size,
        avgCompletion,
        maxCompletion,
        lastViewedAt: lastViewByVideo.get(vid) ?? null,
      };
    });

    res.json({
      data,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error('[Admin] 观看完整度-视频列表错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

// GET /admin/watch-completion/videos/:videoId/users
// 单视频的所有观看用户完整度详情
router.get('/watch-completion/videos/:videoId/users', async (req: Request, res: Response) => {
  try {
    const videoId = parseInt(req.params.videoId as string);
    if (!videoId) return res.status(400).json({ message: 'INVALID_PARAMS' });

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: {
        id: true, uuid: true, title: true, posterUrl: true,
        vodVideo: { select: { videoDuration: true } },
      },
    });
    if (!video) return res.status(404).json({ message: 'NOT_FOUND' });

    const duration = video.vodVideo?.videoDuration ? Number(video.vodVideo.videoDuration) : 0;

    const [records, allSegments] = await Promise.all([
      prisma.viewRecord.findMany({
        where: { videoId },
        include: {
          user: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
        },
      }),
      prisma.viewSegment.findMany({
        where: { videoId },
        select: { userId: true, segStart: true, segEnd: true },
      }),
    ]);

    const segByUser = new Map<number, { start: number; end: number }[]>();
    for (const s of allSegments) {
      const arr = segByUser.get(s.userId);
      const seg = { start: Number(s.segStart), end: Number(s.segEnd) };
      if (arr) arr.push(seg); else segByUser.set(s.userId, [seg]);
    }

    const data = records.map(r => {
      const segs = segByUser.get(r.userId) || [];
      const watched = mergeWatchedDuration(segs);
      const completion = duration > 0 ? Math.min(1, watched / duration) : 0;
      return {
        userId: r.userId,
        user: r.user,
        completion,
        watchedDuration: watched,
        lastPosition: Number(r.lastPosition),
        viewCount: r.viewCount,
        segmentCount: segs.length,
        lastViewedAt: r.lastViewedAt,
      };
    }).sort((a, b) => b.completion - a.completion);

    res.json({
      video: {
        id: video.id, uuid: video.uuid, title: video.title, posterUrl: video.posterUrl,
        duration,
      },
      data,
    });
  } catch (error) {
    console.error('[Admin] 观看完整度-用户列表错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});


router.get('/vod-cloud/config', (_req: Request, res: Response) => {
  const key = env.ALIYUN_VOD_ACCESS_KEY;
  const secret = env.ALIYUN_VOD_ACCESS_SECRET;
  const mask = (s: string) => s ? s.substring(0, 4) + '****' + s.substring(s.length - 4) : '';
  res.json({
    accessKey: mask(key),
    accessSecret: mask(secret),
    endpoint: env.ALIYUN_VOD_ENDPOINT,
  });
});

router.get('/vod-cloud/categories', async (_req: Request, res: Response) => {
  try {
    const client = await createVodClient();
    const { GetCategoriesRequest } = await import('@alicloud/vod20170321');
    const req2 = new GetCategoriesRequest({ cateId: -1, pageNo: 1, pageSize: 100 });
    const response = await client.getCategories(req2);
    const categories = (response.body?.subCategories?.category || []).map((c: any) => ({
      cateId: c.cateId,
      cateName: c.cateName,
    }));
    res.json({ categories });
  } catch (error) {
    console.error('[VOD Cloud] 获取分类失败:', error);
    res.status(500).json({ message: '获取VOD分类失败' });
  }
});

router.get('/vod-cloud/videos', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize as string) || 50));
    const cateId = req.query.cateId as string;

    const client = await createVodClient();
    const { GetVideoListRequest } = await import('@alicloud/vod20170321');
    const params: Record<string, any> = { pageNo: page, pageSize };
    if (cateId && cateId !== '') params.cateId = parseInt(cateId);

    const request = new GetVideoListRequest(params);
    const response = await client.getVideoList(request);
    const videos: any[] = response.body?.videoList?.video || [];
    const total = Number(response.body?.total || 0);

    const vodIds = videos.map((v: any) => v.videoId).filter(Boolean);
    const localRecords = vodIds.length
      ? await prisma.vodVideo.findMany({
          where: { vodVideoId: { in: vodIds } },
          select: {
            id: true,
            vodVideoId: true,
            videos: { select: { id: true, title: true } },
            previewVideos: { select: { id: true, title: true } },
          },
        })
      : [];
    const localMap = new Map(localRecords.map(v => [v.vodVideoId, v]));

    const { generateVodPlayUrl } = await import('../services/aliyun-oss.js');
    const enriched = videos.map((v: any) => {
      const local = localMap.get(v.videoId);
      return {
        videoId: v.videoId,
        title: v.title,
        coverUrl: v.coverURL ? generateVodPlayUrl(v.coverURL) : null,
        duration: v.duration ? Number(v.duration) : null,
        status: v.status,
        createdAt: v.creationTime,
        cateId: v.cateId,
        cateName: v.cateName,
        inLocalDb: !!local,
        localId: local?.id ?? null,
        usedInVideos: local ? [...(local.videos ?? []), ...(local.previewVideos ?? [])] : [],
      };
    });

    res.json({
      videos: enriched,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error('[VOD Cloud] 获取视频列表失败:', error);
    res.status(500).json({ message: '获取VOD云端视频失败' });
  }
});

router.delete('/vod-cloud/videos', async (req: Request, res: Response) => {
  try {
    const { videoIds } = req.body as { videoIds: string[] };
    if (!Array.isArray(videoIds) || videoIds.length === 0) {
      return res.status(400).json({ message: '请提供要删除的视频ID' });
    }

    const client = await createVodClient();
    const { DeleteVideoRequest } = await import('@alicloud/vod20170321');
    const request = new DeleteVideoRequest({ videoIds: videoIds.join(',') });
    await client.deleteVideo(request);

    res.json({ message: `已删除 ${videoIds.length} 个视频` });
  } catch (error) {
    console.error('[VOD Cloud] 删除视频失败:', error);
    res.status(500).json({ message: '删除视频失败' });
  }
});

router.get('/vod-cloud/play/:vodId', async (req: Request, res: Response) => {
  try {
    const { vodId } = req.params;

    const client = await createVodClient();
    const { GetPlayInfoRequest } = await import('@alicloud/vod20170321');
    const request = new GetPlayInfoRequest({ videoId: vodId });
    const response = await client.getPlayInfo(request);
    const playInfoList: any[] = response.body?.playInfoList?.playInfo || [];

    if (!playInfoList.length) {
      return res.status(404).json({ message: '无可播放的视频流' });
    }

    const { generateVodPlayUrl } = await import('../services/aliyun-oss.js');
    const DEFINITION_LABELS: Record<string, string> = {
      OD: '原画', '4K': '4K', '2K': '2K',
      FHD: '1080P', HD: '720P', SD: '480P', LD: '360P', FD: '240P',
    };
    const sorted = [...playInfoList].sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0));
    const qualities = sorted.map((info: any) => {
      let cleanUrl = info.playURL || '';
      try { const p = new URL(cleanUrl); p.searchParams.delete('auth_key'); cleanUrl = p.toString(); } catch { /* keep */ }
      const def = (info.definition as string) || '';
      const h = Number(info.height) || 0;
      const fmt = ((info.format as string) || '').toLowerCase() || (cleanUrl.includes('.m3u8') ? 'm3u8' : 'mp4');
      return {
        definition: def,
        label: DEFINITION_LABELS[def] || (h ? `${h}P` : def || fmt.toUpperCase()),
        height: h,
        width: Number(info.width) || 0,
        url: cleanUrl ? generateVodPlayUrl(cleanUrl) : '',
        format: fmt,
        bitrate: Number(info.bitrate) || 0,
      };
    });
    const best = qualities.find(q => q.format !== 'm3u8') || qualities[0];
    const isHls = qualities.some(q => q.format === 'm3u8');

    res.json({ playURL: best?.url || '', qualities, isHls });
  } catch (error) {
    console.error('[VOD Cloud] 获取播放地址失败:', error);
    res.status(500).json({ message: '获取播放地址失败' });
  }
});

router.get('/photo-albums', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const status = req.query.status as string;
    const search = req.query.search as string;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (status) where.status = status.toUpperCase();
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { content: { contains: search } },
      ];
    }

    const [albums, total] = await Promise.all([
      prisma.photoAlbum.findMany({
        where,
        orderBy: [{ isPickup: 'desc' }, { publishedAt: 'desc' }],
        skip,
        take: pageSize,
        include: {
          categories: { include: { category: { select: { id: true, name: true, slug: true } } } },
          photos: { select: { id: true }, take: 1 },
          _count: { select: { photos: true } },
        },
      }),
      prisma.photoAlbum.count({ where }),
    ]);

    const { signUrl } = await import('../services/aliyun-oss.js');
    const signedAlbums = albums.map(album => ({
      ...album,
      coverUrl: album.coverUrl ? signUrl(album.coverUrl) : null,
    }));

    res.json({
      albums: signedAlbums,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error('[Admin] 相册列表错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.get('/photo-albums/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      return res.status(400).json({ message: '无效的ID' });
    }

    const album = await prisma.photoAlbum.findUnique({
      where: { id },
      include: {
        categories: { include: { category: { select: { id: true, name: true, slug: true } } } },
        photos: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!album) {
      return res.status(404).json({ message: '相册不存在' });
    }

    const { signUrl } = await import('../services/aliyun-oss.js');
    const signedAlbum = {
      ...album,
      coverUrl: album.coverUrl ? signUrl(album.coverUrl) : null,
      photos: album.photos.map(photo => ({
        ...photo,
        url: signUrl(photo.url),
        thumbnailUrl: photo.thumbnailUrl ? signUrl(photo.thumbnailUrl) : null,
      })),
    };

    res.json({ album: signedAlbum });
  } catch (error) {
    console.error('[Admin] 相册详情错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.post('/photo-albums', async (req: Request, res: Response) => {
  try {
    const { v7: uuidv7 } = await import('uuid');
    const {
      title,
      content,
      coverUrl,
      status = 'DRAFT',
      isPickup = false,
      categoryIds = [],
      allowedUsers,
      publishedAt,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ message: '请输入相册标题' });
    }

    const album = await prisma.photoAlbum.create({
      data: {
        uuid: uuidv7(),
        title: title.trim(),
        content: content || null,
        coverUrl: coverUrl || null,
        status: status,
        isPickup: Boolean(isPickup),
        allowedUsers: allowedUsers ? JSON.stringify(allowedUsers) : null,
        publishedAt: publishedAt ? new Date(publishedAt) : null,
        categories: categoryIds.length > 0 ? {
          create: categoryIds.map((categoryId: number) => ({ categoryId })),
        } : undefined,
      },
      include: {
        categories: { include: { category: { select: { id: true, name: true } } } },
      },
    });

    await cacheDelPattern('videos:*');
    await cacheDelPattern('categories:*');

    res.json({ album });
  } catch (error) {
    console.error('[Admin] 创建相册错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.put('/photo-albums/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      return res.status(400).json({ message: '无效的ID' });
    }

    const existing = await prisma.photoAlbum.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: '相册不存在' });
    }

    const {
      title,
      content,
      coverUrl,
      status,
      isPickup,
      categoryIds,
      allowedUsers,
      publishedAt,
    } = req.body;

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title.trim();
    if (content !== undefined) updateData.content = content || null;
    if (coverUrl !== undefined) updateData.coverUrl = coverUrl ? coverUrl.split('?')[0] : null;
    if (status !== undefined) updateData.status = status;
    if (isPickup !== undefined) updateData.isPickup = Boolean(isPickup);
    if (allowedUsers !== undefined) updateData.allowedUsers = allowedUsers ? JSON.stringify(allowedUsers) : null;
    if (publishedAt !== undefined) updateData.publishedAt = publishedAt ? new Date(publishedAt) : null;

    if (categoryIds !== undefined) {
      await prisma.photoAlbumCategory.deleteMany({ where: { albumId: id } });
      if (categoryIds.length > 0) {
        await prisma.photoAlbumCategory.createMany({
          data: categoryIds.map((categoryId: number) => ({ albumId: id, categoryId })),
        });
      }
    }

    const album = await prisma.photoAlbum.update({
      where: { id },
      data: updateData,
      include: {
        categories: { include: { category: { select: { id: true, name: true, slug: true } } } },
      },
    });

    await cacheDelPattern('videos:*');
    await cacheDelPattern('categories:*');

    res.json({ album });
  } catch (error) {
    console.error('[Admin] 更新相册错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.delete('/photo-albums/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      return res.status(400).json({ message: '无效的ID' });
    }

    const album = await prisma.photoAlbum.findUnique({
      where: { id },
      include: { photos: true },
    });

    if (!album) {
      return res.status(404).json({ message: '相册不存在' });
    }

    // 删除相册（级联删除图片和分类关联）
    await prisma.photoAlbum.delete({ where: { id } });

    await cacheDelPattern('videos:*');
    await cacheDelPattern('categories:*');

    res.json({ message: '相册已删除' });
  } catch (error) {
    console.error('[Admin] 删除相册错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.post('/photo-albums/batch', async (req: Request, res: Response) => {
  try {
    const { ids, action } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: '请选择要操作的相册' });
    }

    let result;
    switch (action) {
      case 'publish':
        result = await prisma.photoAlbum.updateMany({
          where: { id: { in: ids } },
          data: { status: 'PUBLISHED', publishedAt: new Date() },
        });
        break;
      case 'draft':
        result = await prisma.photoAlbum.updateMany({
          where: { id: { in: ids } },
          data: { status: 'DRAFT' },
        });
        break;
      case 'archive':
        result = await prisma.photoAlbum.updateMany({
          where: { id: { in: ids } },
          data: { status: 'ARCHIVED' },
        });
        break;
      case 'delete':
        result = await prisma.photoAlbum.deleteMany({
          where: { id: { in: ids } },
        });
        break;
      default:
        return res.status(400).json({ message: '无效的操作' });
    }

    await cacheDelPattern('videos:*');
    await cacheDelPattern('categories:*');

    res.json({ message: `已${action === 'delete' ? '删除' : '更新'} ${result.count} 个相册` });
  } catch (error) {
    console.error('[Admin] 批量操作相册错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.post('/photo-albums/:id/photos', async (req: Request, res: Response) => {
  try {
    const albumId = parseInt(req.params.id as string);
    if (isNaN(albumId)) {
      return res.status(400).json({ message: '无效的ID' });
    }

    const album = await prisma.photoAlbum.findUnique({ where: { id: albumId } });
    if (!album) {
      return res.status(404).json({ message: '相册不存在' });
    }

    const { photos } = req.body;
    if (!Array.isArray(photos) || photos.length === 0) {
      return res.status(400).json({ message: '请提供图片数据' });
    }

    const maxSort = await prisma.photo.aggregate({
      where: { albumId },
      _max: { sortOrder: true },
    });
    let nextSort = (maxSort._max.sortOrder || 0) + 1;

    const createdPhotos = await prisma.photo.createMany({
      data: photos.map((photo: { url: string; thumbnailUrl?: string; width?: number; height?: number; filesize?: number }) => ({
        albumId,
        url: photo.url,
        thumbnailUrl: photo.thumbnailUrl || null,
        width: photo.width || null,
        height: photo.height || null,
        filesize: photo.filesize || null,
        sortOrder: nextSort++,
      })),
    });

    // 如果没有封面图，使用第一张图片
    if (!album.coverUrl && photos.length > 0) {
      await prisma.photoAlbum.update({
        where: { id: albumId },
        data: { coverUrl: photos[0].url },
      });
    }

    const updatedAlbum = await prisma.photoAlbum.findUnique({
      where: { id: albumId },
      include: {
        photos: { orderBy: { sortOrder: 'asc' } },
      },
    });

    const { signUrl } = await import('../services/aliyun-oss.js');
    const signedAlbum = {
      ...updatedAlbum,
      coverUrl: updatedAlbum?.coverUrl ? signUrl(updatedAlbum.coverUrl) : null,
      photos: updatedAlbum?.photos.map(photo => ({
        ...photo,
        url: signUrl(photo.url),
        thumbnailUrl: photo.thumbnailUrl ? signUrl(photo.thumbnailUrl) : null,
      })) || [],
    };

    res.json({ album: signedAlbum, count: createdPhotos.count });
  } catch (error) {
    console.error('[Admin] 上传图片错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.delete('/photos/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      return res.status(400).json({ message: '无效的ID' });
    }

    const photo = await prisma.photo.findUnique({ where: { id } });
    if (!photo) {
      return res.status(404).json({ message: '图片不存在' });
    }

    await prisma.photo.delete({ where: { id } });

    res.json({ message: '图片已删除' });
  } catch (error) {
    console.error('[Admin] 删除图片错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.put('/photos/sort', async (req: Request, res: Response) => {
  try {
    const { photos } = req.body;
    if (!Array.isArray(photos)) {
      return res.status(400).json({ message: '无效的数据' });
    }

    await prisma.$transaction(
      photos.map((p: { id: number; sortOrder: number }) =>
        prisma.photo.update({
          where: { id: p.id },
          data: { sortOrder: p.sortOrder },
        })
      )
    );

    res.json({ message: '排序已更新' });
  } catch (error) {
    console.error('[Admin] 更新排序错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

export default router;
