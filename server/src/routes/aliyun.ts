import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { prisma } from '../config/database.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { uploadToOSS, uploadImageToOSS, deleteFromOSS, isImageType } from '../services/aliyun-oss.js';
import { getVODUploadAuth, refreshVODUploadAuth, getVODVideoInfo, deleteVODVideo } from '../services/aliyun-vod.js';
import type { Request, Response } from 'express';

const router = Router();

// 配置multer用于内存存储
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype.startsWith('image/') ||
      file.mimetype.startsWith('video/') ||
      file.mimetype.startsWith('text/') ||
      file.mimetype === 'application/x-subrip'
    ) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型'));
    }
  },
});

router.get('/sts-token', authenticate, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { v4: uuidv4 } = await import('uuid');

    const StsClient = (await import('@alicloud/sts20150401')).default as any;
    const { Config } = await import('@alicloud/openapi-client');

    const config = new Config({
      accessKeyId: env.ALIYUN_VOD_ACCESS_KEY,
      accessKeySecret: env.ALIYUN_VOD_ACCESS_SECRET,
      endpoint: 'sts.cn-hangzhou.aliyuncs.com',
    });

    const client = new StsClient(config);
    const { AssumeRoleRequest } = await import('@alicloud/sts20150401');

    const request = new AssumeRoleRequest({
      durationSeconds: 3600,
      policy: '{"Statement":[{"Action":"vod:*","Effect":"Allow","Resource":"*"}],"Version":"1"}',
      roleArn: 'acs:ram::35403437:role/fun-fun',
      roleSessionName: uuidv4(),
    });

    const { RuntimeOptions } = await import('@alicloud/tea-util');
    const response = await client.assumeRoleWithOptions(request, new RuntimeOptions());
    res.json({ 
      success: true, 
      data: {
        ...response.body,
        accountId: env.ALIYUN_ACCOUNT_ID,
      }
    });
  } catch (error: any) {
    console.error('[Aliyun] STS Token错误:', error);
    const detail = error?.code || error?.message || String(error);
    res.status(500).json({ message: '获取STS凭证失败', detail });
  }
});

router.get('/video-info/:vodId', authenticate, async (req: Request, res: Response) => {
  try {
    const vodId = req.params.vodId as string;
    const { generateVodPlayUrl } = await import('../services/aliyun-oss.js');
    const info = await getVODVideoInfo(vodId);
    if (info.playURL) info.playURL = generateVodPlayUrl(info.playURL);
    if (info.coverUrl) info.coverUrl = generateVodPlayUrl(info.coverUrl);
    if (Array.isArray(info.qualities)) {
      info.qualities = info.qualities.map((q: any) => ({
        ...q,
        url: q.url ? generateVodPlayUrl(q.url) : '',
      }));
    }
    res.json({ success: true, data: info });
  } catch (error) {
    console.error('[Aliyun] 获取视频信息错误:', error);
    res.status(500).json({ message: '获取视频信息失败' });
  }
});

router.post('/vod/upload-auth', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { title, filename, fileSize } = req.body;
    
    if (!title || !filename || !fileSize) {
      return res.status(400).json({ message: '缺少必要参数' });
    }

    const auth = await getVODUploadAuth(title, filename, fileSize);
    res.json({ success: true, data: auth });
  } catch (error) {
    console.error('[Aliyun] 获取VOD上传凭证错误:', error);
    res.status(500).json({ message: '获取上传凭证失败' });
  }
});

router.post('/vod/refresh-auth', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { videoId } = req.body;
    
    if (!videoId) {
      return res.status(400).json({ message: '缺少视频ID' });
    }

    const auth = await refreshVODUploadAuth(videoId);
    res.json({ success: true, data: auth });
  } catch (error) {
    console.error('[Aliyun] 刷新VOD上传凭证错误:', error);
    res.status(500).json({ message: '刷新上传凭证失败' });
  }
});

router.post('/upload/image', authenticate, requireAdmin, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '没有上传文件' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { uuid: true },
    });
    const userUuid = user?.uuid;

    const folder = req.body.folder || 'images';
    let result;

    if (isImageType(req.file.mimetype)) {
      result = await uploadImageToOSS(req.file.buffer, req.file.originalname, folder, userUuid);
    } else {
      result = await uploadToOSS(req.file.buffer, req.file.originalname, req.file.mimetype, folder, userUuid);
    }

    try {
      await prisma.uploadLog.create({
        data: {
          userId: req.user!.id,
          type: folder === 'gallery' ? 'image' : folder,
          url: result.url,
          thumbUrl: result.thumbUrl || null,
          filename: req.file.originalname,
          filesize: req.file.size,
          mimetype: req.file.mimetype,
          width: result.width || null,
          height: result.height || null,
        },
      });
    } catch (logErr) {
      console.error('[Aliyun] 记录上传日志失败:', logErr);
    }

    res.json({ success: true, data: { ...result, originalFilename: req.file.originalname } });
  } catch (error) {
    console.error('[Aliyun] 上传图片错误:', error);
    res.status(500).json({ message: '上传图片失败' });
  }
});

router.post('/upload/poster', authenticate, requireAdmin, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '没有上传文件' });
    }

    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ message: '只能上传图片文件' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { uuid: true },
    });
    const userUuid = user?.uuid;

    let result;

    if (isImageType(req.file.mimetype)) {
      result = await uploadImageToOSS(req.file.buffer, req.file.originalname, 'posters', userUuid);
    } else {
      result = await uploadToOSS(req.file.buffer, req.file.originalname, req.file.mimetype, 'posters', userUuid);
    }

    try {
      await prisma.uploadLog.create({
        data: {
          userId: req.user!.id,
          type: 'poster',
          url: result.url,
          thumbUrl: result.thumbUrl || null,
          filename: req.file.originalname,
          filesize: req.file.size,
          mimetype: req.file.mimetype,
          width: result.width || null,
          height: result.height || null,
        },
      });
    } catch (logErr) {
      console.error('[Aliyun] 记录上传日志失败:', logErr);
    }

    res.json({ success: true, data: { ...result, originalFilename: req.file.originalname } });
  } catch (error) {
    console.error('[Aliyun] 上传海报错误:', error);
    res.status(500).json({ message: '上传海报失败' });
  }
});

router.post('/upload/avatar', authenticate, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '没有上传文件' });
    }

    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ message: '只能上传图片文件' });
    }

    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ message: '头像大小不能超过5MB' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { uuid: true },
    });
    const userUuid = user?.uuid;

    let result;

    if (isImageType(req.file.mimetype)) {
      result = await uploadImageToOSS(req.file.buffer, req.file.originalname, 'avatars', userUuid);
    } else {
      result = await uploadToOSS(req.file.buffer, req.file.originalname, req.file.mimetype, 'avatars', userUuid);
    }

    try {
      await prisma.uploadLog.create({
        data: {
          userId: req.user!.id,
          type: 'avatar',
          url: result.url,
          thumbUrl: result.thumbUrl || null,
          filename: req.file.originalname,
          filesize: req.file.size,
          mimetype: req.file.mimetype,
          width: result.width || null,
          height: result.height || null,
        },
      });
    } catch (logErr) {
      console.error('[Aliyun] 记录上传日志失败:', logErr);
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Aliyun] 上传头像错误:', error);
    res.status(500).json({ message: '上传头像失败' });
  }
});

router.delete('/oss/file', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ message: '缺少文件URL' });
    }

    const success = await deleteFromOSS(url);
    res.json({ success });
  } catch (error) {
    console.error('[Aliyun] 删除OSS文件错误:', error);
    res.status(500).json({ message: '删除文件失败' });
  }
});

router.post('/vod/save', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { v7: uuidv7 } = await import('uuid');
    const {
      vodVideoId,
      videoUrl,
      filename,
      filesize,
      mimetype,
      videoWidth,
      videoHeight,
      videoDuration,
      videoFps,
      captionUrl,
      spriteUrl,
      spriteVttUrl,
      coverUrl,
      tags,
      videoType,
    } = req.body;

    if (!vodVideoId) {
      return res.status(400).json({ message: '缺少 vodVideoId' });
    }

    const type = videoType === 'preview' ? 'PREVIEW' : 'MAIN';

    const existing = await prisma.vodVideo.findUnique({
      where: { vodVideoId },
    });

    const buildAssets = (id: number) => {
      const entries: Array<{ vodVideoId: number; type: 'CAPTION' | 'SPRITE' | 'SPRITE_VTT'; url: string }> = [];
      if (captionUrl) entries.push({ vodVideoId: id, type: 'CAPTION', url: captionUrl });
      if (spriteUrl) entries.push({ vodVideoId: id, type: 'SPRITE', url: spriteUrl });
      if (spriteVttUrl) entries.push({ vodVideoId: id, type: 'SPRITE_VTT', url: spriteVttUrl });
      return entries;
    };

    if (existing) {
      const vodVideo = await prisma.vodVideo.update({
        where: { id: existing.id },
        data: {
          videoUrl,
          coverUrl: coverUrl || undefined,
          videoWidth,
          videoHeight,
          videoDuration,
          videoFps,
          tags,
          videoType: type,
          status: 'READY',
        },
      });

      for (const entry of buildAssets(existing.id)) {
        await prisma.mediaAsset.upsert({
          where: { vodVideoId_type: { vodVideoId: existing.id, type: entry.type } },
          update: { url: entry.url },
          create: entry,
        });
      }

      return res.json({ success: true, vodVideo });
    }

    const assetInputs = [
      captionUrl ? { type: 'CAPTION' as const, url: captionUrl } : null,
      spriteUrl ? { type: 'SPRITE' as const, url: spriteUrl } : null,
      spriteVttUrl ? { type: 'SPRITE_VTT' as const, url: spriteVttUrl } : null,
    ].filter(Boolean) as Array<{ type: 'CAPTION' | 'SPRITE' | 'SPRITE_VTT'; url: string }>;

    const vodVideo = await prisma.vodVideo.create({
      data: {
        uuid: uuidv7(),
        filename: filename || 'untitled',
        filesize: filesize || 0,
        mimetype: mimetype || 'video/mp4',
        vodVideoId,
        videoUrl,
        coverUrl: coverUrl || null,
        videoWidth,
        videoHeight,
        videoDuration,
        videoFps,
        tags,
        videoType: type,
        status: 'READY',
        uploaderId: req.user!.id,
        mediaAssets: assetInputs.length ? { create: assetInputs } : undefined,
      },
    });

    await prisma.operationLog.create({
      data: {
        userId: req.user!.id,
        action: 'vod_video_create',
        targetType: 'vod_video',
        targetId: vodVideo.id,
        details: JSON.stringify({ filename: vodVideo.filename, vodVideoId: vodVideo.vodVideoId, videoType: type }),
        ipAddress: req.ip || '',
      },
    });

    res.json({ success: true, vodVideo });
  } catch (error) {
    console.error('[Aliyun] 保存VOD视频信息错误:', error);
    res.status(500).json({ message: '保存视频信息失败' });
  }
});

router.delete('/vod/:videoId', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const videoId = req.params.videoId as string;
    const success = await deleteVODVideo(videoId);
    res.json({ success });
  } catch (error) {
    console.error('[Aliyun] 删除VOD视频错误:', error);
    res.status(500).json({ message: '删除视频失败' });
  }
});

router.post('/signed-urls', authenticate, async (req: Request, res: Response) => {
  try {
    const { urls } = req.body;
    
    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({ message: '请提供URL数组' });
    }

    const { generateSignedURLs } = await import('../services/aliyun-oss.js');
    const signedUrls = generateSignedURLs(urls);

    res.json({ success: true, data: signedUrls });
  } catch (error) {
    console.error('[Aliyun] 获取签名URL错误:', error);
    res.status(500).json({ message: '获取签名URL失败' });
  }
});

router.post('/signed-url', authenticate, async (req: Request, res: Response) => {
  try {
    const url = req.body.url as string;

    if (!url) {
      return res.status(400).json({ message: '请提供URL参数' });
    }

    const { generateSignedURL } = await import('../services/aliyun-oss.js');
    const signedUrl = generateSignedURL(url);

    res.json({ success: true, data: { url: signedUrl } });
  } catch (error) {
    console.error('[Aliyun] 获取签名URL错误:', error);
    res.status(500).json({ message: '获取签名URL失败' });
  }
});

export default router;
