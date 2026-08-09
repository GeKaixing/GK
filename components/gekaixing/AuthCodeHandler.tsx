"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Fallback handler for auth redirects that land on a page other than the
 * dedicated /auth/* routes — e.g. the recovery code landing on the root path
 * when Supabase's redirect allowlist didn't match.
 *
 * It forwards the ?code= to the existing /auth/update_password route, which
 * performs the server-side PKCE exchange (using the verifier cookie set when
 * the reset email was requested) and redirects to the password form.
 *
 * Skipped on /auth/* so it never interferes with /auth/callback (OAuth) or
 * /auth/update_password itself.
 */
export default function AuthCodeHandler() {
  const router = useRouter();

  useEffect(() => {
    const pathname = window.location.pathname;
    if (pathname.startsWith("/auth/")) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) {
      return;
    }

    router.replace(`/auth/update_password?code=${encodeURIComponent(code)}`);
  }, [router]);

  return null;
}
