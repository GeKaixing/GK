import { NextResponse } from "next/server";

import { listChatSessions } from "@/lib/ai/pi-chat";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessions = await listChatSessions(user.id);
  return NextResponse.json({ data: sessions });
}
