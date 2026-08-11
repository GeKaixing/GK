"use client"

import { useTranslations } from "next-intl"
import Link from "next/link"

/**
 * 游客模式横幅：未登录用户浏览 feed 时提示当前为只读模式，
 * 并提供登录入口。由 app/gekaixing/page.tsx 在无用户时渲染。
 */
export default function GuestBanner() {
  const t = useTranslations("ImitationX.GuestBanner")

  return (
    <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{t("title")}</p>
        <p className="truncate text-xs text-muted-foreground">{t("description")}</p>
      </div>
      <Link
        href="/account"
        className="shrink-0 rounded-full bg-blue-500 px-4 py-1.5 text-sm font-bold text-white transition-colors hover:bg-blue-600"
      >
        {t("login")}
      </Link>
    </div>
  )
}
