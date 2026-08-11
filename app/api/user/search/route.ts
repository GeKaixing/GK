import { prisma } from "@/lib/prisma"
import { createClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = (searchParams.get("query") || "").trim()

    // 可选登录态：用于计算 isFollowing / isSelf。
    let viewerId: string | null = null
    try {
      const supabase = await createClient()
      const { data } = await supabase.auth.getUser()
      viewerId = data.user?.id ?? null
    } catch {
      viewerId = null
    }

    const users = await prisma.user.findMany({
      where: query
        ? {
            OR: [
              { userid: { contains: query, mode: "insensitive" } },
              { name: { contains: query, mode: "insensitive" } },
            ],
          }
        : undefined,
      select: {
        id: true,
        userid: true,
        name: true,
        avatar: true,
        briefIntroduction: true,
        isPremium: true,
        _count: {
          select: { followers: true },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 8,
    })

    const followingIds = new Set<string>()
    if (viewerId) {
      const follows = await prisma.follow.findMany({
        where: { followerId: viewerId },
        select: { followingId: true },
      })
      follows.forEach((row) => followingIds.add(row.followingId))
    }

    const data = users.map((user) => ({
      id: user.id,
      userid: user.userid,
      name: user.name,
      avatar: user.avatar,
      briefIntroduction: user.briefIntroduction,
      isPremium: user.isPremium,
      followers: user._count.followers,
      isFollowing: viewerId ? followingIds.has(user.id) : false,
      isSelf: user.id === viewerId,
    }))

    return NextResponse.json({ data, success: true })
  } catch (error) {
    console.error("Search users failed:", error)
    return NextResponse.json({ error: "Search users failed" }, { status: 500 })
  }
}
