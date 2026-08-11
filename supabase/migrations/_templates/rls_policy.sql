-- ============================================================================
-- RLS 策略模板 (Row Level Security policy template)
-- ============================================================================
-- 位置: supabase/migrations/_templates/  — 不会被 supabase CLI 当作迁移执行。
-- 复制到 supabase/migrations/<timestamp>_your_name.sql 后按需修改再用。
--
-- ⚠️ 项目边界（见 CLAUDE.md / AGENTS.md）:
--   · 应用数据表一律走 Prisma，RLS 主要给 Supabase 专属场景用:
--     Auth 相关 SQL、storage、或需要客户端(supabase-js)直查的表。
--   · Prisma 用 postgres 角色连接(bypassrls=true)，加 RLS 不影响现有应用逻辑。
--   · 若真要给应用表开 RLS，别用 supabase CLI 的 db push 管理结构，只写策略。
--
-- 🔑 本项目已确认的映射: "User".id == Supabase auth.uid() （注册时写入）。
--    其他表如要关联当前用户，用对应的 authorId / userId 列。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) 前置说明
-- ----------------------------------------------------------------------------
-- 新版 Supabase 默认不再自动暴露新表给 anon/authenticated，必须显式 GRANT。
-- 只有 GRANT 了、且 ENABLE ROW LEVEL SECURITY 的表才会走策略判断；
-- 没 GRANT 的表现在客户端查询直接报 "permission denied for table"。

-- ----------------------------------------------------------------------------
-- 1) 启用 RLS（需要表 owner，即 postgres 角色）
-- ----------------------------------------------------------------------------
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;

-- 需要 FORCE 吗？默认不要。FORCE 连表 owner 也受策略约束，
-- 只对必须阻止特权角色越权的场景用。
-- ALTER TABLE public."User" FORCE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2) 授权客户端角色（anon=未登录, authenticated=已登录）
--    按需放开 SELECT / INSERT / UPDATE / DELETE
-- ----------------------------------------------------------------------------
GRANT SELECT ON public."User" TO anon, authenticated;
-- GRANT INSERT, UPDATE, DELETE ON public."User" TO authenticated;

-- ----------------------------------------------------------------------------
-- 3) 策略：用户只能看/改自己的行
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_self_select" ON public."User";
CREATE POLICY "users_self_select" ON public."User"
  FOR SELECT TO authenticated
  USING (auth.uid() = id);            -- auth.uid() 即登录用户，id 即 User.id
-- ⚠️ Prisma 的 String 主键在 PG 里是 text，auth.uid() 是 uuid，
--    直接比较会报 "operator does not exist: uuid = text"。
--    要么把 id 列建成 uuid 类型，要么改成: USING (auth.uid()::text = id)

-- 允许匿名用户读公开资料（没有 RLS 过滤 = 全表可见）
DROP POLICY IF EXISTS "users_public_read" ON public."User";
CREATE POLICY "users_public_read" ON public."User"
  FOR SELECT TO anon
  USING (true);

-- 写入：只允许创建自己的行（WITH CHECK 校验插入/更新后的行）
DROP POLICY IF EXISTS "users_self_insert" ON public."User";
CREATE POLICY "users_self_insert" ON public."User"
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- 更新：只能改自己的行
DROP POLICY IF EXISTS "users_self_update" ON public."User";
CREATE POLICY "users_self_update" ON public."User"
  FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- 4) 策略：管理员（应用内 role = ADMIN）额外放行
--    authenticated 需要满足本策略才能通过，注意多策略是 OR 关系，
--    不必把 ADMIN 判断重复进每个策略。
-- ----------------------------------------------------------------------------
-- 方式 A: 把应用的角色塞进 JWT claims（需要 auth hook），然后:
-- CREATE POLICY "users_admin_all" ON public."User"
--   FOR ALL TO authenticated
--   USING (auth.jwt() ->> 'app_role' = 'ADMIN');

-- 方式 B: 直接查应用表（注意：策略里的查询不能递归引用同一张表）
-- CREATE POLICY "users_admin_all" ON public."User"
--   FOR ALL TO authenticated
--   USING (EXISTS (
--     SELECT 1 FROM public."User" u
--     WHERE u.id = auth.uid() AND u.role = 'ADMIN'
--   ));
-- ⚠️ 方式 B 在同一张表上会引发递归，属反模式；更推荐方式 A 或
--    让管理员走后端 Prisma（postgres 角色天然豁免 RLS）。

-- ----------------------------------------------------------------------------
-- 5) 验证策略（连回来测试）
-- ----------------------------------------------------------------------------
-- 用 anon / authenticated 角色试:
--   SET ROLE anon;
--   SELECT * FROM public."User" LIMIT 5;
--   RESET ROLE;
-- 或用 supabase-js 客户端带 JWT 调 /rest/v1/User，观察是否按策略过滤。
-- 注意: 应用真实流量走 Prisma(postgres)，RLS 策略不影响它；
--       要验证 Data API 路径，需要真的用 anon key / 用户 token 调 API。

-- ----------------------------------------------------------------------------
-- 6) 常用表达速查
-- ----------------------------------------------------------------------------
-- auth.uid()               当前登录用户 UUID（等于 "User".id；Prisma String 主键是
--                          text，比较时用 auth.uid()::text = id）
-- auth.jwt()               当前用户 JWT（jsonb），可取 ->> 'claim'
-- current_setting('request.jwt.claims', true)  取 JWT 的兼容写法
-- service_role / postgres  始终绕过 RLS（不需要写进策略）
-- 多策略之间是 OR：只要任一策略放行即可。
-- 空策略 = 表对启用角色全封闭（常用于"禁止客户端直查"）。
-- ============================================================================
