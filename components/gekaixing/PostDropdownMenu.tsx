'use client'
import React, { useState } from 'react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Ellipsis } from 'lucide-react'
import { userStore } from '@/store/user'
import { toast } from 'sonner'
import { copyToClipboard } from '@/utils/function/copyToClipboard'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { deleteUnusedImages } from '@/utils/function/deleteUnusedImages'
import { findUrls } from '@/utils/function/findUrls'
import { postStore } from '@/store/post'
import { replyStore } from '@/store/reply'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'


async function deletePost(id: string) {
    const result = await fetch(`/api/post`, {
        method: 'DELETE',
        body: JSON.stringify({ id }),
        headers: {
            'Content-Type': 'application/json',
        },
    });
    return result;
}
async function deleteReply(id: string) {
    const result = await fetch(`/api/reply`, {
        method: 'DELETE',
        body: JSON.stringify({ id }),
        headers: {
            'Content-Type': 'application/json',
        },
    });
    return result;
}
export default function PostDropdownMenu({ post_id, id, reply_id, user_id, type = 'post', content }: { reply_id?: string | null, post_id?: string, content: string; id: string, user_id: string, type?: string }) {
    const user = userStore()
    const t = useTranslations("ImitationX.PostDropdown")
    const isCurrentUser = user.id === user_id; // Check if the post belongs to
    const [isopen, setOpen] = useState(false)
    const [AlertDialogOpen, setAlertDialogOpen] = useState(false)
    const pathName = usePathname()
    const router = useRouter()
    async function deleteHandler() {
        let result

        if (type === 'reply') {
            // 🔁 1. 找到被删的那一项（用于失败回滚）
            const deletedPost = replyStore.getState().replies.find((post) => post.id === id)


            // 🧹 2. 乐观更新 UI
            replyStore.getState().removeReply(id)
            toast.success(t("toast.deleteSuccess"))
            // 🔨 3. 请求后端删除
            result = await deleteReply(id)

            const data = await result.json()

            if (data.success) {
                if (reply_id) {
                    postStore.getState().subReplyCount(reply_id!)
                } else {
                    postStore.getState().subReplyCount(post_id!)
                }
                const UrlsArray = findUrls(content)
                if (UrlsArray.length !== 0) {
                    const { data: UrlsArrayData, error: UrlsArrayError } = await deleteUnusedImages('post-image', UrlsArray)
                    
                }
            } else {
                // ❗️4. 删除失败，回滚 UI
                if (deletedPost) {
                    replyStore.getState().addReply(deletedPost)
                }
                toast.error(t("toast.deleteFailedRollback"))
            }

        } else {
            // 🔁 1. 找到被删的那一项（用于失败回滚）
            const deletedPost = postStore.getState().posts.find(post => post.id === id)


            // 🧹 2. 乐观更新 UI
            postStore.getState().deletePost(id)

            toast.success(t("toast.deleteSuccess"))
            // 🔨 3. 请求后端删除
            result = await deletePost(id)

            const data = await result.json()

            if (data.success) {

                const UrlsArray = findUrls(content)
                if (UrlsArray.length !== 0) {
                    const { data: UrlsArrayData, error: UrlsArrayError } = await deleteUnusedImages('post-image', UrlsArray)
                  
                }
                if (pathName.includes('/gekaixing/status')) {
                    router.replace("/gekaixing")
                }

            } else {
                // ❗️4. 删除失败，回滚 UI
                if (deletedPost) {
                    postStore.getState().addPost(deletedPost)
                }
                toast.error(t("toast.deleteFailedRollback"))
            }
        }
    }


    function report() {
        toast.success(t("toast.reportThanks"))
    }

    function CopyLink() {
        if (type === 'reply') {
            copyToClipboard(`${process.env.NEXT_PUBLIC_URL}/gekaixing/reply/${id}`)
            return;
        }
        copyToClipboard(`${process.env.NEXT_PUBLIC_URL}/gekaixing/status/${id}`)

    }

    return (
        <DropdownMenu open={isopen} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <DropdownMenuItem onClick={report}>{t("menu.reportPost")}</DropdownMenuItem>
                {isCurrentUser && type === "post" && (
                    <DropdownMenuItem onClick={() => router.push(`/gekaixing/ads/new?postId=${id}`)}>
                        {t("menu.promotePost")}
                    </DropdownMenuItem>
                )}
                {isCurrentUser && <DropdownMenuItem
                    onClick={() => setAlertDialogOpen(true)}
                >{t("menu.deletePost")}</DropdownMenuItem>}
                {userStore.getState().id && userStore.getState().id !== user_id && (
                    <DropdownMenuItem onClick={() => router.push(`/gekaixing/chat?userId=${user_id}`)}>
                        {t("menu.directMessage")}
                    </DropdownMenuItem>
                )}
                {userStore.getState().id && <DropdownMenuItem>{t("menu.followUser")}</DropdownMenuItem>}
                <DropdownMenuItem onClick={CopyLink}>{t("menu.copyLink")}</DropdownMenuItem>
                <DropdownMenuItem >
                    <Link href={`/gekaixing/user/${user_id}`}>{t("menu.viewUser")}</Link>
                </DropdownMenuItem>
            </DropdownMenuContent>
            <DeleteAlertDialog
                isopen={AlertDialogOpen}
                setOpen={setAlertDialogOpen}
                deleteHandler={deleteHandler}
                title={t("confirm.title")}
                description={t("confirm.description")}
                cancel={t("confirm.cancel")}
                confirm={t("confirm.confirm")}
            />

        </DropdownMenu>
    )
}

function DeleteAlertDialog({
    isopen,
    setOpen,
    deleteHandler,
    title,
    description,
    cancel,
    confirm,
}: {
    deleteHandler: () => void
    isopen: boolean
    setOpen: (open: boolean) => void
    title: string
    description: string
    cancel: string
    confirm: string
}) {

    return <AlertDialog open={isopen} onOpenChange={setOpen}>

        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>{title}</AlertDialogTitle>
                <AlertDialogDescription>
                    {description}
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>{cancel}</AlertDialogCancel>
                <AlertDialogAction onClick={deleteHandler}>{confirm}</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
}
