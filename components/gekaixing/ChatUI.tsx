"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import MessageBubble from "./MessageBubble"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { useAiSessions } from "@/store/AiSessions"
import { useTranslations } from "next-intl"
import {
  ArrowUp,
  Atom,
  ChevronDown,
  Code2,
  Feather,
  Hash,
  Paperclip,
  Sparkles,
  SquarePen,
} from "lucide-react"
import { getUserAiConfig } from "@/lib/ai/config"
import { createClient } from "@/utils/supabase/client"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  sessionId?: string
}

const PROMPT_ICONS = [Feather, Atom, Code2, Hash]

export default function ChatUI({
  sessionId: initialSessionId,
  userId,
}: {
  sessionId?: string
  userId: string
}) {
  const t = useTranslations("ImitationX.Gkx")
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [aiModelLabel, setAiModelLabel] = useState("")

  const { addSession, updateSessionTitle } = useAiSessions()

  const bottomRef = useRef<HTMLDivElement>(null)
  const autoSentRef = useRef(false)
  const historyAddedRef = useRef(false) // ⭐ 防止重复加入历史

  const router = useRouter()

  const buildFallbackTitle = useCallback((text: string): string => {
    const normalized = text.replace(/\s+/g, " ").trim()
    if (!normalized) return t("newChat")
    return normalized.slice(0, 20)
  }, [t])

  /**
   * 显示当前 AI 提供商 / 模型（读取用户配置）
   */
  useEffect(() => {
    let cancelled = false

    async function loadConfig() {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (cancelled || !user) return

        const config = getUserAiConfig(user)
        const providerLabel =
          config.provider === "google"
            ? "Gemini"
            : config.provider === "openai"
              ? "OpenAI"
              : "AI"
        setAiModelLabel(
          config.model ? `${providerLabel} · ${config.model}` : providerLabel
        )
      } catch {
        // 读取失败不阻塞聊天
      }
    }

    void loadConfig()

    return () => {
      cancelled = true
    }
  }, [])

  function mergeMessages(
    historyMessages: Message[],
    localMessages: Message[]
  ): Message[] {
    if (localMessages.length === 0) return historyMessages
    if (historyMessages.length === 0) return localMessages

    const historyIds = new Set(historyMessages.map((msg) => msg.id))
    const appendedLocal = localMessages.filter((msg) => !historyIds.has(msg.id))

    return [...historyMessages, ...appendedLocal]
  }

  const historyLoadedRef = useRef<string | null>(null)
  /**
 * ⭐ 加载 session 历史消息
 */
useEffect(() => {
  if (!initialSessionId) return

  // 已加载过该 session → 不再请求
  if (historyLoadedRef.current === initialSessionId) return

  historyLoadedRef.current = initialSessionId

  async function loadHistory() {
    try {
      const res = await fetch(
        `/api/chat/history?sessionId=${initialSessionId}`
      )

      if (!res.ok) throw new Error(t("loadHistoryFailed"))

      const data = await res.json()
      // 服务器返回格式：
      // [{ id, role, content }]
      const historyMessages = (data || []) as Message[]

      setMessages((prev) => {
        if (prev.length > 0 && historyMessages.length === 0) {
          return prev
        }

        if (prev.length > 0) {
          return mergeMessages(historyMessages, prev)
        }

        return historyMessages
      })
    } catch (err) {
      console.error(t("loadHistoryFailed"), err)
    }
  }

  loadHistory()
}, [initialSessionId, t])


  /**
   * 自动滚动
   */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  /**
   * ⭐ 发送消息
   */
  const generateSessionTitle = useCallback(async (
    sessionId: string,
    text: string,
    fallbackTitle: string
  ): Promise<void> => {
    try {
      const res = await fetch("/api/chat/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          text,
        }),
      })

      if (!res.ok) {
        updateSessionTitle(sessionId, fallbackTitle)
        return
      }

      const data = (await res.json()) as { title?: string }
      const nextTitle = data.title?.trim() || fallbackTitle
      updateSessionTitle(sessionId, nextTitle)
    } catch (error) {
      console.error(t("generateTitleFailed"), error)
      updateSessionTitle(sessionId, fallbackTitle)
    }
  }, [t, updateSessionTitle])

  const sendMessage = useCallback(async (textOverride?: string) => {
    const text = textOverride ?? input
    if (!text.trim() || loading) return

    setInput("")
    setLoading(true)

    const assistantId = crypto.randomUUID()

    const userMessage: Message = {
      id: crypto.randomUUID(),
      sessionId: initialSessionId,
      role: "user",
      content: text,
    }

    // ⭐ 用函数式更新避免旧 state
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: "assistant", content: "" },
    ])

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage], // 发真实历史
          sessionId: initialSessionId,
          userId,
        }),
      })

      if (!res.ok) {
        const errorText = (await res.text()).trim()
        throw new Error(errorText || "AI service unavailable")
      }

      if (!res.body) throw new Error("No response body")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      let fullText = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        fullText += decoder.decode(value)

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: fullText }
              : msg
          )
        )
      }

      /**
       * ⭐ 只有当 session 第一次产生 AI 回复才进历史
       * （用户已经开始和 AI 聊天）
       */
      if (initialSessionId && !historyAddedRef.current) {
        historyAddedRef.current = true
        const fallbackTitle = buildFallbackTitle(text)

        addSession({
          id: initialSessionId,
          title: fallbackTitle,
          userId,
          tokenUsed: fullText.length,
          createdAt: new Date(),
          updatedAt: new Date(),
        })

        generateSessionTitle(initialSessionId, text, fallbackTitle)
      }
    } catch (error) {
      console.error(error)

      const errorMessage = error instanceof Error ? error.message : ""
      const fallbackMessage = errorMessage.includes("AI API key is not configured")
        ? "请先到 设置 > 账号 配置 AI API Key（/gekaixing/settings/account）"
        : t("errorRetry")

      setMessages((prev) =>
        prev.map((msg) =>
            msg.id === assistantId
            ? { ...msg, content: fallbackMessage }
            : msg
        )
      )
    } finally {
      setLoading(false)
    }
  }, [
    addSession,
    buildFallbackTitle,
    generateSessionTitle,
    initialSessionId,
    input,
    loading,
    messages,
    t,
    userId,
  ])

  /**
   * ⭐ 首次进入自动发送 ?input=xxx
   */
  useEffect(() => {
    if (!initialSessionId) return
    if (autoSentRef.current) return

    const params = new URLSearchParams(window.location.search)
    const inputParam = params.get("input")

    if (!inputParam) return

    autoSentRef.current = true

    setTimeout(() => {
      sendMessage(inputParam)
    }, 0)

    window.history.replaceState({}, "", window.location.pathname)
  }, [initialSessionId, sendMessage])

  /**
   * Enter 发送
   */
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    if (!initialSessionId) {
      const newSessionId = crypto.randomUUID()
      router.push(
        `/gekaixing/gkx/${newSessionId}?input=${encodeURIComponent(text)}`
      )
      return
    }

    sendMessage(text)
  }

  /** 点击建议提示词 */
  function handleSelectPrompt(prompt: string) {
    if (!initialSessionId) {
      const newSessionId = crypto.randomUUID()
      router.push(
        `/gekaixing/gkx/${newSessionId}?input=${encodeURIComponent(prompt)}`
      )
      return
    }

    sendMessage(prompt)
  }

  const prompts = (t.raw("suggestedPrompts") as string[]) ?? []

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] w-full flex-col">
      {/* 顶栏 */}
      <header className="flex items-center justify-between border-b px-4 py-2">
        <button
          type="button"
          className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-muted/60"
        >
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="truncate">{aiModelLabel || t("assistantTitle")}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => router.push("/gekaixing/gkx")}
            aria-label={t("newChat")}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <SquarePen className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-4 py-8">
          {messages.length === 0 ? (
            <GrokEmptyState
              t={t}
              prompts={prompts}
              onSelect={handleSelectPrompt}
            />
          ) : (
            messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                loading={loading && msg.role === "assistant" && !msg.content}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* 输入区 */}
      <div className="px-4 pb-5 pt-2">
        <div className="mx-auto w-full max-w-[760px]">
          <div
            className={cn(
              "flex items-end gap-2 rounded-2xl border border-border bg-background p-2 shadow-sm",
              "transition-shadow focus-within:ring-2 focus-within:ring-primary/40"
            )}
          >
            <button
              type="button"
              aria-label="Attach"
              className="p-1.5 text-muted-foreground hover:text-foreground"
            >
              <Paperclip className="h-5 w-5" />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything"
              rows={1}
              className={cn(
                "flex-1 resize-none bg-transparent px-1 py-1.5 text-sm",
                "focus:outline-none"
              )}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={loading || !input.trim()}
              aria-label={t("send")}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {t("disclaimer")}
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Grok 风格空状态：大号品牌字 + 建议提示词卡片（2 列网格）
 */
function GrokEmptyState({
  t,
  prompts,
  onSelect,
}: {
  t: ReturnType<typeof useTranslations>
  prompts: string[]
  onSelect: (prompt: string) => void
}) {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-10 text-center">
      <h1 className="text-5xl font-bold tracking-tight">
        {t("assistantTitle")}
      </h1>
      {prompts.length > 0 && (
        <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
          {prompts.map((prompt, index) => {
            const Icon = PROMPT_ICONS[index % PROMPT_ICONS.length]
            return (
              <button
                key={prompt}
                type="button"
                onClick={() => onSelect(prompt)}
                className="flex items-center gap-3 rounded-2xl border border-border p-4 text-left text-sm transition-colors hover:bg-muted/60"
              >
                <Icon className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-foreground">{prompt}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
