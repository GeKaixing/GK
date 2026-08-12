import React, { useEffect, useState } from 'react'
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import Link from 'next/link'
import { Heart, MessageCircleMore, Share2, Star } from 'lucide-react'
import PostDropdownMenu from './PostDropdownMenu'
import { replyStore } from '@/store/reply'
import { copyToClipboard } from '@/utils/function/copyToClipboard'
import { userStore } from '@/store/user'
import { useRouter } from 'next/navigation'
import { getMentionHrefFromTarget, renderMentionHtml } from '@/utils/function/mention'

async function toggleLike(postId: string, isLiked: boolean): Promise<{ success: boolean; likeCount?: number }> {
    try {
        const url = `/api/like?postId=${postId}`
        const response = await fetch(url, {
            method: isLiked ? 'DELETE' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: isLiked ? undefined : JSON.stringify({ postId }),
        })
        const data = await response.json()
        if (data.success) {
            return { success: true, likeCount: data.data.likeCount }
        }
        return { success: false }
    } catch {
        return { success: false }
    }
}

async function toggleBookmark(postId: string, isBookmarked: boolean): Promise<boolean> {
    try {
        const url = `/api/bookmark?postId=${postId}`
        const response = await fetch(url, {
            method: isBookmarked ? 'DELETE' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: isBookmarked ? undefined : JSON.stringify({ postId }),
        })
        const data = await response.json()
        return data.success
    } catch {
        return false
    }
}

async function recordShare(postId: string): Promise<{ success: boolean; shareCount?: number }> {
    try {
        const response = await fetch('/api/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postId }),
        })
        const data = await response.json()
        if (data.success) {
            return { success: true, shareCount: data.data.shareCount }
        }
        return { success: false }
    } catch {
        return { success: false }
    }
}

async function fetchInteractionStatus(postId: string): Promise<{ isLiked: boolean; isBookmarked: boolean; likeCount: number; shareCount: number }> {
    try {
        const [likeRes, bookmarkRes, shareRes] = await Promise.all([
            fetch(`/api/like?postId=${postId}`),
            fetch(`/api/bookmark?postId=${postId}`),
            fetch(`/api/share?postId=${postId}`),
        ])

        const [likeData, bookmarkData, shareData] = await Promise.all([
            likeRes.json(),
            bookmarkRes.json(),
            shareRes.json(),
        ])

        return {
            isLiked: likeData.data?.isLiked || false,
            isBookmarked: bookmarkData.data?.isBookmarked || false,
            likeCount: likeData.data?.likeCount || 0,
            shareCount: shareData.data?.shareCount || 0,
        }
    } catch {
        return { isLiked: false, isBookmarked: false, likeCount: 0, shareCount: 0 }
    }
}
export default function ReplyCard({
    post_id,
    id,
    reply_id: initialReply_id,
    user_id,
    user_name,
    user_email,
    user_avatar,
    user_userid,
    content,
    like: initialLike,
    star: initialStar,
    reply_count: initialReply_count,
    share: initialShare,
}: {
    reply_id: string | null
    post_id: string,
    id: string,
    user_id: string,
    user_name: string,
    user_email: string,
    user_avatar: string,
    user_userid: string,
    content: string,
    like: number,
    star: number,
    reply_count: number,
    share: number
}) {
    const router = useRouter()
    const post = replyStore(state => state.replies.find(p => p.id === id))
    const updatePost = replyStore(state => state.updateReply)

    const [isLiked, setIsLiked] = useState(false)
    const [isBookmarked, setIsBookmarked] = useState(false)
    const [isLikeLoading, setIsLikeLoading] = useState(false)
    const [isBookmarkLoading, setIsBookmarkLoading] = useState(false)
    const [isShareLoading, setIsShareLoading] = useState(false)
    const contentWithMentions = React.useMemo(() => renderMentionHtml(content), [content])

    useEffect(() => {
        const currentUser = userStore.getState()
        if (currentUser.id) {
            fetchInteractionStatus(id).then(status => {
                setIsLiked(status.isLiked)
                setIsBookmarked(status.isBookmarked)
                updatePost(id, {
                    like: status.likeCount,
                    share: status.shareCount,
                })
            })
        }
    }, [id, updatePost])

    if (!post) return null

    const { like, share, reply } = post

    const handleLike = async () => {
        if (isLikeLoading) return
        setIsLikeLoading(true)

        const previousLike = like
        const previousIsLiked = isLiked
        const newLikeCount = isLiked ? like - 1 : like + 1

        updatePost(id, { like: newLikeCount })
        setIsLiked(!isLiked)

        const result = await toggleLike(id, previousIsLiked)

        if (!result.success) {
            updatePost(id, { like: previousLike })
            setIsLiked(previousIsLiked)
        } else if (result.likeCount !== undefined) {
            updatePost(id, { like: result.likeCount })
        }

        setIsLikeLoading(false)
    }

    const handleBookmark = async () => {
        if (isBookmarkLoading) return
        setIsBookmarkLoading(true)

        const previousIsBookmarked = isBookmarked

        setIsBookmarked(!isBookmarked)

        const success = await toggleBookmark(id, previousIsBookmarked)

        if (!success) {
            setIsBookmarked(previousIsBookmarked)
        }

        setIsBookmarkLoading(false)
    }

    const handleShare = async () => {
        if (isShareLoading) return
        setIsShareLoading(true)

        const previousShare = share
        const newShareCount = share + 1

        updatePost(id, { share: newShareCount })

        const result = await recordShare(id)

        if (!result.success) {
            updatePost(id, { share: previousShare })
        } else if (result.shareCount !== undefined) {
            updatePost(id, { share: result.shareCount })
        }

        copyToClipboard(`https://gekaixing.vercel.app/gekaixing/status/${id}`)
        setIsShareLoading(false)
    }

    const handleContentClick = (event: React.MouseEvent<HTMLDivElement>): void => {
        const mentionHref = getMentionHrefFromTarget(event.target)

        if (mentionHref) {
            event.preventDefault()
            event.stopPropagation()
            router.push(mentionHref)
            return
        }

        router.push(`/gekaixing/status/${id}`)
    }

    return (
        <Card className='cursor-pointer hover:bg-muted/60 transition-colors' key={id}>
            <CardHeader>
                <div className='flex items-center gap-2 '>
                    <CardTitle className='hover:bg-muted/70 rounded-full transition-colors'>
                        <Avatar>
                            <AvatarImage src={user_avatar} />
                            <AvatarFallback>{user_name?.charAt(0)?.toUpperCase() || 'U'}</AvatarFallback>
                        </Avatar>
                    </CardTitle>
                    <div className="flex flex-col">
                        <CardDescription className="hover:bg-muted/70 rounded-md font-semibold text-foreground transition-colors">{user_name}</CardDescription>
                        <span className="text-sm text-muted-foreground">@{user_userid}</span>
                    </div>
                </div>

                <CardAction>
                    <PostDropdownMenu
                        reply_id={initialReply_id}
                        type='reply'
                        post_id={post_id}
                        id={id}
                        user_id={user_id}
                        content={content}>
                    </PostDropdownMenu>
                </CardAction>
            </CardHeader>
            <CardContent >
                <div onClick={handleContentClick} dangerouslySetInnerHTML={{ __html: contentWithMentions }}></div>
            </CardContent>
            {userStore.getState().id && <CardFooter>
                <ul className='flex justify-between items-center w-full'>
                    <li
                        className={`flex gap-2 hover:text-blue-400 ${isLiked ? 'text-blue-400' : ''}`}
                        onClick={handleLike}
                    >
                        <div className={`w-7 h-7 flex justify-center items-center rounded-full hover:bg-blue-400/10 ${isLikeLoading ? 'opacity-50' : ''}`}>
                            <Heart className={isLiked ? 'fill-current' : ''} />
                        </div>
                        {like || 0}
                    </li>
                    <Link href={`/gekaixing/status/${id}`} className='flex gap-2 hover:text-green-400'>
                        <div className='w-7 h-7 flex justify-center items-center rounded-full hover:bg-green-400/10'>
                            <MessageCircleMore />
                        </div>
                        {reply || 0}
                    </Link>
                    <li
                        className={`flex gap-2 hover:text-red-400 ${isBookmarked ? 'text-red-400' : ''}`}
                        onClick={handleBookmark}
                    >
                        <div className={`w-7 h-7 flex justify-center items-center rounded-full hover:bg-red-400/10 ${isBookmarkLoading ? 'opacity-50' : ''}`}>
                            <Star className={isBookmarked ? 'fill-current' : ''} />
                        </div>
                        {isBookmarked ? 1 : 0}
                    </li>
                    <li className="flex gap-2 hover:text-blue-400" onClick={handleShare}>
                        <div className={`w-7 h-7 flex justify-center items-center rounded-full hover:bg-blue-400/10 ${isShareLoading ? 'opacity-50' : ''}`}>
                            <Share2 />
                        </div>
                        {share || 0}
                    </li>
                </ul>

            </CardFooter>}
        </Card>
    )
}
