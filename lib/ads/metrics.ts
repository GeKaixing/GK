import { UserActionType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export interface AdMetrics {
  impressions: number;
  clicks: number;
  /** 点击率，0~1。 */
  ctr: number;
}

/**
 * 统计某条广告帖的曝光/点击。仅统计 metadata 打上 `ad:true` 的事件，
 * 避免与同帖子的自然曝光/点击混在一起。
 */
export async function getAdMetrics(postId: string): Promise<AdMetrics> {
  const [impressions, clicks] = await Promise.all([
    prisma.userAction.count({
      where: {
        targetPostId: postId,
        actionType: UserActionType.FEED_IMPRESSION,
        metadata: { contains: '"ad":true' },
      },
    }),
    prisma.userAction.count({
      where: {
        targetPostId: postId,
        actionType: UserActionType.POST_CLICK,
        metadata: { contains: '"ad":true' },
      },
    }),
  ]);

  return {
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : 0,
  };
}
