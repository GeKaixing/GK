"use client"

import { useEffect, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import { MinimalTiptapEditor } from "../ui/minimal-tiptap"
import { post_imagesStore } from "@/store/post_images"
import { createClient } from "@/utils/supabase/client"
import { userStore } from "@/store/user"
import { toast } from "sonner"
import { findUnusedUrls } from "@/utils/function/findUnusedUrls"
import { deleteUnusedImages } from "@/utils/function/deleteUnusedImages"
import { postStore } from "@/store/post"
import { postModalStore } from "@/store/postModal"
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar"
import { useTranslations } from "next-intl"
import { Loader2, Music2, Video } from "lucide-react"
import { ToolbarButton } from "../ui/minimal-tiptap/components/toolbar-button"
import { useRichPostEditor } from "./useRichPostEditor"

async function publishPost({
  user_id,
  value,
  videoUrl,
  audioUrl,
}: {
  user_id: string
  value: string
  videoUrl: string | null
  audioUrl: string | null
}) {
  return await fetch("/api/post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id,
      content: value,
      videoUrl,
      audioUrl,
    }),
  })
}

interface EditPostProps {
  onClose?: () => void
}

export default function EditPost({ onClose }: EditPostProps) {
  const t = useTranslations("EditPost")

  // ⭐ 正确使用 store
  const { isOpen, closeModal, openModal } = postModalStore()
  const { poset_images } = post_imagesStore()

  const [isOpenAlertDialog, setIsOpenAlertDialog] = useState(false)
  const [isLogin, setLogin] = useState(false)
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState(false)

  const {
    value,
    setValue,
    setEditor,
    mentionToken,
    mentionUsers,
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
    cleanupMedia,
    reset,
  } = useRichPostEditor()

  const supabase = createClient()
  const { email, id, user_avatar, name, userid } = userStore()

  const bucketName = "images"
  const wasOpenRef = useRef<boolean>(false)

  // 自动删除未保存图片/媒体
  useEffect(() => {
    const isClosing = wasOpenRef.current && !isOpen
    wasOpenRef.current = isOpen

    if (!isClosing) {
      return
    }

    if (poset_images.length !== 0 && !saved) {
      poset_images.forEach((image) => {
        const filePath = image.split("/images/")[1]

        supabase.storage
          .from(bucketName)
          .remove([filePath])
          .catch((error) => {
            console.error("删除图片失败:", error)
          })
      })
    }
    if (!saved) {
      cleanupMedia([])
    }

    reset()
  }, [isOpen])

  function handleClose() {
    closeModal()
    onClose?.()
  }

  async function publish() {
    if (!id) {
      setLogin(true)
      return
    }
    if (!hasPublishableContent(value)) {
      return
    }
    if (videoUploading || audioUploading) {
      toast.error(t("mediaUploading"))
      return
    }

    setStatus(true)

    const { videoUrl, audioUrl, allUrls } = extractEmbeddedMediaUrls(value as string)

    const result = await publishPost({
      user_id: id,
      value: value as string,
      videoUrl,
      audioUrl,
    })

    const data = await result.json()
    const unusedPictures = findUnusedUrls(value as string, poset_images)

    if (data.success) {
      postStore.getState().addPost({
        id: data.data[0]["id"],
        user_id: id,
        user_name: name,
        user_email: email,
        user_avatar,
        user_userid: userid,
        content: value as string,
        videoUrl: data.data[0]["videoUrl"] ?? null,
        audioUrl: data.data[0]["audioUrl"] ?? null,
        createdAt: new Date(),
        isPremium: false,
        like: 0,
        star: 0,
        reply: 0,
        share: 0,
        likedByMe: false,
        bookmarkedByMe: false,
        sharedByMe: false,
      })

      setSaved(true)
      setStatus(false)
      closeModal()
      setValue("")
      cleanupMedia(allUrls)
      toast.success(t("publishSuccess"))
    } else {
      setStatus(false)
      toast.error(t("publishFailed"))
    }

    if (unusedPictures.length !== 0) {
      await deleteUnusedImages("images", unusedPictures)
    }
  }

  return (
    <TooltipProvider>
      <Dialog
        open={isOpen}
        onOpenChange={(nextOpen) => {
          // 关闭时有内容 → 拦截
          if (!nextOpen && hasPublishableContent(value)) {
            setIsOpenAlertDialog(true)
            return
          }

          if (nextOpen) {
            openModal()
          } else {
            handleClose()
          }
        }}
      >
        <DialogContent className="!max-w-2xl !w-full">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription />
          </DialogHeader>

          <MinimalTiptapEditor
            status={status}
            publish={publish}
            value={value}
            onChange={setValue}
            onEditorReady={setEditor}
            onAiGenerate={handleAiPolish}
            aiGenerating={aiGenerating}
            canPublish={hasPublishableContent(value)}
            className="!max-w-[622px] w-full"
            editorContentClassName="p-5"
            output="html"
            placeholder={t("placeholder")}
            autofocus
            editable
            editorClassName="focus:outline-hidden"
            toolbarLeftContent={
              <div className="ml-2 flex items-center gap-1 overflow-x-auto whitespace-nowrap">
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(event) => void handleVideoChange(event)}
                  />
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(event) => void handleAudioChange(event)}
                  />
                  <ToolbarButton
                    type="button"
                    size="sm"
                    onClick={() => videoInputRef.current?.click()}
                    disabled={videoUploading}
                    tooltip={t("uploadVideo")}
                    aria-label={t("uploadVideo")}
                  >
                    {videoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                  </ToolbarButton>
                  <ToolbarButton
                    type="button"
                    size="sm"
                    onClick={() => audioInputRef.current?.click()}
                    disabled={audioUploading}
                    tooltip={t("uploadAudio")}
                    aria-label={t("uploadAudio")}
                  >
                    {audioUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music2 className="h-4 w-4" />}
                  </ToolbarButton>

              </div>
            }
          />
          {mentionUsers.length > 0 && mentionToken ? (
            <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border bg-background">
              {mentionUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleSelectMention(user)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/60"
                >
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={user.avatar ?? undefined} />
                    <AvatarFallback>{(user.name || user.userid).slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{user.name || user.userid}</span>
                  <span className="text-xs text-muted-foreground">@{user.userid}</span>
                </button>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 草稿确认弹窗 */}
      <EditAlertDialog
        saved={saved}
        isOpen={isOpenAlertDialog}
        setIsOpen={setIsOpenAlertDialog}
        closeEditPost={handleClose}
      />

      {/* 登录弹窗 */}
      <LoginDialog isOpen={isLogin} setIsOpen={setLogin} />
    </TooltipProvider>
  )
}

function EditAlertDialog({
  isOpen,
  setIsOpen,
  closeEditPost,
  saved,
}: {
  saved: boolean
  closeEditPost: () => void
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}) {
  const t = useTranslations("EditPost")

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirmCloseTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {saved
              ? t("confirmCloseSaved")
              : t("confirmCloseUnsaved")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setIsOpen(false)}>
            {t("cancel")}
          </AlertDialogCancel>

          <AlertDialogAction
            onClick={() => {
              setIsOpen(false)
              closeEditPost() // ⭐ 一定会关闭 edit post
            }}
          >
            {t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function LoginDialog({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}) {
  const t = useTranslations("EditPost")

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("loginTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("loginDesc")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setIsOpen(false)}>
            {t("cancel")}
          </AlertDialogCancel>

          <AlertDialogAction onClick={() => setIsOpen(false)}>
            {t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
