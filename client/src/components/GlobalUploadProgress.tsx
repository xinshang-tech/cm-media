'use client';

import { useEffect } from 'react';
import { useUploadStore, cancelUploadTask } from '@/stores/uploadStore';
import { CheckCircle2, XCircle, X, Layers } from 'lucide-react';

export default function GlobalUploadProgress() {
  const tasks = useUploadStore(s => s.tasks);
  const removeTask = useUploadStore(s => s.removeTask);
  const isUploading = tasks.some(t => t.uploading);

  useEffect(() => {
    if (!isUploading) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isUploading]);

  if (tasks.length === 0) return null;

  const typeLabel = (type: 'main' | 'preview') => type === 'main' ? '主视频' : '预览';

  return (
    <div className="upload-widget fixed bottom-5 right-5 z-[100] w-[22rem] flex flex-col gap-2.5">

      {tasks.length > 1 && (
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gray-900/80 backdrop-blur-md border border-white/8 shadow-lg shadow-black/30">
          <Layers className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
          <span className="text-[11px] text-gray-400 font-medium">
            上传队列 · <span className="text-gray-300">{tasks.length}</span> 个任务
          </span>
          <div className="ml-auto flex gap-1">
            {tasks.filter(t => t.uploading).length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#ae1a20]/20 text-[#ff7077]">
                {tasks.filter(t => t.uploading).length} 上传中
              </span>
            )}
            {tasks.filter(t => t.complete).length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                {tasks.filter(t => t.complete).length} 完成
              </span>
            )}
          </div>
        </div>
      )}

      {tasks.map(task => (
        <div
          key={task.id}
          className={`upload-card relative rounded-2xl border overflow-hidden shadow-2xl backdrop-blur-md transition-all duration-300 ${
            task.error
              ? 'upload-card-error border-red-500/30 bg-gradient-to-br from-red-950/95 to-gray-900/95 shadow-red-950/40'
              : task.complete
                ? 'upload-card-complete border-emerald-500/30 bg-gradient-to-br from-emerald-950/95 to-gray-900/95 shadow-emerald-950/30'
                : 'upload-card-uploading border-white/10 bg-gradient-to-br from-gray-900/98 to-gray-850/95 shadow-black/50'
          }`}
        >
          {/* 顶部彩色装饰线 */}
          <div className={`h-[2px] w-full ${
            task.error
              ? 'bg-gradient-to-r from-red-600 to-red-400'
              : task.complete
                ? 'bg-gradient-to-r from-emerald-600 to-emerald-400'
                : 'bg-gradient-to-r from-[#ae1a20] via-[#d42530] to-[#ae1a20]'
          }`} />

          <div className="p-4">
            <div className="flex items-start gap-3 mb-3">

              <div className="flex-shrink-0 mt-0.5">
                {task.error ? (
                  <XCircle className="w-4.5 h-4.5 text-red-400" />
                ) : task.complete ? (
                  <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-[#ae1a20] border-t-transparent animate-spin mt-0.5" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="mb-1">
                  <span className={`inline-block text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded-full ${
                    task.complete
                      ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30'
                      : task.type === 'main'
                        ? 'bg-[#ae1a20]/25 text-[#ff7077] ring-1 ring-[#ae1a20]/30'
                        : 'bg-sky-500/20 text-sky-400 ring-1 ring-sky-500/30'
                  }`}>
                    {typeLabel(task.type)}
                  </span>
                </div>
                <p className="text-[13px] font-medium text-gray-100 truncate leading-tight" title={task.filename}>
                  {task.filename}
                </p>
              </div>

              <div className="flex-shrink-0 -mt-0.5">
                {task.uploading && (
                  <button
                    onClick={() => cancelUploadTask(task.id)}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-red-500/12 text-red-400 hover:bg-red-500/25 hover:text-red-300 transition-all duration-150 ring-1 ring-red-500/20"
                  >
                    取消
                  </button>
                )}
                {(task.complete || task.error) && (
                  <button
                    onClick={() => removeTask(task.id)}
                    className="p-1.5 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-white/8 transition-all duration-150"
                    title="关闭"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {task.uploading && (
              <div className="mb-2.5">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[11px] text-gray-500">上传进度</span>
                  <span className="text-[11px] font-semibold tabular-nums text-gray-300">
                    {task.progress}%
                  </span>
                </div>
                <div className="w-full bg-white/6 rounded-full h-[7px] overflow-hidden ring-1 ring-white/5">
                  <div
                    className="relative h-full rounded-full transition-all duration-300 bg-gradient-to-r from-[#8a1219] via-[#d42530] to-[#ff5060] overflow-hidden"
                    style={{ width: `${task.progress}%` }}
                  >
                    {/* 光扫效果 */}
                    <div className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-shimmer" />
                  </div>
                </div>
              </div>
            )}

            <p className={`text-[11px] truncate leading-snug ${
              task.error
                ? 'text-red-300/80'
                : task.complete
                  ? 'text-emerald-300/80'
                  : 'text-gray-500'
            }`}>
              {task.status}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
