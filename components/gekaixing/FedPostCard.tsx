"use client";

import { useState } from "react";
import { Heart, MessageCircleMore, UserPlus, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { isLoggedIn } from "@/store/user";
import FedReplyDialog from "./FedReplyDialog";

/**
 * Card for federated (remote-country) posts. Content is sanitized server-side.
 * RFC-012 interactions: follow the remote author, like the remote post, and
 * reply to it. Guests are redirected to /account on interaction.
 */
export interface FedPostCardProps {
  sourceCountryId: string;
  sourceCountryName: string;
  actorId: string;
  did: string;
  objectId: string; // the source post's id in its country (like/reply target)
  content: string | null;
  authorName: string | null;
  authorHandle: string | null;
  authorAvatar: string | null;
  createdAt: string;
  viewerId?: string | null;
  isFollowing?: boolean;
  likedByMe?: boolean;
  remoteLikeCount?: number;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FedPostCard(props: FedPostCardProps) {
  const {
    sourceCountryId,
    sourceCountryName,
    actorId,
    objectId,
    content,
    authorName,
    authorHandle,
    authorAvatar,
    createdAt,
    viewerId,
    isFollowing = false,
    likedByMe = false,
    remoteLikeCount = 0,
  } = props;

  const router = useRouter();
  const t = useTranslations("ImitationX.Federated");
  const [following, setFollowing] = useState(isFollowing);
  const [followLoading, setFollowLoading] = useState(false);
  const [liked, setLiked] = useState(likedByMe);
  const [likeCount, setLikeCount] = useState(remoteLikeCount);
  const [likeLoading, setLikeLoading] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  const requireLogin = () => {
    if (!viewerId || !isLoggedIn()) {
      router.push("/account");
      return true;
    }
    return false;
  };

  async function handleFollow() {
    if (followLoading) return;
    if (requireLogin()) return;
    setFollowLoading(true);
    const prev = following;
    setFollowing(!prev);
    try {
      const res = await fetch("/api/fed/follow", {
        method: prev ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryId: sourceCountryId, actorId }),
      });
      const data = await res.json();
      if (!data?.success) setFollowing(prev);
    } catch {
      setFollowing(prev);
    } finally {
      setFollowLoading(false);
    }
  }

  async function handleLike() {
    if (likeLoading) return;
    if (requireLogin()) return;
    setLikeLoading(true);
    const prevLiked = liked;
    const prevCount = likeCount;
    setLiked(!prevLiked);
    setLikeCount(prevLiked ? Math.max(likeCount - 1, 0) : likeCount + 1);
    try {
      const res = await fetch("/api/fed/like", {
        method: prevLiked ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryId: sourceCountryId,
          actorId,
          objectId,
        }),
      });
      const data = await res.json();
      if (!data?.success) {
        setLiked(prevLiked);
        setLikeCount(prevCount);
      }
    } catch {
      setLiked(prevLiked);
      setLikeCount(prevCount);
    } finally {
      setLikeLoading(false);
    }
  }

  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="flex-row items-center gap-3 space-y-0 pb-2">
        <Avatar className="h-10 w-10">
          <AvatarImage src={authorAvatar ?? ""} alt={authorName ?? ""} />
          <AvatarFallback>{(authorName ?? "?").slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{authorName ?? "Unknown"}</span>
            {authorHandle ? (
              <span className="truncate text-sm text-muted-foreground">@{authorHandle}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden>🌍</span>
            <span>{sourceCountryName}</span>
            <span aria-hidden>·</span>
            <span>{formatTime(createdAt)}</span>
          </div>
        </div>
        <Button
          variant={following ? "secondary" : "default"}
          size="sm"
          onClick={handleFollow}
          disabled={followLoading}
          aria-label={following ? "Unfollow remote author" : "Follow remote author"}
        >
          {following ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          <span className="hidden sm:inline">{following ? t("following") : t("follow")}</span>
        </Button>
      </CardHeader>

      <CardContent className="pt-1">
        {/* Safe: sanitized server-side on inbound. */}
        <div
          className="break-words [&_img]:rounded-xl [&_a]:text-primary [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: content ?? "" }}
        />
      </CardContent>

      <CardFooter className="pt-2">
        <ul className="flex w-full items-center gap-6 text-sm text-muted-foreground">
          <li>
            <button
              type="button"
              onClick={handleLike}
              disabled={likeLoading}
              className={`flex items-center gap-1.5 transition-colors hover:text-red-500 ${liked ? "text-red-500" : ""} ${likeLoading ? "opacity-50" : ""}`}
              aria-label={liked ? "Unlike remote post" : "Like remote post"}
            >
              <Heart className={liked ? "fill-current" : ""} />
              {likeCount}
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                if (requireLogin()) return;
                setReplyOpen(true);
              }}
              className="flex items-center gap-1.5 transition-colors hover:text-green-500"
              aria-label="Reply to remote post"
            >
              <MessageCircleMore />
            </button>
          </li>
        </ul>
      </CardFooter>

      <FedReplyDialog
        countryId={sourceCountryId}
        actorId={actorId}
        remotePostId={objectId}
        open={replyOpen}
        onOpenChange={setReplyOpen}
      />
    </Card>
  );
}
