import { prisma } from '@/lib/prisma'
import { UserActionType } from '@/generated/prisma/enums'
import { logUserAction } from '@/lib/feed/actions'
import { createClient } from '@/utils/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const postId = req.nextUrl.searchParams.get('postId')
    const userId = req.nextUrl.searchParams.get('userId') // 前端传

    if (!postId) {
      return NextResponse.json(
        { success: false, message: 'Missing postId' },
        { status: 400 }
      )
    }

    const [post, like, bookmark] = await Promise.all([
      prisma.post.findUnique({
        where: { id: postId },
        select: {
          likeCount: true,
          shareCount: true,
          starCount: true,
        },
      }),

      userId
        ? prisma.like.findUnique({
            where: {
              userId_postId: {
                userId,
                postId,
              },
            },
            select: { id: true },
          })
        : null,

      userId
        ? prisma.bookmark.findUnique({
            where: {
              userId_postId: {
                userId,
                postId,
              },
            },
            select: { id: true },
          })
        : null,
    ])

    if (!post) {
      return NextResponse.json(
        { success: false, message: 'Post not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        likeCount: post.likeCount,
        shareCount: post.shareCount,
        bookmarkCount: post.starCount,
        isLiked: !!like,
        isBookmarked: !!bookmark,
      },
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as {
      postId?: string
      targetAuthorId?: string
      actionType?: 'POST_CLICK' | 'DWELL' | 'PROFILE_ENTER'
      dwellMs?: number
      source?: string
      isSponsored?: boolean
    }

    if (!body.postId || !body.actionType) {
      return NextResponse.json({ success: false, message: 'Missing postId or actionType' }, { status: 400 })
    }

    const actionType = body.actionType === 'DWELL' ? UserActionType.DWELL : UserActionType.POST_CLICK
    const metadata =
      body.actionType === 'PROFILE_ENTER'
        ? JSON.stringify({ kind: 'profile_enter', source: body.source ?? 'unknown' })
        : body.actionType === 'POST_CLICK'
          ? JSON.stringify({ kind: 'post_click', source: body.source ?? 'unknown', ad: body.isSponsored ? true : undefined })
          : null

    await logUserAction({
      userId: user.id,
      actionType,
      targetPostId: body.postId,
      targetAuthorId: body.targetAuthorId ?? null,
      dwellMs: body.actionType === 'DWELL' ? body.dwellMs ?? null : null,
      metadata,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
