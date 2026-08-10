"use client"

import React from "react"
import { Check, Copy, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import ReactMarkdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import remarkGfm from "remark-gfm"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

type MessageRole = "user" | "assistant" | "system"

export type ChatToolActivity = { name: string; done: boolean }

interface MessageBubbleProps {
  role: MessageRole
  content: string
  loading?: boolean
  /** Tool activity (search etc.) surfaced by the live stream. */
  tools?: ChatToolActivity[]
}

function toolLabel(name: string): string {
  if (name === "webSearch") return "搜索"
  if (name === "fetchUrl") return "读取网页"
  return name
}

export function MessageBubble({
  role,
  content,
  loading = false,
  tools = [],
}: MessageBubbleProps) {
  const t = useTranslations("ImitationX.Gkx")
  const [copied, setCopied] = React.useState(false)
  const isUser = role === "user"
  const activeTools = tools.filter((tool) => !tool.done)

  async function handleCopy(): Promise<void> {
    if (!content.trim()) return

    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      toast.success(t("copySuccess"))
      window.setTimeout(() => setCopied(false), 1200)
    } catch (error) {
      console.error(t("copyFailed"), error)
      toast.error(t("copyFailed"))
    }
  }

  return (
    <div
      className={cn(
        "group flex w-full mb-4",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div className={cn("flex max-w-[80%] flex-col", isUser ? "items-end" : "items-start")}>
        {/* AI 消息显示模型标签 */}
        {!isUser && (
          <div className="mb-1 flex items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            <span>{t("assistantTitle")}</span>
          </div>
        )}
        <div
          className={cn(
            "w-fit rounded-2xl px-4 py-3 text-sm leading-relaxed break-words",
            "relative",
            "transition-all duration-200",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          )}
        >
          {/* 尚未出正文：灰显「思考中 / 正在执行工具」，正文出现后即被替换 */}
          {loading ? (
            <ThinkingStatus activeTools={activeTools} />
          ) : (
            <MarkdownContent content={content} />
          )}

          {/* 正文进行中又触发了工具（如二次搜索）：正文下方灰显执行状态 */}
          {!loading && activeTools.length > 0 && (
            <RunningToolStatus activeTools={activeTools} />
          )}

          {!loading && content.trim() && (
            <button
              type="button"
              onClick={handleCopy}
              aria-label={t("copyMessage")}
              className={cn(
                "absolute -bottom-3 right-2 inline-flex h-6 w-6 items-center justify-center rounded-full border shadow-sm",
                "opacity-0 group-hover:opacity-100 transition-opacity",
                isUser
                  ? "bg-primary text-primary-foreground border-primary-foreground/30"
                  : "bg-background text-foreground border-border"
              )}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default MessageBubble

// =======================
// Markdown 渲染
// =======================

function MarkdownContent({ content }: { content: string }) {
  const t = useTranslations("ImitationX.Gkx")

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        code(props) {
          const { className, children } = props
          const isInline = !className

          if (isInline) {
            return (
              <code className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-xs">
                {children}
              </code>
            )
          }

          return <CodeBlock className={className} t={t}>{children}</CodeBlock>
        },
        a(props) {
          return (
            <a
              {...props}
              target="_blank"
              className="underline opacity-80 hover:opacity-100"
            />
          )
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function CodeBlock({
  className,
  children,
  t,
}: {
  className?: string
  children: React.ReactNode
  t: (key: string) => string
}) {
  const [copied, setCopied] = React.useState(false)
  const codeText = String(children).replace(/\n$/, "")
  const language = className?.replace(/^language-/, "") || "text"

  async function handleCopyCode(): Promise<void> {
    if (!codeText.trim()) return

    try {
      await navigator.clipboard.writeText(codeText)
      setCopied(true)
      toast.success(t("copySuccess"))
      window.setTimeout(() => setCopied(false), 1200)
    } catch (error) {
      console.error(t("copyFailed"), error)
      toast.error(t("copyFailed"))
    }
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border/70 bg-zinc-950 text-zinc-100">
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-3 py-1.5 text-[11px]">
        <span className="uppercase tracking-wide text-zinc-400">{language}</span>
        <button
          type="button"
          onClick={handleCopyCode}
          aria-label={t("copyCode")}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs">
        <code className={cn(className, "hljs")}>{children}</code>
      </pre>
    </div>
  )
}

// =======================
// 灰色状态提示（思考 / 执行工具）
// =======================

function toolStatusText(activeTools: ChatToolActivity[]): string {
  return activeTools.length > 0
    ? `正在执行：${activeTools.map((tool) => toolLabel(tool.name)).join("、")}…`
    : "思考中…"
}

function ThinkingStatus({ activeTools }: { activeTools: ChatToolActivity[] }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/60" />
      <span className="animate-pulse">{toolStatusText(activeTools)}</span>
    </div>
  )
}

function RunningToolStatus({ activeTools }: { activeTools: ChatToolActivity[] }) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/60" />
      <span className="animate-pulse">{toolStatusText(activeTools)}</span>
    </div>
  )
}
