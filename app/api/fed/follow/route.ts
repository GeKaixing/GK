import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { followRemote, unfollowRemote } from "@/lib/osp/federation";
import { createClient } from "@/utils/supabase/server";

/**
 * OSP RFC-012: follow / unfollow a REMOTE actor. Records the relationship,
 * logs the FOLLOWED/UNFOLLOWED event, and delivers it (targeted) to the
 * actor's country.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { countryId, actorId } = await request.json();
  if (!countryId || !actorId) {
    return NextResponse.json({ error: "Missing countryId or actorId" }, { status: 400 });
  }

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true, userid: true, avatar: true },
  });
  await followRemote(user.id, countryId, actorId, {
    name: profile?.name,
    handle: profile?.userid,
    avatar: profile?.avatar,
  });
  return NextResponse.json({ data: { following: true }, success: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { countryId, actorId } = await request.json();
  if (!countryId || !actorId) {
    return NextResponse.json({ error: "Missing countryId or actorId" }, { status: 400 });
  }

  const removed = await unfollowRemote(user.id, countryId, actorId);
  return NextResponse.json({ data: { following: !removed }, success: true });
}
