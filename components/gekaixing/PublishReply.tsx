'use client'

import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { TooltipProvider } from "@/components/ui/tooltip"
import { useEffect, useState } from "react"
import { userStore } from "@/store/user"
import Link from "next/link"
import { replyStore } from "@/store/reply"
import { postStore } from "@/store/post"
import { Loader2, Music2, Video } from "lucide-react"
import { useTranslations } from "next-intl"
import { MinimalTiptapEditor } from "../ui/minimal-tiptap"
import { ToolbarButton } from "../ui/minimal-tiptap/components/toolbar-button"
import { useRichPostEditor } from "./useRichPostEditor"

async function publishReply(payload: {
    user_id: string
    user_name: string
    user_email: string
    post_id: string
    content: string
    videoUrl: string | null
    audioUrl: string | null
    user_avatar: string | null
    reply_id?: string | null
}) {
    const res = await fetch('/api/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })

    return res.json()
}

type Props = {
    postId: string
    replyId?: string
    userId: string | undefined
    type?: 'post' | 'reply'
}

export default function PublishReply({
    postId,
    replyId,
    userId,
    type = 'post',
}: Props) {
    const t = useTranslations("PublishReply")
    // 媒体上传按钮文案沿用 EditPost 命名空间（编辑器本身也用它）
    const tMedia = useTranslations("EditPost")

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

    const { addReply, replaceReply, removeReply } = replyStore()
    const { addReplyCount, subReplyCount } = postStore()

    const {
        email,
        user_avatar,
        name,
        isPremium,
    } = userStore()

    // 组件卸载（离开页面）时清理废弃的视频/音频
    useEffect(() => {
        return () => {
            cleanupMedia([])
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // 编辑器在 SSR 阶段不会渲染（immediatelyRender 在服务端被强制为 false），
    // 若直接渲染会在 hydration 时与客户端产生不一致。因此只在客户端挂载后再
    // 渲染编辑器，SSR 先渲染占位符。
    const [mounted, setMounted] = useState(false)
    useEffect(() => {
        setMounted(true)
    }, [])

    async function handleReply() {
        if (!hasPublishableContent(value) || !userId) return

        const tempId = 'temp-' + Date.now()
        const content = value as string
        const { videoUrl, audioUrl, allUrls } = extractEmbeddedMediaUrls(content)

        const optimisticReply = {
            id: tempId,
            content,
            videoUrl,
            audioUrl,
            createdAt: new Date(),

            user_id: userId,
            user_name: name || email,
            user_avatar,
            user_userid: userId,
            isPremium,

            like: 0,
            star: 0,
            share: 0,
            reply: 0,

            likedByMe: false,
            bookmarkedByMe: false,
            sharedByMe: false,
        }

        // 🔥 reply 归 replyStore 管
        addReply(optimisticReply)

        // 🔥 post 归 postStore 管
        addReplyCount(postId)

        try {
            const data = await publishReply({
                user_id: userId,
                user_avatar,
                user_name: name || email,
                user_email: email,
                post_id: postId,
                content,
                videoUrl,
                audioUrl,
                reply_id: type === 'reply' ? replyId ?? null : null,
            })

            if (data?.success && data?.data) {
                const real = data.data

                replaceReply(tempId, {
                    ...optimisticReply,
                    id: real.id,
                    videoUrl: real.videoUrl ?? optimisticReply.videoUrl,
                    audioUrl: real.audioUrl ?? null,
                    createdAt: new Date(real.createdAt),
                })

                // 发布成功后清理未用媒体，再清空编辑器
                cleanupMedia(allUrls)
                reset()
            } else {
                throw new Error('Publish failed')
            }
        } catch (error) {
            // 回滚：保留编辑器内容和已传媒体，方便用户重试
            removeReply(tempId)
            subReplyCount(postId)
        }
    }

    return (
        <Card className="relative w-full p-2">
            <TooltipProvider>
                {userId ? (
                    <>
                        <div className="flex items-start gap-2">
                            <Avatar className="mt-1 shrink-0">
                                <AvatarImage src={user_avatar ?? undefined} />
                                <AvatarFallback>
                                    {name?.charAt(0)?.toUpperCase()
                                        || email?.charAt(0)?.toUpperCase()
                                        || 'U'}
                                </AvatarFallback>
                            </Avatar>

                            <div className="min-w-0 flex-1">
                                {mounted ? (
                                    <MinimalTiptapEditor
                                        value={value}
                                        onChange={setValue}
                                        onEditorReady={setEditor}
                                        publish={handleReply}
                                        canPublish={hasPublishableContent(value)}
                                        status={false}
                                        onAiGenerate={handleAiPolish}
                                        aiGenerating={aiGenerating}
                                        className="w-full"
                                        editorContentClassName="px-3 py-2"
                                        output="html"
                                        placeholder={t("placeholder")}
                                        editable
                                        editorClassName="focus:outline-hidden"
                                        toolbarOnFocus
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
                                                    tooltip={tMedia("uploadVideo")}
                                                    aria-label={tMedia("uploadVideo")}
                                                >
                                                    {videoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                                                </ToolbarButton>
                                                <ToolbarButton
                                                    type="button"
                                                    size="sm"
                                                    onClick={() => audioInputRef.current?.click()}
                                                    disabled={audioUploading}
                                                    tooltip={tMedia("uploadAudio")}
                                                    aria-label={tMedia("uploadAudio")}
                                                >
                                                    {audioUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music2 className="h-4 w-4" />}
                                                </ToolbarButton>
                                            </div>
                                        }
                                    />
                                ) : (
                                    <div className="h-32 w-full rounded-md border border-input" />
                                )}
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
                            </div>
                        </div>
                    </>
                ) : (
                    <Link
                        href="/account"
                        className="rounded-2xl font-bold bg-muted-foreground text-primary-foreground h-8 flex justify-center items-center w-full"
                    >
                        {t("loginToReply")}
                    </Link>
                )}
            </TooltipProvider>
        </Card>
    )
}
