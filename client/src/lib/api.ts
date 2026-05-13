const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

interface RequestOptions extends RequestInit {
  token?: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
    const { token, ...fetchOptions } = options;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...fetchOptions,
      headers: {
        ...headers,
        ...fetchOptions.headers,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '网络错误' }));
      const message = error.message || `请求失败: ${response.status}`;
      const detail = error.detail ? ` (${error.detail})` : '';
      const fullMessage = `${message}${detail}`;

      if (response.status === 401 && !isRetry && !endpoint.includes('/auth/')) {
        // 尝试用 refresh token 续期
        const refreshRes = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (refreshRes.ok) {
          return this.request<T>(endpoint, options, true);
        }
        const isLoginPage = window.location.pathname === '/login';
        if (!isLoginPage) {
          window.location.href = '/login';
        }
        throw new Error(fullMessage);
      }

      if (response.status === 401) {
        const isLoginPage = window.location.pathname === '/login';
        if (!isLoginPage) {
          window.location.href = '/login';
        }
        throw new Error(fullMessage);
      }

      throw new Error(fullMessage);
    }

    return response.json();
  }

  async get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient(API_BASE_URL);

export const ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: '请先登录',
  AUTH_EXPIRED: '登录已过期，请重新登录',
  AUTH_INVALID: '用户名或密码错误',
  AUTH_BANNED: '您的账号已被封禁，请联系管理员',
  AUTH_IP_BANNED: '您的IP已被封禁，请联系管理员',
  AUTH_WECHAT: '请在浏览器中打开，微信不支持播放',
  PASSWORD_TOO_SHORT: '密码长度不能少于9位',
  PASSWORD_INVALID: '用户名或密码错误',
  VIDEO_NOT_FOUND: '视频不存在或已被删除',
  VIDEO_NO_PERMISSION: '您没有权限观看此视频',
  VIDEO_LOAD_FAILED: '视频加载失败，请稍后重试',
  NETWORK_ERROR: '网络错误，请检查网络连接',
  SERVER_ERROR: '服务器错误，请稍后重试',
  UNKNOWN_ERROR: '未知错误',
};

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return ERROR_MESSAGES[error.message] || error.message;
  }
  return ERROR_MESSAGES.UNKNOWN_ERROR;
}

/**
 * 获取签名URL
 * 如果URL是OSS资源，返回签名后的URL
 */
export async function getSignedUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  
  // 如果已经是签名URL或不是OSS URL，直接返回
  if (url.includes('Expires=') || !url.includes('aliyuncs.com')) {
    return url;
  }

  try {
    const res = await api.post<{ data: { url: string } }>('/aliyun/signed-url', { url });
    return res.data.url;
  } catch {
    return url;
  }
}

/**
 * 批量获取签名URL
 */
export async function getSignedUrls(urls: (string | null)[]): Promise<(string | null)[]> {
  const validUrls = urls.filter(Boolean) as string[];
  if (validUrls.length === 0) return urls;

  try {
    const res = await api.post<{ data: (string | null)[] }>('/aliyun/signed-urls', { urls: validUrls });
    
    // 保持原始数组的null位置
    let validIndex = 0;
    return urls.map(url => {
      if (!url) return null;
      return res.data[validIndex++] || url;
    });
  } catch {
    return urls;
  }
}
