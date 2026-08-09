"use client"

import { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

/**
 * 主内容列。
 * 聊天页（/gekaixing/gkx、/gekaixing/chat）右侧栏隐藏，主区加宽到
 * 「信息流 600px + 右侧栏 290/350px」的组合宽度，因此布局总宽度与
 * 普通页面一致，导航/内容位置不跳动。
 */
export default function ChatMain({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  const isFullWidthChat =
    pathname === "/gekaixing/gkx" ||
    pathname.startsWith("/gekaixing/gkx/") ||
    pathname === "/gekaixing/chat" ||
    pathname.startsWith("/gekaixing/chat/")

  return (
    <main
      className={cn(
        "flex-1 border-x border-border",
        isFullWidthChat ? "max-w-[890px] xl:max-w-[950px]" : "max-w-[600px]"
      )}
    >
      {children}
    </main>
  )
}
