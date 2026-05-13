import { create } from 'zustand';
import { api } from '@/lib/api';

export interface UploadTask {
  id: string;
  filename: string;
  type: 'main' | 'preview';
  uploading: boolean;
  progress: number;
  status: string;
  complete: boolean;
  error: string | null;
  resultVodVideoId: number | null;
  resultVideoId: string | null;
}

interface UploadStore {
  tasks: UploadTask[];
  addTask: (id: string, filename: string, type: 'main' | 'preview') => void;
  setUploading: (id: string, uploading: boolean) => void;
  setProgress: (id: string, progress: number) => void;
  setStatus: (id: string, status: string) => void;
  setComplete: (id: string, resultVodVideoId: number | null, resultVideoId: string | null) => void;
  setError: (id: string, error: string) => void;
  removeTask: (id: string) => void;
}

export const useUploadStore = create<UploadStore>((set) => ({
  tasks: [],

  addTask: (id, filename, type) => set(s => ({
    tasks: [...s.tasks, {
      id,
      filename,
      type,
      uploading: true,
      progress: 0,
      status: '初始化上传...',
      complete: false,
      error: null,
      resultVodVideoId: null,
      resultVideoId: null,
    }],
  })),

  setUploading: (id, uploading) => set(s => ({
    tasks: s.tasks.map(t => t.id === id ? { ...t, uploading } : t),
  })),

  setProgress: (id, progress) => set(s => ({
    tasks: s.tasks.map(t => t.id === id ? { ...t, progress, status: `上传中 ${progress}%` } : t),
  })),

  setStatus: (id, status) => set(s => ({
    tasks: s.tasks.map(t => t.id === id ? { ...t, status } : t),
  })),

  setComplete: (id, resultVodVideoId, resultVideoId) => set(s => ({
    tasks: s.tasks.map(t => t.id === id ? {
      ...t,
      uploading: false,
      progress: 100,
      status: '上传完成',
      complete: true,
      resultVodVideoId,
      resultVideoId,
    } : t),
  })),

  setError: (id, error) => set(s => ({
    tasks: s.tasks.map(t => t.id === id ? {
      ...t,
      uploading: false,
      error,
      status: '上传失败',
    } : t),
  })),

  removeTask: (id) => set(s => ({
    tasks: s.tasks.filter(t => t.id !== id),
  })),
}));

export const uploaders: Record<string, any> = {};
export const uploadedVideoIds: Record<string, string> = {};

export function cancelUploadTask(id: string) {
  const uploader = uploaders[id];
  if (uploader) {
    uploader.stopUpload();
  }
  const videoId = uploadedVideoIds[id];
  if (videoId) {
    api.delete(`/aliyun/vod/${videoId}`).catch((err: any) => {
      console.error('删除已上传的部分VOD文件失败:', err);
    });
  }
  delete uploaders[id];
  delete uploadedVideoIds[id];
  useUploadStore.getState().removeTask(id);
}
