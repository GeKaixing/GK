import { NextResponse } from "next/server"

import { getCachedJson, setCachedJson } from "@/lib/redis"

const CACHE_KEY = "sidebar:toutiao-hot"
const CACHE_TTL_SECONDS = 300

export async function GET() {
  const cached = await getCachedJson<unknown[]>(CACHE_KEY)
  if (Array.isArray(cached)) {
    return NextResponse.json({ data: cached }, { status: 200 })
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 3000)

  try {
    const res = await fetch("https://dabenshi.cn/other/api/hot.php?type=toutiaoHot", {
      method: "GET",
      signal: controller.signal,
      next: { revalidate: 300 },
    })

    if (!res.ok) {
      return NextResponse.json({ data: [] }, { status: 200 })
    }

    const json = await res.json()
    const data = Array.isArray(json?.data) ? json.data : []
    await setCachedJson(CACHE_KEY, data, CACHE_TTL_SECONDS)
    return NextResponse.json({ data }, { status: 200 })
  } catch (error) {
    console.error("toutiao hot api failed:", error)
    return NextResponse.json({ data: [] }, { status: 200 })
  } finally {
    clearTimeout(timeoutId)
  }
}
