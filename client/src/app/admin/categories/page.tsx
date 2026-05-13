'use client';

import { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';
import { Button, Input, Card, PageLoader, ToastContainer, useToast, Modal, ConfirmModal } from '@/components/ui';

interface Category {
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
  sortOrder: number;
  children?: Category[];
  _count?: {
    videoCategories: number;
    photoAlbumCategories: number;
  };
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const { toasts, addToast, removeToast } = useToast();

  // 拖拽状态
  const [draggedItem, setDraggedItem] = useState<Category | null>(null);
  const [dragOverItem, setDragOverItem] = useState<Category | null>(null);
  const [dragType, setDragType] = useState<'parent' | 'child'>('parent');
  const dragCounter = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const animateFlip = (before: Map<string, { top: number; left: number }>) => {
    requestAnimationFrame(() => {
      if (!listRef.current) return;
      const items = listRef.current.querySelectorAll<HTMLElement>('[data-flip-key]');
      items.forEach(el => {
        const key = el.dataset.flipKey!;
        const prev = before.get(key);
        if (!prev) return;
        const next = el.getBoundingClientRect();
        const dx = prev.left - next.left;
        const dy = prev.top - next.top;
        if (dx === 0 && dy === 0) return;
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.style.transition = 'none';
        requestAnimationFrame(() => {
          el.style.transform = '';
          el.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
        });
      });
    });
  };

  // 编辑弹窗
  const [editModal, setEditModal] = useState<{ isOpen: boolean; category: Category | null }>({
    isOpen: false,
    category: null,
  });
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editParentId, setEditParentId] = useState<string>('');
  const [editSortOrder, setEditSortOrder] = useState('0');
  const [saving, setSaving] = useState(false);

  // 删除确认
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; category: Category | null }>({
    isOpen: false,
    category: null,
  });
  const [deleting, setDeleting] = useState(false);

  const fetchCategories = async () => {
    try {
      const res = await api.get<{ categories: Category[] }>('/admin/categories');
      setCategories(res.categories);
    } catch (err) {
      console.error('加载分类失败:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const randomSlug = () => Math.random().toString(36).slice(2, 10);

  const openCreateModal = () => {
    setEditName('');
    setEditSlug(randomSlug());
    setEditParentId('');
    setEditSortOrder('0');
    setEditModal({ isOpen: true, category: null });
  };

  const openEditModal = (cat: Category) => {
    setEditName(cat.name);
    setEditSlug(cat.slug);
    setEditParentId(cat.parentId ? String(cat.parentId) : '');
    setEditSortOrder(String(cat.sortOrder));
    setEditModal({ isOpen: true, category: cat });
  };

  const handleSave = async () => {
    if (!editName.trim()) {
      addToast('请输入分类名称', 'error');
      return;
    }

    setSaving(true);
    try {
      const data = {
        name: editName.trim(),
        slug: editSlug.trim(),
        parentId: editParentId ? parseInt(editParentId) : null,
        sortOrder: parseInt(editSortOrder) || 0,
      };

      if (editModal.category) {
        await api.put(`/admin/categories/${editModal.category.id}`, data);
        addToast('分类更新成功', 'success');
      } else {
        await api.post('/admin/categories', data);
        addToast('分类创建成功', 'success');
      }

      setEditModal({ isOpen: false, category: null });
      fetchCategories();
    } catch (err: any) {
      addToast(err.message || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.category) return;

    setDeleting(true);
    try {
      await api.delete(`/admin/categories/${deleteModal.category.id}`);
      addToast('分类删除成功', 'success');
      setDeleteModal({ isOpen: false, category: null });
      fetchCategories();
    } catch (err: any) {
      addToast(err.message || '删除失败', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, category: Category, type: 'parent' | 'child') => {
    setDraggedItem(category);
    setDragType(type);
    e.dataTransfer.effectAllowed = 'move';
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
    setDraggedItem(null);
    setDragOverItem(null);
    dragCounter.current = 0;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent, category: Category) => {
    e.preventDefault();
    dragCounter.current++;
    setDragOverItem(category);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragOverItem(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetCategory: Category) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOverItem(null);

    if (!draggedItem || draggedItem.id === targetCategory.id) return;

    const parentCategories = categories.filter(c => !c.parentId);
    const isSameLevel = (dragType === 'parent' && !targetCategory.parentId) ||
                        (dragType === 'child' && draggedItem.parentId === targetCategory.parentId);

    if (!isSameLevel) return;

    const items = dragType === 'parent'
      ? parentCategories
      : categories.filter(c => c.parentId === draggedItem.parentId);

    const fromIndex = items.findIndex(c => c.id === draggedItem.id);
    const toIndex = items.findIndex(c => c.id === targetCategory.id);

    if (fromIndex === -1 || toIndex === -1) return;

    const newItems = [...items];
    const [removed] = newItems.splice(fromIndex, 1);
    newItems.splice(toIndex, 0, removed);

    const updates = newItems.map((item, index) => ({
      id: item.id,
      sortOrder: index,
      parentId: item.parentId,
    }));

    // FLIP: 记录动画前位置
    const before = new Map<string, { top: number; left: number }>();
    if (listRef.current) {
      listRef.current.querySelectorAll<HTMLElement>('[data-flip-key]').forEach(el => {
        const rect = el.getBoundingClientRect();
        before.set(el.dataset.flipKey!, { top: rect.top, left: rect.left });
      });
    }

    // 乐观更新UI
    const newCategories = categories.map(cat => {
      const update = updates.find(u => u.id === cat.id);
      if (update) {
        return { ...cat, sortOrder: update.sortOrder };
      }
      return cat;
    });
    setCategories(newCategories);

    // FLIP: 动画过渡到新位置
    animateFlip(before);

    try {
      await api.put('/admin/categories-sort', { categories: updates });
      addToast('排序已更新', 'success');
    } catch (err: any) {
      addToast(err.message || '排序更新失败', 'error');
      fetchCategories();
    }
  };

  const parentCategories = categories.filter(c => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">分类管理</h1>
          <p className="text-xs text-gray-500 mt-0.5">管理视频和相册分类，支持拖拽排序</p>
        </div>
        <Button onClick={openCreateModal}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新增分类
        </Button>
      </div>

      {categories.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <svg className="w-12 h-12 text-gray-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            <p className="text-gray-500">暂无分类</p>
            <Button variant="secondary" className="mt-4" onClick={openCreateModal}>创建第一个分类</Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-4" ref={listRef}>
          {parentCategories.map((cat) => (
            <div
              key={cat.id}
              data-flip-key={`parent-${cat.id}`}
              draggable
              onDragStart={(e: React.DragEvent<HTMLDivElement>) => handleDragStart(e, cat, 'parent')}
              onDragEnd={handleDragEnd as any}
              onDragOver={handleDragOver}
              onDragEnter={(e: React.DragEvent<HTMLDivElement>) => handleDragEnter(e, cat)}
              onDragLeave={handleDragLeave as any}
              onDrop={(e: React.DragEvent<HTMLDivElement>) => handleDrop(e, cat)}
              className={`rounded-md transition-all ${
                dragOverItem?.id === cat.id ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-900' : ''
              } ${draggedItem?.id === cat.id ? 'opacity-50' : ''}`}
            >
              <Card>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="cursor-move text-gray-500 hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    </svg>
                  </div>
                  <div className="w-10 h-10 rounded-md bg-blue-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-white font-normal">{cat.name}</h3>
                    <p className="text-xs text-gray-500">
                      Slug: <span className="font-mono">{cat.slug}</span>
                      {(cat._count?.videoCategories ?? 0) > 0 && (
                        <span className="ml-2 text-blue-400">{cat._count?.videoCategories} 个视频</span>
                      )}
                      {(cat._count?.photoAlbumCategories ?? 0) > 0 && (
                        <span className="ml-2 text-purple-400">{cat._count?.photoAlbumCategories} 个相册</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openEditModal(cat)}>编辑</Button>
                  <Button variant="danger" size="sm" onClick={() => setDeleteModal({ isOpen: true, category: cat })}>删除</Button>
                </div>
              </div>

              {categories.filter(c => c.parentId === cat.id).length > 0 && (
                <div className="mt-4 ml-14 space-y-2">
                  {categories.filter(c => c.parentId === cat.id).sort((a, b) => a.sortOrder - b.sortOrder).map((child) => (
                    <div
                      key={child.id}
                      data-flip-key={`child-${child.id}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, child, 'child')}
                      onDragEnd={handleDragEnd}
                      onDragOver={handleDragOver}
                      onDragEnter={(e) => handleDragEnter(e, child)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, child)}
                      className={`flex items-center justify-between p-3 rounded-md bg-white/5 transition-all ${
                        dragOverItem?.id === child.id ? 'ring-2 ring-blue-500' : ''
                      } ${draggedItem?.id === child.id ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="cursor-move text-gray-600 hover:text-gray-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                          </svg>
                        </div>
                        <span className="text-sm text-gray-300">{child.name}</span>
                        <span className="text-xs text-gray-600">Slug: <span className="font-mono">{child.slug}</span></span>
                        {(child._count?.videoCategories ?? 0) > 0 && (
                          <span className="text-xs text-blue-400">{child._count?.videoCategories} 个视频</span>
                        )}
                        {(child._count?.photoAlbumCategories ?? 0) > 0 && (
                          <span className="text-xs text-purple-400">{child._count?.photoAlbumCategories} 个相册</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEditModal(child)}>编辑</Button>
                        <Button variant="danger" size="sm" onClick={() => setDeleteModal({ isOpen: true, category: child })}>删除</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={editModal.isOpen}
        onClose={() => setEditModal({ isOpen: false, category: null })}
        title={editModal.category ? '编辑分类' : '新增分类'}
      >
        <div className="space-y-4">
          <Input
            label="分类名称"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="输入分类名称"
          />
          {editModal.category && (
            <Input
              label="Slug"
              value={editSlug}
              onChange={(e) => setEditSlug(e.target.value)}
              placeholder="英文标识，如: funny"
            />
          )}
          <div>
            <label className="block text-sm font-normal text-gray-300 mb-1.5">父级分类</label>
            <select
              value={editParentId}
              onChange={(e) => setEditParentId(e.target.value)}
              className="w-full h-10 px-3 rounded-md text-sm text-white bg-gray-900 border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/50 [&>option]:bg-gray-900 [&>option]:text-white"
            >
              <option value="">无（顶级分类）</option>
              {parentCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <Input
            label="排序"
            type="number"
            value={editSortOrder}
            onChange={(e) => setEditSortOrder(e.target.value)}
            placeholder="0"
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setEditModal({ isOpen: false, category: null })}>取消</Button>
            <Button onClick={handleSave} isLoading={saving}>保存</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, category: null })}
        onConfirm={handleDelete}
        title="删除分类"
        message={`确定要删除分类 "${deleteModal.category?.name}" 吗？${
          (deleteModal.category?._count?.videoCategories ?? 0) > 0 || (deleteModal.category?._count?.photoAlbumCategories ?? 0) > 0
            ? `该分类下有 ${deleteModal.category?._count?.videoCategories ?? 0} 个视频和 ${deleteModal.category?._count?.photoAlbumCategories ?? 0} 个相册，删除后这些内容不会被删除，但会失去此分类关联。`
            : '该分类下没有关联的内容。'
        }`}
        confirmText="删除"
        variant="danger"
        isLoading={deleting}
      />

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
