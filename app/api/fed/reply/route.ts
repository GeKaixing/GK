import { NextResponse } from "next/server";
import { OspEventType } from "@/generated/prisma/enums";
import { invalidateUserHomeFeed } from "@/lib/feed/service";
import {
  DEFAULT_CUSTOMS_PIPELINES,
  OBJECT_TYPES,
  enqueueFederationDelivery,
  recordUserOspEvent,
  runCustoms,
} from "@/lib/osp";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

/**
 * OSP RFC-012: reply to a REMOTE post. Creates a normal local Post (appears in
 * our feeds), links it to the remote parent via RemoteReply, and broadcasts the
 * signed REPLY_CREATED (with parent_id = the remote post) so the source country
 * attaches it to the original post.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { countryId, actorId, remotePostId, content, videoUrl, audioUrl } = (await request.json()) as {
    countryId: string;
    actorId: string;
    remotePostId: string;
    content: string;
    videoUrl?: string | null;
    audioUrl?: string | null;
  };
  if (!countryId || !actorId || !remotePostId || !content) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // OSP RFC-010 Customs admission (consistent with local post creation).
  const customs = await runCustoms(
    { actorId: user.id, objectType: "comment", content },
    DEFAULT_CUSTOMS_PIPELINES
  );
  if (customs.decision === "DENY" || customs.decision === "QUARANTINE") {
    return NextResponse.json(
      { error: customs.reason ?? "Content not admitted by customs" },
      { status: 403 }
    );
  }

  const post = await prisma.post.create({
    data: {
      content,
      videoUrl: videoUrl ?? null,
      audioUrl: audioUrl ?? null,
      authorId: user.id,
    },
    include: { author: true },
  });
  await prisma.remoteReply.create({
    data: { userId: user.id, localPostId: post.id, countryId, actorId, remotePostId },
  });
  await invalidateUserHomeFeed(user.id);

  // OSP RFC-006/009: sign the reply and broadcast (parent_id = the remote post).
  const ospEvent = await recordUserOspEvent(user.id, {
    eventType: OspEventType.REPLY_CREATED,
    objectType: OBJECT_TYPES.COMMENT,
    objectId: post.id,
    payload: { remoteParentId: remotePostId },
  });
  await enqueueFederationDelivery(ospEvent, {
    content,
    authorName: post.author?.name ?? null,
    authorHandle: post.author?.userid ?? null,
    authorAvatar: post.author?.avatar ?? null,
    parentId: remotePostId,
  });

  return NextResponse.json({ data: post, success: true });
}
