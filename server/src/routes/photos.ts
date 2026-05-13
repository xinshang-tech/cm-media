import { Router } from 'express';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { signUrl } from '../services/aliyun-oss.js';
import type { Request, Response } from 'express';

const router = Router();

router.get('/search', authenticate, async (req: Request, res: Response) => {
  try {
    const keywords = (req.query.q as string || '').trim();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize as string) || 20));

    if (!keywords) {
      return res.json({ albums: [], total: 0, pagination: { page, pageSize, total: 0, totalPages: 0 } });
    }

    const words = keywords.split(/\s+/).filter(Boolean);
    const orConditions: any[] = [];
    for (const word of words) {
      orConditions.push(
        { title: { contains: word } },
        { content: { contains: word } },
      );
    }

    const where: any = {
      status: 'PUBLISHED',
      OR: orConditions,
    };

    const [albums, total] = await Promise.all([
      prisma.photoAlbum.findMany({
        where,
        select: {
          id: true,
          uuid: true,
          title: true,
          coverUrl: true,
          viewCount: true,
          publishedAt: true,
          _count: { select: { photos: true } },
          photos: {
            select: { thumbnailUrl: true, url: true },
            orderBy: { sortOrder: 'asc' },
            take: 1,
          },
        },
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.photoAlbum.count({ where }),
    ]);

    res.json({
      albums: albums.map((a) => {
        const firstPhotoRaw = a.photos[0]?.thumbnailUrl || a.photos[0]?.url || null;
        const { photos: _photos, _count, ...rest } = a;
        return {
          ...rest,
          coverUrl: a.coverUrl ? signUrl(a.coverUrl) : null,
          firstPhotoUrl: firstPhotoRaw ? signUrl(firstPhotoRaw) : null,
          photoCount: _count.photos,
        };
      }),
      total,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error('[Photos] 搜索错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.get('/:uuid', authenticate, async (req: Request, res: Response) => {
  try {
    const uuid = req.params.uuid as string;

    const album = await prisma.photoAlbum.findUnique({
      where: { uuid },
      include: {
        categories: { include: { category: { select: { id: true, name: true, slug: true } } } },
        photos: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!album) {
      return res.status(404).json({ message: '相册不存在' });
    }

    if (album.status !== 'PUBLISHED' && req.user!.role !== 'ADMIN') {
      return res.status(404).json({ message: '相册不存在' });
    }

    if (album.allowedUsers && req.user!.role !== 'ADMIN') {
      const allowedUserIds = JSON.parse(album.allowedUsers);
      if (!allowedUserIds.includes(req.user!.id)) {
        return res.status(403).json({ message: '无权访问此相册' });
      }
    }

    const signedAlbum = {
      ...album,
      coverUrl: album.coverUrl ? signUrl(album.coverUrl) : null,
      photos: album.photos.map((photo: { id: number; url: string; thumbnailUrl: string | null; [key: string]: any }) => ({
        ...photo,
        url: signUrl(photo.url) || photo.url,
        thumbnailUrl: photo.thumbnailUrl ? signUrl(photo.thumbnailUrl) : null,
      })),
    };

    res.json({ album: signedAlbum });
  } catch (error) {
    console.error('[Photos] 相册详情错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

router.post('/:uuid/view', authenticate, async (req: Request, res: Response) => {
  try {
    const uuid = req.params.uuid as string;

    const album = await prisma.photoAlbum.findUnique({ where: { uuid } });
    if (!album || album.status !== 'PUBLISHED') {
      return res.status(404).json({ message: '相册不存在' });
    }

    await prisma.photoAlbum.update({
      where: { id: album.id },
      data: { viewCount: { increment: 1 } },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Photos] 记录浏览错误:', error);
    res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

export default router;
