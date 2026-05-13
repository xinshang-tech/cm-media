'use client';

import { useEffect, useState, useRef } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { useParams, useRouter } from 'next/navigation';
import { api, getSignedUrl } from '@/lib/api';
import { Button, Input, Textarea, Select, Spinner, Card, ProgressBar, ToastContainer, useToast } from '@/components/ui';

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

interface Photo {
  id: number;
  url: string;
  thumbnailUrl?: string | null;
  sortOrder: number;
  width?: number | null;
  height?: number | null;
}

interface AlbumForm {
  title: string;
  content: string;
  coverUrl: string | null;
  status: string;
  isPickup: boolean;
  categoryIds: number[];
  allowedUserIds: number[];
  publishedAt: string;
}

const emptyForm: AlbumForm = {
  title: '',
  content: '',
  coverUrl: null,
  status: 'PUBLISHED',
  isPickup: false,
  categoryIds: [],
  allowedUserIds: [],
  publishedAt: toShanghaiLocal(new Date()),
};

export default function AdminPhotoAlbumEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const isNew = id === 'new';

  const [form, setForm] = useState<AlbumForm>(emptyForm);
  const [albumUuid, setAlbumUuid] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  // 图片上传状态
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverUploading, setCoverUploading] = useState(false);

  useEffect(() => {
    api.get<{ categories: Category[] }>('/admin/categories').then((res) => {
      setCategories(res.categories.flatMap((c: Category) => [c, ...(c.children || [])]));
    });

    api.get<{ users: User[] }>('/admin/users').then((res) => {
      setUsers(res.users);
    });

    if (!isNew) {
      api.get<any>(`/admin/photo-albums/${id}`).then(async (res) => {
        const album = res.album;
        const signedCoverUrl = album.coverUrl ? await getSignedUrl(album.coverUrl) : null;

        setForm({
          title: album.title || '',
          content: album.content || '',
          coverUrl: signedCoverUrl || album.coverUrl || null,
          status: album.status || 'DRAFT',
          isPickup: album.isPickup || false,
          categoryIds: album.categories?.map((c: any) => c.categoryId ?? c.category?.id).filter(Boolean) || [],
          allowedUserIds: album.allowedUsers ? (Array.isArray(album.allowedUsers) ? album.allowedUsers : JSON.parse(album.allowedUsers)) : [],
          publishedAt: album.publishedAt ? toShanghaiLocal(new Date(album.publishedAt)) : '',
        });

        setAlbumUuid(album.uuid || null);
        setPhotos(album.photos || []);
        setLoading(false);
      }).catch(() => {
        alert('相册不存在');
        router.push('/admin/photos');
      });
    }
  }, [id, isNew, router]);

  const handleSave = async () => {
    if (!form.title.trim()) {
      addToast('请输入相册标题', 'error');
      return;
    }

    setSaving(true);
    try {
      const data = {
        title: form.title,
        content: form.content,
        coverUrl: form.coverUrl ? form.coverUrl.split('?')[0] : null,
        status: form.status,
        isPickup: form.isPickup,
        categoryIds: form.categoryIds,
        allowedUsers: form.allowedUserIds.length > 0 ? form.allowedUserIds : null,
        publishedAt: form.publishedAt ? `${form.publishedAt}+08:00` : null,
      };

      if (isNew) {
        const res = await api.post<{ album: { id: number } }>('/admin/photo-albums', data);
        addToast('相册创建成功', 'success');
        setTimeout(() => router.push(`/admin/photos/${res.album.id}`), 1000);
      } else {
        await api.put(`/admin/photo-albums/${id}`, data);
        addToast('保存成功', 'success');
      }
    } catch (err: any) {
      addToast(err.message || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 批量上传图片
  const handlePhotoUpload = async (fileList: FileList) => {
    if (!fileList.length) return;

    // 如果是新建相册，先保存
    if (isNew) {
      addToast('请先保存相册后再上传图片', 'error');
      return;
    }

    const files = Array.from(fileList);
    setUploading(true);
    setUploadProgress(0);
    setUploadStatus(`准备上传 ${files.length} 张图片...`);

    const uploadedPhotos: { url: string; thumbnailUrl?: string; width?: number; height?: number; filesize?: number }[] = [];
    const totalFiles = files.length;

    for (let i = 0; i < totalFiles; i++) {
      const file = files[i];
      setUploadStatus(`上传中 (${i + 1}/${totalFiles}): ${file.name}`);
      setUploadProgress(Math.round(((i) / totalFiles) * 100));

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', 'photos');

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/aliyun/upload/image`, {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });

        if (!res.ok) throw new Error('上传失败');

        const data = await res.json();
        uploadedPhotos.push({
          url: data.data.url,
          thumbnailUrl: data.data.thumbnailUrl || null,
          width: data.data.width || null,
          height: data.data.height || null,
          filesize: file.size,
        });
      } catch (err: any) {
        console.error(`上传失败: ${file.name}`, err);
        addToast(`上传失败: ${file.name}`, 'error');
      }
    }

    // 批量保存到数据库
    if (uploadedPhotos.length > 0) {
      try {
        setUploadStatus('保存图片记录...');
        const res = await api.post<{ album: any }>(`/admin/photo-albums/${id}/photos`, { photos: uploadedPhotos });

        if (res.album?.photos) {
          setPhotos(res.album.photos);
        }

        addToast(`成功上传 ${uploadedPhotos.length} 张图片`, 'success');
      } catch (err: any) {
        addToast(err.message || '保存图片记录失败', 'error');
      }
    }

    setUploading(false);
    setUploadProgress(100);
    setUploadStatus('');
  };

  const handleDeletePhoto = async (photoId: number) => {
    if (!confirm('确定删除这张图片？')) return;

    try {
      await api.delete(`/admin/photos/${photoId}`);
      setPhotos(prev => prev.filter(p => p.id !== photoId));
      addToast('图片已删除', 'success');
    } catch (err: any) {
      addToast(err.message || '删除失败', 'error');
    }
  };

  const handleSetCover = (url: string) => {
    setForm(prev => ({ ...prev, coverUrl: url }));
    addToast('封面已更新，请保存', 'success');
  };

  const handleCoverUpload = async (file: File) => {
    setCoverUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'covers');

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/aliyun/upload/poster`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) throw new Error('上传失败');

      const data = await res.json();
      const displayUrl = data.data.signedUrl || data.data.url;
      setForm(prev => ({ ...prev, coverUrl: displayUrl }));
      addToast('封面上传成功', 'success');
    } catch (err: any) {
      addToast(err.message || '封面上传失败', 'error');
    } finally {
      setCoverUploading(false);
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
          <h1 className="text-sm font-semibold text-white">{isNew ? '新增相册' : '编辑相册'}</h1>
          <p className="text-xs text-gray-500 mt-0.5">创建图片相册并批量上传图片</p>
        </div>
        <div className="flex gap-3">
          {!isNew && albumUuid && (
            <a href={`/album/${albumUuid}`} target="_blank" rel="noopener noreferrer">
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
                label="相册标题"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="输入相册标题"
              />
              <Textarea
                label="相册描述"
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="输入相册描述（可选）"
                rows={4}
              />
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white">图片管理</h2>
              {!isNew && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      if (e.target.files) {
                        handlePhotoUpload(e.target.files);
                        e.target.value = '';
                      }
                    }}
                    className="hidden"
                  />
                  <Button
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    isLoading={uploading}
                    disabled={uploading}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    批量上传
                  </Button>
                </div>
              )}
            </div>

            {isNew ? (
              <div className="bg-gray-800 rounded-md p-6 text-center">
                <svg className="w-12 h-12 text-gray-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-gray-400 mb-2">请先保存相册，然后上传图片</p>
                <p className="text-gray-500 text-sm">支持 JPG、PNG、WebP 等格式</p>
              </div>
            ) : (
              <>
                {uploading && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Spinner size="sm" />
                      <span className="text-sm text-gray-400">{uploadStatus}</span>
                    </div>
                    <ProgressBar value={uploadProgress} showLabel />
                  </div>
                )}

                {photos.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {photos.map((photo) => (
                      <div key={photo.id} className="relative group aspect-square bg-gray-800 rounded-md overflow-hidden">
                        <img
                          src={photo.thumbnailUrl || photo.url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleSetCover(photo.url)}
                            className="p-1.5 bg-white/20 rounded hover:bg-white/30 transition-colors"
                            title="设为封面"
                          >
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeletePhoto(photo.id)}
                            className="p-1.5 bg-red-500/80 rounded hover:bg-red-500 transition-colors"
                            title="删除"
                          >
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                        {form.coverUrl === photo.url && (
                          <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-blue-500 rounded text-xs text-white">
                            封面
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-800 rounded-md p-6 text-center">
                    <svg className="w-12 h-12 text-gray-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-gray-400">暂无图片</p>
                    <p className="text-gray-500 text-sm mt-1">点击上方"批量上传"按钮添加图片</p>
                  </div>
                )}
              </>
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
                    <span className="text-sm font-normal text-foreground">置顶相册</span>
                    <p className="text-xs text-gray-500">相册将显示在首页顶部</p>
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
            <p className="text-xs text-gray-500 mb-3">默认所有用户可见，选择用户后仅指定用户可查看</p>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {users.map((user) => (
                <label
                  key={user.id}
                  className={`flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded text-sm transition-colors ${
                    form.allowedUserIds.includes(user.id)
                      ? 'bg-blue-500/15 text-blue-300'
                      : 'text-gray-400 hover:bg-white/5'
                  }`}
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
                  <span>{user.nickname || user.username}</span>
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-white mb-3">封面图片</h2>
            {form.coverUrl ? (
              <div className="relative">
                <img src={form.coverUrl} alt="封面" className="w-full rounded aspect-video object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded">
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleCoverUpload(file);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                  <Button
                    size="sm"
                    onClick={() => coverInputRef.current?.click()}
                    isLoading={coverUploading}
                    disabled={coverUploading}
                  >
                    更换封面
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setForm(prev => ({ ...prev, coverUrl: null }))}
                  >
                    移除
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCoverUpload(file);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <div
                  onClick={() => coverInputRef.current?.click()}
                  className="w-full rounded aspect-video bg-gray-800 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-700 transition-colors"
                >
                  {coverUploading ? (
                    <Spinner size="lg" />
                  ) : (
                    <>
                      <svg className="w-12 h-12 text-gray-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-gray-400 text-sm">点击上传封面图片</p>
                      <p className="text-gray-500 text-xs mt-1">支持 JPG、PNG、WebP 格式</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
