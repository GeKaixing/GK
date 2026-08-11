import { NextResponse } from "next/server";
import { hasUnreadChatMessages } from "@/lib/chat/unread";
import { withTimeoutOrNull } from "@/lib/with-timeout";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const authResult = await withTimeoutOrNull(supabase.auth.getUser(), 8000);
    const userId = authResult?.data.user?.id ?? null;

    if (!userId) {
      return NextResponse.json({ hasUnread: false });
    }

    const hasUnread = await hasUnreadChatMessages(userId);

    return NextResponse.json({ hasUnread });
  } catch {
    return NextResponse.json({ hasUnread: false });
  }
}
