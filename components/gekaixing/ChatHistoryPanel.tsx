"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { History, Search, Trash2, X } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

type Session = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

type GroupKey =
  | "dateToday"
  | "dateYesterday"
  | "datePrev7"
  | "datePrev30"
  | "dateOlder"

const GROUP_ORDER: GroupKey[] = [
  "dateToday",
  "dateYesterday",
  "datePrev7",
  "datePrev30",
  "dateOlder",
]

function startOfDay(d: Date): number {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.getTime()
}

/** 按会话更新时间归入「今天 / 昨天 / 近 7 天 / 近 30 天 / 更早」 */
function groupOf(updatedAt: string): GroupKey {
  const diffDays = Math.round(
    (startOfDay(new Date()) - startOfDay(new Date(updatedAt))) / 86_400_000
  )
  if (diffDays <= 0) return "dateToday"
  if (diffDays === 1) return "dateYesterday"
  if (diffDays <= 7) return "datePrev7"
  if (diffDays <= 30) return "datePrev30"
  return "dateOlder"
}

export default function ChatHistoryPanel({
  open,
  onOpenChange,
  currentSessionId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentSessionId?: string
}) {
  const t = useTranslations("ImitationX.Gkx")
  const router = useRouter()

  const [sessions, setSessions] = useState<Session[]>([])
  // 面板每次打开都会重挂载，初始即为加载态
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadSessions = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/chat/sessions")
      if (!res.ok) throw new Error()
      const data = (await res.json()) as { data?: Session[] }
      setSessions(data.data ?? [])
    } catch {
      toast.error(t("loadHistoryFailed"))
    } finally {
      setLoading(false)
    }
  }, [t])

  /** 每次打开都重新拉取，保证列表最新（面板通过 key 重挂载，状态天然重置） */
  useEffect(() => {
    if (!open) return
    void loadSessions()
  }, [open, loadSessions])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sessions
    return sessions.filter((s) =>
      s.title.toLowerCase().includes(q)
    )
  }, [sessions, search])

  const groups = useMemo(() => {
    const map = new Map<GroupKey, Session[]>()
    for (const s of filtered) {
      const key = groupOf(s.updatedAt)
      const arr = map.get(key) ?? []
      arr.push(s)
      map.set(key, arr)
    }
    return GROUP_ORDER.filter((k) => (map.get(k)?.length ?? 0) > 0).map(
      (k) => ({ key: k, items: map.get(k)! })
    )
  }, [filtered])

  /** 点击历史：关闭面板并跳转加载该会话 */
  const openSession = useCallback(
    (sessionId: string): void => {
      onOpenChange(false)
      if (sessionId !== currentSessionId) {
        router.push(`/gekaixing/gkx/${sessionId}`)
      }
    },
    [currentSessionId, onOpenChange, router]
  )

  const handleDelete = useCallback(
    async (sessionId: string): Promise<void> => {
      setDeletingId(sessionId)
      try {
        const res = await fetch("/api/chat/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        })
        if (!res.ok) throw new Error()

        setSessions((prev) => prev.filter((s) => s.id !== sessionId))
        setConfirmingId(null)
        toast.success(t("deleteSuccess"))

        // 删除的是当前正在看的会话 → 回到新建对话
        if (sessionId === currentSessionId) {
          onOpenChange(false)
          router.push("/gekaixing/gkx")
        }
      } catch {
        toast.error(t("deleteFailedRetry"))
      } finally {
        setDeletingId(null)
      }
    },
    [currentSessionId, onOpenChange, router, t]
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" />
            {t("history")}
          </SheetTitle>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-9 w-full rounded-lg border border-border bg-muted/40 pr-8 pl-8 text-sm outline-none focus:border-primary/50 focus:bg-background"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label={t("searchPlaceholder")}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center p-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground/60" />
            </div>
          ) : groups.length === 0 ? (
            <div className="p-8 text-center">
              <History className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {t("emptyHistory")}
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.key} className="px-2 py-1">
                <p className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">
                  {t(group.key)}
                </p>
                {group.items.map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      "group relative flex items-center rounded-lg",
                      s.id === currentSessionId && "bg-muted/60"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => openSession(s.id)}
                      className={cn(
                        "min-w-0 flex-1 truncate rounded-lg px-3 py-2 pr-10 text-left text-sm hover:bg-muted/60",
                        s.id === currentSessionId
                          ? "font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {s.title || t("untitled")}
                    </button>

                    {confirmingId === s.id ? (
                      <div className="absolute right-1 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleDelete(s.id)}
                          disabled={deletingId === s.id}
                          className="rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground disabled:opacity-60"
                        >
                          {t("deleteSession")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          aria-label={t("cancel")}
                          className="rounded-md p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingId(s.id)}
                        aria-label={t("deleteSession")}
                        className="absolute right-1 rounded-md p-1.5 text-muted-foreground opacity-0 hover:bg-muted/60 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
