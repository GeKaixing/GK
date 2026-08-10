import { NextResponse } from "next/server";

import { getChatMessages } from "@/lib/ai/pi-chat";
import { createClient } from "@/utils/supabase/server";

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json([]);
  }

  const messages = await getChatMessages(sessionId, user.id);
  return NextResponse.json(messages);
}
