"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { ArrowLeft, FileSearch, Search } from "lucide-react"
import { useTranslations } from "next-intl"

import PostCard from "@/components/gekaixing/PostCard"
import SearchInput from "@/components/gekaixing/SearchInput"
import SearchUserCard from "@/components/gekaixing/SearchUserCard"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useSearchResults } from "@/lib/search/use-search"

interface SearchMainProps {
  initialQuery: string
}

const DEBOUNCE_MS = 300

function PostSkeleton() {
  return (
    <div className="flex items-start gap-3 border-b border-border py-3">
      <Skeleton className="size-11 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  )
}

/**
 * 搜索页主体：sticky 搜索栏 + 输入即搜（防抖）+ 人/帖分区结果。
 * 状态机：空 query → hero；加载 → 骨架屏；失败 → 错误 + 重试；否则结果。
 */
export default function SearchMain({ initialQuery }: SearchMainProps) {
  const t = useTranslations("ImitationX.SearchPage")
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlQuery = searchParams.get("query") ?? ""

  const [query, setQuery] = useState(initialQuery)
  const [committedQuery, setCommittedQuery] = useState(initialQuery.trim())
  const [retryKey, setRetryKey] = useState(0)

  const { people, posts, loading, error } = useSearchResults(committedQuery, retryKey)

  // 输入防抖：停下 300ms 才提交（触发搜索 + URL 同步）。
  useEffect(() => {
    const id = setTimeout(() => setCommittedQuery(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [query])

  // URL 同步：提交的词写入 ?query=；清空则移除。首帧跳过（URL 已是服务端给的）。
  // 记录最后一次「由本组件写入」的 query，用于区分外部 URL 变化。
  const lastWrittenRef = useRef(initialQuery.trim())
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    lastWrittenRef.current = committedQuery
    if (committedQuery) {
      router.replace(`/gekaixing/search?query=${encodeURIComponent(committedQuery)}`, {
        scroll: false,
      })
    } else {
      router.replace("/gekaixing/search", { scroll: false })
    }
  }, [committedQuery, router])

  // 外部 URL 变化（右侧栏搜索框提交、前进/后退）→ 同步输入框与结果。
  useEffect(() => {
    if (urlQuery === lastWrittenRef.current) {
      return
    }
    lastWrittenRef.current = urlQuery
    const trimmed = urlQuery.trim()
    setQuery(trimmed)
    setCommittedQuery(trimmed)
  }, [urlQuery])

  // Enter / 点放大镜：立即提交，不等防抖。
  function handleSearch(next: string): void {
    setCommittedQuery(next.trim())
  }

  const hasQuery = query.trim().length > 0
  const showSkeleton = loading && people.length === 0 && posts.length === 0
  const hasResults = people.length > 0 || posts.length > 0

  return (
    <div>
      <div className="sticky top-14 z-10 border-b border-border bg-background/95 backdrop-blur sm:top-0">
        <div className="flex items-center gap-3 px-4 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label={t("back")}
            className="rounded-full p-2 transition-colors hover:bg-muted/70"
          >
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="text-xl font-bold">{t("title")}</h1>
        </div>
        <div className="px-4 py-2">
          <SearchInput value={query} onValueChange={setQuery} onSearch={handleSearch} />
        </div>
      </div>

      <div className="px-4 pt-4">
        {!hasQuery ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-muted">
              <Search className="size-7 text-muted-foreground" />
            </div>
            <p className="text-lg font-bold">{t("heroTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("heroHint")}</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <FileSearch className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("error")}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRetryKey((k) => k + 1)}
            >
              {t("retry")}
            </Button>
          </div>
        ) : showSkeleton ? (
          <div className="flex flex-col">
            {Array.from({ length: 4 }).map((_, i) => (
              <PostSkeleton key={i} />
            ))}
          </div>
        ) : !hasResults ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <FileSearch className="size-10 text-muted-foreground" />
            <p className="text-lg font-bold">
              {t("noResultsTitle", { query: committedQuery })}
            </p>
            <p className="text-sm text-muted-foreground">{t("noResultsHint")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {people.length > 0 && (
              <section>
                <h2 className="mb-1 text-sm font-bold text-muted-foreground">
                  {t("peopleSection", { count: people.length })}
                </h2>
                <div className="flex flex-col">
                  {people.map((user) => (
                    <SearchUserCard key={user.id} user={user} />
                  ))}
                </div>
              </section>
            )}

            {posts.length > 0 && (
              <section>
                <h2 className="mb-1 text-sm font-bold text-muted-foreground">
                  {t("postsSection", { count: posts.length })}
                </h2>
                <div className="flex flex-col gap-4">
                  {posts.map((post) => (
                    <PostCard key={post.id} {...post} highlightQuery={committedQuery} />
                  ))}
                </div>
              </section>
            )}

            {loading && hasResults && (
              <p className="pb-2 text-center text-xs text-muted-foreground">
                {t("loading")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
