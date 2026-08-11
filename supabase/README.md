# supabase/

本项目里 Supabase 只管 **Supabase 特有** 的东西。应用的数据表一律走 Prisma
（`prisma/schema.prisma` → `npx prisma db push` / `migrate`），原因：后期可能换数据库，
Prisma 的 `@prisma/adapter-pg` 已抽象连接层。

**禁止**：用 `supabase db push` / 裸 SQL 管理共享库里的应用表，否则会和 Prisma 冲突、造成 schema drift。

| 目录 | 用途 |
|------|------|
| `migrations/` | Auth 相关 SQL、RLS 策略、触发器（Supabase 专属） |
| `functions/`  | Edge Functions |
| `config.toml` | Supabase CLI 配置（`project_id` 已设为远程 ref） |

远程项目 ref：`dlfxwtoaauuoithhcpcz`（gekaixing，ap-northeast-2）
