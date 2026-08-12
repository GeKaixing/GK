import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { createClient as createClientROLE } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { OspEventType } from "@/generated/prisma/enums";
import {
  getActorByUserId,
  listCapabilities,
  recordOspEvent,
  revokeCapability,
  revokePassport,
} from "@/lib/osp";
import { invalidateAuthorAudienceFeed } from "@/lib/feed/service";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const prismaUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    return NextResponse.json({
      id: prismaUser?.id || null,
      userid: prismaUser?.userid || null,
      success: true,
    });
  } catch (error) {
    console.error("Failed to fetch userid:", error);
    return NextResponse.json(
      { error: "Failed to fetch user data" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const body = await request.json();

  const { name, backgroundImage, avatar, briefIntroduction, userid } = body;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const updateData: Record<string, string | null> = {};
  if (name !== undefined) updateData.name = name;
  if (backgroundImage !== undefined)
    updateData.backgroundImage = backgroundImage;
  if (avatar !== undefined) updateData.avatar = avatar;
  if (briefIntroduction !== undefined)
    updateData.briefIntroduction = briefIntroduction;

  const hasFieldsToUpdate = Object.keys(updateData).length > 0;

  if (userid !== undefined && userid !== "") {
    try {
      const existingUser = await prisma.user.findUnique({
        where: { userid },
      });

      if (existingUser && existingUser.id !== user.id) {
        return NextResponse.json(
          { error: "该用户ID已被使用" },
          { status: 400 },
        );
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { userid },
      });
    } catch (error) {
      console.error("Failed to update userid:", error);
      return NextResponse.json({ error: "更新用户ID失败" }, { status: 500 });
    }
  }

  if (!hasFieldsToUpdate && userid === undefined) {
    return NextResponse.json(
      { error: "No valid fields provided" },
      { status: 400 },
    );
  }

  if (hasFieldsToUpdate) {
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
    } catch (error) {
      console.error("Failed to update user in Prisma:", error);
      return NextResponse.json({ error: "更新用户信息失败" }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  // Authenticate + ownership check (previously MISSING — anyone could delete any
  // userId via the service-role key).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { userId } = body;
  if (userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const actor = await getActorByUserId(userId);

    // OSP RFC-008 teardown: the signed ledger is immutable, so record the
    // account's end and revoke credentials BEFORE the data is deleted. The
    // Actor row survives (Actor.userId is SetNull) with its events intact.
    if (actor) {
      await recordOspEvent({ actorId: actor.id, eventType: OspEventType.ACCOUNT_DELETED });
      const capabilities = await listCapabilities(actor.id);
      for (const cap of capabilities) {
        await revokeCapability(actor.id, cap.capabilityType);
      }
      await revokePassport(actor.id);
    }

    await prisma.$transaction(async (tx) => {
      // Tables with no FK to User that Prisma can't cascade.
      await tx.piSessionFile.deleteMany({
        where: { path: { startsWith: `/sessions/${userId}/` } },
      });
      await tx.chatAISession.deleteMany({ where: { userId } });

      // Follow has no onDelete — clean both directions explicitly.
      await tx.follow.deleteMany({
        where: { OR: [{ followerId: userId }, { followingId: userId }] },
      });

      // User row cascades Post (→ Like/Bookmark/Share/UserAction),
      // ConversationParticipant, Message (sent), ConversationRead, WorkTask
      // (created), JobPosting, SponsoredAd, LiveStream/LiveChatMessage/LiveFeedback.
      await tx.user.delete({ where: { id: userId } });

      // Conversations with no remaining participants are orphaned — remove them
      // (cascades their leftover messages/tasks).
      await tx.conversation.deleteMany({ where: { participants: { none: {} } } });
    });

    const supabaseAdmin = createClientROLE(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      console.error("Failed to delete Supabase auth user:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await invalidateAuthorAudienceFeed(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Account deletion failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 500 }
    );
  }
}
