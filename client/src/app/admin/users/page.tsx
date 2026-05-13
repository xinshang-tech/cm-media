'use client';

import { useEffect, useState } from 'react';
import { api, getSignedUrl } from '@/lib/api';
import { Button, Input, Modal, Spinner, PageLoader, ToastContainer, useToast } from '@/components/ui';
import AvatarCropper from '@/components/AvatarCropper';

interface User {
  id: number;
  username: string;
  nickname: string;
  avatarUrl: string | null;
  role: string;
  isPermanentlyBanned: boolean;
  bannedReason: string | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  createdAt: string;
}

interface BannedIp {
  id: number;
  ipAddress: string;
  reason: string | null;
  bannedAt: string;
}

export default function AdminUsersPage() {
  const [tab, setTab] = useState<'users' | 'ips'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [bannedIps, setBannedIps] = useState<BannedIp[]>([]);
  const [ipsLoading, setIpsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', password: '', nickname: '', role: 'USER' });
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ nickname: '', role: '', password: '', avatarUrl: '' });
  const { toasts, addToast, removeToast } = useToast();
  const [avatarUploading, setAvatarUploading] = useState(false);

  const fetchBannedIps = async () => {
    setIpsLoading(true);
    try {
      const res = await api.get<{ bannedIps: BannedIp[] }>('/admin/banned-ips');
      setBannedIps(res.bannedIps);
    } catch (err) {
      console.error('加载封禁IP失败:', err);
    } finally {
      setIpsLoading(false);
    }
  };

  const handleUnbanIp = async (ip: string) => {
    if (!confirm(`确定解封 IP ${ip}？`)) return;
    try {
      await api.post(`/admin/banned-ips/${ip}/unban`);
      setBannedIps(prev => prev.filter(b => b.ipAddress !== ip));
      addToast('IP 已解封', 'success');
    } catch (err: any) {
      addToast(err.message || '解封失败', 'error');
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get<{ users: User[] }>('/admin/users');
      const usersWithSignedAvatars = await Promise.all(
        res.users.map(async (user) => {
          if (user.avatarUrl) {
            user.avatarUrl = await getSignedUrl(user.avatarUrl);
          }
          return user;
        })
      );
      setUsers(usersWithSignedAvatars);
    } catch (err) {
      console.error('加载用户失败:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);
  useEffect(() => { if (tab === 'ips') fetchBannedIps(); }, [tab]);

  const handleCreate = async () => {
    try {
      await api.post('/admin/users', createForm);
      setShowCreate(false);
      setCreateForm({ username: '', password: '', nickname: '', role: 'USER' });
      fetchUsers();
      addToast('用户创建成功', 'success');
    } catch (err: any) {
      addToast(err.message || '创建失败', 'error');
    }
  };

  const handleEdit = async () => {
    if (!editUser) return;
    try {
      const data: Record<string, string> = {};
      if (editForm.nickname) data.nickname = editForm.nickname;
      if (editForm.role) data.role = editForm.role;
      if (editForm.password) data.password = editForm.password;
      if (editForm.avatarUrl !== undefined) {
        // 保存原始URL（移除签名参数）
        data.avatarUrl = editForm.avatarUrl.split('?')[0];
      }
      await api.put(`/admin/users/${editUser.id}`, data);
      setEditUser(null);
      fetchUsers();
      addToast('用户更新成功', 'success');
    } catch (err: any) {
      addToast(err.message || '更新失败', 'error');
    }
  };

  const handleAvatarUpload = async (file: File) => {
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/aliyun/upload/avatar`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) throw new Error('上传失败');

      const data = await res.json();
      const signedUrl = data.data.signedUrl || data.data.url;
      setEditForm({ ...editForm, avatarUrl: signedUrl });
      addToast('头像上传成功', 'success');
    } catch (err: any) {
      addToast(err.message || '上传失败', 'error');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此用户？')) return;
    try {
      await api.delete(`/admin/users/${id}`);
      fetchUsers();
      addToast('用户删除成功', 'success');
    } catch (err: any) {
      addToast(err.message || '删除失败', 'error');
    }
  };

  const handleUnban = async (id: number) => {
    if (!confirm('确定解禁此用户？')) return;
    try {
      await api.post(`/admin/users/${id}/unban`);
      fetchUsers();
      addToast('用户解禁成功', 'success');
    } catch (err: any) {
      addToast(err.message || '解禁失败', 'error');
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">用户管理</h1>
          <p className="text-xs text-gray-500 mt-0.5">管理用户账号与封禁 IP</p>
        </div>
        {tab === 'users' && (
          <Button onClick={() => setShowCreate(true)}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            创建用户
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10">
        {(['users', 'ips'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'text-foreground border-blue-500'
                : 'text-muted border-transparent hover:text-foreground'
            }`}
          >
            {t === 'users' ? '用户列表' : '封禁 IP'}
            {t === 'ips' && bannedIps.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400">{bannedIps.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'users' && (
      <div className="rounded-md overflow-hidden border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/5">
              <th className="px-4 py-3 text-left text-gray-400 font-normal">用户</th>
              <th className="px-4 py-3 text-left text-gray-400 font-normal">角色</th>
              <th className="px-4 py-3 text-left text-gray-400 font-normal">状态</th>
              <th className="px-4 py-3 text-left text-gray-400 font-normal">最后登录</th>
              <th className="px-4 py-3 text-left text-gray-400 font-normal">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-800 flex-shrink-0">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-sm text-gray-500">{(user.nickname || user.username)[0]}</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-white font-normal">{user.username}</div>
                      <div className="text-xs text-gray-500">{user.nickname}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-normal ${
                    user.role === 'ADMIN' ? 'bg-purple-500/20 text-purple-400' : 'bg-white/10 text-gray-400'
                  }`}>
                    {user.role === 'ADMIN' ? '管理员' : '用户'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {user.isPermanentlyBanned ? (
                    <span className="px-2 py-1 rounded-full text-xs font-normal bg-red-500/20 text-red-400">已封禁</span>
                  ) : (
                    <span className="px-2 py-1 rounded-full text-xs font-normal bg-green-500/20 text-green-400">正常</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('zh-CN') : '-'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditUser(user);
                        setEditForm({
                          nickname: user.nickname,
                          role: user.role,
                          password: '',
                          avatarUrl: user.avatarUrl || '',
                        });
                      }}
                      className="px-3 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-md transition-colors"
                    >
                      编辑
                    </button>
                    {user.isPermanentlyBanned && (
                      <button
                        onClick={() => handleUnban(user.id)}
                        className="px-3 py-1 text-xs text-green-400 hover:text-green-300 hover:bg-green-500/10 rounded-md transition-colors"
                      >
                        解禁
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="px-3 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-md transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {tab === 'ips' && (
        <div className="rounded-md overflow-hidden border border-white/10">
          {ipsLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : bannedIps.length === 0 ? (
            <div className="py-12 text-center text-gray-500 text-sm">暂无封禁 IP</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5">
                  <th className="px-4 py-3 text-left text-gray-400 font-normal">IP 地址</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-normal">封禁原因</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-normal">封禁时间</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-normal">操作</th>
                </tr>
              </thead>
              <tbody>
                {bannedIps.map((item) => (
                  <tr key={item.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 font-mono text-red-400">{item.ipAddress}</td>
                    <td className="px-4 py-3 text-gray-400">{item.reason || '-'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                      {new Date(item.bannedAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleUnbanIp(item.ipAddress)}
                        className="px-3 py-1 text-xs text-green-400 hover:text-green-300 hover:bg-green-500/10 rounded-md transition-colors"
                      >
                        解封
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="创建用户">
        <div className="space-y-4">
          <Input label="用户名" value={createForm.username} onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} placeholder="输入用户名" />
          <Input label="密码（至少9位）" type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} placeholder="输入密码" />
          <Input label="昵称" value={createForm.nickname} onChange={(e) => setCreateForm({ ...createForm, nickname: e.target.value })} placeholder="输入昵称" />
          <div>
            <label className="block text-sm font-normal text-gray-300 mb-1.5">角色</label>
            <select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })} className="w-full h-8 px-3 rounded-md text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/50">
              <option value="USER">普通用户</option>
              <option value="ADMIN">管理员</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>取消</Button>
            <Button onClick={handleCreate}>创建</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!editUser} onClose={() => setEditUser(null)} title={`编辑用户: ${editUser?.username}`}>
        <div className="space-y-4">
          <div className="flex justify-center">
            <AvatarCropper
              currentAvatar={editForm.avatarUrl}
              onUpload={handleAvatarUpload}
              isUploading={avatarUploading}
            />
          </div>

          <div className="divider" />

          <Input label="昵称" value={editForm.nickname} onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })} />
          <div>
            <label className="block text-sm font-normal text-gray-300 mb-1.5">角色</label>
            <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} className="w-full h-8 px-3 rounded-md text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/50">
              <option value="USER">普通用户</option>
              <option value="ADMIN">管理员</option>
            </select>
          </div>
          <Input label="新密码（留空不修改）" type="password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} placeholder="留空则不修改密码" />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setEditUser(null)}>取消</Button>
            <Button onClick={handleEdit}>保存</Button>
          </div>
        </div>
      </Modal>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}

