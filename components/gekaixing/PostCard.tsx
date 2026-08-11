"use client"

import React, { useState } from "react"
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Heart, MessageCircleMore, Share2, ShieldCheck, Star, ArrowUpRight } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import PostDropdownMenu from "./PostDropdownMenu"
import Link from "next/link"
import { Post } from "@/app/gekaixing/page"
import { postStore } from "@/store/post"
import { replyStore } from "@/store/reply"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { getMentionHrefFromTarget, renderMentionHtml } from "@/utils/function/mention"

function PostCard({
    id,
    user_id,
    user_name,
    user_avatar,
    user_userid,
    content,
    videoUrl,
    audioUrl,
    like,
    star,
    reply,
    share,
    likedByMe,
    bookmarkedByMe,
    metrics,
    isPremium,
    isSponsored,
    sponsoredBy,
    ctaUrl,
    ctaLabel
}: Post) {
    const te = useTranslations("Dashboard.engagement")
    const tf = useTranslations("ImitationX.Feed")
    const router = useRouter()
    const [liked, setLiked] = useState(likedByMe)
    const [bookmarked, setBookmarked] = useState(bookmarkedByMe)
    const [likeCount, setLikeCount] = useState(like)
    const [starCount, setStarCount] = useState(star)
    const [shareCount, setShareCount] = useState(share)

    const [likeLoading, setLikeLoading] = useState(false)
    const [bookmarkLoading, setBookmarkLoading] = useState(false)
    const [shareLoading, setShareLoading] = useState(false)

    React.useEffect(() => {
        setLiked(likedByMe)
        setBookmarked(bookmarkedByMe)
        setLikeCount(like)
        setStarCount(star)
        setShareCount(share)
    }, [bookmarkedByMe, like, likedByMe, share, star])

    const contentWithMentions = React.useMemo(() => renderMentionHtml(content), [content])
    const hasEmbeddedMediaNode = React.useMemo(() => {
        return (
            content.includes("data-youtube-embed") ||
            content.includes("data-video-embed") ||
            content.includes("data-audio-embed") ||
            content.includes("<iframe") ||
            content.includes("<video") ||
            content.includes("<audio")
        )
    }, [content])
    const formatRate = (value: number): string => `${value.toFixed(2)}%`

    const syncInteractionToStore = (patch: Partial<Post>): void => {
        const postState = postStore.getState()
        const replyState = replyStore.getState()

        if (postState.posts.some((postItem) => postItem.id === id)) {
            postState.updatePost(id, patch)
        }

        if (replyState.replies.some((replyItem) => replyItem.id === id)) {
            replyState.updateReply(id, patch)
        }
    }

    // =========================
    // ❤️ 点赞
    // =========================
    const handleLike = async () => {
        if (likeLoading) return
        setLikeLoading(true)

        const prevLiked = liked
        const prevCount = likeCount

        // 乐观更新
        setLiked(!prevLiked)
        setLikeCount(prevLiked ? likeCount - 1 : likeCount + 1)
        syncInteractionToStore({
            likedByMe: !prevLiked,
            like: prevLiked ? likeCount - 1 : likeCount + 1,
        })

        const res = await fetch(`/api/like?postId=${id}`, {
            method: prevLiked ? "DELETE" : "POST",
            headers: { "Content-Type": "application/json" },
            body: prevLiked ? undefined : JSON.stringify({ postId: id }),
        })

        const data = await res.json()

        if (!data.success) {
            // 回滚
            setLiked(prevLiked)
            setLikeCount(prevCount)
            syncInteractionToStore({
                likedByMe: prevLiked,
                like: prevCount,
            })
        } else {
            setLikeCount(data.data.likeCount)
            syncInteractionToStore({
                likedByMe: !prevLiked,
                like: data.data.likeCount,
            })
        }

        setLikeLoading(false)
    }

    // =========================
    // ⭐ 收藏
    // =========================
    const handleBookmark = async () => {
        if (bookmarkLoading) return
        setBookmarkLoading(true)

        const prevBookmarked = bookmarked
        const prevStar = starCount

        setBookmarked(!prevBookmarked)
        setStarCount(prevBookmarked ? starCount - 1 : starCount + 1)
        syncInteractionToStore({
            bookmarkedByMe: !prevBookmarked,
            star: prevBookmarked ? starCount - 1 : starCount + 1,
        })

        const res = await fetch(`/api/bookmark?postId=${id}`, {
            method: prevBookmarked ? "DELETE" : "POST",
            headers: { "Content-Type": "application/json" },
            body: prevBookmarked ? undefined : JSON.stringify({ postId: id }),
        })

        const data = await res.json()

        if (!data.success) {
            setBookmarked(prevBookmarked)
            setStarCount(prevStar)
            syncInteractionToStore({
                bookmarkedByMe: prevBookmarked,
                star: prevStar,
            })
        }

        setBookmarkLoading(false)
    }

    // =========================
    // 🔄 分享
    // =========================
    const handleShare = async () => {
        if (shareLoading) return
        setShareLoading(true)

        const prevShare = shareCount
        setShareCount(prevShare + 1)
        syncInteractionToStore({
            share: prevShare + 1,
        })

        const res = await fetch("/api/share", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ postId: id }),
        })

        const data = await res.json()

        if (!data.success) {
            setShareCount(prevShare)
            syncInteractionToStore({
                share: prevShare,
            })
        } else {
            setShareCount(data.data.shareCount)
            syncInteractionToStore({
                sharedByMe: true,
                share: data.data.shareCount,
            })
        }

        await navigator.clipboard.writeText(
            `${window.location.origin}/gekaixing/status/${id}`
        )

        setShareLoading(false)
    }

    const handleContentClick = (event: React.MouseEvent<HTMLDivElement>): void => {
        const mentionHref = getMentionHrefFromTarget(event.target)

        if (mentionHref) {
            event.preventDefault()
            event.stopPropagation()
            router.push(mentionHref)
            return
        }

        void trackInteraction("POST_CLICK")
        router.push(`/gekaixing/status/${id}`)
    }

    const trackInteraction = async (actionType: "POST_CLICK" | "PROFILE_ENTER"): Promise<void> => {
        try {
            await fetch("/api/post/interaction", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    postId: id,
                    targetAuthorId: user_id,
                    actionType,
                    source: "post_card",
                    isSponsored,
                }),
                keepalive: true,
            })
        } catch (error) {
            console.warn("Failed to track post interaction:", error)
        }
    }

    const handleProfileClick = (event: React.MouseEvent<HTMLDivElement>): void => {
        event.preventDefault()
        event.stopPropagation()
        void trackInteraction("PROFILE_ENTER")
        router.push(`/gekaixing/user/${user_id}`)
    }

    return (
        <Card className="cursor-pointer hover:bg-muted/60 transition-colors">
            <CardHeader>
                <div className="flex items-center gap-3">
                    <CardTitle>
                        <Avatar onClick={handleProfileClick}>
                            <AvatarImage src={user_avatar || ''} />
                            <AvatarFallback>
                                {user_name?.[0]?.toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                    </CardTitle>

                    <div className="flex flex-col cursor-pointer" onClick={handleProfileClick}>
                        <CardDescription className="font-semibold text-foreground flex items-center">
                            {user_name}
                            {isPremium && <ShieldCheck className="w-4 h-4 text-blue-500" />}
                            {isSponsored && (
                                <Badge variant="outline" className="ml-2 text-xs">
                                    {tf("sponsored")}
                                </Badge>
                            )}
                        </CardDescription>
                        <span className="text-sm text-muted-foreground">
                            @{user_userid}
                        </span>
                    </div>
                </div>

                <CardAction>
                    <PostDropdownMenu id={id} user_id={user_id} content={content} />
                </CardAction>
            </CardHeader>

            <CardContent>
                <div onClick={handleContentClick} dangerouslySetInnerHTML={{ __html: contentWithMentions }} />
                {videoUrl && !hasEmbeddedMediaNode ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-border">
                        <div className="aspect-video w-full">
                            <iframe
                                src={videoUrl}
                                title="YouTube video"
                                className="h-full w-full"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                referrerPolicy="strict-origin-when-cross-origin"
                                allowFullScreen
                            />
                        </div>
                    </div>
                ) : null}
                {audioUrl && !hasEmbeddedMediaNode ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-border p-3">
                    <audio className="w-full" controls preload="none">
                      <source src={audioUrl} />
                    </audio>
                    </div>
                ) : null}
                {metrics ? (
                    <div className="mt-3 rounded-lg border border-border p-3 text-xs text-muted-foreground">
                        <div className="flex flex-wrap gap-3">
                            <span>{te("postClickRate")}: {formatRate(metrics.postClickRate)}</span>
                            <span>{te("replyRate")}: {formatRate(metrics.replyRate)}</span>
                            <span>{te("profileEnterRate")}: {formatRate(metrics.profileEnterRate)}</span>
                        </div>
                        <div className="mt-2">
                            {metrics.postClicks}/{metrics.impressions} | {metrics.repliesReceived}/{metrics.impressions} | {metrics.profileEnters}/{metrics.impressions}
                        </div>
                    </div>
                ) : null}
                {isSponsored && ctaUrl ? (
                    <div className="mt-3" onClick={(event) => event.stopPropagation()}>
                        <a
                            href={ctaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                        >
                            {ctaLabel || tf("learnMore")}
                            <ArrowUpRight className="w-4 h-4" />
                        </a>
                    </div>
                ) : null}
            </CardContent>

            <CardFooter>
                <ul className="flex justify-between items-center w-full">
                    {/* ❤️ 点赞 */}
                    <li
                        onClick={handleLike}
                        className={`flex gap-2 items-center cursor-pointer hover:text-red-500 ${liked ? "text-red-500" : ""
                            } ${likeLoading ? "opacity-50" : ""}`}
                    >
                        <Heart className={liked ? "fill-current" : ""} />
                        {likeCount}
                    </li>

                    {/* 💬 回复 */}
                    <Link
                        href={`/gekaixing/status/${id}`}
                        className="flex gap-2 items-center hover:text-green-500"
                    >
                        <MessageCircleMore />
                        {reply}
                    </Link>

                    {/* ⭐ 收藏 */}
                    <li
                        onClick={handleBookmark}
                        className={`flex gap-2 items-center cursor-pointer hover:text-yellow-500 ${bookmarked ? "text-yellow-500" : ""
                            } ${bookmarkLoading ? "opacity-50" : ""}`}
                    >
                        <Star className={bookmarked ? "fill-current" : ""} />
                        {starCount}
                    </li>

                    {/* 🔄 分享 */}
                    <li
                        onClick={handleShare}
                        className={`flex gap-2 items-center cursor-pointer hover:text-blue-500 ${shareLoading ? "opacity-50" : ""
                            }`}
                    >
                        <Share2 />
                        {shareCount}
                    </li>
                </ul>
            </CardFooter>
        </Card>
    )
}

function arePostCardPropsEqual(prev: Post, next: Post): boolean {
    return (
        prev.id === next.id &&
        prev.user_id === next.user_id &&
        prev.user_name === next.user_name &&
        prev.user_avatar === next.user_avatar &&
        prev.user_userid === next.user_userid &&
        prev.content === next.content &&
        prev.videoUrl === next.videoUrl &&
        prev.audioUrl === next.audioUrl &&
        prev.like === next.like &&
        prev.star === next.star &&
        prev.reply === next.reply &&
        prev.share === next.share &&
        prev.likedByMe === next.likedByMe &&
        prev.bookmarkedByMe === next.bookmarkedByMe &&
        prev.sharedByMe === next.sharedByMe &&
        prev.isPremium === next.isPremium &&
        prev.isSponsored === next.isSponsored &&
        prev.sponsoredBy === next.sponsoredBy &&
        prev.ctaUrl === next.ctaUrl &&
        prev.ctaLabel === next.ctaLabel &&
        prev.metrics?.impressions === next.metrics?.impressions &&
        prev.metrics?.postClicks === next.metrics?.postClicks &&
        prev.metrics?.repliesReceived === next.metrics?.repliesReceived &&
        prev.metrics?.profileEnters === next.metrics?.profileEnters &&
        prev.metrics?.postClickRate === next.metrics?.postClickRate &&
        prev.metrics?.replyRate === next.metrics?.replyRate &&
        prev.metrics?.profileEnterRate === next.metrics?.profileEnterRate
    )
}

export default React.memo(PostCard, arePostCardPropsEqual)
