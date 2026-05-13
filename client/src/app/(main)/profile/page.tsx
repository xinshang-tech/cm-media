'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, getSignedUrl } from '@/lib/api';
import { Button, Input, Card, Spinner, ToastContainer, useToast, Modal } from '@/components/ui';
import AvatarCropper from '@/components/AvatarCropper';

interface User {
  id: number;
  username: string;
  nickname: string;
  avatarUrl: string | null;
  phone: string | null;
  email: string | null;
  role: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  // 编辑状态
  const [nickname, setNickname] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);

  // 密码修改
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // 手机号修改
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneSending, setPhoneSending] = useState(false);
  const [phoneCountdown, setPhoneCountdown] = useState(0);
  const [phoneSubmitting, setPhoneSubmitting] = useState(false);

  // 邮箱修改
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailCodeInput, setEmailCodeInput] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailCountdown, setEmailCountdown] = useState(0);
  const [emailSubmitting, setEmailSubmitting] = useState(false);

  const phoneTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const emailTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCountdown = useCallback((setter: React.Dispatch<React.SetStateAction<number>>, timerRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>) => {
    setter(60);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setter(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await api.get<{ user: User }>('/auth/me');
        const user = res.user;

        if (user.avatarUrl) {
          user.avatarUrl = await getSignedUrl(user.avatarUrl);
        }

        setUser(user);
        setNickname(user.nickname || '');
        setAvatarUrl(user.avatarUrl || '');
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };
    fetchUser();

    return () => {
      if (phoneTimerRef.current) clearInterval(phoneTimerRef.current);
      if (emailTimerRef.current) clearInterval(emailTimerRef.current);
    };
  }, [router]);

  const handleSaveProfile = async () => {
    if (!nickname.trim()) {
      addToast('昵称不能为空', 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await api.put<{ user: User }>('/auth/profile', {
        nickname: nickname.trim(),
        avatarUrl: avatarUrl ? avatarUrl.split('?')[0] : null,
      });
      setUser(res.user);
      addToast('个人资料更新成功', 'success');
    } catch (err: any) {
      addToast(err.message || '更新失败', 'error');
    } finally {
      setSaving(false);
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
      setAvatarUrl(signedUrl);

      await api.put('/auth/profile', { avatarUrl: data.data.url });

      addToast('头像上传成功', 'success');
    } catch (err: any) {
      addToast(err.message || '上传失败', 'error');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      addToast('请输入当前密码和新密码', 'error');
      return;
    }

    if (newPassword.length < 9) {
      addToast('新密码长度不能少于9位', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      addToast('两次输入的密码不一致', 'error');
      return;
    }

    setChangingPassword(true);
    try {
      await api.put('/auth/password', { currentPassword, newPassword });
      addToast('密码修改成功，请重新登录', 'success');
      setShowPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(() => {
        router.push('/login');
      }, 1500);
    } catch (err: any) {
      addToast(err.message || '密码修改失败', 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSendPhoneCode = async () => {
    if (!newPhone || !/^1\d{10}$/.test(newPhone)) {
      addToast('请输入有效的手机号', 'error');
      return;
    }
    setPhoneSending(true);
    try {
      await api.post('/auth/send-phone-verify', { phone: newPhone });
      startCountdown(setPhoneCountdown, phoneTimerRef);
      addToast('验证码已发送', 'success');
    } catch (err: any) {
      addToast(err.message || '发送失败', 'error');
    } finally {
      setPhoneSending(false);
    }
  };

  const handleSubmitPhone = async () => {
    if (!newPhone || !phoneCode) {
      addToast('请输入手机号和验证码', 'error');
      return;
    }
    setPhoneSubmitting(true);
    try {
      const res = await api.put<{ success: boolean }>('/auth/phone', { phone: newPhone, code: phoneCode });
      if (res.success) {
        setUser(prev => prev ? { ...prev, phone: newPhone } : null);
        addToast('手机号修改成功', 'success');
        setShowPhoneModal(false);
        setNewPhone('');
        setPhoneCode('');
        setPhoneCountdown(0);
      }
    } catch (err: any) {
      addToast(err.message || '修改失败', 'error');
    } finally {
      setPhoneSubmitting(false);
    }
  };

  const handleSendEmailCode = async () => {
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      addToast('请输入有效的邮箱地址', 'error');
      return;
    }
    setEmailSending(true);
    try {
      await api.post('/auth/send-email-verify', { email: newEmail });
      startCountdown(setEmailCountdown, emailTimerRef);
      addToast('验证码已发送', 'success');
    } catch (err: any) {
      addToast(err.message || '发送失败', 'error');
    } finally {
      setEmailSending(false);
    }
  };

  const handleSubmitEmail = async () => {
    if (!newEmail || !emailCodeInput) {
      addToast('请输入邮箱和验证码', 'error');
      return;
    }
    setEmailSubmitting(true);
    try {
      const res = await api.put<{ success: boolean }>('/auth/email', { email: newEmail, code: emailCodeInput });
      if (res.success) {
        setUser(prev => prev ? { ...prev, email: newEmail } : null);
        addToast('邮箱修改成功', 'success');
        setShowEmailModal(false);
        setNewEmail('');
        setEmailCodeInput('');
        setEmailCountdown(0);
      }
    } catch (err: any) {
      addToast(err.message || '修改失败', 'error');
    } finally {
      setEmailSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="container-responsive pt-4 pb-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-white">个人资料</h1>
          <p className="text-xs text-gray-500 mt-0.5">管理你的个人信息和头像</p>
        </div>

        <Card>
          <AvatarCropper
            currentAvatar={avatarUrl}
            onUpload={handleAvatarUpload}
            isUploading={avatarUploading}
          />
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">基本信息</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-normal text-gray-300 mb-1.5">用户名</label>
              <div className="input-field flex items-center h-10 px-3 rounded-md bg-white/5 border border-white/10 text-gray-400 text-sm">
                {user.username}
              </div>
              <p className="text-xs text-gray-600 mt-1">用户名不可修改</p>
            </div>

            <Input
              label="昵称"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="输入你的昵称"
              maxLength={30}
            />

            <div>
              <label className="block text-sm font-normal text-gray-300 mb-1.5">角色</label>
              <div className="input-field flex items-center h-10 px-3 rounded-md bg-white/5 border border-white/10 text-gray-400 text-sm">
                {user.role === 'ADMIN' ? '管理员' : '普通用户'}
              </div>
            </div>

            <div>
              <label className="block text-sm font-normal text-gray-300 mb-1.5">注册时间</label>
              <div className="input-field flex items-center h-10 px-3 rounded-md bg-white/5 border border-white/10 text-gray-400 text-sm font-mono">
                {user.createdAt ? new Date(user.createdAt).toLocaleDateString('zh-CN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }) : '-'}
              </div>
            </div>

            {user.lastLoginAt && (
              <div>
                <label className="block text-sm font-normal text-gray-300 mb-1.5">上次登录</label>
                <div className="input-field flex items-center h-10 px-3 rounded-md bg-white/5 border border-white/10 text-gray-400 text-sm font-mono">
                  {new Date(user.lastLoginAt).toLocaleString('zh-CN')}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end mt-6">
            <Button onClick={handleSaveProfile} isLoading={saving}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              保存修改
            </Button>
          </div>
        </Card>

        {/* 联系方式 */}
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">联系方式</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
              <div>
                <h3 className="text-sm font-normal text-white">手机号</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {user.phone || '未绑定手机号'}
                </p>
              </div>
              <Button variant="secondary" onClick={() => {
                setNewPhone(user.phone || '');
                setPhoneCode('');
                setPhoneCountdown(0);
                setShowPhoneModal(true);
              }}>
                {user.phone ? '修改' : '绑定'}
              </Button>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
              <div>
                <h3 className="text-sm font-normal text-white">邮箱</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {user.email || '未绑定邮箱'}
                </p>
              </div>
              <Button variant="secondary" onClick={() => {
                setNewEmail(user.email || '');
                setEmailCodeInput('');
                setEmailCountdown(0);
                setShowEmailModal(true);
              }}>
                {user.email ? '修改' : '绑定'}
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">安全设置</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
              <div>
                <h3 className="text-sm font-normal text-white">修改密码</h3>
                <p className="text-xs text-gray-500 mt-1">定期修改密码可以提高账号安全性</p>
              </div>
              <Button variant="secondary" onClick={() => setShowPasswordModal(true)}>
                修改密码
              </Button>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
              <div>
                <h3 className="text-sm font-normal text-white">退出登录</h3>
                <p className="text-xs text-gray-500 mt-1">退出当前账号</p>
              </div>
              <Button variant="danger" onClick={async () => {
                await api.post('/auth/logout', {});
                router.push('/login');
              }}>
                退出登录
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* 密码修改 Modal */}
      <Modal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        title="修改密码"
      >
        <div className="space-y-4">
          <Input
            label="当前密码"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="输入当前密码"
          />
          <Input
            label="新密码"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="输入新密码（至少9位）"
          />
          <Input
            label="确认新密码"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="再次输入新密码"
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setShowPasswordModal(false)}>
              取消
            </Button>
            <Button onClick={handleChangePassword} isLoading={changingPassword}>
              确认修改
            </Button>
          </div>
        </div>
      </Modal>

      {/* 手机号修改 Modal */}
      <Modal
        isOpen={showPhoneModal}
        onClose={() => setShowPhoneModal(false)}
        title={user.phone ? '修改手机号' : '绑定手机号'}
      >
        <div className="space-y-4">
          <Input
            label="手机号"
            type="tel"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="输入手机号"
            maxLength={11}
          />
          <div>
            <label className="block text-sm font-normal text-gray-300 mb-1.5">验证码</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={phoneCode}
                onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="输入验证码"
                maxLength={6}
                className="input-field flex-1 h-10 px-3 rounded-md text-white text-sm"
              />
              <Button
                variant="secondary"
                onClick={handleSendPhoneCode}
                disabled={phoneSending || phoneCountdown > 0}
                isLoading={phoneSending}
                className="h-10"
              >
                {phoneCountdown > 0 ? `${phoneCountdown}s` : '获取验证码'}
              </Button>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setShowPhoneModal(false)}>
              取消
            </Button>
            <Button onClick={handleSubmitPhone} isLoading={phoneSubmitting}>
              确认
            </Button>
          </div>
        </div>
      </Modal>

      {/* 邮箱修改 Modal */}
      <Modal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        title={user.email ? '修改邮箱' : '绑定邮箱'}
      >
        <div className="space-y-4">
          <Input
            label="邮箱地址"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="输入邮箱地址"
            maxLength={255}
          />
          <div>
            <label className="block text-sm font-normal text-gray-300 mb-1.5">验证码</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={emailCodeInput}
                onChange={(e) => setEmailCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="输入验证码"
                maxLength={6}
                className="input-field flex-1 h-10 px-3 rounded-md text-white text-sm"
              />
              <Button
                variant="secondary"
                onClick={handleSendEmailCode}
                disabled={emailSending || emailCountdown > 0}
                isLoading={emailSending}
                className="h-10"
              >
                {emailCountdown > 0 ? `${emailCountdown}s` : '获取验证码'}
              </Button>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setShowEmailModal(false)}>
              取消
            </Button>
            <Button onClick={handleSubmitEmail} isLoading={emailSubmitting}>
              确认
            </Button>
          </div>
        </div>
      </Modal>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
