"use client";

import Link from "next/link";
import { Eye, Radio } from "lucide-react";
import { useTranslations } from "next-intl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export type LiveStreamListItem = {
  id: string;
  authorId: string;
  author: {
    id: string;
    name: string | null;
    avatar: string | null;
    userid: string;
  } | null;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  streamUrl: string | null;
  thumbnailUrl: string | null;
  viewerCount: number;
  startedAt: string | null;
  scheduledAt: string | null;
  endedAt: string | null;
};

export default function LiveStreamCard({ stream }: { stream: LiveStreamListItem }) {
  const t = useTranslations("ImitationX.Live");
  const isLive = stream.status === "LIVE";
  const isEnded = stream.status === "ENDED";

  return (
    <Link
      href={`/gekaixing/live/${stream.id}`}
      className="group block overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm transition-colors hover:border-primary/30"
    >
      {/* 封面区 */}
      <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-muted via-muted/60 to-muted/20">
        {stream.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={stream.thumbnailUrl}
            alt={stream.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Radio className="h-12 w-12 text-muted-foreground/40" />
          </div>
        )}

        {/* 状态徽章 */}
        {isLive ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            {t("liveBadge")}
          </span>
        ) : (
          <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-semibold text-white backdrop-blur">
            {t(isEnded ? "ended" : "scheduled")}
          </span>
        )}

        {/* 观众数 */}
        {isLive ? (
          <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
            <Eye className="h-3.5 w-3.5" />
            {stream.viewerCount}
          </span>
        ) : null}
      </div>

      {/* 信息区 */}
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{stream.title}</h3>
          {stream.category ? (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {t(`category.${stream.category}`)}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Avatar className="h-5 w-5">
            <AvatarImage src={stream.author?.avatar ?? undefined} />
            <AvatarFallback>{(stream.author?.name || stream.author?.userid || "U").slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className={cn("truncate", stream.authorId === stream.author?.id && "font-medium text-foreground")}>
            {stream.author?.name || `@${stream.author?.userid || "user"}`}
          </span>
        </div>
      </div>
    </Link>
  );
}
