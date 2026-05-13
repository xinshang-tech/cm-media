# CM Media - 内部视频管理平台

内部视频管理与播放平台，采用前后端分离架构，支持视频点播、图集浏览、精细权限控制和完整的管理后台。

## 技术栈

### 前端（端口 4900）

| 依赖 | 版本 | 用途 |
|------|------|------|
| Next.js | 16.2.6 | React 全栈框架（App Router + Turbopack） |
| React | 19.2.6 | UI 框架 |
| Tailwind CSS | 4.3.0 | 原子化 CSS |
| Zustand | 5.0.13 | 轻量状态管理（上传队列） |
| Plyr | 3.7.8 | HTML5 视频播放器 |
| hls.js | 1.6.16 | HLS (m3u8) 流媒体播放 |
| Swiper | 12.1.4 | 图集轮播 |
| CropperJS | 2.1.1 | 头像裁切 |
| Lucide React | 1.14.0 | 图标库 |
| uuid | 14.0.0 | UUIDv7 生成 |
| next-themes | — | 亮色/暗色主题切换 |

### 后端（端口 4800）

| 依赖 | 版本 | 用途 |
|------|------|------|
| Express | 5.1.0 | HTTP 框架 |
| TypeScript | 6.0.3 | 类型安全 |
| Prisma | 7.8.0 | ORM（MySQL 连接） |
| ioredis | 5.6.0 | Redis 客户端（会话/限流/缓存） |
| bcryptjs | 3.0.2 | 密码哈希 |
| jsonwebtoken | 9.0.2 | JWT 生成与验证 |
| helmet | 8.1.0 | HTTP 安全头 |
| express-rate-limit | 8.5.0 | API 请求限流 |
| rate-limit-redis | 5.0.0 | Redis 限流存储后端 |
| multer | 2.1.1 | 文件上传（内存存储） |
| sharp | 0.34.5 | 图像处理（WebP 转换、缩略图） |
| nodemailer | 8.0.7 | SMTP 邮件通知 |
| ali-oss | 6.22.0 | 阿里云 OSS SDK（签名 URL） |
| cors | 2.8.5 | 跨域资源共享 |
| cookie-parser | 1.4.7 | Cookie 解析 |

### 基础设施

| 服务 | 用途 |
|------|------|
| MySQL 8.0 | 主数据库 |
| Redis 6.0+ | 会话、限流、列表缓存 |
| 阿里云 VOD | 视频存储、转码、多画质流 |
| 阿里云 OSS | 静态资源存储（封面图、头像、字幕、雪碧图、VTT 文件） |
| 阿里云 STS | 前端直传 OSS/VOD 临时凭证 |
| 阿里云短信 | 安全告警通知 |

### 阿里云 OSS 存储的资源类型

| OSS 路径 | 内容 | 处理方式 |
|----------|------|----------|
| `posters/` | 视频封面图 | Sharp → WebP(q90) 原图 + WebP(q85) 缩略图(300px宽) |
| `avatars/` | 用户头像 | Sharp → WebP(q90) + 缩略图(300px宽) |
| `images/` / `gallery/` | 图集图片 | Sharp → WebP(q90) + WebP(q85) 缩略图(300px宽) |
| `files/` | 非图片文件（SRT字幕等） | 直接上传，不转码 |
| 字幕/雪碧图/VTT | 通过 `media_assets` 表关联 VOD 视频 | 直接上传，OSS 签名访问 |

> 所有图片经 Sharp 处理后以 **WebP** 格式存储。全尺寸质量 90，缩略图宽 300px、质量 85，均设置 `Cache-Control: max-age=31536000`（1年）。

---

## 快速开始

### 环境要求

- Node.js >= 18
- MySQL >= 8.0
- Redis >= 6.0

### 安装与运行

```bash
# 安装依赖
npm install

# 配置环境变量（两个文件都需要）
cp server/.env.example server/.env
cp client/.env.local.example client/.env.local

# 初始化数据库
npm run db:push      # 同步 schema 到数据库
npm run db:seed      # 初始化管理员账号和默认分类

# 开发模式（同时启动前后端）
npm run dev

# 生产构建 + 启动
npm run build
npm start
```

### 默认管理员账号

种子数据（`server/prisma/seed.ts`）会创建：

- 用户名: `admin`
- 密码: `admin123456`

> upsert 实现，重复运行不会报错，已修改的密码不会被重置。

---

## 生产环境部署

本项目典型部署架构：**Nginx（反向代理 + SSL）→ Next.js（:4900）+ Express（:4800）**，前后端走同一域名。

### Nginx 配置

以下为宝塔面板完整配置模板，关键点已标注：

```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    # 前端静态资源（Next.js 构建产物，文件名含 content hash）
    # 关闭 nginx 缓存，避免构建后引用旧 chunk 导致 404
    location /_next/static/ {
        proxy_pass http://127.0.0.1:4900;
        proxy_cache off;
        expires 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Next.js 前端（SSR）
    location / {
        proxy_pass http://127.0.0.1:4900;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;   # 必须：Express 据此判断 HTTPS
        proxy_cache off;                                # 必须：关闭缓存
        proxy_buffering off;
    }

    # Express API 后端
    location /api/ {
        proxy_pass http://127.0.0.1:4800;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;   # 必须：cookie secure 判断
        proxy_cache off;                                # 必须：API 不缓存
        proxy_buffering off;
    }

    # 禁止访问敏感文件/目录（Next.js .next、server 源码等）
    location ~* /(\.git|\.next|node_modules|server/src|server/prisma)/ {
        return 404;
    }

    access_log /www/wwwlogs/your-site.log;
    error_log  /www/wwwlogs/your-site.error.log;
}
```

> **关键点**：`X-Forwarded-Proto $scheme` 让 Express 知道客户端实际是 HTTPS 连接，否则 cookie 的 `Secure` 标记会导致浏览器拒收。

### 环境变量（生产）

**`server/.env`** 额外注意：

```bash
CLIENT_URL=https://your-domain.com     # CORS 白名单
```

如果前后端**不在同一域名**，还需要设置 cookie 跨子域共享：

```bash
COOKIE_DOMAIN=.your-domain.com          # 共享给所有子域
```

**`client/.env.local`** 生产环境使用相对路径（同域）：

```bash
NEXT_PUBLIC_API_URL=/api
```

> 此变量在 `next build` 时烘焙进客户端 JS，修改后需重新构建。

### 部署步骤

```bash
# 1. 构建
npm run build

# 2. 重启服务（必须！否则 .next 仍是旧构建）
pm2 restart cm-media-server
pm2 restart cm-media-client

# 3. 清理 nginx 缓存（如已配置 proxy_cache off 可跳过）
rm -rf /www/server/nginx/proxy_cache_dir/*
nginx -s reload
```

### 部署后验证

| 检查项 | 预期 |
|--------|------|
| DevTools → Application → Cookies | `token` 写在当前域名下，Domain 列正确 |
| 登录后 | 跳转首页，不再 401 循环跳回 `/login` |
| `/_next/static/` 下的 JS/CSS | 状态码 200，非 404 |
| Network → `/api/auth/login` Response Headers | 包含 `Set-Cookie: token=...; Secure; HttpOnly; SameSite=Lax` |

### 常见部署问题

| 现象 | 根因 | 解决 |
|------|------|------|
| 构建后 JS 文件 404 | Nginx `proxy_cache` 缓存了旧 hash 的 chunk | `location /` 加 `proxy_cache off` |
| 登录成功但循环跳回 `/login` | Cookie 未写入浏览器 | ①确认 `X-Forwarded-Proto` 已传递 ②确认 `trust proxy` 设置为 `1` ③确认 `COOKIE_DOMAIN`（如跨子域） |
| Cookie 写在了错误的子域 | 前端通过独立子域调 API | 改为同域部署（`/api` 路径）或设置 `COOKIE_DOMAIN` |

---

## 项目结构

```
cm-media/
├── package.json                  # Monorepo 根，concurrently 并行启动
│
├── server/                       # Express 后端
│   ├── prisma/
│   │   ├── schema.prisma         # 数据库模型
│   │   └── seed.ts               # 种子数据
│   └── src/
│       ├── app.ts                # Express 入口（中间件栈）
│       ├── config/               # 数据库、Redis、环境变量
│       ├── middleware/
│       │   └── auth.ts           # authenticate / requireAdmin / banChecker
│       ├── routes/
│       │   ├── auth.ts           # 登录/登出/刷新/个人信息/密码修改
│       │   ├── videos.ts         # 视频列表/详情/搜索/播放记录
│       │   ├── categories.ts     # 分类树/分类内容（Redis 缓存 5min）
│       │   ├── photos.ts         # 图集详情/搜索/浏览记录
│       │   ├── admin.ts          # 管理后台全部功能（需 ADMIN）
│       │   └── aliyun.ts         # OSS 上传 / VOD 凭证 / 视频信息
│       └── services/
│           ├── aliyun-vod.ts     # VOD 播放信息、多画质、上传凭证
│           ├── aliyun-oss.ts     # OSS 上传、签名 URL、CDN 鉴权
│           ├── notification.ts   # 邮件 + 短信通知（登录/验证码/暴力破解告警）
│           └── location.ts       # IP 归属地查询（腾讯地图 API，内存缓存 1h）
│
├── client/                       # Next.js 前端
│   └── src/
│       ├── app/
│       │   ├── (auth)/login/     # 登录页
│       │   ├── (main)/           # 主布局（需登录）
│       │   │   ├── page.tsx      # 首页（视频+图集混合，无限滚动）
│       │   │   ├── watch/[uuid]/ # 播放页（Plyr + hls.js）
│       │   │   ├── album/[uuid]/ # 图集浏览页
│       │   │   ├── categories/   # 分类列表 / 分类内容
│       │   │   ├── search/       # 搜索结果
│       │   │   ├── history/      # 观看历史
│       │   │   └── profile/      # 个人资料
│       │   ├── admin/            # 管理后台（需 ADMIN）
│       │   ├── blocked/          # 封禁提示页
│       │   └── wechat-blocked/   # 微信拦截页
│       ├── components/
│       │   ├── video/ContentCard.tsx    # 视频/图集统一卡片
│       │   ├── GlobalUploadProgress.tsx # 全局上传进度浮层
│       │   ├── ThemeProvider.tsx        # next-themes 主题提供者（亮/暗/跟随系统）
│       │   ├── AvatarCropper.tsx        # 头像裁切（CropperJS）
│       │   ├── MediaPickerModal.tsx     # 媒体选择/上传弹窗
│       │   ├── Protection.tsx           # 防复制组件
│       │   └── ui.tsx                   # 通用 UI 组件库（含 PageLoader）
│       ├── stores/
│       │   └── uploadStore.ts    # Zustand 上传队列 store
│       └── lib/api.ts            # ApiClient（401 自动刷新 token）
```

---

## 数据库模型

### 模型关系图

```
User ─┬─< ViewRecord >──── Video ─┬─< VideoCategory >──── Category ─┐
      ├─< ViewSegment             │                                   │(自关联)
      ├─< OperationLog            ├── VodVideo (主视频)               │
      ├─< LoginLog                ├── VodVideo (预览视频)             │
      ├─< UploadLog               └── (allowedUsers JSON)            │
      └─< BannedIp (unbannedBy)                                      │
                                  VodVideo ──< MediaAsset             │
                                                                      │
                                  PhotoAlbum ─┬─< Photo              │
                                              └─< PhotoAlbumCategory >┘
```

### User（用户表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UnsignedInt PK | 自增 ID |
| username | Varchar(60) UQ | 用户名 |
| password_hash | Varchar(255) | bcrypt 哈希 |
| nickname | Varchar(60) | 昵称 |
| role | Enum | ADMIN / USER |
| avatar_url | Varchar(500) | 头像 OSS URL |
| phone | Varchar(20) UQ | 手机号（可空，用于验证码登录） |
| email | Varchar(255) UQ | 邮箱（可空，用于验证码登录） |
| session_id | Varchar(64) | 当前 Redis 会话 ID（单设备登录） |
| login_attempts | UnsignedInt | 登录失败计数 |
| is_permanently_banned | Boolean | 永久封禁标志 |
| banned_reason | Varchar(255) | 封禁原因 |

### Video（视频文章表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UnsignedInt PK | 自增 ID |
| uuid | Varchar(36) UQ | UUIDv7，对外暴露 |
| title | Varchar(255) | 视频标题 |
| content | Text | 视频描述 |
| vodVideoId | UnsignedInt FK | 主视频 → vod_videos |
| previewVodVideoId | UnsignedInt FK | 预览视频 → vod_videos（可为空） |
| posterUrl | Varchar(500) | 封面图 OSS URL |
| status | Enum | DRAFT / PUBLISHED / ARCHIVED |
| is_pickup | Boolean | 置顶标志 |
| view_count | UnsignedInt | 累计播放次数 |
| allowed_users | LongText | 允许观看的用户 ID 数组 JSON（null = 所有人） |
| published_at | DateTime | 发布时间 |

> ⚠️ videos 表**不存储**视频 URL、分辨率、时长，这些在 **vod_videos** 表中。

### VodVideo（阿里云 VOD 视频表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UnsignedInt PK | |
| uuid | Varchar(36) UQ | UUIDv7 |
| filename / filesize / mimetype | | 原始文件信息 |
| vodVideoId | Varchar(100) UQ | 阿里云 VOD VideoId |
| videoUrl | Varchar(500) | CDN 播放地址（需每次重新签名） |
| coverUrl | Varchar(500) | 封面图 URL |
| videoWidth / videoHeight | UnsignedInt | 最高画质分辨率 |
| videoDuration | Varchar(20) | 时长 HH:MM:SS |
| videoFps | Decimal(5,2) | 帧率 |
| videoType | Enum | MAIN（主视频）/ PREVIEW（预览） |
| status | Enum | PROCESSING / READY / FAILED |
| uploaderId | UnsignedInt FK | 上传者 → users |

### MediaAsset（媒体资产表）

每条 VodVideo 的附属文件，每种类型唯一。

| 字段 | 类型 | 说明 |
|------|------|------|
| vodVideoId | UnsignedInt FK | 关联 vod_videos |
| type | Enum | CAPTION（字幕）/ SPRITE（雪碧图）/ SPRITE_VTT（预览 VTT）/ COVER |
| url | Varchar(500) | OSS 资产 URL |

唯一约束: `(vodVideoId, type)`

### PhotoAlbum（图集表）

| 字段 | 说明 |
|------|------|
| uuid | UUIDv7，对外暴露 |
| title / content / coverUrl | 标题/描述/封面 OSS URL |
| status | DRAFT / PUBLISHED / ARCHIVED |
| isPickup | 置顶标志 |
| viewCount / allowedUsers / publishedAt | 与 Video 相同模式 |

### Photo（图集图片表）

| 字段 | 说明 |
|------|------|
| albumId FK | 关联 photo_albums |
| url | 原图 OSS URL（WebP, q90） |
| thumbnailUrl | 缩略图 OSS URL（WebP, q85, 300px宽） |
| sortOrder / width / height / filesize | 排序和尺寸 |

### ViewRecord（观看记录表）

唯一约束 `(user_id, video_id)`，记录每个用户对每个视频的累计数据。

| 字段 | 说明 |
|------|------|
| last_position | 上次停止位置（秒，Decimal） |
| total_duration | 累计观看时长（秒，Decimal） |
| view_count | 观看次数 |

### ViewSegment（观看片段表）

精细播放轨迹，每 3 秒上报一条 `(segStart, segEnd)` 记录，用于分析实际观看行为。

### Category / OperationLog / LoginLog / UploadLog / BannedIp

见「API 端点」中的说明。

---

## API 端点

### 认证机制

- JWT 通过 **httpOnly Cookie** 传递（同时支持 `Authorization: Bearer` 头）
- Access Token 有效期 **2 小时**，到期后用 Refresh Token 无感续期
- Refresh Token 存储于 Redis，有效期 **7 天**，每次续期自动延长
- 会话 ID 存储于 Redis（TTL 2h），登出即销毁，新登录踢出旧会话

### 公开端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |

### 认证路由 `/api/auth`

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/auth/login` | 否 | 用户名密码登录 |
| POST | `/api/auth/send-sms-code` | 否 | 发送短信验证码（60s 冷却，5min 有效） |
| POST | `/api/auth/login-by-phone` | 否 | 短信验证码登录 |
| POST | `/api/auth/send-email-code` | 否 | 发送邮箱验证码（60s 冷却，5min 有效） |
| POST | `/api/auth/login-by-email` | 否 | 邮箱验证码登录 |
| POST | `/api/auth/logout` | 是 | 登出，销毁 Redis 会话 |
| POST | `/api/auth/refresh` | 否 | 用 Refresh Token 续期 Access Token |
| GET | `/api/auth/me` | 是 | 当前用户信息（含 phone/email） |
| PUT | `/api/auth/profile` | 是 | 修改昵称 |
| PUT | `/api/auth/password` | 是 | 修改密码 |
| PUT | `/api/auth/avatar` | 是 | 更新头像 URL |
| POST | `/api/auth/send-phone-verify` | 是 | 发送手机号绑定验证码（已登录） |
| PUT | `/api/auth/phone` | 是 | 绑定/修改手机号（验证码确认） |
| POST | `/api/auth/send-email-verify` | 是 | 发送邮箱绑定验证码（已登录） |
| PUT | `/api/auth/email` | 是 | 绑定/修改邮箱（验证码确认） |

**POST /api/auth/login**

```json
// 请求
{ "username": "admin", "password": "admin123456" }

// 成功响应 (200)
{ "success": true, "user": { "id": 1, "username": "admin", "nickname": "管理员", "role": "ADMIN" } }

// 失败响应
{ "success": false, "message": "用户名或密码错误", "remaining": 9 }
{ "message": "AUTH_IP_BANNED" }   // IP 已封禁 (403)
{ "message": "AUTH_BANNED" }      // 账号已封禁 (403)
```

### 视频路由 `/api/videos`

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/videos` | 是 | 视频+图集混合列表（分页，Redis 缓存 30s） |
| GET | `/api/videos/search` | 是 | 关键词搜索视频 |
| GET | `/api/videos/:uuid` | 是 | 视频详情（含 vodVideo + mediaAssets） |
| POST | `/api/videos/:uuid/view` | 是 | 上报播放进度片段 |
| GET | `/api/videos/:uuid/related` | 是 | 相关视频推荐 |

**GET /api/videos 参数**

```
page        页码，默认 1
pageSize    每页数量，默认 20，最大 50
category    分类 slug 筛选
search      标题/内容搜索
type        内容类型：video / album（不传则混合）

排序: 置顶优先 → 发布时间倒序
权限: 普通用户只能看到 allowedUsers=null 的内容
```

**POST /api/videos/:uuid/view**

```json
{ "position": 120.5, "segStart": 117.0, "segEnd": 120.5, "countView": false }
// 逻辑: upsert ViewRecord → upsert ViewSegment → 条件增加 view_count
```

### 分类路由 `/api/categories`

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/categories` | 是 | 分类树（Redis 缓存 5min） |
| GET | `/api/categories/with-covers` | 是 | 分类列表含封面图（Redis 缓存 5min） |
| GET | `/api/categories/:slug/videos` | 是 | 分类下视频+图集列表 |

### 图集路由 `/api/photos`

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/photos/search` | 是 | 图集搜索 |
| GET | `/api/photos/:uuid` | 是 | 图集详情（含所有图片，按 sortOrder 排序） |
| POST | `/api/photos/:uuid/view` | 是 | 记录图集浏览 |

### 管理路由 `/api/admin`（需 ADMIN 角色）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/dashboard` | 仪表盘（统计 + 近期登录/视频） |
| **视频管理** | | |
| GET/POST | `/api/admin/videos` | 视频列表 / 创建视频 |
| GET/PUT/DELETE | `/api/admin/videos/:id` | 视频详情 / 更新 / 删除 |
| POST | `/api/admin/videos/batch` | 批量操作（发布/草稿/归档/删除） |
| **图集管理** | | |
| GET/POST | `/api/admin/photos` | 图集列表 / 创建 |
| GET/PUT/DELETE | `/api/admin/photos/:id` | 图集详情 / 更新 / 删除 |
| POST | `/api/admin/photos/:id/photos` | 上传图片到图集 |
| PUT | `/api/admin/photos/:id/photos/reorder` | 图片排序 |
| DELETE | `/api/admin/photos/:id/photos/:photoId` | 删除图集内图片 |
| **VOD 视频管理** | | |
| GET/POST | `/api/admin/vod-videos` | VOD 列表 / 创建记录 |
| GET/PUT/DELETE | `/api/admin/vod-videos/:id` | VOD 详情 / 更新 / 删除（含阿里云） |
| DELETE | `/api/admin/vod-videos/:id/local-only` | 仅从本地库删除，保留阿里云文件 |
| POST | `/api/admin/vod-videos/:id/sync-info` | 从阿里云同步分辨率/时长/FPS |
| **VOD 云端管理** | | |
| GET | `/api/admin/vod-cloud/videos` | 直接查询阿里云 VOD 视频列表 |
| GET | `/api/admin/vod-cloud/play/:vodId` | 获取所有画质播放地址（含 isHls） |
| GET | `/api/admin/vod-cloud/categories` | 阿里云 VOD 分类列表 |
| DELETE | `/api/admin/vod-cloud/videos` | 批量删除阿里云 VOD 视频 |
| **媒体资产** | | |
| GET | `/api/admin/media` | 媒体资产列表 |
| PUT | `/api/admin/media/:id` | 更新资产 URL |
| DELETE | `/api/admin/media/:id` | 删除媒体资产 |
| **用户管理** | | |
| GET/POST | `/api/admin/users` | 用户列表 / 创建用户 |
| GET/PUT/DELETE | `/api/admin/users/:id` | 用户详情 / 更新 / 删除 |
| POST | `/api/admin/users/:id/unban` | 解禁用户 |
| **IP 管理** | | |
| GET | `/api/admin/banned-ips` | 封禁 IP 列表 |
| POST | `/api/admin/banned-ips/:ip/unban` | 解禁 IP |
| **分类管理** | | |
| GET/POST | `/api/admin/categories` | 分类列表 / 创建 |
| PUT/DELETE | `/api/admin/categories/:id` | 更新 / 删除分类 |
| **日志** | | |
| GET/DELETE | `/api/admin/login-logs` | 登录日志（分页）/ 清空 |
| GET | `/api/admin/operation-logs` | 操作日志 |
| GET | `/api/admin/view-history` | 全用户观看历史 |
| GET | `/api/admin/view-records` | 全用户观看记录列表（分页/搜索） |
| GET | `/api/admin/view-records/segments` | 查询某用户某视频的所有播放片段 |
| GET | `/api/admin/watch-completion/videos` | 观看完整度（按视频聚合：观看人数 / 平均完整度 / 最高完整度） |
| GET | `/api/admin/watch-completion/videos/:videoId/users` | 单视频内每位用户的去重完整度详情 |

### 阿里云路由 `/api/aliyun`

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/aliyun/sts-token` | ADMIN | STS 临时凭证（1h），用于前端直传 OSS |
| GET | `/api/aliyun/video-info/:vodId` | 已登录 | VOD 全画质流信息 + isHls 标志 |
| POST | `/api/aliyun/vod/upload-auth` | ADMIN | VOD 上传凭证（前端直传视频） |
| POST | `/api/aliyun/vod/refresh-auth` | ADMIN | 刷新 VOD 上传凭证 |
| POST | `/api/aliyun/vod/save` | ADMIN | 上传完成后保存 VOD 元数据到数据库 |
| DELETE | `/api/aliyun/vod/:videoId` | ADMIN | 从阿里云删除 VOD 视频 |
| POST | `/api/aliyun/upload/image` | ADMIN | 上传图片到 OSS（生成 WebP + 缩略图） |
| POST | `/api/aliyun/upload/poster` | ADMIN | 上传视频封面到 OSS |
| POST | `/api/aliyun/upload/avatar` | 已登录 | 上传用户头像到 OSS |
| POST | `/api/aliyun/signed-urls` | 已登录 | 批量生成 OSS 签名 URL |
| GET | `/api/aliyun/signed-url` | 已登录 | 生成单个 OSS 签名 URL |

**GET /api/aliyun/video-info/:vodId 响应示例**

```json
{
  "success": true,
  "data": {
    "playURL": "https://cdn.example.com/video.mp4?auth_key=...",
    "isHls": false,
    "qualities": [
      { "definition": "FHD", "label": "1080P", "height": 1080, "url": "https://...?auth_key=...", "format": "mp4", "bitrate": 3000 },
      { "definition": "HD",  "label": "720P",  "height": 720,  "url": "https://...?auth_key=...", "format": "mp4", "bitrate": 1500 },
      { "definition": "SD",  "label": "480P",  "height": 480,  "url": "https://...?auth_key=...", "format": "mp4", "bitrate": 800 }
    ],
    "duration": "01:23:45", "width": 1920, "height": 1080, "fps": 30.0, "size": 524288000,
    "title": "视频标题", "coverUrl": "https://...", "status": "Normal", "isProcessing": false
  }
}
```

> `qualities` 按分辨率降序排列；`isHls=true` 时前端自动切换 hls.js 播放模式。

---

## 前端页面

### 路由结构

| 路径 | 页面 | 说明 |
|------|------|------|
| `/login` | 登录页 | 用户名密码登录 |
| `/` | 首页 | 视频+图集混合网格，无限滚动，置顶优先 |
| `/watch/:uuid` | 播放页 | Plyr + hls.js 多画质播放 + 断点续播 + 推荐侧栏 |
| `/album/:uuid` | 图集浏览页 | 图片网格，支持全屏查看 |
| `/categories` | 分类列表 | 各分类带封面图和内容数量 |
| `/categories/:slug` | 分类内容页 | 视频+图集混合，分页 |
| `/search` | 搜索页 | 关键词搜索视频和图集 |
| `/history` | 观看历史 | 历史记录 + 断点续播按钮 |
| `/profile` | 个人资料 | 修改昵称、头像裁切上传、密码、绑定手机号/邮箱 |
| `/admin` | 仪表盘 | 统计数据 + 近期登录记录 |
| `/admin/videos` | 视频管理 | 列表 + 状态筛选 + CRUD |
| `/admin/videos/new` | 新建视频 | 关联 VOD ID、分类、权限配置 |
| `/admin/videos/:id` | 视频编辑 | 完整编辑表单 |
| `/admin/photos` | 图集管理 | 列表 + CRUD |
| `/admin/photos/:id` | 图集编辑 | 图片上传/排序/删除 |
| `/admin/vod-videos` | VOD 视频库 | 状态监控 + 从阿里云同步信息 |
| `/admin/vod-cloud` | VOD 云端管理 | 直查阿里云 VOD 列表 + 直传上传界面 |
| `/admin/media` | 媒体资产管理 | 字幕/雪碧图/VTT 文件管理 |
| `/admin/categories` | 分类管理 | 分类 CRUD + 排序 |
| `/admin/users` | 用户管理 | 用户 CRUD + 封禁/解禁 |
| `/admin/logs` | 日志 | 登录日志 + 操作日志 |
| `/admin/view-history` | 观看历史（管理员） | 全用户观看数据 |
| `/admin/watch-completion` | 观看完整度（管理员） | 按视频分组，展示每位用户基于片段去重合并的真实观看完整度 |
| `/blocked` | 封禁页 | 账号/IP 封禁提示 |
| `/wechat-blocked` | 微信拦截 | 提示在外部浏览器打开 |

### 关键组件

| 组件 | 说明 |
|------|------|
| `video/ContentCard.tsx` | 视频/图集统一卡片（aspect-video，质量标签 4K/1080P/720P/480P，时长/图片数） |
| `GlobalUploadProgress.tsx` | 全局上传进度浮层（右下角固定），显示所有上传任务的进度条和状态，页面关闭时有离开提示 |
| `ThemeProvider.tsx` | next-themes 封装，attribute="class"，支持亮色/暗色/跟随系统 |
| `AvatarCropper.tsx` | 头像裁切（CropperJS，输出 300×300 WebP） |
| `MediaPickerModal.tsx` | 媒体选择/上传弹窗 |
| `Protection.tsx` | 防复制（禁右键/F12/Ctrl+U/文字选择，管理员可绕过） |
| `ui.tsx` | 通用 UI 组件（Spinner / PageLoader / Button / Modal / Badge / Toast 等） |

### 状态管理（Zustand）

**`uploadStore`**（`client/src/stores/uploadStore.ts`）

管理全局上传任务队列，供 `GlobalUploadProgress` 组件消费：

| 状态/方法 | 说明 |
|-----------|------|
| `tasks[]` | 当前所有上传任务（filename, type, progress, status） |
| `addTask()` | 新增任务（主视频 / 预览视频） |
| `setProgress(id, %)` | 更新进度（0–100） |
| `setComplete(id)` | 标记完成 |
| `setError(id, msg)` | 标记失败 |
| `removeTask(id)` | 移除任务 |
| `cancelUploadTask(id)` | 取消进行中的上传 |

### 视频播放（Plyr + hls.js）

播放页根据 VOD 返回的流格式自动选择播放策略：

| 情况 | 策略 | 画质切换 |
|------|------|----------|
| 单路 MP4 | Plyr 直接播放 | 无 |
| 多路 MP4（FHD/HD/SD/LD…） | Plyr source size 多画质 | 设置菜单手动切换，切换时自动保存播放位置 |
| HLS (m3u8) | hls.js 挂载 + Plyr 包装 | 设置菜单：自动 ABR + 手动指定分辨率 |
| Safari 原生 HLS | 直接设置 videoEl.src | Safari 内置 HLS，无需 hls.js |

- HLS"自动"选项实时显示当前码率，例如"自动 (1080P)"
- 画质标签映射：原画 / 4K / 2K / 1080P / 720P / 480P / 360P / 240P
- 支持预览缩略图（雪碧图 + VTT）、中文字幕、倍速

### 断点续播

1. 打开视频时自动跳转到上次停止位置（`lastPosition`）
2. 播放中每 3 秒上报一次片段 `(segStart, segEnd, position)`
3. 暂停/结束时立即保存当前位置
4. 首次播放满 3 秒触发 `view_count++`

---

## 特殊功能

### 亮色 / 暗色主题

- 使用 **next-themes**（`ThemeProvider`，`attribute="class"`）实现全局主题管理
- 支持**亮色 / 暗色 / 跟随系统**三种模式，默认跟随系统
- 导航栏顶部的太阳/月亮图标按钮可即时切换；偏好持久化到 `localStorage`
- `globals.css` 中通过 `html.light` 选择器覆盖大量 `bg-white/10`、`text-white`、`bg-gray-900` 等深色 utility，保证浅色模式下可读性
- 输入框 autofill 文字颜色跟随主题前景色变量（`--color-foreground`）

### 多方式登录

登录页支持三种登录方式，可通过 Tab 切换：

| 方式 | 说明 |
|------|------|
| 密码登录 | 用户名 + 密码（原有方式，含显示/隐藏密码切换） |
| 短信验证码 | 手机号 + 6 位验证码（60s 冷却，5min 有效，需绑定手机号） |
| 邮箱验证码 | 邮箱 + 6 位验证码（60s 冷却，5min 有效，需绑定邮箱） |

验证码在服务端存储于 Redis，一次性消费（验证后立即删除）。

### 手机号 / 邮箱绑定

个人资料页提供绑定/修改入口：
1. 输入新手机号/邮箱，点击「发送验证码」
2. 服务端校验唯一性，发送 6 位验证码（Redis TTL 5min）
3. 前端提交号码 + 验证码，后端校验后更新 `users.phone` / `users.email`

### 登录日志 IP 归属地

- 登录时异步调用 **腾讯地图 IP 定位 API**（`services/location.ts`），超时 3 秒
- 结果写入 `login_logs.address` 字段（省级精度，如"中国北京市海淀区"）
- 内存缓存 1 小时，同一 IP 不重复请求
- 需配置环境变量 `QQ_MAP_API_KEY`

### 管理员用户管理 - 封禁 IP 标签

用户管理页新增 Tab 布局：**用户列表** / **封禁 IP**，方便在同一页面查看和解封封禁 IP 记录，无需跳转其他页面。

### 视频权限控制

- `allowedUsers` 字段存 JSON 数组（用户 ID 列表）
- `null` = 所有登录用户可看
- 非空数组 = 仅列表内用户可看
- 管理员始终可看所有内容

### 单设备登录

- 登录时生成新 `sessionId` 写入 Redis（TTL 2h）并更新数据库
- 认证时比对 JWT 中的 `sessionId` 与 Redis 值，不一致即拒绝
- 新登录覆盖旧 sessionId，旧设备下次请求自动失效

### 数据库重置检测

- JWT payload 携带 `userCreatedAt` 时间戳
- 认证时与数据库中用户的 `createdAt` 比对，时间戳不一致则拒绝（防止数据库还原后旧 token 仍有效）

### 安全防护

**暴力破解防护与 IP 封禁:**

```
登录失败 → Redis 计数（IP 维度 + 用户名维度，24h 滑动窗口）
失败次数 >= MAX_LOGIN_ATTEMPTS（默认 10）
  → 永久封禁 IP（数据库 banned_ips + Redis ban:ip:{ip} 缓存 24h）
  → 永久封禁账号（is_permanently_banned = true）
  → 清除 Redis 会话，强制下线
  → 触发邮件 + 短信双重告警（告警内容含 IP 归属地）
```

**请求限流:**

| 限流规则 | 阈值 | 窗口 | 存储 |
|----------|------|------|------|
| 全局（所有接口，按 IP） | 10,000 次 | 24 小时 | Redis |
| `/api/auth/refresh` | 10 次 | 60 秒 | Redis |

**其他安全措施:**
- Helmet 安全头（X-Frame-Options DENY、noindex 等）
- 微信浏览器检测，重定向到提示页
- 前端防复制：禁用右键菜单、F12、Ctrl+U、文字选择（管理员可绕过）
- Cookie httpOnly + SameSite Lax

### 操作日志记录

| action | 触发场景 |
|--------|----------|
| `video_create` / `video_update` / `video_delete` | 视频 CRUD |
| `video_batch_{action}` | 批量发布/草稿/归档/删除 |
| `vod_video_create` / `vod_video_update` / `vod_video_delete` | VOD 视频 CRUD |
| `vod_video_remove_from_library` | 仅从本地库移除 |
| `user_create` / `user_update` / `user_delete` / `user_unban` | 用户管理 |
| `ip_unban` | 解禁 IP |
| `media_delete` | 删除媒体资产 |
| `login_logs_clear` | 清空登录日志 |

### 阿里云 URL 鉴权机制

本项目有两类需要鉴权的 URL，实现方式完全不同：

#### 1. OSS 私有文件签名（静态资源）

- **适用**：封面图、头像、图集图片、字幕、雪碧图、VTT 文件
- **识别**：hostname 为 `{BUCKET}.{ENDPOINT}`（如 `cm-media.oss-cn-beijing.aliyuncs.com`）
- **方式**：OSS SDK `signatureUrl(key, { expires })`，生成带 `OSSAccessKeyId=`、`Expires=`、`Signature=` 的临时 URL
- **实现**：`server/src/services/aliyun-oss.ts` → `generateSignedURL()`

```
https://cm-media.oss-cn-beijing.aliyuncs.com/posters/xxx.webp
  → ?OSSAccessKeyId=xxx&Expires=1234567890&Signature=xxx
```

#### 2. VOD CDN A 类鉴权（视频播放地址）

- **适用**：`videoUrl`（VodVideo 表）及 `qualities[].url`
- **识别**：CDN 加速域名，**不是** OSS bucket URL
- **方式**：CDN A 类鉴权，`auth_key=timestamp-0-0-md5sign`，密钥为 `CDN_AUTH_KEY`
- **有效期**：默认 **3600 秒（1 小时）**，每次 serve 时重新生成
- **实现**：`server/src/services/aliyun-oss.ts` → `generateVodPlayUrl()`
- **注意**：数据库中存储的 URL 可能携带过期的 `auth_key`，服务端在响应前统一剥离旧签名并重新签名

```
https://xxx.cdn.com/sv/abc/video.mp4
  → ?auth_key=1712345678-0-0-abcdef1234567890abcdef1234567890
```

#### 签名统一处理入口

所有含 VodVideo 的 API 响应在返回前经过统一签名处理：
- `videoUrl` → `generateVodPlayUrl()`（CDN A 类，每次重新生成）
- `qualities[].url` → `generateVodPlayUrl()`（同上）
- 其余 OSS 字段（coverUrl / posterUrl 等）→ `generateSignedURL()`

### 观看完整度分析

后台 `/admin/watch-completion` 提供基于 `view_segments` 的真实观看完整度分析：

- **数据来源**：播放过程中每 3 秒上报一条 `(segStart, segEnd)` 片段
- **计算口径**：将同一 (用户, 视频) 的所有片段按起点排序后**去重合并**，得到唯一观看时长，除以视频总时长
- **与停留位置区别**：`view_records.lastPosition` 仅反映上次停止位置；完整度反映"实际看过多少独特内容"，反复重看不会超过 100%
- **页面结构**：按视频分组，每行展示视频的观看人数、平均完整度、最高完整度；展开后列出每位用户的完整度、已看时长、片段数、最后观看时间
- **片段查看**：点击单个用户的"查看区段"可弹出播放器 + 区段时间轴，点击区段可跳转播放对应位置

### 通知系统

| 事件 | 通知方式 | 环境变量开关 |
|------|----------|-------------|
| 用户登录成功 | SMTP 邮件通知管理员（含 IP 归属地） | `NOTIFY_ON_LOGIN=true` |
| 暴力破解触发封禁 | SMTP 邮件 + 阿里云短信（含 IP 归属地） | `NOTIFY_ON_BRUTE_FORCE=true` |
| 短信验证码 | 阿里云短信（登录 / 绑定手机号） | — |
| 邮箱验证码 | SMTP 邮件（登录 / 绑定邮箱） | — |

---

## Redis 缓存策略

| Key 模式 | 用途 | TTL |
|----------|------|-----|
| `session:{userId}` | 用户会话 ID（单设备登录） | 7200s（2h） |
| `refresh:{token}` | Refresh Token | 604800s（7天） |
| `login:attempt:ip:{ip}` | IP 登录失败计数 | 86400s（24h，滑动窗口） |
| `login:attempt:user:{username}` | 用户名登录失败计数 | 86400s（24h，滑动窗口） |
| `ban:ip:{ip}` | IP 封禁缓存（避免频繁查库） | 86400s（24h） |
| `vc:phone:{phone}` | 短信验证码（登录/绑定） | 300s（5min） |
| `vc:email:{email}` | 邮箱验证码（登录/绑定） | 300s（5min） |
| `vc:rate:phone:{phone}` | 短信验证码发送冷却 | 60s |
| `vc:rate:email:{email}` | 邮箱验证码发送冷却 | 60s |
| `categories:all` | 分类树缓存 | 300s（5min） |
| `categories:covers` | 分类封面图缓存 | 300s（5min） |
| `videos:…` | 视频列表分页缓存（按参数哈希） | 30s |

---

## 环境变量

### 后端 `server/.env`

```bash
# 数据库
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=cm-media_2026
DB_USER=root
DB_PASSWORD=root
DATABASE_URL="mysql://root:root@127.0.0.1:3306/cm-media_2026"

# Redis
REDIS_URL=redis://127.0.0.1:6379

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=2h

# 端口
SERVER_PORT=4800
CLIENT_PORT=4900
CLIENT_URL=http://localhost:4900    # 生产改 https://your-domain.com

# 安全
MAX_LOGIN_ATTEMPTS=10       # 超过后同时封禁 IP 和账号

# CDN A 类鉴权密钥（VOD 播放地址签名）
CDN_AUTH_KEY=your-cdn-auth-key

# 阿里云 VOD
ALIYUN_VOD_ACCESS_KEY=your-access-key
ALIYUN_VOD_ACCESS_SECRET=your-access-secret
ALIYUN_VOD_ENDPOINT=vod.cn-beijing.aliyuncs.com
ALIYUN_ACCOUNT_ID=your-account-id

# 阿里云 OSS（静态资源存储）
ALIYUN_OSS_ACCESS_KEY=your-access-key
ALIYUN_OSS_ACCESS_SECRET=your-access-secret
ALIYUN_OSS_BUCKET=cm-media
ALIYUN_OSS_ENDPOINT=oss-cn-beijing.aliyuncs.com
ALIYUN_OSS_CNAME=https://cm-media.oss-cn-beijing.aliyuncs.com

# 阿里云短信（安全告警 + 验证码）
SMS_ACCESS_KEY=your-access-key
SMS_ACCESS_SECRET=your-access-secret
SMS_SIGN_NAME=信商科技
SMS_TEMPLATE_CODE=SMS_xxx          # 暴力破解告警短信模板
SMS_VERIFY_TEMPLATE_CODE=SMS_xxx   # 验证码短信模板（{code} 变量）
SMS_ADMIN_PHONE=1xxxxxxxxxx

# SMTP 邮件
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=support@example.com
SMTP_PASS=your-smtp-password
SMTP_FROM=CM Media <support@example.com>
SMTP_ADMIN_EMAIL=admin@example.com

# 通知开关
NOTIFY_ON_LOGIN=true
NOTIFY_ON_BRUTE_FORCE=true

# 腾讯地图（IP 归属地查询，可选）
QQ_MAP_API_KEY=your-key

# Cookie 跨子域共享（API 与前端不同子域时设置，同域留空）
COOKIE_DOMAIN=.example.com
```

### 前端 `client/.env.local`

```bash
# 本地开发（前后端独立端口）
NEXT_PUBLIC_API_URL=http://localhost:4800/api

# 生产部署（Nginx 反向代理，前后端同域）
# NEXT_PUBLIC_API_URL=/api
```

---

## 常用命令

```bash
# 开发（同时启动前后端）
npm run dev

# 单独启动
npm run dev:server       # Express + tsx watch，端口 4800
npm run dev:client       # Next.js + Turbopack，端口 4900

# 构建
npm run build            # 构建前后端
npm run build:server     # tsc 编译后端
npm run build:client     # next build

# 启动生产服务
npm start

# 数据库
npm run db:push          # 同步 schema（无迁移文件）
npm run db:generate      # 重新生成 Prisma Client
npm run db:seed          # 初始化种子数据
npm run db:studio        # Prisma Studio 可视化界面
```
