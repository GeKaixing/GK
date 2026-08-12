import { NextResponse } from "next/server";
import { likeRemote, unlikeRemote } from "@/lib/osp/federation";
import { createClient } from "@/utils/supabase/server";

/**
 * OSP RFC-012: like / unlike a REMOTE post. Records the relationship, logs the
 * POST_LIKED/POST_UNLIKED event, and delivers it (targeted) to the post's
 * country.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { countryId, actorId, objectId } = await request.json();
  if (!countryId || !actorId || !objectId) {
    return NextResponse.json({ error: "Missing countryId, actorId or objectId" }, { status: 400 });
  }

  await likeRemote(user.id, countryId, actorId, objectId);
  return NextResponse.json({ data: { liked: true }, success: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { countryId, actorId, objectId } = await request.json();
  if (!countryId || !actorId || !objectId) {
    return NextResponse.json({ error: "Missing countryId, actorId or objectId" }, { status: 400 });
  }

  const removed = await unlikeRemote(user.id, countryId, actorId, objectId);
  return NextResponse.json({ data: { liked: !removed }, success: true });
}
