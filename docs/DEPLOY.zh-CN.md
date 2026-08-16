# Gekaixing 部署手册（中文）

本文档用于 `gekaixing` 当前架构的部署（**纯 TypeScript**）：
- 前端/BFF：Next.js 16
- 认证：Auth.js + JWT
- 数据库：PostgreSQL（Prisma）
- 缓存：Redis（Upstash REST）
- 运行时：Vercel（Node）

> 架构原则：全程 TypeScript。部署者只需一套 Node 工具链，无需安装 Go 等其他语言运行时。

## 1. 部署前准备

## 1.1 基础要求

- Node.js 22+
- npm 10+
- （本地联调）Docker / Docker Compose

## 1.2 关键目录

- 应用：`/`
- Docker（本地数据库）：`/deploy/docker`

## 2. 环境变量

## 2.1 前端 `.env.local`

先复制：

```bash
cp .env.example .env.local
```

至少配置：

- `DATABASE_URL` / `DIRECT_URL`
- `AUTH_SECRET`
- `NEXT_PUBLIC_URL`
- `NEXT_PUBLIC_APP_URL`

说明：
- `AUTH_SECRET` 必须使用强随机字符串（`openssl rand -base64 32`），且保持稳定 —— 更换会导致所有用户重新登录。
- 生产环境中 `NEXT_PUBLIC_URL` / `NEXT_PUBLIC_APP_URL` 必须是公网 HTTPS 域名。

完整变量以 `.env.example` 为准。

## 3. 本地启动

## 3.1 安装依赖与初始化

```bash
npm install
npx prisma generate
npx prisma migrate dev
```

## 3.2 启动 PostgreSQL 与 Redis（可选，本地联调用）

```bash
cd deploy/docker && docker compose up -d postgres redis
```

## 3.3 启动应用

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 3.4 验证

```bash
npx tsc --noEmit
npm run test
```

## 4. Vercel 部署（推荐）

1. 在 Vercel 导入仓库，框架选择 Next.js。
2. 在 Project → Settings → Environment Variables 配置全部环境变量（见 `.env.example`）。
3. 触发部署。生产环境需包含：`DATABASE_URL`、`AUTH_SECRET`、`STRIPE_SECRET_KEY`、`NEXT_PUBLIC_URL` 等。
4. 部署完成后运行数据库迁移（如用托管 PostgreSQL，先 `npx prisma db push`）。

## 5. Docker Compose 部署

```bash
cd deploy/docker
docker compose up --build
```

相关文件：

- `frontend.Dockerfile`
- `docker-compose.yml`（含 postgres + redis）

## 6. 发布检查清单

上线前必做：

1. `npx tsc --noEmit` 通过
2. `npm run test` 通过
3. `npm run build` 通过（推送前在本地验证）
4. Auth.js 登录、登出、会话刷新可用
5. 文件上传与删除（`/api/storage/*`）可用
6. 数据库迁移已执行且无报错

## 7. 常见问题

## 7.1 登录后接口 401

优先检查：
- `AUTH_SECRET` / `NEXTAUTH_SECRET` 是否正确且前后端一致
- 反向代理是否透传 cookie/header

## 7.2 上传失败

优先检查：
- `public/uploads` 目录是否可写
- 上传接口是否可达：`/api/storage/upload`
- Nginx/Ingress 是否限制请求体大小

## 7.3 数据库连不上

优先检查：
- `DATABASE_URL` 是否正确
- 网络策略/防火墙是否放行数据库端口

## 8. 安全建议

- **不要提交 `.env.production.local`、`.env.development.local` 等含真实 secret 的文件**（已加入 `.gitignore`）。
- Secret 统一由平台注入（Vercel Environment Variables）。
- 生产环境必须使用 HTTPS。
- 定期轮换 `AUTH_SECRET`、第三方 API Key。
