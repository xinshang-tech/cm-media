'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { api, getErrorMessage } from '@/lib/api';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'CM Media';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const router = useRouter();

  // 登录方式切换
  const [loginMode, setLoginMode] = useState<'password' | 'sms' | 'email'>('password');

  // 密码登录
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 短信验证码登录
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsCountdown, setSmsCountdown] = useState(0);

  // 邮箱验证码登录
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailCountdown, setEmailCountdown] = useState(0);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [btnHovered, setBtnHovered] = useState(false);

  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  const smsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  const handleSendSms = async () => {
    if (!phone || !/^1\d{10}$/.test(phone)) {
      setError('请输入有效的手机号');
      return;
    }
    setError('');
    setSmsSending(true);
    try {
      await api.post('/auth/send-sms-code', { phone });
      startCountdown(setSmsCountdown, smsTimerRef);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSmsSending(false);
    }
  };

  const handleSendEmailCode = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    setError('');
    setEmailSending(true);
    try {
      await api.post('/auth/send-email-code', { email });
      startCountdown(setEmailCountdown, emailTimerRef);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setEmailSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (loginMode === 'password') {
        if (!username || !password) {
          setError('请输入用户名和密码');
          setLoading(false);
          return;
        }
        const res = await api.post<{ success: boolean; message?: string; remaining?: number }>('/auth/login', {
          username,
          password,
        });
        if (res.success) {
          router.push('/');
        } else {
          setError(res.message || '登录失败');
        }
      } else if (loginMode === 'sms') {
        if (!phone || !smsCode) {
          setError('请输入手机号和验证码');
          setLoading(false);
          return;
        }
        const res = await api.post<{ success: boolean; message?: string }>('/auth/login-by-phone', {
          phone,
          code: smsCode,
        });
        if (res.success) {
          router.push('/');
        } else {
          setError(res.message || '登录失败');
        }
      } else {
        if (!email || !emailCode) {
          setError('请输入邮箱和验证码');
          setLoading(false);
          return;
        }
        const res = await api.post<{ success: boolean; message?: string }>('/auth/login-by-email', {
          email,
          code: emailCode,
        });
        if (res.success) {
          router.push('/');
        } else {
          setError(res.message || '登录失败');
        }
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const inputBaseStyle: React.CSSProperties = isLight ? {
    background: 'rgba(0,0,0,0.05)',
    border: '1px solid rgba(0,0,0,0.12)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    color: '#111',
  } : {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
  };

  const inputFocusStyle: React.CSSProperties = isLight ? {
    background: 'rgba(0,0,0,0.08)',
    borderColor: 'rgba(0,0,0,0.22)',
    boxShadow: '0 0 0 3px rgba(0,0,0,0.06)',
    color: '#111',
  } : {
    background: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.28)',
    boxShadow: '0 0 0 3px rgba(255,255,255,0.06)',
  };

  const iconClass = isLight
    ? 'absolute left-4 top-1/2 -translate-y-1/2 z-10 transition-colors duration-300 text-black/50 group-focus-within:text-black/70'
    : 'absolute left-4 top-1/2 -translate-y-1/2 z-10 transition-colors duration-300 text-white/40 group-focus-within:text-white/70';
  const inputTextClass = isLight
    ? 'w-full h-12 pl-11 pr-4 rounded-xl text-[15px] outline-none login-input text-[#111] placeholder-black/40'
    : 'w-full h-12 pl-11 pr-4 rounded-xl text-[15px] outline-none login-input text-white placeholder-white/30';
  const inputTextClassPr12 = inputTextClass.replace('pr-4', 'pr-12');
  const eyeBtnClass = isLight
    ? 'absolute right-3 top-1/2 -translate-y-1/2 transition-colors duration-200 z-10 cursor-pointer text-black/50 hover:text-black/70'
    : 'absolute right-3 top-1/2 -translate-y-1/2 transition-colors duration-200 z-10 cursor-pointer text-white/40 hover:text-white/70';
  const codeButtonStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    border: 'none',
    color: '#fff',
    boxShadow: '0 2px 10px rgba(37,99,235,0.35)',
  };
  const codeButtonDisabledStyle: React.CSSProperties = {
    background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
    border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)',
    color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)',
  };

  const tabs = [
    { key: 'password' as const, label: '密码登录' },
    { key: 'sms' as const, label: '短信登录' },
    { key: 'email' as const, label: '邮箱登录' },
  ];

  return (
    <div className="min-h-screen relative flex items-center justify-center">
      <div className="absolute inset-0 z-0">
        <div
          className="hidden md:block w-full h-full bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'url(/images/pc-bg.webp)' }}
        />
        <div
          className="md:hidden w-full h-full bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'url(/images/mobile-bg.webp)' }}
        />
        <div className={`absolute inset-0 ${isLight ? 'bg-black/5' : 'bg-black/40'}`} />
      </div>

      <div className="relative z-10 w-full max-w-sm mx-6 sm:mx-4">
        <div className="text-center mb-6">
          <img src="/images/logo-icon.svg" alt={APP_NAME} className="w-12 h-12 sm:w-16 sm:h-16 mx-auto drop-shadow-lg" />
        </div>

        <div
          className="rounded-[24px] p-8 relative overflow-hidden"
          style={isLight ? {
            background: 'linear-gradient(160deg, rgba(255,255,255,0.52) 0%, rgba(255,255,255,0.42) 50%, rgba(255,255,255,0.48) 100%)',
            backdropFilter: 'blur(48px) saturate(180%)',
            WebkitBackdropFilter: 'blur(48px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.5)',
            boxShadow: `
              0 8px 40px rgba(0,0,0,0.18),
              0 2px 8px rgba(0,0,0,0.08),
              inset 0 1px 0 rgba(255,255,255,0.95),
              inset 0 0 2px rgba(255,255,255,0.5)
            `,
          } : {
            background: 'linear-gradient(160deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.1) 100%)',
            backdropFilter: 'blur(48px) saturate(200%)',
            WebkitBackdropFilter: 'blur(48px) saturate(200%)',
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: `
              0 8px 40px rgba(0,0,0,0.2),
              0 2px 8px rgba(0,0,0,0.1),
              inset 0 1px 0 rgba(255,255,255,0.18),
              inset 0 0 2px rgba(255,255,255,0.05)
            `,
          }}
        >
          <div
            className="absolute top-0 left-3 right-3 h-[2px]"
            style={{ background: isLight
              ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)'
              : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)' }}
          />
          <div
            className="absolute -top-16 -right-16 w-56 h-56 rounded-full pointer-events-none"
            style={{ background: isLight
              ? 'radial-gradient(circle, rgba(0,0,0,0.04) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }}
          />
          <div
            className="absolute -bottom-12 -left-12 w-44 h-44 rounded-full pointer-events-none"
            style={{ background: isLight
              ? 'radial-gradient(circle, rgba(0,0,0,0.03) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)' }}
          />

          {/* 登录方式切换 - 无背景浮动滑块样式 */}
          <div className="flex mb-6 relative" style={{ padding: '4px 0' }}>
            {/* 滑块指示器 */}
            <div
              className="absolute top-0 bottom-0 rounded-xl transition-all duration-300 ease-out"
              style={{
                width: `${100 / tabs.length}%`,
                left: `${tabs.findIndex(t => t.key === loginMode) * (100 / tabs.length)}%`,
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                boxShadow: '0 2px 12px rgba(37,99,235,0.35)',
              }}
            />
            {tabs.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => { setLoginMode(tab.key); setError(''); }}
                className="relative z-10 flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[10px] text-xs font-medium transition-colors duration-300"
                style={{
                  color: loginMode === tab.key
                    ? '#fff'
                    : isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)',
                }}
              >
                {tab.key === 'password' && (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                )}
                {tab.key === 'sms' && (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                )}
                {tab.key === 'email' && (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                )}
                {tab.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 relative">
            {loginMode === 'password' && (
              <>
                <div className="relative group">
                  <div className={iconClass}>
                    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="用户名"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    maxLength={60}
                    className={inputTextClass}
                    style={inputBaseStyle}
                    onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                    onBlur={(e) => {
                      Object.assign(e.target.style, inputBaseStyle);
                      e.target.style.boxShadow = '';
                    }}
                  />
                </div>

                <div className="relative group">
                  <div className={iconClass}>
                    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className={inputTextClassPr12}
                    style={inputBaseStyle}
                    onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                    onBlur={(e) => {
                      Object.assign(e.target.style, inputBaseStyle);
                      e.target.style.boxShadow = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={eyeBtnClass}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </>
            )}

            {loginMode === 'sms' && (
              <>
                <div className="relative group">
                  <div className={iconClass}>
                    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <input
                    type="tel"
                    placeholder="手机号"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={11}
                    className={inputTextClass}
                    style={inputBaseStyle}
                    onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                    onBlur={(e) => {
                      Object.assign(e.target.style, inputBaseStyle);
                      e.target.style.boxShadow = '';
                    }}
                  />
                </div>

                <div className="flex gap-2">
                  <div className="relative group flex-1">
                    <div className={iconClass}>
                      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="验证码"
                      value={smsCode}
                      onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      maxLength={6}
                      className={inputTextClass}
                      style={inputBaseStyle}
                      onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                      onBlur={(e) => {
                        Object.assign(e.target.style, inputBaseStyle);
                        e.target.style.boxShadow = '';
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendSms}
                    disabled={smsSending || smsCountdown > 0}
                    className="h-12 px-3.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-200 active:scale-95"
                    style={smsSending || smsCountdown > 0 ? codeButtonDisabledStyle : codeButtonStyle}
                  >
                    {smsSending ? '发送中…' : smsCountdown > 0 ? `${smsCountdown}s 后重发` : '获取验证码'}
                  </button>
                </div>
              </>
            )}

            {loginMode === 'email' && (
              <>
                <div className="relative group">
                  <div className={iconClass}>
                    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <input
                    type="email"
                    placeholder="邮箱地址"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={255}
                    className={inputTextClass}
                    style={inputBaseStyle}
                    onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                    onBlur={(e) => {
                      Object.assign(e.target.style, inputBaseStyle);
                      e.target.style.boxShadow = '';
                    }}
                  />
                </div>

                <div className="flex gap-2">
                  <div className="relative group flex-1">
                    <div className={iconClass}>
                      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="验证码"
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      maxLength={6}
                      className={inputTextClass}
                      style={inputBaseStyle}
                      onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                      onBlur={(e) => {
                        Object.assign(e.target.style, inputBaseStyle);
                        e.target.style.boxShadow = '';
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendEmailCode}
                    disabled={emailSending || emailCountdown > 0}
                    className="h-12 px-3.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-200 active:scale-95"
                    style={emailSending || emailCountdown > 0 ? codeButtonDisabledStyle : codeButtonStyle}
                  >
                    {emailSending ? '发送中…' : emailCountdown > 0 ? `${emailCountdown}s 后重发` : '获取验证码'}
                  </button>
                </div>
              </>
            )}

            {error && (
              <div
                className={`p-3 rounded-xl text-sm text-center ${isLight ? 'text-[#7a1010]' : 'text-white/90'}`}
                style={{
                  background: isLight ? 'rgba(174,26,32,0.10)' : 'rgba(174,26,32,0.15)',
                  border: '1px solid rgba(174,26,32,0.25)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                {error}
              </div>
            )}

            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                onMouseEnter={() => setBtnHovered(true)}
                onMouseLeave={() => setBtnHovered(false)}
                className="w-full h-12 rounded-xl text-[15px] font-medium transition-all duration-300 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                style={{
                  background: loading
                    ? 'rgba(174,26,32,0.35)'
                    : 'linear-gradient(160deg, rgba(196,50,56,0.85) 0%, rgba(174,26,32,0.88) 100%)',
                  border: '1px solid rgba(255,100,100,0.15)',
                  color: '#fff',
                  boxShadow: loading
                    ? 'none'
                    : btnHovered
                      ? '0 6px 36px rgba(174,26,32,0.40), 0 0 0 4px rgba(174,26,32,0.12), inset 0 1px 0 rgba(255,255,255,0.15)'
                      : '0 4px 24px rgba(174,26,32,0.22), inset 0 1px 0 rgba(255,255,255,0.1)',
                  transform: loading ? undefined : btnHovered ? 'scale(1.03)' : undefined,
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    登录中
                  </span>
                ) : '登录'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
