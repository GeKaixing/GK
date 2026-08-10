import { NextResponse } from "next/server";

import { deleteChatSession } from "@/lib/ai/pi-chat";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  const { sessionId } = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await deleteChatSession(sessionId, user.id);
  return NextResponse.json({ success: true });
}
