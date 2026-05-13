// @ts-ignore
import OSS from 'ali-oss';
import sharp from 'sharp';
import { createHash } from 'crypto';
import { env } from '../config/env.js';
import { Readable } from 'stream';

let ossClient: OSS | null = null;

function getOSSClient(): OSS {
  if (!ossClient) {
    const endpoint = env.ALIYUN_OSS_ENDPOINT.startsWith('http') 
      ? env.ALIYUN_OSS_ENDPOINT 
      : `https://${env.ALIYUN_OSS_ENDPOINT}`;
    
    ossClient = new OSS({
      region: 'oss-cn-beijing',
      accessKeyId: env.ALIYUN_OSS_ACCESS_KEY,
      accessKeySecret: env.ALIYUN_OSS_ACCESS_SECRET,
      bucket: env.ALIYUN_OSS_BUCKET,
      endpoint: endpoint,
      secure: true,
    });
  }
  return ossClient;
}

export interface UploadResult {
  url: string;
  thumbUrl?: string;
  signedUrl: string;
  thumbSignedUrl?: string;
  name: string;
  size: number;
  width?: number;
  height?: number;
}

export interface ImageProcessResult {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * 处理图片：生成全尺寸WebP和缩略图
 */
export async function processImage(buffer: Buffer, mimeType: string): Promise<{
  full: ImageProcessResult;
  thumb: ImageProcessResult;
}> {
  const metadata = await sharp(buffer).metadata();
  
  const fullBuffer = await sharp(buffer)
    .webp({ quality: 90 })
    .toBuffer();
  
  // 生成缩略图 (宽度300px，高度自动，质量85)
  const thumbBuffer = await sharp(buffer)
    .resize(300, null, { withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  
  const thumbMetadata = await sharp(thumbBuffer).metadata();
  
  return {
    full: {
      buffer: fullBuffer,
      width: metadata.width || 0,
      height: metadata.height || 0,
    },
    thumb: {
      buffer: thumbBuffer,
      width: thumbMetadata.width || 300,
      height: thumbMetadata.height || 0,
    },
  };
}

export function isImageType(mimeType: string): boolean {
  return mimeType.startsWith('image/') && !mimeType.includes('svg');
}

/**
 * 从URL提取OSS key
 * 支持多种URL格式：
 * - https://bucket.endpoint/key
 * - https://endpoint/bucket/key
 * - VOD URL 格式
 */
export function getKeyFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const pathname = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
    
    const ossEndpoint = env.ALIYUN_OSS_ENDPOINT.replace('https://', '').replace('http://', '');
    const bucketName = env.ALIYUN_OSS_BUCKET;
    
    if (hostname === `${bucketName}.${ossEndpoint}`) {
      return pathname;
    }
    
    if (hostname.includes('aliyuncs.com')) {
      // 对于 VOD URL，pathname 可能包含 bucket 前缀
      // 例如：/bucket-name/key 或 /key
      if (pathname.startsWith(bucketName + '/')) {
        return pathname.substring(bucketName.length + 1);
      }
      return pathname;
    }
    
    return pathname;
  } catch {
    // 如果 URL 解析失败，尝试简单的字符串处理
    const prefix = `https://${env.ALIYUN_OSS_BUCKET}.${env.ALIYUN_OSS_ENDPOINT.replace('https://', '')}/`;
    return url.replace(prefix, '');
  }
}

export function isOwnOssUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    const ossEndpoint = env.ALIYUN_OSS_ENDPOINT.replace('https://', '').replace('http://', '');
    return hostname === `${env.ALIYUN_OSS_BUCKET}.${ossEndpoint}`;
  } catch {
    return false;
  }
}

/**
 * 生成签名URL（仅对自己 OSS bucket 的 URL 签名）
 */
export function generateSignedURL(url: string, expires: number = 3600): string {
  try {
    if (!url) return url;
    if (url.includes('Expires=')) return url;
    if (!isOwnOssUrl(url)) return url;

    const client = getOSSClient();
    const key = getKeyFromUrl(url);

    if (!key) return url;

    return client.signatureUrl(key, { expires });
  } catch (error) {
    console.error('[OSS] 生成签名URL失败:', error);
    return url;
  }
}

/**
 * 阿里云 CDN A 类鉴权（适用于 VOD 视频播放地址）
 * 重新生成 auth_key，覆盖 URL 中已过期的旧值
 */
export function generateVodPlayUrl(url: string, expiresInSeconds: number = 3600): string {
  if (!env.CDN_AUTH_KEY || !url) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('auth_key');
    const uri = parsed.pathname;
    const timestamp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const rand = '0';
    const uid = '0';
    const sign = createHash('md5').update(`${uri}-${timestamp}-${rand}-${uid}-${env.CDN_AUTH_KEY}`).digest('hex');
    parsed.searchParams.set('auth_key', `${timestamp}-${rand}-${uid}-${sign}`);
    return parsed.toString();
  } catch {
    return url;
  }
}

export function generateSignedURLs(urls: (string | null)[], expires: number = 3600): (string | null)[] {
  return urls.map(url => url ? generateSignedURL(url, expires) : null);
}

export function signUrl(url: string | null, expires: number = 3600): string | null {
  if (!url) return null;
  return generateSignedURL(url, expires);
}

/**
 * 签名 VodVideo 对象中的所有 OSS URL（含 mediaAssets）
 */
export function signVodVideoUrls<T extends {
  videoUrl?: string | null;
  coverUrl?: string | null;
  mediaAssets?: Array<{ type: string; url: string }>;
}>(vodVideo: T, expires: number = 3600): T {
  return {
    ...vodVideo,
    videoUrl: vodVideo.videoUrl ? generateVodPlayUrl(vodVideo.videoUrl, expires) : vodVideo.videoUrl,
    coverUrl: vodVideo.coverUrl ? generateVodPlayUrl(vodVideo.coverUrl, expires) : vodVideo.coverUrl,
    mediaAssets: vodVideo.mediaAssets?.map(asset => ({
      ...asset,
      url: generateSignedURL(asset.url, expires),
    })),
  };
}

/**
 * 签名包含 vodVideo / previewVodVideo / posterUrl 的 Video 对象
 */
export function signVideoWithVod<T extends {
  posterUrl?: string | null;
  vodVideo?: any;
  previewVodVideo?: any;
}>(video: T, expires: number = 3600): T {
  return {
    ...video,
    posterUrl: video.posterUrl ? generateSignedURL(video.posterUrl, expires) : video.posterUrl,
    vodVideo: video.vodVideo ? signVodVideoUrls(video.vodVideo, expires) : video.vodVideo,
    previewVodVideo: video.previewVodVideo ? signVodVideoUrls(video.previewVodVideo, expires) : video.previewVodVideo,
  };
}

/**
 * 上传文件到OSS（非图片文件）
 * @param file 文件内容
 * @param filename 原始文件名
 * @param contentType MIME类型
 * @param folder 子目录 (images/avatars/files等)
 * @param userUuid 用户UUID（用于目录结构）
 */
export async function uploadToOSS(
  file: Buffer | Readable,
  filename: string,
  contentType: string,
  folder: string = 'files',
  userUuid?: string
): Promise<UploadResult> {
  const client = getOSSClient();
  const { v7: uuidv7 } = await import('uuid');
  const dirPrefix = userUuid || uuidv7();
  const ext = filename.split('.').pop() || 'bin';
  const fileId = uuidv7();
  const key = `${dirPrefix}/${folder}/${fileId}.${ext}`;

  const result = await client.put(key, file, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'max-age=31536000',
    },
  });

  const url = `https://${env.ALIYUN_OSS_BUCKET}.${env.ALIYUN_OSS_ENDPOINT.replace('https://', '')}/${key}`;
  const signedUrl = client.signatureUrl(key, { expires: 3600 });

  return {
    url,
    signedUrl,
    name: filename,
    size: Buffer.isBuffer(file) ? file.length : 0,
  };
}

/**
 * 上传图片到OSS（生成全尺寸WebP + 缩略图）
 * @param file 文件内容
 * @param filename 原始文件名
 * @param folder 子目录
 * @param userUuid 用户UUID（用于目录结构）
 */
export async function uploadImageToOSS(
  file: Buffer,
  filename: string,
  folder: string = 'images',
  userUuid?: string
): Promise<UploadResult> {
  const client = getOSSClient();
  const { v7: uuidv7 } = await import('uuid');
  const dirPrefix = userUuid || uuidv7();
  const fileId = uuidv7();
  
  const processed = await processImage(file, 'image/jpeg');
  
  const fullKey = `${dirPrefix}/${folder}/${fileId}.webp`;
  await client.put(fullKey, processed.full.buffer, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'max-age=31536000',
    },
  });
  
  const thumbKey = `${dirPrefix}/${folder}/thumb_${fileId}.webp`;
  await client.put(thumbKey, processed.thumb.buffer, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'max-age=31536000',
    },
  });

  const baseUrl = `https://${env.ALIYUN_OSS_BUCKET}.${env.ALIYUN_OSS_ENDPOINT.replace('https://', '')}`;
  const url = `${baseUrl}/${fullKey}`;
  const thumbUrl = `${baseUrl}/${thumbKey}`;
  const signedUrl = client.signatureUrl(fullKey, { expires: 3600 });
  const thumbSignedUrl = client.signatureUrl(thumbKey, { expires: 3600 });

  return {
    url,
    thumbUrl,
    signedUrl,
    thumbSignedUrl,
    name: filename,
    size: processed.full.buffer.length,
    width: processed.full.width,
    height: processed.full.height,
  };
}

export async function deleteFromOSS(url: string): Promise<boolean> {
  try {
    const client = getOSSClient();
    const key = getKeyFromUrl(url);
    await client.delete(key);
    return true;
  } catch (error) {
    console.error('[OSS] 删除文件失败:', error);
    return false;
  }
}

/**
 * 删除OSS上指定前缀的所有文件（即删除整个"文件夹"）
 * 若无 ListObjects 权限则跳过，不抛错。
 */
export async function deleteOSSFolder(folderPrefix: string): Promise<void> {
  const client = getOSSClient();
  const prefix = folderPrefix.endsWith('/') ? folderPrefix : `${folderPrefix}/`;

  let continuationToken: string | undefined;
  do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;
    try {
      result = await client.listV2({
        prefix,
        'max-keys': 1000,
        ...(continuationToken ? { 'continuation-token': continuationToken } : {}),
      });
    } catch (err: any) {
      if (err?.status === 403 || err?.code === 'AccessDenied') {
        console.warn('[OSS] 无 ListObjects 权限，跳过文件夹清理:', prefix);
        return;
      }
      throw err;
    }

    const objects: { name: string }[] = result.objects || [];
    if (objects.length > 0) {
      await client.deleteMulti(objects.map(o => o.name), { quiet: true });
    }

    continuationToken = result.nextContinuationToken || undefined;
  } while (continuationToken);
}

/**
 * 获取OSS上传凭证（用于前端直传）
 */
export async function getOSSUploadCredentials(folder: string = 'images', ext: string = 'jpg') {
  const client = getOSSClient();
  const { v7: uuidv7 } = await import('uuid');
  const dirId = uuidv7();
  const key = `${dirId}/${folder}/${uuidv7()}`;
  
  const policy = {
    expiration: new Date(Date.now() + 3600 * 1000).toISOString(),
    conditions: [
      ['content-length-range', 0, 100 * 1024 * 1024],
      ['starts-with', '$key', `${dirId}/${folder}/`],
    ],
  };

  const policyBase64 = Buffer.from(JSON.stringify(policy)).toString('base64');
  const signature = client.calculatePostSignature(policyBase64);

  return {
    host: `https://${env.ALIYUN_OSS_BUCKET}.${env.ALIYUN_OSS_ENDPOINT.replace('https://', '')}`,
    accessKeyId: env.ALIYUN_OSS_ACCESS_KEY,
    policy: policyBase64,
    signature,
    key: `${key}.${ext}`,
    dir: `${dirId}/${folder}/`,
  };
}
