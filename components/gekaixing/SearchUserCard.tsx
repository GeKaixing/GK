"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ShieldCheck, UserCheck, UserPlus } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { SearchUserItem } from "@/lib/search/types"
import { isLoggedIn } from "@/store/user"

interface SearchUserCardProps {
  user: SearchUserItem
}

/**
 * 搜索「人」结果卡片：头像 + 昵称(认证徽章) + @ID + 简介 + 关注按钮。
 * 关注走 /api/follow（body 用 targetId），乐观更新失败回滚。
 */
export default function SearchUserCard({ user }: SearchUserCardProps) {
  const t = useTranslations("ImitationX.FollowCard")
  const router = useRouter()
  const [isFollowing, setIsFollowing] = useState(user.isFollowing)

  // 新搜索结果（同一 id 重新拉取）时同步最新关注状态。
  useEffect(() => {
    setIsFollowing(user.isFollowing)
  }, [user.id, user.isFollowing])

  async function handleToggleFollow(): Promise<void> {
    if (!isLoggedIn()) {
      router.push("/account")
      return
    }

    const next = !isFollowing
    setIsFollowing(next) // 乐观更新

    try {
      const res = await fetch("/api/follow", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: user.id }),
      })
      if (!res.ok) throw new Error("follow failed")
    } catch (err) {
      setIsFollowing(!next) // 回滚
      console.error(err)
    }
  }

  if (user.isSelf) {
    return null
  }

  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <Link
        href={`/gekaixing/user/${user.id}`}
        className="flex min-w-0 flex-1 items-start gap-3"
      >
        <Avatar className="size-11 shrink-0">
          <AvatarImage src={user.avatar || ""} />
          <AvatarFallback>{(user.name?.[0] ?? "u").toUpperCase()}</AvatarFallback>
        </Avatar>

        <div className="min-w-0">
          <div className="flex items-center gap-1 font-bold">
            <span className="truncate">{user.name || user.userid}</span>
            {user.isPremium && (
              <ShieldCheck className="size-4 shrink-0 text-blue-500" />
            )}
          </div>
          <p className="truncate text-sm text-muted-foreground">@{user.userid}</p>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
            {user.briefIntroduction || t("noBio")}
          </p>
        </div>
      </Link>

      <Button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          void handleToggleFollow()
        }}
        variant={isFollowing ? "outline" : "default"}
        size="sm"
        className={cn(
          "shrink-0 rounded-full font-bold",
          isFollowing
            ? "hover:border-red-400/50 hover:text-red-500"
            : "bg-primary text-primary-foreground"
        )}
      >
        {isFollowing ? (
          <>
            <UserCheck className="size-4" />
            {t("following")}
          </>
        ) : (
          <>
            <UserPlus className="size-4" />
            {t("follow")}
          </>
        )}
      </Button>
    </div>
  )
}
