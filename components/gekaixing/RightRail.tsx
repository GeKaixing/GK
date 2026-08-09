"use client"

import { ReactNode } from "react"
import { usePathname } from "next/navigation"

/**
 * 右侧栏：普通页面显示 Footer；
 * 全宽聊天页（AI 聊天 /gekaixing/gkx、私信 /gekaixing/chat）隐藏右侧栏，
 * 由 ChatMain 将聊天区加宽到同等宽度，保持布局总宽度不变。
 */
export default function RightRail({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  const isFullWidthChat =
    pathname === "/gekaixing/gkx" ||
    pathname.startsWith("/gekaixing/gkx/") ||
    pathname === "/gekaixing/chat" ||
    pathname.startsWith("/gekaixing/chat/")

  if (isFullWidthChat) return null

  return (
    <footer className="hidden lg:flex w-[290px] xl:w-[350px] shrink-0 pl-4 sticky top-0 h-screen overflow-y-auto">
      {children}
    </footer>
  )
}
