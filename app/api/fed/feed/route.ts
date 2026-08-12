import { NextResponse } from "next/server";
import { FedInboundStatus, RecognitionState } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { buildFedInteractionMaps, COUNTRY_ID } from "@/lib/osp";
import { createClient } from "@/utils/supabase/server";

/**
 * OSP RFC-009/012: federated content — admitted remote posts from
 * RECOGNIZED/TRUSTED peers, newest first. Public. Includes per-viewer
 * interaction state (isFollowing / likedByMe / remoteLikeCount) when authed.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 20) || 20, 1), 50);

  const objects = await prisma.fedObject.findMany({
    where: {
      status: FedInboundStatus.ADMITTED,
      remoteCountry: {
        status: "ACTIVE",
        recognitions: {
          some: {
            fromCountryId: COUNTRY_ID,
            state: { in: [RecognitionState.RECOGNIZED, RecognitionState.TRUSTED] },
          },
        },
      },
    },
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: { remoteCountry: { select: { id: true, name: true } } },
  });

  const hasMore = objects.length > limit;
  const page = hasMore ? objects.slice(0, limit) : objects;
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

  // Optional viewer for interaction state.
  let viewerId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    viewerId = user?.id ?? null;
  } catch {
    viewerId = null;
  }

  // Batch interaction state (RFC-012).
  const maps = await buildFedInteractionMaps(
    viewerId,
    page.map((o) => ({ sourceCountryId: o.sourceCountryId, actorId: o.actorId, objectId: o.objectId }))
  );

  return NextResponse.json({
    data: page.map((o) => ({
      id: o.id,
      eventId: o.eventId,
      sourceCountryId: o.sourceCountryId,
      sourceCountryName: o.remoteCountry?.name ?? o.sourceCountryId,
      actorId: o.actorId,
      did: `did:osp:${o.sourceCountryId}:${o.actorId}`,
      content: o.content,
      authorName: o.authorName,
      authorHandle: o.authorHandle,
      authorAvatar: o.authorAvatar,
      parentId: o.parentId,
      createdAt: o.createdAt,
      receivedAt: o.receivedAt,
      isFollowing: maps.following.has(`${o.sourceCountryId}:${o.actorId}`),
      likedByMe: maps.liked.has(o.objectId),
      remoteLikeCount: maps.likeCount.get(o.objectId) ?? 0,
    })),
    page: { nextCursor, hasMore },
    success: true,
  });
}
