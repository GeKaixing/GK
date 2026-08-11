import { NextResponse } from "next/server";
import { hasFollowedLiveStreams } from "@/lib/live/liveNow";
import { withTimeoutOrNull } from "@/lib/with-timeout";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const authResult = await withTimeoutOrNull(supabase.auth.getUser(), 8000);
    const userId = authResult?.data.user?.id ?? null;

    if (!userId) {
      return NextResponse.json({ hasLive: false });
    }

    const hasLive = await hasFollowedLiveStreams(userId);

    return NextResponse.json({ hasLive });
  } catch {
    return NextResponse.json({ hasLive: false });
  }
}
