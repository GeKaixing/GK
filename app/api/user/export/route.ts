import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  OSP_SCHEMA_VERSION,
  actorDid,
  canonicalize,
  countrySign,
  getActorByUserId,
  getCountry,
  getPassport,
  listCapabilities,
  sha256Hex,
} from "@/lib/osp";
import { createClient } from "@/utils/supabase/server";

/**
 * OSP RFC-007/008: data ownership — the actor's full, machine-readable export.
 * The manifest carries a Country-key signature over the canonical data digest,
 * so a holder can verify both integrity (digest) and authenticity (signature).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = user.id;
    const actor = await getActorByUserId(userId);

    const [
      profile,
      posts,
      likes,
      bookmarks,
      shares,
      followsOut,
      followsIn,
      actions,
      capabilities,
      passport,
      conversations,
      workTasks,
      ospEvents,
    ] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.post.findMany({ where: { authorId: userId }, orderBy: { createdAt: "asc" } }),
      prisma.like.findMany({ where: { userId } }),
      prisma.bookmark.findMany({ where: { userId } }),
      prisma.share.findMany({ where: { userId } }),
      prisma.follow.findMany({ where: { followerId: userId } }),
      prisma.follow.findMany({ where: { followingId: userId } }),
      prisma.userAction.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      actor ? listCapabilities(actor.id) : [],
      actor ? getPassport(actor.id) : null,
      prisma.conversationParticipant.findMany({
        where: { userId },
        select: { conversation: { include: { messages: true } } },
      }),
      prisma.workTask.findMany({
        where: { OR: [{ assigneeId: userId }, { createdById: userId }] },
      }),
      actor
        ? prisma.ospEvent.findMany({ where: { actorId: actor.id }, orderBy: { seq: "asc" } })
        : [],
    ]);

    const data = {
      identity: { user: profile, passport, capabilities },
      posts,
      likes,
      bookmarks,
      shares,
      follows: { following: followsOut, followers: followsIn },
      conversations: conversations.map((c) => c.conversation),
      workTasks,
      userActions: actions,
      ospEvents,
    };

    // Digest over the canonical serialized form; sign it with the Country key.
    const digest = sha256Hex(canonicalize(data));
    const country = await getCountry();
    const signature = countrySign(digest);

    return NextResponse.json({
      manifest: {
        schema: OSP_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        countryId: country.id,
        countryPublicKey: country.publicKey,
        actorId: actor?.id ?? null,
        did: actor ? actorDid(actor.id) : null,
        exportDigest: digest,
        exportSignature: signature,
      },
      data,
      success: true,
    });
  } catch (error) {
    console.error("Data export failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    );
  }
}
