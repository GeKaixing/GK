export type FeedTab = "foryou" | "following";

export interface FeedPostItem {
  id: string;
  content: string;
  videoUrl: string | null;
  audioUrl: string | null;
  createdAt: Date;
  user_id: string;
  user_name: string | null;
  user_email?: string | null;
  user_avatar: string | null;
  user_userid: string;
  isPremium: boolean;
  like: number;
  star: number;
  share: number;
  reply: number;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
  sharedByMe: boolean;
  /** 以下为广告/赞助字段（可选，仅首页信息流中的广告帖会设置）。 */
  isSponsored?: boolean;
  /** 展示用广告主/品牌名。 */
  sponsoredBy?: string | null;
  ctaUrl?: string | null;
  ctaLabel?: string | null;
  metrics?: {
    impressions: number;
    postClicks: number;
    repliesReceived: number;
    profileEnters: number;
    postClickRate: number;
    replyRate: number;
    profileEnterRate: number;
  };
}

export interface FeedPage {
  data: FeedPostItem[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export interface FeedCachePayload {
  postIds: string[];
  computedAt: number;
}

export interface FeedPageCachePayload {
  postIds: string[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
  computedAt: number;
}
