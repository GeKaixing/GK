"use client"

import { ReactNode } from "react"
import { usePathname } from "next/navigation"

/**
 * 反向的 ShowOnGkx：在 gkx 聊天页面隐藏子内容（右侧栏）。
 */
export default function HideOnGkx({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isGkxRoute =
    pathname === "/gekaixing/gkx" || pathname.startsWith("/gekaixing/gkx/")

  if (isGkxRoute) return null

  return <>{children}</>
}
