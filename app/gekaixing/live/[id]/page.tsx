import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Eye, Radio } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";
import LiveWatchRoom from "@/components/gekaixing/LiveWatchRoom";
import LivePlayer from "@/components/gekaixing/LivePlayer";
import LiveChat from "@/components/gekaixing/LiveChat";
import LiveEndStreamButton from "@/components/gekaixing/LiveEndStreamButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

async function queryStream(id: string) {
  return prisma.liveStream.findUnique({
    where: { id },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          avatar: true,
          userid: true,
        },
      },
    },
  });
}

export default async function LiveWatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  const t = await getTranslations("ImitationX.Live");

  const supabase = await createClient();
  let currentUserId: string | null = null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    currentUserId = user?.id ?? null;
  } catch {
    currentUserId = null;
  }

  let stream: Awaited<ReturnType<typeof queryStream>> | null = null;
  try {
    stream = await queryStream(id);
  } catch (error) {
    // DB 瞬时连接超时等 → 404，避免整页崩溃
    console.error("Failed to load live stream:", error);
    stream = null;
  }

  if (!stream) {
    notFound();
  }

  const isLive = stream.status === "LIVE";
  const isHost = currentUserId === stream.authorId;

  const formattedStartTime = new Intl.DateTimeFormat("default", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(
    new Date(stream.status === "SCHEDULED" && stream.scheduledAt ? stream.scheduledAt : stream.startedAt)
  );

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] w-full flex-col">
      {/* 顶栏（GKX 风格） */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/gekaixing/live"
            aria-label={t("backToLive")}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>

          {isLive ? (
            <Badge className="gap-1.5 rounded-full bg-red-600 text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              {t("liveBadge")}
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1.5 rounded-full">
              <Radio className="h-3 w-3" />
              {t(stream.status === "ENDED" ? "ended" : "scheduled")}
            </Badge>
          )}

          <h1 className="truncate text-base font-bold sm:text-lg">{stream.title}</h1>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isLive ? (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <Eye className="h-4 w-4" />
              {stream.viewerCount}
            </span>
          ) : null}
          {isHost && isLive ? <LiveEndStreamButton streamId={stream.id} /> : null}
        </div>
      </header>

      {/* 内容区：视频/信息 + 聊天 */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="px-4 py-4 lg:px-6">
            {/* 视频区 */}
            {isLive ? (
              stream.streamUrl ? (
                <LivePlayer streamUrl={stream.streamUrl} title={stream.title} poster={stream.thumbnailUrl} />
              ) : (
                <LiveWatchRoom streamId={stream.id} isHost={isHost} />
              )
            ) : (
              <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-muted to-background">
                {stream.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={stream.thumbnailUrl}
                    alt={stream.title}
                    className="absolute inset-0 h-full w-full object-cover opacity-60"
                  />
                ) : (
                  <Radio className="h-16 w-16 text-muted-foreground/40" />
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/30 text-center">
                  <p className="text-lg font-semibold">
                    {t(stream.status === "ENDED" ? "streamEnded" : "notStartedYet")}
                  </p>
                </div>
              </div>
            )}

            {/* 直播信息 */}
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11">
                  <AvatarImage src={stream.author.avatar ?? undefined} />
                  <AvatarFallback>
                    {(stream.author.name || stream.author.userid || "U").slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {stream.author.name || `@${stream.author.userid}`}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">@{stream.author.userid}</p>
                </div>
                {stream.category ? (
                  <Badge variant="secondary" className="ml-auto shrink-0 rounded-full">
                    {t(`category.${stream.category}`)}
                  </Badge>
                ) : null}
              </div>

              {stream.description ? (
                <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">
                  {stream.description}
                </p>
              ) : null}

              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarClock className="h-4 w-4" />
                <span>{formattedStartTime}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 桌面端右侧聊天栏 */}
        <aside className="hidden w-[320px] shrink-0 flex-col border-l border-border lg:flex">
          <LiveChat streamId={stream.id} streamStatus={stream.status} />
        </aside>
      </div>

      {/* 移动端底部聊天 */}
      <div className="h-[360px] shrink-0 border-t border-border lg:hidden">
        <LiveChat streamId={stream.id} streamStatus={stream.status} />
      </div>
    </div>
  );
}
