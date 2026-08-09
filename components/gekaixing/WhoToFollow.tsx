"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { userStore } from "@/store/user"

interface UserProfile {
  id: string
  name: string
  handle: string
  avatar: string | null
  bio: string | null
  isFollowing: boolean
}

type RelationsResponse = { success?: boolean; users?: UserProfile[]; error?: string }
type CurrentUserResponse = { success?: boolean; id?: string; userid?: string; error?: string }

export default function WhoToFollow() {
  const t = useTranslations("ImitationX.FollowCard")
  const storeUserId = userStore((state) => state.id)
  const [currentUserId, setCurrentUserId] = useState<string>(storeUserId)
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (storeUserId) {
      setCurrentUserId(storeUserId)
    }
  }, [storeUserId])

  useEffect(() => {
    if (!currentUserId) {
      const fetchCurrentUser = async () => {
        try {
          const response = await fetch("/api/user")
          const data = (await response.json()) as CurrentUserResponse
          if (response.ok && data.success && data.id) {
            setCurrentUserId(data.id)
          }
        } catch (error) {
          console.error("Failed to fetch current user:", error)
        }
      }
      void fetchCurrentUser()
      return
    }

    let cancelled = false
    setLoading(true)

    ;(async () => {
      try {
        const res = await fetch(`/api/user/${currentUserId}/relations?type=recommended`)
        const data = (await res.json()) as RelationsResponse
        if (!cancelled && res.ok && data.success && data.users) {
          setUsers(data.users.slice(0, 3))
        } else if (!cancelled) {
          setUsers([])
        }
      } catch (error) {
        console.error("Failed to fetch recommendations:", error)
        if (!cancelled) {
          setUsers([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [currentUserId])

  const handleFollow = async (targetId: string) => {
    const target = users.find((user) => user.id === targetId)
    if (!target) {
      return
    }

    setUsers((prev) =>
      prev.map((user) =>
        user.id === targetId ? { ...user, isFollowing: !user.isFollowing } : user
      )
    )

    try {
      await fetch("/api/follow", {
        method: target.isFollowing ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId }),
      })
    } catch (error) {
      console.error("Failed to update follow status:", error)
    }
  }

  if (loading || users.length === 0) {
    return null
  }

  return (
    <div className="rounded-3xl border border-border/70 bg-background p-4 shadow-sm">
      <p className="text-lg font-bold">{t("whoToFollow")}</p>
      <div className="mt-3 flex flex-col gap-3">
        {users.map((user) => (
          <div key={user.id} className="flex items-center gap-3">
            <Link href={`/gekaixing/user/${user.id}`} className="shrink-0">
              <Avatar className="h-10 w-10">
                <AvatarImage src={user.avatar ?? ""} alt={user.name} />
                <AvatarFallback>{user.name.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={`/gekaixing/user/${user.id}`}
                className="block truncate text-sm font-bold hover:underline"
              >
                {user.name}
              </Link>
              <p className="truncate text-sm text-muted-foreground">@{user.handle}</p>
            </div>
            <button
              onClick={() => void handleFollow(user.id)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
                user.isFollowing
                  ? "border border-border text-foreground hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-500"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              }`}
            >
              {user.isFollowing ? t("following") : t("follow")}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
