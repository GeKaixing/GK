import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasNewHomeFeedTweets } from "@/lib/feed/newTweets";
import { withTimeoutOrNull } from "@/lib/with-timeout";
import { createClient } from "@/utils/supabase/server";

const HOME_FEED_LAST_SEEN_COOKIE = "gkx_home_feed_last_seen_at";

function parseSeenAt(raw: string | undefined): Date | null {
  if (!raw) {
    return null;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const authResult = await withTimeoutOrNull(supabase.auth.getUser(), 8000);
    const userId = authResult?.data.user?.id ?? null;

    if (!userId) {
      return NextResponse.json({ hasNewTweets: false });
    }

    const cookieStore = await cookies();
    const lastSeenAt = parseSeenAt(cookieStore.get(HOME_FEED_LAST_SEEN_COOKIE)?.value);
    const hasNewTweets = await hasNewHomeFeedTweets(userId, lastSeenAt);

    return NextResponse.json({ hasNewTweets });
  } catch {
    return NextResponse.json({ hasNewTweets: false });
  }
}
