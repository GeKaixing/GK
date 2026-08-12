import { prisma } from "@/lib/prisma";
import { withTimeoutOrNull } from "@/lib/with-timeout";
import { ensureCitizen } from "@/lib/osp";
import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let next = searchParams.get("next") ?? "/gekaixing";

  if (!next.startsWith("/")) {
    next = "/gekaixing";
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data?.user) {
    console.error("Auth error:", error);
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  const user = data.user;

  try {
    const upsertResult = await withTimeoutOrNull(
      prisma.user.upsert({
        where: { id: user.id },
        update: {
          email: user.email ?? "",
          name: user.user_metadata?.full_name ?? null,
          avatar: user.user_metadata?.avatar_url ?? null,
        },
        create: {
          id: user.id,
          // Fix the Google-first rough edge: give OAuth users a friendly
          // handle instead of the auto-generated random UUID.
          userid: `user_${user.id.slice(0, 8)}`,
          email: user.email ?? "",
          name: user.user_metadata?.full_name ?? null,
          avatar: user.user_metadata?.avatar_url ?? null,
        },
      }),
      8000
    );

    if (!upsertResult) {
      console.warn("User sync timed out in auth callback.");
    } else {
      // Backfill a placeholder handle (auto-generated UUID) left from before this
      // fix. Never rewrite a user-set handle — that would break @userid mentions.
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(upsertResult.userid)) {
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { userid: `user_${user.id.slice(0, 8)}` },
          });
        } catch (backfillError) {
          console.error("Failed to backfill OAuth userid:", backfillError);
        }
      }

      // OSP identity bootstrap: Actor + Passport + capability seeds. Non-fatal —
      // the bootstrap script (scripts/bootstrap-osp.ts) is the backstop.
      await ensureCitizen(user.id).catch((ospError) =>
        console.error("OSP ensureCitizen failed in auth callback:", ospError)
      );
    }
  } catch (upsertError) {
    console.error("Failed to sync user into Prisma:", upsertError);
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";

  if (isLocalEnv) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  if (forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${next}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
