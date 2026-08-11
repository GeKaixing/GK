import fs from "fs"
import path from "path"
import type { MetadataRoute } from "next"
import { prisma } from "@/lib/prisma"
import { getSiteUrl } from "@/lib/site"

function getBlogSlugs(): string[] {
  try {
    const markdownDir = path.join(process.cwd(), "markdown")
    const files = fs.readdirSync(markdownDir)
    return files
      .filter((file) => file.endsWith(".md"))
      .map((file) => file.replace(/\.md$/, ""))
  } catch (error) {
    console.error("读取 markdown 目录失败:", error)
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/blog`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/gekaixing`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/gekaixing/explore`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${siteUrl}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteUrl}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${siteUrl}/tos`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${siteUrl}/help`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ]

  const blogRoutes: MetadataRoute.Sitemap = getBlogSlugs().map((slug) => ({
    url: `${siteUrl}/blog/${encodeURIComponent(slug)}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }))

  const [posts, users] = await Promise.all([
    prisma.post.findMany({
      select: {
        id: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    }),
    prisma.user.findMany({
      select: {
        id: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    }),
  ])

  const postRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${siteUrl}/gekaixing/status/${post.id}`,
    lastModified: post.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }))

  const userRoutes: MetadataRoute.Sitemap = users.map((user) => ({
    url: `${siteUrl}/gekaixing/user/${user.id}`,
    lastModified: user.updatedAt,
    changeFrequency: "weekly",
    priority: 0.6,
  }))

  return [...staticRoutes, ...blogRoutes, ...postRoutes, ...userRoutes]
}
