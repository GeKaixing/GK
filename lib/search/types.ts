import type { FeedPostItem } from "@/lib/feed/types"

/**
 * `/api/sreach` 返回的单条帖子（key 沿用接口既有的扁平命名）。
 */
export interface SearchPostItem {
  id: string
  user_id: string
  user_name: string
  user_email: string
  user_avatar: string
  user_userid: string
  content: string
  videoUrl: string | null
  audioUrl: string | null
  createdAt: string
  like: number
  star: number
  reply_count: number
  share: number
  isPremium: boolean
  likedByMe: boolean
  bookmarkedByMe: boolean
  sharedByMe: boolean
}

/**
 * `/api/user/search` 返回的单条用户。
 */
export interface SearchUserItem {
  id: string
  userid: string
  name: string | null
  avatar: string | null
  briefIntroduction: string | null
  isPremium: boolean
  followers: number
  isFollowing: boolean
  isSelf: boolean
}

export interface SearchPostsResponse {
  data: SearchPostItem[]
  success: boolean
}

export interface SearchUsersResponse {
  data: SearchUserItem[]
  success: boolean
}

export function mapSearchPostToFeedPost(raw: SearchPostItem): FeedPostItem {
  return {
    id: raw.id,
    content: raw.content,
    videoUrl: raw.videoUrl,
    audioUrl: raw.audioUrl,
    createdAt: new Date(raw.createdAt),
    user_id: raw.user_id,
    user_name: raw.user_name,
    user_email: raw.user_email,
    user_avatar: raw.user_avatar,
    user_userid: raw.user_userid,
    isPremium: raw.isPremium,
    like: raw.like,
    star: raw.star,
    share: raw.share,
    reply: raw.reply_count,
    likedByMe: raw.likedByMe,
    bookmarkedByMe: raw.bookmarkedByMe,
    sharedByMe: raw.sharedByMe,
  }
}
