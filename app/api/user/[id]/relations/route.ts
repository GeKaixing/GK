import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/prisma";
import { getCachedJson, setCachedJson } from "@/lib/redis";

const RECOMMENDED_CACHE_PREFIX = "sidebar:relations:recommended";
const RECOMMENDED_CACHE_TTL_SECONDS = 300;

interface RecommendedUser {
  id: string;
  name: string;
  handle: string;
  avatar: string | null;
  bio: string | null;
  isFollowing: boolean;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);

  const type = url.searchParams.get("type");

  try {
    // ===== 推荐关注（右侧栏 WhoToFollow）=====
    if (type === "recommended") {
      const cacheKey = `${RECOMMENDED_CACHE_PREFIX}:${user.id}`;
      const cached = await getCachedJson<RecommendedUser[]>(cacheKey);
      if (Array.isArray(cached)) {
        return NextResponse.json({ success: true, users: cached });
      }

      const followingIds = await prisma.follow.findMany({
        where: { followerId: user.id },
        select: { followingId: true },
      });

      const ids = followingIds.map((f) => f.followingId);

      const recommendedUsers = await prisma.user.findMany({
        where: {
          id: {
            notIn: [...ids, user.id],
          },
        },
        take: 20,
      });

      const myFollowing = await prisma.follow.findMany({
        where: { followerId: user.id },
        select: { followingId: true },
      });

      const myFollowingIds = new Set(myFollowing.map((f) => f.followingId));
      const users: RecommendedUser[] = recommendedUsers.map((u) => ({
        id: u.id,
        name: u.name || "用户",
        handle: u.userid,
        avatar: u.avatar,
        bio: u.briefIntroduction,
        isFollowing: myFollowingIds.has(u.id),
      }));

      await setCachedJson(cacheKey, users, RECOMMENDED_CACHE_TTL_SECONDS);
      return NextResponse.json({ success: true, users });
    }

    let users: {
      name: string | null;
      id: string;
      userid: string;
      email: string;
      avatar: string | null;
      backgroundImage: string | null;
      briefIntroduction: string | null;
      createdAt: Date;
      updatedAt: Date;
    }[] = [];

    // ===== 粉丝 =====
    if (type === "followers") {
      const followers = await prisma.follow.findMany({
        where: { followingId: id },
        include: { follower: true },
      });

      users = followers.map((f) => f.follower);
    }

    // ===== 关注中 =====
    if (type === "following") {
      const following = await prisma.follow.findMany({
        where: { followerId: id },
        include: { following: true },
      });

      users = following.map((f) => f.following);
    }

    // 当前用户已关注列表（用于 isFollowing）
    const myFollowing = await prisma.follow.findMany({
      where: { followerId: user.id },
      select: { followingId: true },
    });

    const myFollowingIds = new Set(myFollowing.map((f) => f.followingId));

    return NextResponse.json({
      success: true,
      users: users.map((u) => ({
        id: u.id,
        name: u.name || "用户",
        handle: u.userid,
        avatar: u.avatar,
        bio: u.briefIntroduction,
        isFollowing: myFollowingIds.has(u.id),
      })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}
