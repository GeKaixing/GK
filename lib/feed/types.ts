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
