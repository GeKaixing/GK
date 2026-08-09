"use client"

import Link from "next/link"
import { MessageSquare, Plus, Search, Sparkles, Trash2 } from "lucide-react"
import { AiSession, useAiSessions } from "@/store/AiSessions"
import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

type DateGroupKey = "today" | "yesterday" | "prev7" | "prev30" | "older"

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function getDateGroup(updatedAt: Date): DateGroupKey {
  const startOfToday = startOfDay(new Date())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfToday.getDate() - 1)
  const startOfUpdated = startOfDay(updatedAt)

  if (startOfUpdated >= startOfToday) return "today"
  if (startOfUpdated >= startOfYesterday) return "yesterday"

  const dayDiff = Math.floor(
    (startOfToday.getTime() - startOfUpdated.getTime()) / (24 * 60 * 60 * 1000)
  )
  if (dayDiff <= 7) return "prev7"
  if (dayDiff <= 30) return "prev30"
  return "older"
}

export default function GkxAiSidebar({
  sessions,
  userId: _userId,
  modelLabel,
}: {
  sessions: AiSession[]
  userId: string
  modelLabel?: string
}) {
  const t = useTranslations("ImitationX.Gkx")
  const router = useRouter()
  const pathname = usePathname()

  // 判断当前 session 是否 active
  const isActiveSession = (sessionId: string) => {
    return pathname === `/gekaixing/gkx/${sessionId}`
  }

  // store
  const {
    sessions: storeSessions,
    setSessions,
    removeSession,
  } = useAiSessions()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  // 同步 sessions 到 store
  useEffect(() => {
    setSessions(sessions)
  }, [sessions, setSessions])

  // 搜索过滤 + 排序 + 日期分组
  const groupedSessions = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    const filtered = [...storeSessions]
      .filter((session) =>
        keyword ? (session.title || "").toLowerCase().includes(keyword) : true
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )

    const groups: { key: DateGroupKey; sessions: AiSession[] }[] = [
      { key: "today", sessions: [] },
      { key: "yesterday", sessions: [] },
      { key: "prev7", sessions: [] },
      { key: "prev30", sessions: [] },
      { key: "older", sessions: [] },
    ]

    filtered.forEach((session) => {
      const key = getDateGroup(new Date(session.updatedAt))
      const group = groups.find((g) => g.key === key)
      group?.sessions.push(session)
    })

    return groups.filter((group) => group.sessions.length > 0)
  }, [storeSessions, query])

  const groupLabel: Record<DateGroupKey, string> = {
    today: t("dateToday"),
    yesterday: t("dateYesterday"),
    prev7: t("datePrev7"),
    prev30: t("datePrev30"),
    older: t("dateOlder"),
  }

  const handleNewSession = () => {
    router.push(`/gekaixing/gkx`)
  }

  async function handleDeleteSession(sessionId: string): Promise<void> {
    if (deletingId) return
    setDeletingId(sessionId)

    try {
      const res = await fetch("/api/chat/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId }),
      })

      if (!res.ok) {
        throw new Error(t("deleteFailed"))
      }

      removeSession(sessionId)
      toast.success(t("deleteSuccess"))

      if (isActiveSession(sessionId)) {
        router.push("/gekaixing/gkx")
      }
    } catch (error) {
      console.error(t("deleteFailed"), error)
      toast.error(t("deleteFailedRetry"))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* 模型 / 品牌 */}
      <div className="mb-3 flex items-center gap-2 px-1">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/60"
        >
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="truncate">{modelLabel || "GKX"}</span>
        </button>
      </div>

      {/* 新对话按钮 */}
      <div className="mb-2">
        <button
          onClick={handleNewSession}
          className="w-full flex items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus size={16} strokeWidth={3} />
          <span>{t("newChat")}</span>
        </button>
      </div>

      {/* 搜索框 */}
      <div className="mb-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-full border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* 历史记录 */}
      <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
        {groupedSessions.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground italic">
            {t("emptyHistory")}
          </div>
        ) : (
          groupedSessions.map((group) => (
            <div key={group.key} className="mb-3 space-y-1">
              <div className="px-2 py-1 text-xs font-bold text-muted-foreground">
                {groupLabel[group.key]}
              </div>
              {group.sessions.map((session) => {
                const isActive = isActiveSession(session.id)

                return (
                  <div
                    key={session.id}
                    className={cn(
                      "group flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-all overflow-hidden",
                      "hover:bg-muted/60 hover:text-foreground",
                      isActive
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    <Link
                      href={`/gekaixing/gkx/${session.id}`}
                      className="flex min-w-0 flex-1 items-center gap-2"
                    >
                      <span className="truncate flex-1">
                        {session.title || t("untitled")}
                      </span>
                    </Link>

                    <button
                      type="button"
                      aria-label={t("deleteSession")}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        void handleDeleteSession(session.id)
                      }}
                      disabled={deletingId === session.id}
                      className={cn(
                        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-opacity",
                        "opacity-0 group-hover:opacity-100",
                        "hover:bg-destructive/10 hover:text-destructive",
                        deletingId === session.id && "opacity-100 cursor-not-allowed"
                      )}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
