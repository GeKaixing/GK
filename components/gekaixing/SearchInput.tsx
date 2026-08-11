"use client"

import { Search, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useRef, useState, type FormEvent } from "react"

import { cn } from "@/lib/utils"

interface SearchInputProps {
  /** 受控值：同时提供 value 与 onValueChange 时进入受控模式（搜索页用）。 */
  value?: string
  onValueChange?: (value: string) => void
  /** 提交（回车/点放大镜）回调；受控模式下由父级接管，不再 router.push。 */
  onSearch?: (query: string) => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
}

/**
 * 全局搜索框：右侧边栏、搜索页、探索页共用。
 * - 胶囊造型，聚焦时蓝色描边（focus-within 纯 CSS）
 * - 点放大镜或按回车提交，查询参数做 URL 编码
 * - 有内容时显示 ✕ 一键清空
 * - 自持模式：在 /gekaixing/search 打开时回显 URL query 并随导航同步
 * - 受控模式（传 value/onValueChange）：值由父级驱动，提交走 onSearch
 */
export default function SearchInput({
  value,
  onValueChange,
  onSearch,
  placeholder,
  autoFocus,
  className,
}: SearchInputProps) {
  const t = useTranslations("ImitationX.Search")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlQuery = searchParams.get("query") ?? ""

  const controlled = value !== undefined && onValueChange !== undefined

  const [internalValue, setInternalValue] = useState(() =>
    pathname === "/gekaixing/search" ? urlQuery : ""
  )
  const [prevUrlQuery, setPrevUrlQuery] = useState(urlQuery)

  // 自持模式：搜索页 URL query 变化（再次提交、前进/后退）时同步输入框。
  // 用 prevUrlQuery 守卫而非内部值，避免把用户正在输入的内容清掉。
  if (!controlled && pathname === "/gekaixing/search" && prevUrlQuery !== urlQuery) {
    setPrevUrlQuery(urlQuery)
    setInternalValue(urlQuery)
  }

  const inputRef = useRef<HTMLInputElement>(null)
  const currentValue = controlled ? value ?? "" : internalValue

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault()
    const query = currentValue.trim()
    if (!query) return
    inputRef.current?.blur()
    if (controlled) {
      onSearch?.(query)
    } else {
      router.push(`/gekaixing/search/?query=${encodeURIComponent(query)}`)
    }
  }

  function handleClear(): void {
    if (controlled) {
      onValueChange?.("")
    } else {
      setInternalValue("")
    }
    inputRef.current?.focus()
  }

  function handleChange(next: string): void {
    if (controlled) {
      onValueChange?.(next)
    } else {
      setInternalValue(next)
    }
  }

  const label = placeholder ?? t("placeholder")

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className={cn(
        "flex h-10 items-center gap-1 rounded-full border border-border bg-background px-3 transition-colors focus-within:border-blue-500",
        className
      )}
    >
      <button
        type="submit"
        aria-label={label}
        className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <Search className="size-4" />
      </button>
      <input
        ref={inputRef}
        type="text"
        value={currentValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={label}
        aria-label={label}
        autoFocus={autoFocus}
        className="h-full w-full border-0 bg-transparent text-sm focus:outline-none focus:ring-0"
      />
      {currentValue.length > 0 && (
        <button
          type="button"
          onClick={handleClear}
          aria-label={t("clear")}
          className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </form>
  )
}
