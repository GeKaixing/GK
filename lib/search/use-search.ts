"use client"

import { useEffect, useRef, useState } from "react"

import type { FeedPostItem } from "@/lib/feed/types"
import {
  mapSearchPostToFeedPost,
  type SearchPostItem,
  type SearchUserItem,
} from "@/lib/search/types"

export interface SearchResults {
  people: SearchUserItem[]
  posts: FeedPostItem[]
  loading: boolean
  error: boolean
}

/**
 * 并行拉取「帖子 + 人」两个搜索接口。
 * - 空 query 直接清空不发请求
 * - AbortController + 请求序号双重防竞态：过期响应一律丢弃
 * - 任一接口失败 → error（整体视为失败，交由页面展示重试）
 */
export function useSearchResults(query: string, retryKey: number): SearchResults {
  const [people, setPeople] = useState<SearchUserItem[]>([])
  const [posts, setPosts] = useState<FeedPostItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const seqRef = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setPeople([])
      setPosts([])
      setLoading(false)
      setError(false)
      return
    }

    const seq = ++seqRef.current
    const controller = new AbortController()
    const params = new URLSearchParams({ query: trimmed })

    setLoading(true)
    setError(false)

    Promise.all([
      fetch(`/api/sreach?${params.toString()}`, { signal: controller.signal }).then(
        async (res) => {
          if (!res.ok) throw new Error(`posts search ${res.status}`)
          const json = (await res.json()) as { data?: SearchPostItem[] }
          return (json.data ?? []).map(mapSearchPostToFeedPost)
        }
      ),
      fetch(`/api/user/search?${params.toString()}`, { signal: controller.signal }).then(
        async (res) => {
          if (!res.ok) throw new Error(`user search ${res.status}`)
          const json = (await res.json()) as { data?: SearchUserItem[] }
          return json.data ?? []
        }
      ),
    ])
      .then(([nextPosts, nextPeople]) => {
        if (seq !== seqRef.current) return
        setPosts(nextPosts)
        setPeople(nextPeople)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (seq !== seqRef.current) return
        // 被新请求 abort 掉的旧请求忽略
        if (err instanceof DOMException && err.name === "AbortError") return
        console.error("Search failed:", err)
        setPosts([])
        setPeople([])
        setLoading(false)
        setError(true)
      })

    return () => {
      controller.abort()
    }
  }, [query, retryKey])

  return { people, posts, loading, error }
}
