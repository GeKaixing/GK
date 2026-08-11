# supabase/migrations/

只放 **Supabase 专属** 的 SQL 迁移：

- Auth 相关 SQL（触发器、函数、hook）
- RLS（Row Level Security）策略

**不要**在这里放应用数据表的结构 —— 那些走 `prisma/schema.prisma`
（用 `supabase db push` 管理应用表会和 Prisma 冲突）。

命名示例：`20260101000000_enable_rls.sql`

**模板**：`_templates/` 目录放参考模板（不会被 CLI 执行），
RLS 策略模板见 `_templates/rls_policy.sql`。
