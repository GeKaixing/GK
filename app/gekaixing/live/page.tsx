import Link from "next/link";
import { Radio } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";
import ArrowLeftBack from "@/components/gekaixing/ArrowLeftBack";
import GoLiveDialog from "@/components/gekaixing/GoLiveDialog";
import LiveStreamCard, { type LiveStreamListItem } from "@/components/gekaixing/LiveStreamCard";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TABS = ["live", "following", "scheduled", "ended"] as const;
type TabKey = (typeof TABS)[number];

function getSingleValue(value: string | string[] | undefined): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return "";
}

const STATUS_TABS = ["live", "scheduled", "ended"] as const;
type StatusTabKey = (typeof STATUS_TABS)[number];

const STATUS_BY_TAB: Record<StatusTabKey, string> = {
  live: "LIVE",
  scheduled: "SCHEDULED",
  ended: "ENDED",
};

type StreamRow = {
  id: string;
  authorId: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  streamUrl: string | null;
  thumbnailUrl: string | null;
  viewerCount: number;
  startedAt: Date;
  scheduledAt: Date | null;
  endedAt: Date | null;
  author: {
    id: string;
    name: string | null;
    avatar: string | null;
    userid: string;
  };
};

const AUTHOR_SELECT = {
  select: {
    id: true,
    name: true,
    avatar: true,
    userid: true,
  },
} as const;

/** 正在关注：展示所关注主播的直播，直播中 → 预告 → 已结束。 */
async function queryFollowedStreams(userId: string | undefined): Promise<StreamRow[]> {
  if (!userId) {
    return [];
  }

  const follows = await prisma.follow.findMany({
    where: { followerId: userId, status: "FOLLOWING" },
    select: { followingId: true },
  });
  const followingIds = follows.map((follow) => follow.followingId);
  if (!followingIds.length) {
    return [];
  }

  const [live, scheduled, ended] = await Promise.all([
    prisma.liveStream.findMany({
      where: { authorId: { in: followingIds }, status: "LIVE" },
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { author: AUTHOR_SELECT },
    }),
    prisma.liveStream.findMany({
      where: { authorId: { in: followingIds }, status: "SCHEDULED" },
      orderBy: { scheduledAt: "desc" },
      take: 50,
      include: { author: AUTHOR_SELECT },
    }),
    prisma.liveStream.findMany({
      where: { authorId: { in: followingIds }, status: "ENDED" },
      orderBy: { endedAt: "desc" },
      take: 50,
      include: { author: AUTHOR_SELECT },
    }),
  ]);

  return [...live, ...scheduled, ...ended];
}

async function queryStreams(tab: TabKey, userId: string | undefined): Promise<StreamRow[]> {
  if (tab === "following") {
    return queryFollowedStreams(userId);
  }
  return prisma.liveStream.findMany({
    where: { status: STATUS_BY_TAB[tab] },
    orderBy: { startedAt: "desc" },
    take: 100,
    include: { author: AUTHOR_SELECT },
  });
}

function serializeStream(stream: StreamRow): LiveStreamListItem {
  return {
    id: stream.id,
    authorId: stream.authorId,
    author: stream.author,
    title: stream.title,
    description: stream.description,
    category: stream.category,
    status: stream.status,
    streamUrl: stream.streamUrl,
    thumbnailUrl: stream.thumbnailUrl,
    viewerCount: stream.viewerCount,
    startedAt: stream.startedAt.toISOString(),
    scheduledAt: stream.scheduledAt?.toISOString() ?? null,
    endedAt: stream.endedAt?.toISOString() ?? null,
  };
}

export default async function LivePage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const t = await getTranslations("ImitationX.Live");

  const rawTab = getSingleValue(params.tab);
  const tab: TabKey = TABS.includes(rawTab as TabKey) ? (rawTab as TabKey) : "live";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let streams: Awaited<ReturnType<typeof queryStreams>> = [];
  try {
    streams = await queryStreams(tab, user?.id);
  } catch (error) {
    // DB 瞬时连接超时等 → 优雅降级为空列表，避免整页崩溃
    console.error("Failed to load live streams:", error);
    streams = [];
  }

  const isEmptyFollowing = tab === "following" && streams.length === 0;

  return (
    <div>
      <div className="sticky top-14 z-10 border-b border-border bg-background/90 backdrop-blur sm:top-0">
        <ArrowLeftBack name={t("title")} href="/gekaixing" />

        {/* 顶部操作栏 */}
        <div className="flex items-center justify-between gap-2 px-4 pb-3">
          {/* tab 切换 */}
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {TABS.map((key) => (
              <Link
                key={key}
                href={key === "live" ? "/gekaixing/live" : `/gekaixing/live?tab=${key}`}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
                  tab === key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {t(`tab.${key}`)}
              </Link>
            ))}
          </div>

          <GoLiveDialog />
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6">
        {streams.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {streams.map((stream) => (
              <LiveStreamCard key={stream.id} stream={serializeStream(stream)} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/80 bg-muted/20 px-6 py-16 text-center">
            <Radio className="h-10 w-10 text-muted-foreground/50" />
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">
                {t(isEmptyFollowing ? "emptyFollowingTitle" : "emptyTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t(isEmptyFollowing ? "emptyFollowingDescription" : "emptyDescription")}
              </p>
            </div>
            {isEmptyFollowing ? (
              <Link
                href="/gekaixing/live"
                className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {t("goDiscover")}
              </Link>
            ) : (
              <GoLiveDialog />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
