-- ============================================================================
-- Grant USAGE on the public schema to the Data API roles
-- ============================================================================
-- Tables were created by Prisma, so Supabase's baseline schema grant was never
-- applied. Without USAGE on `public`, anon/authenticated can't access anything
-- via the Data API (permission denied for schema public), even with RLS
-- policies and column grants in place.
--
-- USAGE alone exposes no data — table/column grants still gate access.
-- This is the standard Supabase baseline grant.

GRANT USAGE ON SCHEMA public TO anon, authenticated;
