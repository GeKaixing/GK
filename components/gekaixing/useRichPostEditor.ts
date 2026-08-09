"use client"

import { useEffect, useRef, useState } from "react"
import { Content, Editor } from "@tiptap/react"
import { createClient } from "@/utils/supabase/client"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { useRouter } from "next/navigation"
import { uploadMediaToSupabase } from "@/utils/function/uploadMediaToSupabase"

export type MentionUser = {
  id: string
  userid: string
  name: string | null
  avatar: string | null
}

export type MentionToken = {
  query: string
  from: number
  to: number
}

export type ExtractedMedia = {
  videoUrl: string | null
  audioUrl: string | null
  allUrls: string[]
}

function getMentionToken(editor: Editor): MentionToken | null {
  const { from } = editor.state.selection
  const lookBack = 60
  const start = Math.max(1, from - lookBack)
  const textBefore = editor.state.doc.textBetween(start, from, "\n", "\n")
  const match = /(?:^|[\s(（])@([^\s@]{0,36})$/u.exec(textBefore)

  if (!match) {
    return null
  }

  const raw = match[0]
  const mentionText = raw.startsWith("@") ? raw : raw.slice(1)
  const mentionStart = from - mentionText.length

  return {
    query: match[1] || "",
    from: mentionStart,
    to: from,
  }
}

async function searchUsers(query: string): Promise<MentionUser[]> {
  try {
    const response = await fetch(`/api/user/search?query=${encodeURIComponent(query)}`)
    const data = await response.json()
    if (!data?.success || !Array.isArray(data?.data)) {
      return []
    }
    return data.data as MentionUser[]
  } catch (error) {
    console.error("Failed to search users:", error)
    return []
  }
}

async function getVideoDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return await new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement("video")
    video.preload = "metadata"
    video.src = objectUrl

    const cleanup = (): void => {
      URL.revokeObjectURL(objectUrl)
      video.removeAttribute("src")
      video.load()
    }

    video.onloadedmetadata = () => {
      const width = video.videoWidth
      const height = video.videoHeight
      cleanup()
      if (!width || !height) {
        resolve(null)
        return
      }
      resolve({ width, height })
    }

    video.onerror = () => {
      cleanup()
      resolve(null)
    }
  })
}

export function hasPublishableContent(content: Content): boolean {
  if (typeof content !== "string") {
    return false
  }

  const plainText = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, "").trim()
  const hasYouTubeNode = content.includes("data-youtube-embed")
  const hasVideoNode = content.includes("data-video-embed")
  const hasAudioNode = content.includes("data-audio-embed")
  return plainText.length > 0 || hasYouTubeNode || hasVideoNode || hasAudioNode
}

export function extractEmbeddedMediaUrls(content: string): ExtractedMedia {
  const videoMatch = /<video\b[^>]*\ssrc=["']([^"']+)["'][^>]*>/i.exec(content)
  const audioMatch = /<audio\b[^>]*\ssrc=["']([^"']+)["'][^>]*>/i.exec(content)
  const allMatches = Array.from(content.matchAll(/<(?:video|audio)\b[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi))
  const allUrls = allMatches
    .map((match) => match[1] ?? "")
    .filter((url) => url.length > 0)

  return {
    videoUrl: videoMatch?.[1] ?? null,
    audioUrl: audioMatch?.[1] ?? null,
    allUrls,
  }
}

function extractPlainTextFromHtml(html: string): string {
  return html
    .replace(/<div[^>]*data-youtube-embed[^>]*>[\s\S]*?<\/div>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function toParagraphHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  const lines = escaped
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return "<p></p>"
  }

  return lines.map((line) => `<p>${line}</p>`).join("")
}

/**
 * 富文本编辑器共用逻辑：内容状态、@ 提及、视频/音频上传、AI 润色、
 * 可发布校验、媒体 URL 提取与清理。EditPost（发帖）与 PublishReply（回复）
 * 共用，保证两处编辑器能力一致。
 */
export function useRichPostEditor() {
  const t = useTranslations("EditPost")
  const locale = useLocale()
  const router = useRouter()

  const [value, setValue] = useState<Content>("")
  const [editor, setEditor] = useState<Editor | null>(null)
  const [mentionToken, setMentionToken] = useState<MentionToken | null>(null)
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([])
  const [uploadedMediaUrls, setUploadedMediaUrls] = useState<string[]>([])
  const [videoUploading, setVideoUploading] = useState(false)
  const [audioUploading, setAudioUploading] = useState(false)
  const [aiGenerating, setAiGenerating] = useState(false)
  const videoInputRef = useRef<HTMLInputElement | null>(null)
  const audioInputRef = useRef<HTMLInputElement | null>(null)
  // 用 ref 镜像 uploadedMediaUrls，保证卸载清理（空依赖闭包）也能读到最新值
  const uploadedMediaUrlsRef = useRef<string[]>([])

  const supabase = createClient()
  const mediaBucketName = "post-media"

  useEffect(() => {
    uploadedMediaUrlsRef.current = uploadedMediaUrls
  }, [uploadedMediaUrls])

  useEffect(() => {
    if (!editor) {
      return
    }

    const nextToken = getMentionToken(editor)
    setMentionToken(nextToken)
  }, [value, editor])

  useEffect(() => {
    if (!mentionToken) {
      setMentionUsers([])
      return
    }

    const timer = setTimeout(() => {
      void searchUsers(mentionToken.query).then((users) => {
        setMentionUsers(users)
      })
    }, 150)

    return () => {
      clearTimeout(timer)
    }
  }, [mentionToken])

  async function deleteMediaByUrl(url: string | null): Promise<void> {
    if (!url) {
      return
    }

    const key = `${mediaBucketName}/`
    const startIndex = url.indexOf(key)
    if (startIndex === -1) {
      return
    }

    const filePath = url.slice(startIndex + key.length)
    if (!filePath) {
      return
    }

    try {
      const { error } = await supabase.storage.from(mediaBucketName).remove([filePath])
      if (error) {
        console.error("删除媒体失败:", error)
      }
    } catch (error) {
      console.error("删除媒体失败:", error)
    }
  }

  async function handleMediaUpload(
    file: File,
    type: "video" | "audio"
  ): Promise<void> {
    const isVideo = type === "video"
    const isValidType = isVideo ? file.type.startsWith("video/") : file.type.startsWith("audio/")
    if (!isValidType) {
      toast.error(t(isVideo ? "videoTypeError" : "audioTypeError"))
      return
    }

    if (file.size > 100 * 1024 * 1024) {
      toast.error(t("mediaSizeError"))
      return
    }

    const videoDimensions = isVideo ? await getVideoDimensions(file) : null

    if (isVideo) {
      setVideoUploading(true)
    } else {
      setAudioUploading(true)
    }

    try {
      const uploadedUrl = await uploadMediaToSupabase(file, "post-media", type)
      if (!uploadedUrl) {
        toast.error(t("mediaUploadFailed"))
        return
      }

      if (isVideo) {
        editor
          ?.chain()
          .focus()
          .insertVideoEmbed(uploadedUrl, videoDimensions?.width, videoDimensions?.height)
          .run()
      } else {
        editor?.chain().focus().insertAudioEmbed(uploadedUrl).run()
      }

      setUploadedMediaUrls((prev) => (prev.includes(uploadedUrl) ? prev : [...prev, uploadedUrl]))
    } catch (error) {
      console.error(`Failed to upload ${type}:`, error)
      toast.error(t("mediaUploadFailed"))
    } finally {
      if (isVideo) {
        setVideoUploading(false)
      } else {
        setAudioUploading(false)
      }
    }
  }

  async function handleVideoChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (file) {
      await handleMediaUpload(file, "video")
    }
    event.target.value = ""
  }

  async function handleAudioChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (file) {
      await handleMediaUpload(file, "audio")
    }
    event.target.value = ""
  }

  function handleSelectMention(user: MentionUser): void {
    if (!editor || !mentionToken) {
      return
    }

    editor
      .chain()
      .focus()
      .deleteRange({ from: mentionToken.from, to: mentionToken.to })
      .insertContent(`@${user.userid} `)
      .run()

    setMentionUsers([])
    setMentionToken(null)
  }

  async function handleAiPolish(): Promise<void> {
    if (aiGenerating) {
      return
    }

    const htmlValue = typeof value === "string" ? value : ""
    const plainText = extractPlainTextFromHtml(htmlValue)

    if (!plainText) {
      toast.error(locale === "zh-CN" ? "请先输入需要润色的内容" : "Please enter content to polish")
      return
    }

    setAiGenerating(true)
    try {
      const response = await fetch("/api/post/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "polish",
          content: plainText,
          locale: locale === "zh-CN" ? "zh-CN" : "en",
        }),
      })

      const payload = (await response.json()) as {
        success?: boolean
        content?: string
        error?: string
        details?: string
      }

      if (!response.ok || !payload.success || !payload.content) {
        if (response.status === 401) {
          toast.error(
            locale === "zh-CN"
              ? "请先在设置-账户中配置 Gemini API Key"
              : "Please configure Gemini API key in Settings > Account first"
          )
          router.push("/gekaixing/settings/account")
          return
        }

        if (response.status === 503) {
          const message = payload.error || ""
          const missingKey =
            message.toLowerCase().includes("not configured") ||
            message.toLowerCase().includes("api key")

          if (missingKey) {
            toast.error(
              locale === "zh-CN"
                ? "请先在设置-账户中配置 Gemini API Key"
                : "Please configure Gemini API key in Settings > Account first"
            )
            router.push("/gekaixing/settings/account")
            return
          }

          toast.error(
            locale === "zh-CN"
              ? "服务器当前无法连接 Gemini，请稍后重试（或检查网络/代理）"
              : "Server cannot reach Gemini right now. Please retry later (or check network/proxy)."
          )
          if (payload.details) {
            console.warn("AI polish details:", payload.details)
          }
          return
        }

        if (response.status === 429) {
          toast.error(
            locale === "zh-CN"
              ? "Gemini 配额已用尽或触发限流，请稍后再试"
              : "Gemini quota exceeded or rate limited, please try again later"
          )
          return
        }

        toast.error(payload.error || (locale === "zh-CN" ? "AI 润色失败" : "AI polish failed"))
        if (payload.details) {
          console.warn("AI polish details:", payload.details)
        }
        return
      }

      const polishedHtml = toParagraphHtml(payload.content)
      setValue(polishedHtml)
      editor?.commands.setContent(polishedHtml)
      toast.success(locale === "zh-CN" ? "润色完成" : "Polish completed")
    } catch (error) {
      console.error("AI polish failed:", error)
      toast.error(locale === "zh-CN" ? "AI 润色失败" : "AI polish failed")
    } finally {
      setAiGenerating(false)
    }
  }

  /** 清理不再使用（未留在内容中）的视频/音频；读 ref 保证闭包始终拿到最新列表 */
  function cleanupMedia(allUrls: string[]): void {
    const unusedMedia = uploadedMediaUrlsRef.current.filter((url) => !allUrls.includes(url))
    unusedMedia.forEach((url) => {
      void deleteMediaByUrl(url)
    })
  }

  /** 发布/关闭后重置编辑器状态 */
  function reset(): void {
    setValue("")
    setMentionUsers([])
    setMentionToken(null)
    setUploadedMediaUrls([])
    uploadedMediaUrlsRef.current = []
    setVideoUploading(false)
    setAudioUploading(false)
  }

  return {
    value,
    setValue,
    editor,
    setEditor,
    mentionToken,
    mentionUsers,
    uploadedMediaUrls,
    videoUploading,
    audioUploading,
    aiGenerating,
    videoInputRef,
    audioInputRef,
    handleVideoChange,
    handleAudioChange,
    handleSelectMention,
    handleAiPolish,
    hasPublishableContent,
    extractEmbeddedMediaUrls,
    deleteMediaByUrl,
    cleanupMedia,
    reset,
  }
}
