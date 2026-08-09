import "./styles/index.css"

import type { Content, Editor } from "@tiptap/react"
import type { UseMinimalTiptapEditorProps } from "./hooks/use-minimal-tiptap"
import { EditorContent } from "@tiptap/react"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { SectionOne } from "./components/section/one"
import { SectionTwo } from "./components/section/two"
import { SectionThree } from "./components/section/three"
import { SectionFour } from "./components/section/four"
import { SectionFive } from "./components/section/five"
import { LinkBubbleMenu } from "./components/bubble-menu/link-bubble-menu"
import { useMinimalTiptapEditor } from "./hooks/use-minimal-tiptap"
import { MeasuredContainer } from "./components/measured-container"
import Button from "@/components/gekaixing/Button"
import clsx from "clsx"
import { useEffect } from "react"
import Spin from "@/components/gekaixing/Spin"
import { Fragment } from "@tiptap/pm/model"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { ReactNode } from "react"

export interface MinimalTiptapProps
  extends Omit<UseMinimalTiptapEditorProps, "onUpdate"> {
  value?: Content
  onChange?: (value: Content) => void
  onEditorReady?: (editor: Editor | null) => void
  onAiGenerate?: () => void
  aiGenerating?: boolean
  canPublish?: boolean
  toolbarLeftContent?: ReactNode
  contentAfterEditor?: ReactNode
  className?: string
  editorContentClassName?: string
  /** 仅当编辑器容器内获得焦点时才显示工具栏（用于回复框等紧凑场景） */
  toolbarOnFocus?: boolean
}

const Toolbar = ({
  editor,
  publish,
  value,
  canPublish,
  onAiGenerate,
  aiGenerating = false,
  toolbarLeftContent,
}: {
  editor: Editor
  publish?: () => void
  value: Content | undefined | string
  canPublish?: boolean
  onAiGenerate?: () => void
  aiGenerating?: boolean
  toolbarLeftContent?: ReactNode
}) => {
const t = useTranslations('EditPost')
  const locale = useLocale()
  const hasContent = canPublish ?? (typeof value === "string" ? value.trim().length !== 0 : false)
  const aiButtonLabel = aiGenerating
    ? locale === "zh-CN"
      ? "生成中..."
      : "Thinking..."
    : locale === "zh-CN"
      ? "AI发帖"
      : "AI Post"

  return (
    <div className="border-border flex justify-between  h-12 shrink-0  border-b p-2">
      <div className="flex min-w-0 flex-1 items-center gap-px overflow-x-auto">
        {/* <SectionOne editor={editor} activeLevels={[1, 2, 3, 4, 5, 6]} /> */}

        {/* <Separator orientation="vertical" className="mx-2" /> */}

        <SectionTwo
          editor={editor}
          activeActions={[
            "bold",
            "italic",
            "underline",
            // "strikethrough",
            // "code",
            // "clearFormatting",
          ]}
          mainActionCount={3}
        />
        {toolbarLeftContent}
        

        {/* <Separator orientation="vertical" className="mx-2" />

      <SectionThree editor={editor} /> */}

        {/* <Separator orientation="vertical" className="mx-2" />

      <SectionFour
        editor={editor}
        activeActions={["orderedList", "bulletList"]}
        mainActionCount={0}
      />

      <Separator orientation="vertical" className="mx-2" /> */}

        <SectionFive
          editor={editor}
          activeActions={["codeBlock", "blockquote", "horizontalRule"]}
          mainActionCount={0}
        />
      </div>
      <div className="flex items-center gap-2">
        {onAiGenerate ? (
          <Button
            onClick={onAiGenerate}
            className="!w-[88px] !max-w-none"
            disabled={aiGenerating}
          >
            {aiButtonLabel}
          </Button>
        ) : null}
        <Button onClick={publish} disabled={!hasContent} className={clsx('!w-16 !max-w-2xs', {
          '!bg-black': hasContent,
          '!text-white': hasContent
        })}>{t("publish")}</Button>
      </div>
    </div>
  )
}

export const MinimalTiptapEditor = ({
  value,
  publish,
  status,
  onChange,
  onEditorReady,
  onAiGenerate,
  aiGenerating,
  canPublish,
  toolbarLeftContent,
  contentAfterEditor,
  className,
  editorContentClassName,
  toolbarOnFocus,
  ...props
}: MinimalTiptapProps & {
  publish?: () => void
  status: boolean
}) => {
  const editor = useMinimalTiptapEditor({
    value,
    onUpdate: onChange,
    ...props,
  })
  // 👇 当外部 value 变化时，更新编辑器内容
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent('') // false: 不记录到历史记录中
    }
  }, [value, editor])

  useEffect(() => {
    onEditorReady?.(editor ?? null)
  }, [editor, onEditorReady])
  if (!editor) {
    return null
  }


  return (
    <MeasuredContainer
      as="div"
      name="editor"
      className={cn(
        "gkx-tiptap-group border-input min-data-[orientation=vertical]:h-72 flex h-auto w-full flex-col rounded-md border shadow-xs",
        "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
        className
      )}
    >

      <EditorContent
        editor={editor}
        className={cn("minimal-tiptap-editor", editorContentClassName)}
      />
      {contentAfterEditor}
      {status ?
        <div className="flex justify-center">
          <Spin></Spin>
        </div>
        : toolbarOnFocus ? (
          <div className="gkx-toolbar-focus-only">
            <Toolbar
              editor={editor}
              publish={publish}
              value={value}
              canPublish={canPublish}
              onAiGenerate={onAiGenerate}
              aiGenerating={aiGenerating}
              toolbarLeftContent={toolbarLeftContent}
            />
          </div>
        ) : (
          <Toolbar
            editor={editor}
            publish={publish}
            value={value}
            canPublish={canPublish}
            onAiGenerate={onAiGenerate}
            aiGenerating={aiGenerating}
            toolbarLeftContent={toolbarLeftContent}
          />
        )}

      <LinkBubbleMenu editor={editor} />
    </MeasuredContainer>
  )
}

MinimalTiptapEditor.displayName = "MinimalTiptapEditor"

export default MinimalTiptapEditor
