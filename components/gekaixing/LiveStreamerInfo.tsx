"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { UserCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StreamerInfo = {
  id: string;
  name: string | null;
  userid: string;
  avatar: string | null;
  briefIntroduction: string | null;
};

export default function LiveStreamerInfo({
  author,
  currentUserId,
  initialIsFollowing,
}: {
  author: StreamerInfo;
  currentUserId: string | null;
  initialIsFollowing: boolean;
}) {
  const t = useTranslations("ImitationX.FollowCard");
  const router = useRouter();
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [loading, setLoading] = useState(false);

  const isSelf = currentUserId === author.id;

  const handleFollow = async () => {
    if (!currentUserId) {
      router.push("/account");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/follow", {
        method: isFollowing ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: author.id }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "follow failed");
      }

      setIsFollowing((prev) => !prev);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      {/* 头像 */}
      <Link href={`/gekaixing/user/${author.id}`} className="shrink-0">
        <Avatar className="h-14 w-14">
          <AvatarImage src={author.avatar ?? undefined} />
          <AvatarFallback>
            {(author.name || author.userid || "U").slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>

      {/* 名字 + id */}
      <div className="min-w-0">
        <Link href={`/gekaixing/user/${author.id}`} className="block">
          <p className="truncate font-bold hover:underline">{author.name || `@${author.userid}`}</p>
          <p className="truncate text-sm text-muted-foreground">@{author.userid}</p>
        </Link>
      </div>

      {/* 简介 */}
      {author.briefIntroduction ? (
        <p className="min-w-0 max-w-[45ch] truncate text-sm text-muted-foreground">
          {author.briefIntroduction}
        </p>
      ) : null}

      {/* 关注按钮 */}
      <div className={cn("shrink-0", !author.briefIntroduction && "ml-auto")}>
        {!isSelf ? (
          currentUserId ? (
            <Button
              variant={isFollowing ? "outline" : "default"}
              size="sm"
              className="gap-1.5 rounded-full"
              onClick={() => void handleFollow()}
              disabled={loading}
            >
              {isFollowing ? (
                <>
                  <UserCheck className="h-4 w-4" />
                  {t("following")}
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  {t("follow")}
                </>
              )}
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="rounded-full" asChild>
              <Link href="/account">{t("follow")}</Link>
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}
