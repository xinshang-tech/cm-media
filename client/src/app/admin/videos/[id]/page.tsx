'use client';

import { useEffect, useState, useRef } from 'react';
import { v7 as uuidv7 } from 'uuid';

function HlsVideoPreview({ src, poster, className }: { src: string; poster?: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    const isHls = src.includes('.m3u8') || src.includes('m3u8');
    if (!isHls) {
      video.src = src;
      return;
    }

    let hls: any;
    import('hls.js').then(({ default: Hls }) => {
      if (!videoRef.current) return;
      if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(src);
        hls.attachMedia(videoRef.current);
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = src;
      }
    });

    return () => {
      hls?.destroy();
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      poster={poster}
      controls
      className={className}
    />
  );
}
import { useParams, useRouter } from 'next/navigation';
import { api, getSignedUrl } from '@/lib/api';
import { Button, Input, Textarea, Select, Spinner, Card, FileUpload, ProgressBar, ToastContainer, useToast } from '@/components/ui';
import { MediaPickerModal } from '@/components/MediaPickerModal';
import { useUploadStore, uploaders, uploadedVideoIds, cancelUploadTask } from '@/stores/uploadStore';

function toShanghaiLocal(date: Date): string {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

interface Category {
  id: number;
  name: string;
  slug: string;
  children?: Category[];
}

interface User {
  id: number;
  username: string;
  nickname: string | null;
}

interface VideoForm {
  title: string;
  content: string;
  vodVideoId: number | null;
  previewVodVideoId: number | null;
  posterUrl: string | null;
  status: string;
  isPickup: boolean;
  categoryIds: number[];
  allowedUserIds: number[];
  publishedAt: string;
}

interface MediaAsset {
  type: 'CAPTION' | 'SPRITE' | 'SPRITE_VTT';
  url: string;
  originalFilename?: string;
}

interface VodVideoInfo {
  id: number;
  uuid: string;
  filename: string;
  vodVideoId: string | null;
  videoUrl: string | null;
  coverUrl: string | null;
  videoWidth: number | null;
  videoHeight: number | null;
  videoDuration: string | null;
  videoFps: number | null;
  videoType: string;
  mediaAssets: MediaAsset[];
}

interface PreviewVodVideoInfo {
  id: number;
  vodVideoId: string | null;
  videoUrl: string | null;
  videoType: string;
}

const emptyForm: VideoForm = {
  title: '',
  content: '',
  vodVideoId: null,
  previewVodVideoId: null,
  posterUrl: null,
  status: 'PUBLISHED',
  isPickup: false,
  categoryIds: [],
  allowedUserIds: [],
  publishedAt: toShanghaiLocal(new Date()),
};

export default function AdminVideoEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const isNew = id === 'new';

  const [form, setForm] = useState<VideoForm>(emptyForm);
  const [videoUuid, setVideoUuid] = useState<string | null>(null);
  const [vodVideo, setVodVideo] = useState<VodVideoInfo | null>(null);
  const [previewVodVideo, setPreviewVodVideo] = useState<PreviewVodVideoInfo | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  // VOD视频上传状态
  const [vodUploading, setVodUploading] = useState(false);
  const [vodProgress, setVodProgress] = useState(0);
  const [vodStatus, setVodStatus] = useState('');
  const [vodSyncing, setVodSyncing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);

  // 预览视频上传状态
  const [previewUploading, setPreviewUploading] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewStatus, setPreviewStatus] = useState('');
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<File | null>(null);
  const previewFileRef = useRef<HTMLInputElement>(null);

  // 海报上传状态
  const [posterUploading, setPosterUploading] = useState(false);

  const [vodLinking, setVodLinking] = useState(false);
  const [previewLinking, setPreviewLinking] = useState(false);

  // 字幕和雪碧图上传状态
  const [captionUploading, setCaptionUploading] = useState(false);
  const [previewVttUploading, setPreviewVttUploading] = useState(false);
  const [spriteUploading, setSpriteUploading] = useState(false);

  // 媒体库选择器
  type PickerTarget = 'poster' | 'caption' | 'previewVtt' | 'sprite';
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);

  const pickerConfig: Record<PickerTarget, {
    title: string; typeFilters: string[]; accept: string; uploadFolder: string; uploadEndpoint?: string;
  }> = {
    poster:     { title: '选择海报图片', typeFilters: ['poster', 'image'], accept: 'image/*', uploadFolder: 'posters', uploadEndpoint: '/aliyun/upload/poster' },
    caption:    { title: '选择字幕文件', typeFilters: ['subtitle'], accept: '.vtt,.srt', uploadFolder: 'subtitles' },
    previewVtt: { title: '选择预览VTT',  typeFilters: ['sprite_vtt'], accept: '.vtt', uploadFolder: 'subtitles' },
    sprite:     { title: '选择雪碧图',   typeFilters: ['sprite', 'image'], accept: 'image/*', uploadFolder: 'sprites' },
  };

  useEffect(() => {
    api.get<{ categories: Category[] }>('/admin/categories').then((res) => {
      setCategories(res.categories.flatMap((c: Category) => [c, ...(c.children || [])]));
    });

    api.get<{ users: User[] }>('/admin/users').then((res) => {
      setUsers(res.users);
    });

    if (!isNew) {
      api.get<any>(`/admin/videos/${id}`).then(async (res) => {
        const v = res.video;
        const signedPosterUrl = v.posterUrl ? await getSignedUrl(v.posterUrl) : null;

        setForm({
          title: v.title || '',
          content: v.content || '',
          vodVideoId: v.vodVideoId || null,
          previewVodVideoId: v.previewVodVideoId || null,
          posterUrl: signedPosterUrl || v.posterUrl || null,
          status: v.status || 'DRAFT',
          isPickup: v.isPickup || false,
          categoryIds: v.categories?.map((c: any) => c.categoryId ?? c.category?.id).filter(Boolean) || [],
          allowedUserIds: v.allowedUsers ? (Array.isArray(v.allowedUsers) ? v.allowedUsers : JSON.parse(v.allowedUsers)) : [],
          publishedAt: v.publishedAt ? toShanghaiLocal(new Date(v.publishedAt)) : '',
        });

        setVideoUuid(v.uuid || null);
        if (v.vodVideo) setVodVideo(v.vodVideo);
        if (v.previewVodVideo) setPreviewVodVideo(v.previewVodVideo);

        setLoading(false);
      }).catch(() => {
        alert('视频不存在');
        router.push('/admin/videos');
      });
    }
  }, [id, isNew, router]);

  // 加载 PhotoSwipe
  useEffect(() => {
    if (document.getElementById('photoswipe-css')) return;
    const link = document.createElement('link');
    link.id = 'photoswipe-css';
    link.rel = 'stylesheet';
    link.href = '/css/photoswipe.min.css';
    document.head.appendChild(link);

    const loadScript = (src: string) => new Promise<void>((resolve) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      document.head.appendChild(s);
    });
    loadScript('/js/photoswipe.umd.min.js').then(() =>
      loadScript('/js/photoswipe-lightbox.umd.min.js')
    );
  }, []);

  const openSpritePhotoswipe = (url: string, imgEl: HTMLImageElement) => {
    const PSL = (window as any).PhotoSwipeLightbox;
    if (!PSL) return;
    const lightbox = new PSL({
      dataSource: [{ src: url, width: imgEl.naturalWidth || 1200, height: imgEl.naturalHeight || 800 }],
      pswpModule: (window as any).PhotoSwipe,
    });
    lightbox.init();
    lightbox.loadAndOpen(0);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      addToast('请输入视频标题', 'error');
      return;
    }

    setSaving(true);
    try {
      const data = {
        title: form.title,
        content: form.content,
        vodVideoId: form.vodVideoId,
        previewVodVideoId: form.previewVodVideoId,
        posterUrl: form.posterUrl ? form.posterUrl.split('?')[0] : null,
        status: form.status,
        isPickup: form.isPickup,
        categoryIds: form.categoryIds,
        allowedUsers: form.allowedUserIds.length > 0 ? form.allowedUserIds : null,
        publishedAt: form.publishedAt ? `${form.publishedAt}+08:00` : null,
      };

      if (isNew) {
        await api.post('/admin/videos', data);
      } else {
        await api.put(`/admin/videos/${id}`, data);
      }

      addToast('保存成功', 'success');
      setTimeout(() => router.push('/admin/videos'), 1000);
    } catch (err: any) {
      addToast(err.message || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 手动关联预览视频（通过VOD ID）
  const handleLinkPreviewVodVideo = async (vodId: string) => {
    if (!vodId) {
      addToast('请先填写VOD视频ID', 'error');
      return;
    }

    setPreviewLinking(true);
    try {
      const res = await api.get<{ data: any }>(`/aliyun/video-info/${vodId}`);
      const info = res.data;

      if (info.isProcessing) {
        addToast(info.statusMessage || '视频正在处理中，请稍后再试', 'error');
        return;
      }

      const saveRes = await api.post<{ vodVideo: { id: number } }>('/aliyun/vod/save', {
        vodVideoId: vodId,
        videoUrl: info.playURL,
        coverUrl: info.coverUrl,
        videoType: 'preview',
      });

      const currentVideoId = isNew ? null : id;
      if (currentVideoId) {
        await api.put(`/admin/videos/${currentVideoId}`, { previewVodVideoId: saveRes.vodVideo.id });
      }

      setForm(prev => ({ ...prev, previewVodVideoId: saveRes.vodVideo.id }));
      setPreviewVodVideo({
        id: saveRes.vodVideo.id,
        vodVideoId: vodId,
        videoUrl: info.playURL || null,
        videoType: 'PREVIEW',
      });

      addToast('预览视频关联成功', 'success');
    } catch (err: any) {
      addToast(err.message || '关联预览视频失败', 'error');
    } finally {
      setPreviewLinking(false);
    }
  };

  // 手动关联VOD视频（通过VOD ID）
  const handleLinkVodVideo = async (vodId: string) => {
    if (!vodId) {
      addToast('请先填写VOD视频ID', 'error');
      return;
    }

    setVodLinking(true);
    try {
      const res = await api.get<{ data: any }>(`/aliyun/video-info/${vodId}`);
      const info = res.data;
      
      if (info.isProcessing) {
        addToast(info.statusMessage || '视频正在处理中，请稍后再试', 'error');
        return;
      }

      const saveRes = await api.post<{ vodVideo: { id: number } }>('/aliyun/vod/save', {
        vodVideoId: vodId,
        videoUrl: info.playURL,
        videoWidth: info.width,
        videoHeight: info.height,
        videoDuration: info.duration,
        videoFps: info.fps,
        coverUrl: info.coverUrl,
        videoType: 'main',
      });

      setForm(prev => ({ ...prev, vodVideoId: saveRes.vodVideo.id }));
      setVodVideo({
        id: saveRes.vodVideo.id,
        uuid: '',
        filename: '',
        vodVideoId: vodId,
        videoUrl: info.playURL,
        coverUrl: info.coverUrl || null,
        videoWidth: info.width,
        videoHeight: info.height,
        videoDuration: info.duration,
        videoFps: info.fps,
        videoType: 'MAIN',
        mediaAssets: [],
      });
      
      addToast('VOD视频关联成功', 'success');
    } catch (err: any) {
      addToast(err.message || '关联VOD视频失败', 'error');
    } finally {
      setVodLinking(false);
    }
  };

  const currentMainTaskIdRef = useRef('');
  const currentPreviewTaskIdRef = useRef('');

  // 上传视频到VOD（使用阿里云VOD SDK）
  const handleVideoUpload = async (file: File, type: 'main' | 'preview' = 'main') => {
    const setUploading = type === 'main' ? setVodUploading : setPreviewUploading;
    const setProgress = type === 'main' ? setVodProgress : setPreviewProgress;
    const setStatus = type === 'main' ? setVodStatus : setPreviewStatus;
    const taskIdRef = type === 'main' ? currentMainTaskIdRef : currentPreviewTaskIdRef;

    const taskId = uuidv7();
    taskIdRef.current = taskId;

    const store = useUploadStore.getState();
    store.addTask(taskId, file.name, type);

    setUploading(true);
    setProgress(0);
    setStatus('初始化上传...');

    try {
      const fileUuid = uuidv7();
      const ext = file.name.split('.').pop() || 'mp4';
      const renamedFile = new File([file], `${fileUuid}.${ext}`, { type: file.type });
      const title = fileUuid;
      let uploadedVideoId = '';

      if (!(window as any).AliyunUpload) {
        throw new Error('阿里云上传SDK未加载，请刷新页面重试');
      }

      const uploader = new (window as any).AliyunUpload.Vod({

        timeout: 60000,
        partSize: 1048576,
        parallel: 5,
        retryCount: 3,
        retryDuration: 2,
        region: 'cn-beijing',
        userId: 1,
        localCheckpoint: true,
        refreshSTSTokenInterval: 300000,
        refreshSTSToken: async () => {
          const stsRes = await api.get<{ data: any }>('/aliyun/sts-token');
          const credentials = stsRes.data.credentials;
          return {
            accessKeyId: credentials.accessKeyId,
            accessKeySecret: credentials.accessKeySecret,
            stsToken: credentials.securityToken,
            expiration: credentials.expiration,
          };
        },
        onUploadstarted: async (uploadInfo: any) => {
          try {
            const stsRes = await api.get<{ data: any }>('/aliyun/sts-token');
            const credentials = stsRes.data.credentials;
            uploader.setSTSToken(uploadInfo, credentials.accessKeyId, credentials.accessKeySecret, credentials.securityToken);
            if (uploadInfo.videoId) uploadedVideoIds[taskId] = uploadInfo.videoId;
            setStatus('文件开始上传...');
            useUploadStore.getState().setStatus(taskId, '文件开始上传...');
          } catch (err: any) {
            console.error('setSTSToken 调用出错:', err);
            const detail = err?.message || '获取凭证失败';
            addToast(`上传初始化失败: ${detail}`, 'error');
            setStatus('初始化失败');
            setUploading(false);
            useUploadStore.getState().setError(taskId, detail);
            delete uploaders[taskId];
            delete uploadedVideoIds[taskId];
            taskIdRef.current = '';
          }
        },
        onUploadSucceed: async (uploadInfo: any) => {
          delete uploaders[taskId];
          setProgress(100);
          setStatus('上传完成');

          const finalVideoId = uploadInfo.videoId || uploadedVideoId;

          if (finalVideoId) {
            try {
              setStatus('正在获取视频信息...');
              const videoInfoRes = await api.get<{ data: any }>(`/aliyun/video-info/${finalVideoId}`);
              const videoInfo = videoInfoRes.data;

              if (type === 'preview') {
                const saveRes = await api.post<{ vodVideo: { id: number } }>('/aliyun/vod/save', {
                  vodVideoId: finalVideoId,
                  videoUrl: videoInfo.playURL,
                  filename: renamedFile.name,
                  filesize: file.size,
                  mimetype: file.type,
                  coverUrl: videoInfo.coverUrl,
                  videoType: 'preview',
                });

                const currentVideoId = isNew ? null : id;
                if (currentVideoId) {
                  await api.put(`/admin/videos/${currentVideoId}`, {
                    previewVodVideoId: saveRes.vodVideo.id,
                  });
                }

                const previewUrl = videoInfo.playURL || null;
                setPreviewVodVideo({
                  id: saveRes.vodVideo.id,
                  vodVideoId: finalVideoId,
                  videoUrl: previewUrl,
                  videoType: 'PREVIEW',
                });
                setForm(prev => ({ ...prev, previewVodVideoId: saveRes.vodVideo.id }));
                addToast('预览视频上传成功', 'success');
                useUploadStore.getState().setComplete(taskId, saveRes.vodVideo.id, finalVideoId);

                if (!previewUrl || !videoInfo.coverUrl) {
                  const savedId = saveRes.vodVideo.id;
                  let attempts = 0;
                  const poll = async () => {
                    attempts++;
                    try {
                      const pollRes = await api.post<{ success: boolean; vodVideo: { id: number; videoUrl: string | null; coverUrl: string | null } }>(
                        `/admin/vod-videos/${savedId}/sync-info`, {}
                      );
                      const pv = pollRes.vodVideo;
                      const done = (!previewUrl ? !!pv.videoUrl : true) && (!videoInfo.coverUrl ? !!pv.coverUrl : true);
                      setPreviewVodVideo(prev => prev ? {
                        ...prev,
                        ...(pv.videoUrl ? { videoUrl: pv.videoUrl } : {}),
                      } : prev);
                      if (done) return;
                    } catch {}
                    if (attempts < 10) setTimeout(poll, 3000);
                  };
                  setTimeout(poll, 3000);
                }
              } else {
                const saveRes = await api.post<{ vodVideo: { id: number } }>('/aliyun/vod/save', {
                  vodVideoId: finalVideoId,
                  videoUrl: videoInfo.playURL,
                  filename: renamedFile.name,
                  filesize: file.size,
                  mimetype: file.type,
                  videoWidth: videoInfo.width,
                  videoHeight: videoInfo.height,
                  videoDuration: videoInfo.duration,
                  videoFps: videoInfo.fps,
                  coverUrl: videoInfo.coverUrl,
                  videoType: 'main',
                });

                const currentVideoId = isNew ? null : id;
                if (currentVideoId) {
                  await api.put(`/admin/videos/${currentVideoId}`, {
                    vodVideoId: saveRes.vodVideo.id,
                  });
                }

                setForm(prev => ({ ...prev, vodVideoId: saveRes.vodVideo.id }));
                setVodVideo({
                  id: saveRes.vodVideo.id,
                  uuid: '',
                  filename: renamedFile.name,
                  vodVideoId: finalVideoId,
                  videoUrl: videoInfo.playURL,
                  coverUrl: videoInfo.coverUrl || null,
                  videoWidth: videoInfo.width,
                  videoHeight: videoInfo.height,
                  videoDuration: videoInfo.duration,
                  videoFps: videoInfo.fps,
                  videoType: 'MAIN',
                  mediaAssets: [],
                });
                addToast('视频上传成功并已保存', 'success');
                useUploadStore.getState().setComplete(taskId, saveRes.vodVideo.id, finalVideoId);

                if (videoInfo.isProcessing || !videoInfo.playURL || !videoInfo.coverUrl) {
                  const savedId = saveRes.vodVideo.id;
                  let attempts = 0;
                  setVodSyncing(true);
                  const poll = async () => {
                    attempts++;
                    try {
                      const pollRes = await api.post<{ success: boolean; vodVideo: VodVideoInfo }>(
                        `/admin/vod-videos/${savedId}/sync-info`, {}
                      );
                      const pv = pollRes.vodVideo;
                      if (pv.videoUrl && pv.coverUrl) {
                        setVodVideo(prev => prev ? {
                          ...prev,
                          videoUrl: pv.videoUrl,
                          coverUrl: pv.coverUrl,
                          videoWidth: pv.videoWidth,
                          videoHeight: pv.videoHeight,
                          videoDuration: pv.videoDuration,
                          videoFps: pv.videoFps,
                          mediaAssets: pv.mediaAssets?.length ? pv.mediaAssets : prev.mediaAssets,
                        } : prev);
                        setVodSyncing(false);
                        return;
                      }
                    } catch {}
                    if (attempts < 20) setTimeout(poll, 5000);
                    else setVodSyncing(false);
                  };
                  setTimeout(poll, 5000);
                }
              }
            } catch (saveErr: any) {
              console.error('保存失败:', saveErr);
              addToast(`上传成功，但保存失败: ${saveErr.message}`, 'error');
              useUploadStore.getState().setError(taskId, `保存失败: ${saveErr.message}`);
            }
          } else {
            addToast(`${type === 'main' ? '视频' : '预览视频'}上传成功`, 'success');
            useUploadStore.getState().setComplete(taskId, null, finalVideoId);
          }

          setUploading(false);
          taskIdRef.current = '';
        },
        onUploadFailed: (uploadInfo: any, code: string, message: string) => {
          console.error('上传失败:', code, message);
          addToast(`上传失败: ${message}`, 'error');
          setUploading(false);
          delete uploaders[taskId];
          useUploadStore.getState().setError(taskId, message);
          taskIdRef.current = '';
        },
        onUploadProgress: (uploadInfo: any, totalSize: number, loadedPercent: number) => {
          const percent = Math.round(loadedPercent * 100);
          setProgress(percent);
          setStatus(`上传中 ${percent}%`);
          useUploadStore.getState().setProgress(taskId, percent);
          if (loadedPercent === 1 && uploadInfo.videoId) {
            uploadedVideoId = uploadInfo.videoId;
            uploadedVideoIds[taskId] = uploadInfo.videoId;
          }
        },
        onUploadTokenExpired: async () => {
          try {
            const stsRes = await api.get<{ data: any }>('/aliyun/sts-token');
            const credentials = stsRes.data.credentials;
            uploader.resumeUploadWithSTSToken(credentials.accessKeyId, credentials.accessKeySecret, credentials.securityToken, credentials.expiration);
            uploader.startUpload();
          } catch (err) {
            console.error('刷新凭证失败:', err);
            addToast('上传凭证过期，刷新失败', 'error');
            setUploading(false);
            delete uploaders[taskId];
            useUploadStore.getState().setError(taskId, '凭证刷新失败');
            taskIdRef.current = '';
          }
        },
        onUploadCanceled: () => {
          setUploading(false);
          delete uploaders[taskId];
          useUploadStore.getState().removeTask(taskId);
          taskIdRef.current = '';
        },
      });

      uploaders[taskId] = uploader;
      uploadedVideoIds[taskId] = '';

      const paramData = JSON.stringify({
        Vod: {
          Title: title,
          TemplateGroupId: 'VOD_NO_TRANSCODE',
          CateId: 32804,
        },
      });

      uploader.addFile(renamedFile, null, null, null, paramData);
      uploader.startUpload();
      
    } catch (err: any) {
      console.error('上传过程错误:', err);
      addToast(err.message || '上传失败', 'error');
      setUploading(false);
      delete uploaders[taskId];
      useUploadStore.getState().setError(taskId, err.message || '上传失败');
      taskIdRef.current = '';
    }
  };

  const cancelVideoUpload = (type: 'main' | 'preview' = 'main') => {
    const taskIdRef = type === 'main' ? currentMainTaskIdRef : currentPreviewTaskIdRef;
    const taskId = taskIdRef.current;
    if (taskId) {
      cancelUploadTask(taskId);
      taskIdRef.current = '';
    }
    const setUploading = type === 'main' ? setVodUploading : setPreviewUploading;
    const setProgress = type === 'main' ? setVodProgress : setPreviewProgress;
    const setStatus = type === 'main' ? setVodStatus : setPreviewStatus;
    setUploading(false);
    setProgress(0);
    setStatus('');
    if (type === 'main') {
      setSelectedFile(null);
    } else {
      setSelectedPreviewFile(null);
    }
  };

  // 媒体库选择回调
  const handlePickerSelect = async (rawUrl: string, displayUrl: string, originalFilename?: string) => {
    if (!pickerTarget) return;

    if (pickerTarget === 'poster') {
      const currentVideoId = isNew ? null : id;
      if (currentVideoId) {
        await api.put(`/admin/videos/${currentVideoId}`, { posterUrl: rawUrl });
      }
      setForm(prev => ({ ...prev, posterUrl: displayUrl }));
      addToast('海报已更新', 'success');
      return;
    }

    // 字幕 / VTT / 雪碧图 - 需要已关联 VOD 视频
    if (!vodVideo) {
      addToast('请先关联VOD视频', 'error');
      return;
    }

    const assetMap: Record<string, { field: string; filenameField: string; type: 'CAPTION' | 'SPRITE' | 'SPRITE_VTT'; label: string }> = {
      caption:    { field: 'captionUrl',   filenameField: 'captionFilename',   type: 'CAPTION',    label: '字幕' },
      previewVtt: { field: 'spriteVttUrl', filenameField: 'spriteVttFilename', type: 'SPRITE_VTT', label: '预览VTT' },
      sprite:     { field: 'spriteUrl',    filenameField: 'spriteFilename',    type: 'SPRITE',     label: '雪碧图' },
    };
    const cfg = assetMap[pickerTarget];
    if (!cfg) return;

    const payload: Record<string, string> = { [cfg.field]: rawUrl };
    if (originalFilename) payload[cfg.filenameField] = originalFilename;

    await api.put(`/admin/vod-videos/${vodVideo.id}`, payload);
    setVodVideo(prev => {
      if (!prev) return null;
      const assets = [...prev.mediaAssets];
      const idx = assets.findIndex(a => a.type === cfg.type);
      const newAsset: MediaAsset = { type: cfg.type, url: displayUrl, originalFilename };
      if (idx >= 0) assets[idx] = newAsset;
      else assets.push(newAsset);
      return { ...prev, mediaAssets: assets };
    });
    addToast(`${cfg.label}已更新`, 'success');
  };

  // 取消设置资产（只清关联，不删 OSS 文件）
  const handleUnsetAsset = async (assetType: 'CAPTION' | 'SPRITE' | 'SPRITE_VTT') => {
    if (!vodVideo) return;
    const fieldMap: Record<string, string> = { CAPTION: 'captionUrl', SPRITE: 'spriteUrl', SPRITE_VTT: 'spriteVttUrl' };
    const labelMap: Record<string, string> = { CAPTION: '字幕', SPRITE: '雪碧图', SPRITE_VTT: '预览VTT' };
    await api.put(`/admin/vod-videos/${vodVideo.id}`, { [fieldMap[assetType]]: null });
    setVodVideo(prev => prev ? { ...prev, mediaAssets: prev.mediaAssets.filter(a => a.type !== assetType) } : null);
    addToast(`${labelMap[assetType]}已取消设置`, 'success');
  };

  const handlePosterUpload = async (file: File) => {
    setPosterUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'posters');

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/aliyun/upload/poster`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) throw new Error('上传失败');

      const data = await res.json();

      // 更新视频文章的海报（用 signedUrl 显示，存 url 到数据库）
      const displayUrl = data.data.signedUrl || data.data.url;
      setForm(prev => ({ ...prev, posterUrl: displayUrl }));
      const currentVideoId = isNew ? null : id;
      if (currentVideoId) {
        await api.put(`/admin/videos/${currentVideoId}`, { posterUrl: data.data.url });
      }

      addToast('海报上传成功', 'success');
    } catch (err: any) {
      addToast(err.message || '上传失败', 'error');
    } finally {
      setPosterUploading(false);
    }
  };

  const handleCaptionUpload = async (file: File, type: 'caption' | 'previewVtt' | 'sprite') => {
    const setUploading = type === 'caption' ? setCaptionUploading : 
                         type === 'previewVtt' ? setPreviewVttUploading : setSpriteUploading;
    const label = type === 'caption' ? '字幕' : 
                  type === 'previewVtt' ? '预览VTT' : '雪碧图';
    
    if (!vodVideo) {
      addToast('请先关联VOD视频', 'error');
      return;
    }
    
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', type === 'sprite' ? 'sprites' : 'subtitles');

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/aliyun/upload/image`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) throw new Error('上传失败');

      const data = await res.json();
      
      // 更新 media_asset
      const assetTypeMap = { caption: 'captionUrl', previewVtt: 'spriteVttUrl', sprite: 'spriteUrl' } as const;
      const assetField = assetTypeMap[type];
      const mediaAssetType = type === 'caption' ? 'CAPTION' : type === 'previewVtt' ? 'SPRITE_VTT' : 'SPRITE';
      await api.put(`/admin/vod-videos/${vodVideo.id}`, { [assetField]: data.data.url });
      const displayUrl = data.data.signedUrl || data.data.url;
      setVodVideo(prev => {
        if (!prev) return null;
        const existing = prev.mediaAssets.findIndex(a => a.type === mediaAssetType);
        const newAssets = [...prev.mediaAssets];
        if (existing >= 0) newAssets[existing] = { type: mediaAssetType, url: displayUrl };
        else newAssets.push({ type: mediaAssetType, url: displayUrl });
        return { ...prev, mediaAssets: newAssets };
      });

      addToast(`${label}上传成功`, 'success');
    } catch (err: any) {
      addToast(err.message || '上传失败', 'error');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-white">{isNew ? '新增视频文章' : '编辑视频文章'}</h1>
          <p className="text-xs text-gray-500 mt-0.5">创建视频文章并关联VOD视频资源</p>
        </div>
        <div className="flex gap-3">
          {!isNew && videoUuid && (
            <a href={`/watch/${videoUuid}`} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                浏览
              </Button>
            </a>
          )}
          <Button variant="ghost" onClick={() => router.back()}>取消</Button>
          <Button onClick={handleSave} isLoading={saving}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            保存
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h2 className="text-sm font-semibold text-white mb-3">基本信息</h2>
            <div className="space-y-4">
              <Input
                label="视频标题"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="输入视频标题"
              />
              <Textarea
                label="视频描述"
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="输入视频描述（可选）"
                rows={4}
              />
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-white mb-3">VOD视频资源</h2>
            
            {vodVideo ? (
              <div className="space-y-4">
                {/* 已关联的VOD视频信息 */}
                <div className="bg-gray-800 rounded-md p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      {(vodVideo.coverUrl || form.posterUrl) && (
                        <img
                          src={vodVideo.coverUrl || form.posterUrl!}
                          alt="封面"
                          className="w-24 h-14 object-cover rounded"
                        />
                      )}
                      <div>
                        <div className="text-sm text-gray-400">VOD ID</div>
                        <div className="font-mono text-white">{vodVideo.vodVideoId || '-'}</div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setForm(prev => ({ ...prev, vodVideoId: null }));
                        setVodVideo(null);
                      }}
                    >
                      取消关联
                    </Button>
                  </div>
                  
                  {vodSyncing && (
                    <div className="flex items-center gap-2 mt-3 text-xs text-yellow-400">
                      <Spinner size="sm" />
                      <span>视频处理中，自动同步信息（约需数秒至数分钟）...</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <div>
                      <div className="text-xs text-gray-500">分辨率</div>
                      <div className="text-sm text-white font-mono">
                        {vodVideo.videoWidth && vodVideo.videoHeight
                          ? `${vodVideo.videoWidth}×${vodVideo.videoHeight}`
                          : vodSyncing ? <span className="text-gray-600">同步中...</span> : '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">时长</div>
                      <div className="text-sm text-white font-mono">
                        {vodVideo.videoDuration || (vodSyncing ? <span className="text-gray-600">同步中...</span> : '-')}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">帧率</div>
                      <div className="text-sm text-white font-mono">{vodVideo.videoFps ? `${vodVideo.videoFps} fps` : '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">预览视频</div>
                      <div className="text-sm text-white">{previewVodVideo ? '有' : '无'}</div>
                    </div>
                  </div>

                  {vodVideo.videoUrl && (
                    <div className="mt-4">
                      <div className="text-xs text-gray-500 mb-1">主视频</div>
                      <HlsVideoPreview
                        src={vodVideo.videoUrl}
                        poster={vodVideo.coverUrl || form.posterUrl || undefined}
                        className="w-full max-w-md rounded"
                      />
                    </div>
                  )}

                  <div className="mt-4 border-t border-gray-700 pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-gray-500">预览视频（用户鼠标悬浮时播放，独立资源）</div>
                      <div className="flex items-center gap-3 flex-wrap">
                        {previewVodVideo && (
                          <button
                            className="text-red-400 text-sm hover:underline"
                            onClick={async () => {
                              const currentVideoId = isNew ? null : id;
                              if (currentVideoId) {
                                await api.put(`/admin/videos/${currentVideoId}`, { previewVodVideoId: null });
                              }
                              setPreviewVodVideo(null);
                              setForm(prev => ({ ...prev, previewVodVideoId: null }));
                            }}
                          >
                            移除预览
                          </button>
                        )}
                        <label className="cursor-pointer">
                          <input
                            ref={previewFileRef}
                            type="file"
                            accept="video/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setSelectedPreviewFile(file);
                                handleVideoUpload(file, 'preview');
                              }
                            }}
                            className="hidden"
                          />
                          <span className="text-blue-400 text-sm hover:underline cursor-pointer">
                            {previewUploading ? '上传中...' : (previewVodVideo ? '更换预览视频' : '上传预览视频')}
                          </span>
                        </label>
                        <span className="text-gray-600 text-sm">或</span>
                        <div className="flex gap-2 items-center">
                          <Input
                            placeholder="输入VOD视频ID"
                            className="w-40 !h-8"
                            id="manual-preview-vod-id"
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            isLoading={previewLinking}
                            onClick={() => {
                              const input = document.getElementById('manual-preview-vod-id') as HTMLInputElement;
                              if (input?.value) handleLinkPreviewVodVideo(input.value);
                            }}
                          >
                            关联
                          </Button>
                        </div>
                      </div>
                    </div>

                    {previewUploading && (
                      <div className="mb-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Spinner size="sm" />
                          <span className="text-sm text-gray-400">{previewStatus}</span>
                        </div>
                        <ProgressBar value={previewProgress} showLabel />
                        <div className="flex justify-center mt-2">
                          <button
                            type="button"
                            className="text-xs text-red-400 hover:text-red-300 hover:underline"
                            onClick={() => cancelVideoUpload('preview')}
                          >
                            取消上传
                          </button>
                        </div>
                      </div>
                    )}

                    {previewVodVideo ? (
                      previewVodVideo.videoUrl ? (
                        <HlsVideoPreview
                          src={previewVodVideo.videoUrl}
                          className="w-full max-w-md rounded"
                        />
                      ) : (
                        <div className="bg-gray-900 rounded p-4 text-center text-gray-500 text-sm">
                          预览视频处理中，稍后刷新可播放
                        </div>
                      )
                    ) : !previewUploading ? (
                      <div className="bg-gray-900 rounded p-4 text-center text-gray-500 text-sm">
                        暂无预览视频
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="border-t border-gray-700 pt-4">
                  <h3 className="text-sm font-normal text-gray-300 mb-3">字幕和缩略图</h3>
                  <div className="space-y-3">
                    {(() => {
                      const asset = vodVideo.mediaAssets.find(a => a.type === 'CAPTION');
                      const label = asset?.originalFilename || (asset?.url ? decodeURIComponent(asset.url.split('/').pop()?.split('?')[0] || '') : '');
                      return (
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm text-gray-400 w-20 flex-shrink-0">字幕</span>
                          {asset ? (
                            <a href={asset.url} target="_blank" rel="noopener noreferrer"
                              className="text-blue-400 text-sm hover:underline truncate max-w-xs" title={label}>
                              {label || '查看文件'}
                            </a>
                          ) : (
                            <span className="text-gray-600 text-sm">未设置</span>
                          )}
                          <button className="text-blue-400 text-sm hover:underline cursor-pointer flex-shrink-0" onClick={() => setPickerTarget('caption')}>
                            {asset ? '更换' : '选择'}
                          </button>
                          {asset && (
                            <button className="text-red-400 text-sm hover:underline cursor-pointer flex-shrink-0" onClick={() => handleUnsetAsset('CAPTION')}>
                              取消设置
                            </button>
                          )}
                        </div>
                      );
                    })()}

                    {(() => {
                      const asset = vodVideo.mediaAssets.find(a => a.type === 'SPRITE_VTT');
                      const label = asset?.originalFilename || (asset?.url ? decodeURIComponent(asset.url.split('/').pop()?.split('?')[0] || '') : '');
                      return (
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm text-gray-400 w-20 flex-shrink-0">预览VTT</span>
                          {asset ? (
                            <a href={asset.url} target="_blank" rel="noopener noreferrer"
                              className="text-blue-400 text-sm hover:underline truncate max-w-xs" title={label}>
                              {label || '查看文件'}
                            </a>
                          ) : (
                            <span className="text-gray-600 text-sm">未设置</span>
                          )}
                          <button className="text-blue-400 text-sm hover:underline cursor-pointer flex-shrink-0" onClick={() => setPickerTarget('previewVtt')}>
                            {asset ? '更换' : '选择'}
                          </button>
                          {asset && (
                            <button className="text-red-400 text-sm hover:underline cursor-pointer flex-shrink-0" onClick={() => handleUnsetAsset('SPRITE_VTT')}>
                              取消设置
                            </button>
                          )}
                        </div>
                      );
                    })()}

                    {(() => {
                      const asset = vodVideo.mediaAssets.find(a => a.type === 'SPRITE');
                      return (
                        <div className="flex items-start gap-3 flex-wrap">
                          <span className="text-sm text-gray-400 w-20 flex-shrink-0 pt-1">雪碧图</span>
                          <div className="flex flex-col gap-2">
                            {asset ? (
                              <img
                                src={asset.url}
                                alt="雪碧图"
                                className="max-w-[200px] h-auto rounded cursor-zoom-in border border-white/10 hover:border-white/30 transition-colors"
                                onClick={(e) => openSpritePhotoswipe(asset.url, e.currentTarget)}
                                title="点击放大"
                              />
                            ) : (
                              <span className="text-gray-600 text-sm pt-1">未设置</span>
                            )}
                            <div className="flex gap-3">
                              <button className="text-blue-400 text-sm hover:underline cursor-pointer" onClick={() => setPickerTarget('sprite')}>
                                {asset ? '更换' : '选择'}
                              </button>
                              {asset && (
                                <button className="text-red-400 text-sm hover:underline cursor-pointer" onClick={() => handleUnsetAsset('SPRITE')}>
                                  取消设置
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="border-t border-gray-700 pt-4">
                  <h3 className="text-sm font-normal text-gray-300 mb-3">海报图片</h3>
                  <div>
                    {form.posterUrl && (
                      <img src={form.posterUrl} alt="海报" className="w-full max-w-xs rounded mb-2" />
                    )}
                    <button
                      className="text-blue-400 text-sm hover:underline cursor-pointer"
                      onClick={() => setPickerTarget('poster')}
                    >
                      {posterUploading ? '上传中...' : (form.posterUrl ? '更换海报' : '选择海报')}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-gray-800 rounded-md p-6 text-center">
                  <svg className="w-12 h-12 text-gray-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <p className="text-gray-400 mb-4">尚未关联VOD视频资源</p>
                  
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <div>
                      <input
                        ref={videoFileRef}
                        type="file"
                        accept="video/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setSelectedFile(file);
                            handleVideoUpload(file, 'main');
                          }
                        }}
                        className="hidden"
                      />
                      <Button
                        variant="primary"
                        onClick={() => videoFileRef.current?.click()}
                        isLoading={vodUploading}
                        disabled={vodUploading}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        上传新视频
                      </Button>
                    </div>

                    <span className="text-gray-600 self-center">或</span>

                    {/* 手动关联已有VOD */}
                    <div className="flex gap-2">
                      <Input
                        placeholder="输入VOD视频ID"
                        className="w-48 !h-9"
                        id="manual-vod-id"
                      />
                      <Button
                        variant="secondary"
                        isLoading={vodLinking}
                        onClick={() => {
                          const input = document.getElementById('manual-vod-id') as HTMLInputElement;
                          if (input?.value) {
                            handleLinkVodVideo(input.value);
                          }
                        }}
                      >
                        关联
                      </Button>
                    </div>
                  </div>

                  {vodUploading && (
                    <div className="mt-4 max-w-md mx-auto">
                      <div className="flex items-center gap-2 mb-1">
                        <Spinner size="sm" />
                        <span className="text-sm text-gray-400">{vodStatus}</span>
                      </div>
                      <ProgressBar value={vodProgress} showLabel />
                      <div className="flex justify-center mt-2">
                        <button
                          type="button"
                          className="text-xs text-red-400 hover:text-red-300 hover:underline"
                          onClick={() => cancelVideoUpload('main')}
                        >
                          取消上传
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedFile && !vodUploading && (
                    <div className="mt-3 flex items-center gap-2 justify-center">
                      <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm text-gray-300">{selectedFile.name}</span>
                    </div>
                  )}
                </div>

                <p className="text-xs text-gray-500 text-center">
                  支持 MP4 格式，最大 4GB。上传后视频将保存到VOD视频资源库。
                </p>
              </div>
            )}
          </Card>

          </div>

        <div className="space-y-6">
          <Card>
            <h2 className="text-sm font-semibold text-white mb-3">发布设置</h2>
            <div className="space-y-4">
              <Select
                label="状态"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                options={[
                  { value: 'DRAFT', label: '草稿' },
                  { value: 'PUBLISHED', label: '已发布' },
                  { value: 'ARCHIVED', label: '归档' },
                ]}
              />

              <div>
                <label className="block text-xs text-gray-400 mb-1">发布时间</label>
                <input
                  type="datetime-local"
                  value={form.publishedAt}
                  onChange={(e) => setForm({ ...form, publishedAt: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md bg-gray-800 border border-white/10 text-white focus:outline-none focus:border-blue-500 [color-scheme:dark]"
                />
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-md hover:bg-white/5 transition-colors">
                  <input
                    type="checkbox"
                    checked={form.isPickup}
                    onChange={(e) => setForm({ ...form, isPickup: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-normal text-foreground">置顶视频</span>
                    <p className="text-xs text-gray-500">视频将显示在首页顶部</p>
                  </div>
                </label>

              </div>
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-white mb-3">分类</h2>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <label
                  key={cat.id}
                  className={`flex items-center gap-1.5 cursor-pointer px-2.5 py-1 rounded-full border text-sm transition-colors ${
                    form.categoryIds.includes(cat.id)
                      ? 'border-blue-500 bg-blue-500/15 text-blue-300'
                      : 'border-white/10 text-gray-400 hover:border-white/25'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={form.categoryIds.includes(cat.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setForm({ ...form, categoryIds: [...form.categoryIds, cat.id] });
                      } else {
                        setForm({ ...form, categoryIds: form.categoryIds.filter((x) => x !== cat.id) });
                      }
                    }}
                    className="hidden"
                  />
                  {cat.name}
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-white mb-3">权限控制</h2>
            <p className="text-xs text-gray-500 mb-3">留空表示所有人可访问，勾选后仅限选中用户</p>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {users.map((user) => (
                <label
                  key={user.id}
                  className="flex items-center gap-3 cursor-pointer p-2 rounded-md hover:bg-white/5 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={form.allowedUserIds.includes(user.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setForm({ ...form, allowedUserIds: [...form.allowedUserIds, user.id] });
                      } else {
                        setForm({ ...form, allowedUserIds: form.allowedUserIds.filter((x) => x !== user.id) });
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm text-gray-300">{user.nickname || user.username}</span>
                    {user.nickname && <span className="text-xs text-gray-500 ml-2">@{user.username}</span>}
                  </div>
                </label>
              ))}
              {users.length === 0 && (
                <p className="text-xs text-gray-600 py-2">暂无注册用户</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      {pickerTarget && (
        <MediaPickerModal
          isOpen={!!pickerTarget}
          onClose={() => setPickerTarget(null)}
          onSelect={async (rawUrl, displayUrl, originalFilename) => {
            await handlePickerSelect(rawUrl, displayUrl, originalFilename);
            setPickerTarget(null);
          }}
          {...pickerConfig[pickerTarget]}
        />
      )}

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
