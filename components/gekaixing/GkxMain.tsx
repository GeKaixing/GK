"use client"

import { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

/**
 * gkx 聊天页加宽主区（Grok 风格需要更宽的聊天区），
 * 其它页面保持 600px 信息流宽度。
 */
export default function GkxMain({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isGkxRoute =
    pathname === "/gekaixing/gkx" || pathname.startsWith("/gekaixing/gkx/")

  return (
    <main
      className={cn(
        "flex-1 w-full border-x border-border",
        isGkxRoute ? "max-w-[1100px]" : "max-w-[600px]"
      )}
    >
      {children}
    </main>
  )
}
