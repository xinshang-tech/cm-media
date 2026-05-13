import { env } from '../config/env.js';

export async function createVodClient() {
  const mod = await import('@alicloud/vod20170321');
  // CJS-via-require: mod.default is the class; ESM interop: mod.default.default is the class
  const VodClient = (mod.default as any).default ?? (mod.default as any);
  const { Config } = await import('@alicloud/openapi-client');

  const config = new Config({
    accessKeyId: env.ALIYUN_VOD_ACCESS_KEY,
    accessKeySecret: env.ALIYUN_VOD_ACCESS_SECRET,
  });
  config.endpoint = 'vod.cn-beijing.aliyuncs.com';

  return new VodClient(config);
}

export interface VODUploadResult {
  videoId: string;
  requestId: string;
}

export async function getVODUploadAuth(
  title: string,
  filename: string,
  fileSize: number
): Promise<any> {
  try {
    const client = await createVodClient();
    const { CreateUploadVideoRequest } = await import('@alicloud/vod20170321');

    const request = new CreateUploadVideoRequest({
      title,
      fileName: filename,
      fileSize,
      description: '',
      coverType: 'auto',
      userData: '',
    });

    const response = await client.createUploadVideo(request);
    
    if (!response.body) {
      throw new Error('获取上传凭证失败');
    }

    return {
      videoId: response.body.videoId,
      uploadAddress: response.body.uploadAddress,
      uploadAuth: response.body.uploadAuth,
      requestId: response.body.requestId,
    };
  } catch (error) {
    console.error('[VOD] 获取上传凭证错误:', error);
    throw error;
  }
}

export async function refreshVODUploadAuth(videoId: string): Promise<any> {
  try {
    const client = await createVodClient();
    const { RefreshUploadVideoRequest } = await import('@alicloud/vod20170321');

    const request = new RefreshUploadVideoRequest({ videoId });
    const response = await client.refreshUploadVideo(request);

    if (!response.body) {
      throw new Error('刷新上传凭证失败');
    }

    return {
      videoId: response.body.videoId,
      uploadAddress: response.body.uploadAddress,
      uploadAuth: response.body.uploadAuth,
    };
  } catch (error) {
    console.error('[VOD] 刷新上传凭证错误:', error);
    throw error;
  }
}

export interface PlayQuality {
  definition: string;
  label: string;
  height: number;
  width: number;
  url: string;
  format: string;
  bitrate: number;
}

const DEFINITION_LABELS: Record<string, string> = {
  OD: '原画', '4K': '4K', '2K': '2K',
  FHD: '1080P', HD: '720P', SD: '480P', LD: '360P', FD: '240P',
};

function stripAuthKey(url: string): string {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('auth_key');
    return parsed.toString();
  } catch {
    return url;
  }
}

export async function getVODVideoInfo(videoId: string): Promise<any> {
  try {
    const client = await createVodClient();
    const { GetVideoInfoRequest, GetPlayInfoRequest } = await import('@alicloud/vod20170321');

    const request = new GetVideoInfoRequest({ videoId });
    const response = await client.getVideoInfo(request);

    if (!response.body?.video) {
      throw new Error('视频信息不存在');
    }

    const video = response.body.video;
    // 从视频元数据获取时长（秒），作为备用
    const videoDurationFromMeta = Number(video.duration || 0);
    
    if (video.status !== 'Normal') {
      const statusMap: Record<string, string> = {
        'Uploading': '视频上传中',
        'UploadFail': '视频上传失败',
        'UploadSucc': '视频上传成功，处理中',
        'Transcoding': '视频转码中',
        'TranscodeFail': '视频转码失败',
        'Deleted': '视频已删除',
        'Blocked': '视频已屏蔽',
      };
      
      // 去掉封面URL中的旧签名参数，由调用方在输出时签名
      let coverUrlNonSigned = video.coverURL || '';
      if (coverUrlNonSigned) {
        try {
          const parsed = new URL(coverUrlNonSigned);
          parsed.searchParams.delete('auth_key');
          coverUrlNonSigned = parsed.toString();
        } catch {}
      }

      return {
        videoId,
        title: video.title,
        coverUrl: coverUrlNonSigned,
        playURL: '',
        qualities: [] as PlayQuality[],
        isHls: false,
        duration: '00:00:00',
        width: 0,
        height: 0,
        fps: 0,
        size: 0,
        status: video.status,
        statusMessage: statusMap[video.status] || `视频状态: ${video.status}`,
        isProcessing: true,
        createdAt: video.creationTime,
      };
    }
    
    let playURL = '';
    let duration = 0;
    let width = 0;
    let height = 0;
    let fps = 0;
    let size = 0;
    let qualities: PlayQuality[] = [];
    let isHls = false;

    try {
      const playInfoRequest = new GetPlayInfoRequest({ videoId });
      const playInfoResponse = await client.getPlayInfo(playInfoRequest);

      const allInfos: any[] = playInfoResponse.body?.playInfoList?.playInfo || [];
      if (allInfos.length) {
        const sorted = [...allInfos].sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0));

        qualities = sorted.map((info: any) => {
          const qUrl = stripAuthKey(info.playURL || '');
          const def = (info.definition as string) || '';
          const h = Number(info.height) || 0;
          const fmt = ((info.format as string) || '').toLowerCase() ||
            (qUrl.includes('.m3u8') ? 'm3u8' : 'mp4');
          return {
            definition: def,
            label: h ? `${h}P` : (DEFINITION_LABELS[def] || def || fmt.toUpperCase()),
            height: h,
            width: Number(info.width) || 0,
            url: qUrl,
            format: fmt,
            bitrate: Number(info.bitrate) || 0,
          };
        });

        isHls = qualities.some(q => q.format === 'm3u8');

        // 优先用最高分辨率的 MP4 作为主流，无 MP4 则用最高分辨率 HLS
        const primary = sorted.find((info: any) => {
          const fmt = ((info.format as string) || '').toLowerCase();
          return fmt === 'mp4' || (!fmt && !(info.playURL || '').includes('.m3u8'));
        }) || sorted[0];

        if (primary) {
          playURL = stripAuthKey(primary.playURL || '');
          duration = Number(primary.duration || 0) || videoDurationFromMeta;
          width = primary.width || 0;
          height = primary.height || 0;
          fps = primary.fps ? Number(Number(primary.fps).toFixed(2)) : 0;
          size = primary.size || 0;
        }
      }
    } catch (playError: any) {
      if (playError?.code === 'InvalidVideo.NoneStream' || playError?.data?.Code === 'InvalidVideo.NoneStream') {
        return {
          videoId,
          title: video.title,
          coverUrl: stripAuthKey(video.coverURL || ''),
          playURL: '',
          qualities: [] as PlayQuality[],
          isHls: false,
          duration: '00:00:00',
          width: 0,
          height: 0,
          fps: 0,
          size: 0,
          status: video.status || 'NoStream',
          statusMessage: '视频无可播放流，请重新上传或联系管理员',
          isProcessing: true,
          createdAt: video.creationTime,
        };
      }
      throw playError;
    }

    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = Math.floor(duration % 60);
    const durationStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    return {
      videoId,
      title: video.title,
      coverUrl: stripAuthKey(video.coverURL || ''),
      playURL,
      qualities,
      isHls,
      duration: durationStr,
      width,
      height,
      fps,
      size,
      status: video.status,
      statusMessage: '',
      isProcessing: false,
      createdAt: video.creationTime,
    };
  } catch (error) {
    console.error('[VOD] 获取视频信息错误:', error);
    throw error;
  }
}

export async function deleteVODVideo(videoId: string): Promise<boolean> {
  try {
    const client = await createVodClient();
    const { DeleteVideoRequest } = await import('@alicloud/vod20170321');

    const request = new DeleteVideoRequest({ videoIds: videoId });
    await client.deleteVideo(request);

    return true;
  } catch (error) {
    console.error('[VOD] 删除视频错误:', error);
    return false;
  }
}

/**
 * 批量删除VOD视频
 * 视频已不存在（InvalidVideo.NotFound / VideoNotExist）视为成功。
 * 其他错误抛出，由调用方决定如何处理。
 */
export async function deleteVodVideos(videoIds: string[]): Promise<void> {
  try {
    const client = await createVodClient();
    const { DeleteVideoRequest } = await import('@alicloud/vod20170321');

    const request = new DeleteVideoRequest({ videoIds: videoIds.join(',') });
    await client.deleteVideo(request);
  } catch (error: any) {
    const code: string = error?.code || error?.Code || '';
    if (
      code === 'InvalidVideo.NotFound' ||
      code === 'VideoNotExist' ||
      code === 'InvalidVideoIds.NotFound'
    ) {
      console.warn('[VOD] 视频已不存在，跳过删除:', videoIds);
      return;
    }
    console.error('[VOD] 批量删除视频错误:', error);
    throw error;
  }
}
