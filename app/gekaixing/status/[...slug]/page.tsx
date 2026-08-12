'use server'

import PublishReply from '@/components/gekaixing/PublishReply'
import Reply from '@/components/gekaixing/Reply'
import StatusStore from '@/components/gekaixing/StatusStore'
import { prisma } from '@/lib/prisma'
import { UserActionType } from "@/generated/prisma/enums";
import { logUserAction } from "@/lib/feed/actions";
import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type { Post } from '../../page'
import PostRetreatServer from '@/components/gekaixing/PostRetreatServer'
import { getLocale, getTranslations } from 'next-intl/server'
import { getPostReplies } from "@/lib/feed/replies"
import { getSiteUrl } from "@/lib/site"

/* =======================
   类型定义
======================= */

export type FeedPost = Post & {
    replies?: Post[]
}

function toRate(numerator: number, denominator: number): number {
    if (denominator <= 0) {
        return 0
    }

    return (numerator / denominator) * 100
}

function buildExcerpt(text: string): string {
    const plainText = text.replace(/\s+/g, ' ').trim()
    return plainText.slice(0, 120)
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string[] }>
}): Promise<Metadata> {
    const locale = await getLocale()
    const t = await getTranslations({ locale, namespace: 'ImitationX.StatusPageMeta' })
    const { slug } = await params
    const postId = slug?.[0]
    const siteUrl = getSiteUrl()

    if (!postId) {
        return {
            title: t('pageTitle'),
            description: t('pageDescription'),
        }
    }

    const post = await prisma.post.findUnique({
        where: { id: postId },
        select: {
            id: true,
            content: true,
            createdAt: true,
            author: {
                select: {
                    name: true,
                    userid: true,
                },
            },
        },
    })

    if (!post) {
        return {
            title: t('notFoundTitle'),
            description: t('notFoundDescription'),
        }
    }

    const authorName = post.author.name || `@${post.author.userid}`
    const excerpt = buildExcerpt(post.content)
    const title = t('titleTemplate', { authorName })
    const description = excerpt || t('fallbackDescription')
    const url = `${siteUrl}/gekaixing/status/${post.id}`

    return {
        title,
        description,
        alternates: {
            canonical: url,
        },
        openGraph: {
            title,
            description,
            url,
            type: 'article',
            publishedTime: post.createdAt.toISOString(),
            siteName: 'Gekaixing',
        },
        twitter: {
            card: 'summary',
            title,
            description,
        },
    }
}

/* =======================
   获取单个 Post + 子回复
======================= */

const getPost = async (id: string): Promise<FeedPost | null> => {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    const userId = user?.id

    const post = await prisma.post.findUnique({
        where: { id },

        include: {
            author: {
                select: {
                    id: true,
                    userid: true,
                    name: true,
                    avatar: true,
                    isPremium: true,
                },
            },

            _count: {
                select: {
                    likes: true,
                    bookmarks: true,
                    shares: true,
                    replies: true,
                },
            },

            likes: userId
                ? { where: { userId }, select: { id: true } }
                : false,

            bookmarks: userId
                ? { where: { userId }, select: { id: true } }
                : false,

            shares: userId
                ? { where: { userId }, select: { id: true } }
                : false,

        },
    })

    if (!post) return null

    if (userId && userId !== post.author.id) {
        await logUserAction({
            userId,
            actionType: UserActionType.FEED_IMPRESSION,
            targetPostId: id,
            targetAuthorId: post.author.id,
            metadata: JSON.stringify({ kind: "feed_impression", source: "status_page" }),
        })
    }

    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const [impressions, postClicks, repliesReceived, profileEnters] = await Promise.all([
        prisma.userAction.count({
            where: {
                actionType: "FEED_IMPRESSION",
                targetPostId: id,
                createdAt: { gte: weekAgo },
            },
        }),
        prisma.userAction.count({
            where: {
                actionType: "POST_CLICK",
                targetPostId: id,
                createdAt: { gte: weekAgo },
                NOT: {
                    metadata: {
                        contains: "\"kind\":\"profile_enter\"",
                    },
                },
            },
        }),
        prisma.userAction.count({
            where: {
                actionType: "REPLY_CREATE",
                targetPostId: id,
                createdAt: { gte: weekAgo },
            },
        }),
        prisma.userAction.count({
            where: {
                actionType: "POST_CLICK",
                targetPostId: id,
                createdAt: { gte: weekAgo },
                metadata: {
                    contains: "\"kind\":\"profile_enter\"",
                },
            },
        }),
    ])

    const result: FeedPost = {
        id: post.id,
        content: post.content,
        videoUrl: post.videoUrl ?? null,
        audioUrl: post.audioUrl ?? null,
        createdAt: post.createdAt,

        user_id: post.author.id,
        user_name: post.author.name,
        user_avatar: post.author.avatar,
        user_userid: post.author.userid,
        isPremium: post.author.isPremium,

        like: post._count.likes,
        star: post._count.bookmarks,
        share: post._count.shares,
        reply: post._count.replies,
        metrics: {
            impressions,
            postClicks,
            repliesReceived,
            profileEnters,
            postClickRate: toRate(postClicks, impressions),
            replyRate: toRate(repliesReceived, impressions),
            profileEnterRate: toRate(profileEnters, impressions),
        },

        likedByMe: post.likes?.length > 0,
        bookmarkedByMe: post.bookmarks?.length > 0,
        sharedByMe: post.shares?.length > 0,
    }

    return result
}

/* =======================
   页面组件
======================= */

export default async function Page({ params }: { params: Promise<{ slug: string[] }> }) {

    const { slug } = await params
    const id = slug[0]

    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    const userId = user?.id

    if (!id) {
        notFound()
    }

    const data = await getPost(id)
    const replyPage = await getPostReplies(id, userId)

    if (!data) {
        notFound()
    }

    return (
        <div className="space-y-4 pt-4">
            {/* 返回按钮 */}
            <PostRetreatServer></PostRetreatServer>
            <div className="px-4">
                {/* 主帖子 */}
                <StatusStore data={[data]} />

                <div className="h-4" />

                {/* 回复输入框 */}
                <PublishReply
                    postId={data.id}
                    replyId={data.id}
                    userId={userId}
                    type="post"
                />

                <div className="h-4" />

                {/* 回复列表 */}
                <Reply
                    replies={replyPage.data}
                    nextCursor={replyPage.page.nextCursor}
                    hasMore={replyPage.page.hasMore}
                    feedQuery={{ scope: "status-replies", targetId: id }}
                />
            </div>
        </div>
    )
}
