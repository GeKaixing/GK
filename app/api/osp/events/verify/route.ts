import { NextResponse } from "next/server";
import { getActorByUserId } from "@/lib/osp/actor";
import { verifyEventChain } from "@/lib/osp/event";
import { createClient } from "@/utils/supabase/server";

/**
 * OSP RFC-006: verify an actor's signed event chain (hash linkage + signatures).
 * Authenticated. `actorId` is optional — defaults to the caller's own actor.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const actorId = searchParams.get("actorId") ?? (await getActorByUserId(user.id))?.id;
    if (!actorId) {
      return NextResponse.json({ error: "No actor found" }, { status: 404 });
    }

    const result = await verifyEventChain(actorId);
    return NextResponse.json({ data: result, success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verify failed" },
      { status: 500 }
    );
  }
}
