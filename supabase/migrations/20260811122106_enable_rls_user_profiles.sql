-- ============================================================================
-- Enable RLS on the public "User" table — read-only public profile exposure
-- ============================================================================
-- Scope: only non-sensitive public-profile columns are granted to the Data API
-- roles (anon / authenticated). Sensitive columns (email, stripeCustomerId,
-- stripeSubId, subscriptionStatus, premiumExpiresAt, premiumGraceEndsAt,
-- stripePriceId) are intentionally NOT granted, so supabase-js / PostgREST
-- can never read them.
--
-- Writes are intentionally NOT granted: users are created and updated via
-- Prisma (postgres role, bypassrls), never through the Data API.
--
-- App impact: none. Prisma bypasses RLS; the app never queries this table via
-- supabase-js. This only makes public profile fields available to client-side
-- lookups if/when needed.
--
-- Rollback: DROP POLICY IF EXISTS "users_public_read" ON public."User";
--           DROP POLICY IF EXISTS "users_self_select" ON public."User";
--           REVOKE SELECT ON public."User" FROM anon, authenticated;
--           ALTER TABLE public."User" DISABLE ROW LEVEL SECURITY;

-- 1) Enable RLS
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;

-- 2) Column-limited grants: public profile fields only.
--    Mixed-case columns MUST be double-quoted (else folded to lowercase).
GRANT SELECT (
  id,
  name,
  avatar,
  "backgroundImage",
  "briefIntroduction",
  userid,
  "createdAt"
) ON public."User" TO anon, authenticated;

-- 3) Policies
--    anon: read any public profile
CREATE POLICY "users_public_read" ON public."User"
  FOR SELECT TO anon
  USING (true);

--    authenticated: read own row (auth.uid() == "User".id).
--    NOTE: Prisma String ids are stored as `text`, auth.uid() is `uuid`,
--    so cast to text before comparing.
CREATE POLICY "users_self_select" ON public."User"
  FOR SELECT TO authenticated
  USING (auth.uid()::text = id);
