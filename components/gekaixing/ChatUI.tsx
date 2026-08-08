"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import MessageBubble from "./MessageBubble"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { useAiSessions } from "@/store/AiSessions"
import { useTranslations } from "next-intl"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  sessionId?: string
}

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

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] w-full flex-col">
      <div className="border-b px-6 py-4 font-semibold">
        {t("assistantTitle")}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 pb-28 sm:pb-6">
        {messages.length === 0 && <EmptyState text={t("emptyState")} />}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            loading={loading && msg.role === "assistant" && !msg.content}
          />
        ))}

        <div ref={bottomRef} />
      </div>

      <div className="fixed bottom-[57px] left-0 right-0 z-30 border-t bg-background/95 p-4 backdrop-blur sm:static sm:z-auto sm:bg-background sm:p-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("inputPlaceholder")}
            rows={1}
            className={cn(
              "flex-1 resize-none rounded-xl border px-4 py-3 text-sm",
              "focus:outline-none focus:ring-2 focus:ring-primary"
            )}
          />

          <button
            onClick={handleSend}
            disabled={loading}
            className="px-5 rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
          >
            {t("send")}
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
      {text}
    </div>
  )
}
