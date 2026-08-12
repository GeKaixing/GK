'use server'
import ArrowLeftBack from '@/components/gekaixing/ArrowLeftBack'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { prisma } from '@/lib/prisma'
import { getRemoteFollowerCount } from "@/lib/osp";
import { Post } from '../../page'
import PostStore from '@/components/gekaixing/PostStore'
import User_background_image from '@/components/gekaixing/User_background_image'
import User_background_bio from '@/components/gekaixing/User_background_bio'
import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { createClient } from "@/utils/supabase/server"
import { Prisma } from '@/generated/prisma/client'
import { notFound } from 'next/navigation'
import { withTimeoutOrNull } from '@/lib/with-timeout'
import { getSiteUrl } from "@/lib/site"

const PROFILE_LIST_LIMIT = 20
type FeedScope = "user-posts" | "user-replies" | "user-liked" | "user-bookmarks"

type FeedPage = {
    data: Post[]
    page: {
        nextCursor: string | null
        hasMore: boolean
    }
}

async function safeDbQuery<T>(label: string, query: () => Promise<T>, timeoutMs: number): Promise<T | null> {
    try {
        return await withTimeoutOrNull(query(), timeoutMs)
    } catch (error) {
        console.error(`${label} failed:`, error)
        return null
    }
}

function buildBioDescription(text: string | null): string {
    const normalized = (text || '').replace(/\s+/g, ' ').trim()
    if (!normalized) {
        return ''
    }
    return normalized.slice(0, 120)
}

async function resolveUserIdentifier(identifier: string): Promise<{ id: string; userid: string } | null> {
    const user = await safeDbQuery(
        "resolveUserIdentifier",
        () => prisma.user.findFirst({
            where: {
                OR: [{ id: identifier }, { userid: identifier }, { name: identifier }],
            },
            select: {
                id: true,
                userid: true,
            },
        }),
        8000
    )

    if (!user) {
        return null
    }

    return user
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string[] }>
}): Promise<Metadata> {
    const locale = await getLocale()
    const t = await getTranslations({ locale, namespace: 'ImitationX.UserPageMeta' })
    const { id } = await params
    const identifier = id?.[0]
    const siteUrl = getSiteUrl()

    if (!identifier) {
        return {
            title: t('pageTitle'),
            description: t('pageDescription'),
        }
    }

    const resolvedUser = await resolveUserIdentifier(identifier)
    if (!resolvedUser) {
        return {
            title: t('notFoundTitle'),
            description: t('notFoundDescription'),
        }
    }

    const user = await safeDbQuery(
        "generateMetadata.user.findUnique",
        () => prisma.user.findUnique({
            where: { id: resolvedUser.id },
            select: {
                id: true,
                name: true,
                userid: true,
                briefIntroduction: true,
                avatar: true,
            },
        }),
        8000
    )

    if (!user) {
        return {
            title: t('notFoundTitle'),
            description: t('notFoundDescription'),
        }
    }

    const displayName = user.name || `@${user.userid}`
    const title = t('titleTemplate', { displayName })
    const description = buildBioDescription(user.briefIntroduction) || t('defaultDescription')
    const url = `${siteUrl}/gekaixing/user/${user.id}`

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
            type: 'profile',
            siteName: 'Gekaixing',
            images: user.avatar
                ? [
                    {
                        url: user.avatar,
                        alt: `${displayName} avatar`,
                    },
                ]
                : undefined,
        },
        twitter: {
            card: 'summary',
            title,
            description,
            images: user.avatar ? [user.avatar] : undefined,
        },
    }
}

function buildWhere(scope: FeedScope, targetId: string): Prisma.PostWhereInput {
    switch (scope) {
        case "user-posts":
            return {
                authorId: targetId,
                parentId: null,
            }
        case "user-replies":
            return {
                authorId: targetId,
                parentId: { not: null },
            }
        case "user-liked":
            return {
                parentId: null,
                likes: {
                    some: {
                        userId: targetId,
                    },
                },
            }
        case "user-bookmarks":
            return {
                parentId: null,
                bookmarks: {
                    some: {
                        userId: targetId,
                    },
                },
            }
        default:
            return {
                parentId: null,
            }
    }
}

async function getScopedFeed(scope: FeedScope, targetId: string, viewerId: string | undefined): Promise<FeedPage> {
    try {
        const rows = await safeDbQuery(
            `getScopedFeed:${scope}`,
            () => prisma.post.findMany({
                where: buildWhere(scope, targetId),
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: PROFILE_LIST_LIMIT + 1,
                select: {
                    id: true,
                    content: true,
                    videoUrl: true,
                    audioUrl: true,
                    createdAt: true,
                    likeCount: true,
                    starCount: true,
                    shareCount: true,
                    replyCount: true,
                    author: {
                        select: {
                            id: true,
                            userid: true,
                            name: true,
                            avatar: true,
                            isPremium: true,
                        },
                    },
                    likes: viewerId
                        ? {
                            where: { userId: viewerId },
                            select: { id: true },
                        }
                        : false,
                    bookmarks: viewerId
                        ? {
                            where: { userId: viewerId },
                            select: { id: true },
                        }
                        : false,
                    shares: viewerId
                        ? {
                            where: { userId: viewerId },
                            select: { id: true },
                        }
                        : false,
                },
            }),
            10000
        )

        if (!rows) {
            return {
                data: [],
                page: {
                    nextCursor: null,
                    hasMore: false,
                },
            }
        }

        const hasMore = rows.length > PROFILE_LIST_LIMIT
        const posts = hasMore ? rows.slice(0, PROFILE_LIST_LIMIT) : rows
        const nextCursor = hasMore ? posts[posts.length - 1]?.id ?? null : null

        return {
            data: posts.map((post) => ({
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
                like: post.likeCount,
                star: post.starCount,
                share: post.shareCount,
                reply: post.replyCount,
                likedByMe: post.likes?.length > 0,
                bookmarkedByMe: post.bookmarks?.length > 0,
                sharedByMe: post.shares?.length > 0,
            })),
            page: {
                nextCursor,
                hasMore,
            },
        }
    } catch (error) {
        console.error(`getScopedFeed failed for ${scope}:`, error)
        return {
            data: [],
            page: {
                nextCursor: null,
                hasMore: false,
            },
        }
    }
}



async function getUserInfo(userId: string) {
    return safeDbQuery(
        "getUserInfo",
        () => prisma.user.findUnique({
            where: {
                id: userId,
            },
            include: {
                _count: {
                    select: {
                        followers: true,
                        following: true,
                    },
                },
            },
        }),
        8000
    )
}

async function getUserHiringStatus(userId: string): Promise<boolean> {
    const hiringPost = await safeDbQuery(
        "getUserHiringStatus",
        () => prisma.jobPosting.findFirst({
            where: {
                authorId: userId,
            },
            select: {
                id: true,
            },
        }),
        8000
    )

    return Boolean(hiringPost)
}


export default async function Page({ params }: { params: Promise<{ id: string[] }> }) {
    const t = await getTranslations("ImitationX.Profile")
    const supabase = await createClient()
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    const { id } = await params

    const identifier = id[0]
    const resolvedUser = await resolveUserIdentifier(identifier)

    if (!resolvedUser) {
        notFound()
    }

    const userId = resolvedUser.id

    const [postsResult, repliesResult, likedResult, bookmarkResult] = await Promise.allSettled([
        getScopedFeed("user-posts", userId, currentUser?.id),
        getScopedFeed("user-replies", userId, currentUser?.id),
        getScopedFeed("user-liked", userId, currentUser?.id),
        getScopedFeed("user-bookmarks", userId, currentUser?.id),
    ])
    const emptyFeed: FeedPage = { data: [], page: { nextCursor: null, hasMore: false } }
    const postsPage = postsResult.status === "fulfilled" ? postsResult.value : emptyFeed
    const repliesPage = repliesResult.status === "fulfilled" ? repliesResult.value : emptyFeed
    const likedPage = likedResult.status === "fulfilled" ? likedResult.value : emptyFeed
    const bookmarkPage = bookmarkResult.status === "fulfilled" ? bookmarkResult.value : emptyFeed

    const [userResult, hiringResult] = await Promise.allSettled([
        getUserInfo(userId),
        getUserHiringStatus(userId),
    ])
    const user = userResult.status === "fulfilled" ? userResult.value : null
    const isHiring = hiringResult.status === "fulfilled" ? hiringResult.value : false
    const isOwner = currentUser?.id === user?.id

    // OSP RFC-012: followers from federated (remote) countries.
    const remoteFollowers = user ? await getRemoteFollowerCount(user.id).catch(() => 0) : 0


    return (
        <div className="pb-20 sm:pb-0">
            <div className="h-14 sm:h-16">
                <ArrowLeftBack></ArrowLeftBack>
            </div>
            <User_background_image backgroundImage={user?.backgroundImage} />
            <div className='px-3 sm:px-4'>

                <User_background_bio
                    viewedUserId={user?.id}
                    name={user?.name}
                    avatar={user?.avatar}
                    briefIntroduction={user?.briefIntroduction}
                    viewedUserid={user?.userid}
                    followers={user?._count.followers}
                    following={user?._count.following}
                    remoteFollowers={remoteFollowers}
                    isOwner={isOwner}
                    isPremium={user?.isPremium || false}
                    isHiring={isHiring}
                />

                <Tabs defaultValue="post" className="w-full">
                    <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto p-1">
                        <TabsTrigger value="post" className="shrink-0 rounded-full px-3 py-1.5 text-xs sm:text-sm">{t("tabs.posts")}</TabsTrigger>
                        <TabsTrigger value="reply" className="shrink-0 rounded-full px-3 py-1.5 text-xs sm:text-sm">{t("tabs.replies")}</TabsTrigger>
                        {/* <TabsTrigger value="article">文章</TabsTrigger>*/}
                        <TabsTrigger value="like" className="shrink-0 rounded-full px-3 py-1.5 text-xs sm:text-sm">{t("tabs.likes")}</TabsTrigger>
                        <TabsTrigger value="bookmark" className="shrink-0 rounded-full px-3 py-1.5 text-xs sm:text-sm">{t("tabs.bookmarks")}</TabsTrigger>
                    </TabsList>
                    <TabsContent value="post" className='mt-2 flex flex-col gap-6'>
                        <PostStore
                            data={postsPage.data}
                            nextCursor={postsPage.page.nextCursor}
                            hasMore={postsPage.page.hasMore}
                            feedQuery={{ scope: "user-posts", targetId: userId }}
                        />
                    </TabsContent>
                    <TabsContent value="reply" className='mt-2 flex flex-col gap-6'>
                        <PostStore
                            data={repliesPage.data}
                            nextCursor={repliesPage.page.nextCursor}
                            hasMore={repliesPage.page.hasMore}
                            feedQuery={{ scope: "user-replies", targetId: userId }}
                        />
                    </TabsContent>
                    {/* <TabsContent value="article" className='flex flex-col gap-6'>    <PostCard></PostCard></TabsContent>*/}
                    <TabsContent value="like" className='mt-2 flex flex-col gap-6'>
                        <PostStore
                            data={likedPage.data}
                            nextCursor={likedPage.page.nextCursor}
                            hasMore={likedPage.page.hasMore}
                            feedQuery={{ scope: "user-liked", targetId: userId }}
                        />
                    </TabsContent>
                    <TabsContent value="bookmark" className='mt-2 flex flex-col gap-6'>
                        <PostStore
                            data={bookmarkPage.data}
                            nextCursor={bookmarkPage.page.nextCursor}
                            hasMore={bookmarkPage.page.hasMore}
                            feedQuery={{ scope: "user-bookmarks", targetId: userId }}
                        />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}
