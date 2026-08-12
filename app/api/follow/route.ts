import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/prisma";
import { UserActionType, OspEventType } from "@/generated/prisma/enums";
import { logUserAction } from "@/lib/feed/actions";
import { invalidateUserHomeFeed } from "@/lib/feed/service";
import { recordUserOspEvent } from "@/lib/osp";


// ===== 关注 =====
export async function POST(req: Request) {
  const supabase = await createClient();
  const { targetId } = await req.json();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!targetId) {
    return NextResponse.json({ error: "Missing targetId" }, { status: 400 });
  }

  if (user.id === targetId) {
    return NextResponse.json({ error: "不能关注自己" }, { status: 400 });
  }

  try {
    await prisma.follow.create({
      data: {
        followerId: user.id,
        followingId: targetId,
      },
    });
    await Promise.all([invalidateUserHomeFeed(user.id), invalidateUserHomeFeed(targetId)]);
    await logUserAction({
      userId: user.id,
      actionType: UserActionType.FOLLOW,
      targetAuthorId: targetId,
    });
    await recordUserOspEvent(user.id, {
      eventType: OspEventType.FOLLOWED,
      payload: { targetActor: targetId },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "关注失败" }, { status: 500 });
  }
}

// ===== 取消关注 =====
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { targetId } = await req.json();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.follow.deleteMany({
      where: {
        followerId: user.id,
        followingId: targetId,
      },
    });
    await Promise.all([invalidateUserHomeFeed(user.id), invalidateUserHomeFeed(targetId)]);
    await logUserAction({
      userId: user.id,
      actionType: UserActionType.UNFOLLOW,
      targetAuthorId: targetId,
    });
    await recordUserOspEvent(user.id, {
      eventType: OspEventType.UNFOLLOWED,
      payload: { targetActor: targetId },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "取消关注失败" }, { status: 500 });
  }
}
