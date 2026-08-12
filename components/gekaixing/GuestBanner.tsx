"use client"

import { useTranslations } from "next-intl"
import Link from "next/link"
import { useEffect, useState } from "react"

const DISMISSED_KEY = "gkx_guest_banner_dismissed"

/**
 * 游客模式横幅：未登录用户浏览 feed 时提示当前为只读模式，
 * 并提供登录入口。由 app/gekaixing/page.tsx 在无用户时渲染。
 * 点「暂不登录」会在当前标签页会话内隐藏横幅（sessionStorage），下次新开访问再出现。
 */
export default function GuestBanner() {
  const t = useTranslations("ImitationX.GuestBanner")
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISSED_KEY) === "1")
  }, [])

  if (dismissed) return null

  return (
    <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{t("title")}</p>
        <p className="truncate text-xs text-muted-foreground">{t("description")}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => {
            sessionStorage.setItem(DISMISSED_KEY, "1")
            setDismissed(true)
          }}
          className="rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-blue-500/10 hover:text-foreground"
        >
          {t("notNow")}
        </button>
        <Link
          href="/account"
          className="rounded-full bg-blue-500 px-4 py-1.5 text-sm font-bold text-white transition-colors hover:bg-blue-600"
        >
          {t("login")}
        </Link>
      </div>
    </div>
  )
}
