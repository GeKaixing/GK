'use client'
import { userStore } from "@/store/user";
import { postModalStore } from "@/store/postModal";
import { feedDotStore } from "@/store/feedDot";
import { chatDotStore } from "@/store/chatDot";
import { liveDotStore } from "@/store/liveDot";
import { MessageSquare, House, LogIn, Settings, Users, Search, Sparkles, CircleEllipsis, Heart, Bookmark, Feather, User as UserIcon, ShieldCheck, Bell, BriefcaseBusiness, Radio, History, Globe } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Ellipsis } from 'lucide-react'
import { copyToClipboard } from "@/utils/function/copyToClipboard";
import SidebarAvatar from "./SidebarAvatar";
import EditPost from "./EditPost";
import type { userResult } from "@/app/gekaixing/layout";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function Sidebar({ user, mentionCount = 0, hasNewTweets = false, hasUnreadChat = false, hasLive = false }: { user: userResult | null, mentionCount?: number, hasNewTweets?: boolean, hasUnreadChat?: boolean, hasLive?: boolean }) {
    const t = useTranslations("ImitationX.Sidebar");
    const router = useRouter();
    const pathname = usePathname();
    const [isMoreOpen, setIsMoreOpen] = useState(false)
    const { openModal } = postModalStore()
    const displayMentionCount = pathname === "/gekaixing/notifications" ? 0 : mentionCount
    const isActivePath = (href: string) => pathname === href || pathname.startsWith(href + "/")
    const homeActive = pathname === "/gekaixing"
    const polledNewTweets = feedDotStore((s) => s.hasNewTweets)
    const liveNewTweets = polledNewTweets ?? hasNewTweets
    const displayNewTweets = homeActive ? false : liveNewTweets
    const chatActive = isActivePath("/gekaixing/chat")
    const polledUnreadChat = chatDotStore((s) => s.hasUnreadChat)
    const liveUnreadChat = polledUnreadChat ?? hasUnreadChat
    const displayChatDot = chatActive ? false : liveUnreadChat
    const polledLive = liveDotStore((s) => s.hasLive)
    const displayLiveDot = polledLive ?? hasLive
    const profileActive = user?.id ? isActivePath(`/gekaixing/user/${user.id}`) : false
    const moreActive =
      ["/gekaixing/likes", "/gekaixing/bookmarks", "/gekaixing/notifications", "/gekaixing/jobs", "/gekaixing/history"].some(
        (href) => isActivePath(href)
      ) || profileActive
    const settingsActive = user?.id ? isActivePath("/gekaixing/settings") : false

    const navItems = [
      { href: "/gekaixing", icon: House, label: t("home"), active: homeActive },
      { href: "/gekaixing/chat", icon: MessageSquare, label: t("chat"), active: isActivePath("/gekaixing/chat") },
      { href: "/gekaixing/connect_people", icon: Users, label: t("connect"), active: isActivePath("/gekaixing/connect_people") },
      { href: "/gekaixing/explore", icon: Search, label: t("explore"), active: isActivePath("/gekaixing/explore") },
      { href: "/gekaixing/federated", icon: Globe, label: t("federated"), active: isActivePath("/gekaixing/federated") },
      { href: "/gekaixing/live", icon: Radio, label: t("live"), active: isActivePath("/gekaixing/live") },
      { href: "/gekaixing/gkx", icon: Sparkles, label: "GKX", active: isActivePath("/gekaixing/gkx") },
      { href: "/premium", icon: ShieldCheck, label: t("premium"), active: isActivePath("/premium") },
    ]

    useEffect(() => {
        userStore.setState({
            email: user?.email || '',
            id: user?.id || '',
            name: user?.name || 'anonymity',
            user_background_image: user?.backgroundImage || '',
            user_avatar: user?.avatar || '',
            brief_introduction: user?.briefIntroduction || '',
            isPremium: user?.isPremium || false,
            userid: user?.userid || '',
            followers: user?._count.followers ?? 0, // 被关注数
            following: user?._count.following ?? 0, // 关注数
        });
    }, [user]);

    const handleMoreMenuSelect = (href: string) => () => {
        setIsMoreOpen(false)
        router.push(href)
    }

    return (
        <nav className="w-full h-screen px-2 xl:px-4">
            <div className="flex flex-col h-full w-full">
                <div className="hidden xl:block px-3 pt-3 pb-1">
                    <Link href="/gekaixing" className="inline-flex items-center">
                        <Image src="/logo.svg" width={52} height={12} alt="logo" className="dark:hidden" />
                        <Image src="/logo-white.svg" width={52} height={12} alt="logo white" className="hidden dark:block" />
                    </Link>
                </div>
                <ul className="space-y-1 flex flex-col items-center xl:items-start">
                    {navItems.map((item) => {
                        const Icon = item.icon
                        return (
                            <li key={item.href} className="w-full">
                                <Link
                                    href={item.href}
                                    aria-current={item.active ? "page" : undefined}
                                    className={`flex items-center justify-center xl:justify-start gap-0 xl:gap-3 text-xl rounded-full p-3 w-full transition-colors hover:bg-muted/70 ${item.active ? "font-bold" : "font-normal"}`}
                                >
                                    <span className="relative inline-flex">
                                        <Icon className="w-7 h-7" fill={item.active ? "currentColor" : "none"} />
                                        {item.href === "/gekaixing" && displayNewTweets ? (
                                            <span aria-hidden className="absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full bg-blue-500" />
                                        ) : null}
                                        {item.href === "/gekaixing/chat" && displayChatDot ? (
                                            <span aria-hidden className="absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full bg-blue-500" />
                                        ) : null}
                                        {item.href === "/gekaixing/live" && displayLiveDot ? (
                                            <span aria-hidden className="absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full bg-blue-500" />
                                        ) : null}
                                    </span>
                                    <span className="hidden xl:inline">{item.label}</span>
                                </Link>
                            </li>
                        )
                    })}

                    <li className="w-full">
                        <DropdownMenu open={isMoreOpen} onOpenChange={setIsMoreOpen}>
                            <DropdownMenuTrigger asChild>
                                <button className={`flex items-center justify-center xl:justify-start gap-0 xl:gap-3 text-xl rounded-full p-3 w-full cursor-pointer transition-colors hover:bg-muted/70 ${moreActive ? "font-bold" : "font-normal"}`}>
                                    {moreActive ? (
                                        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
                                            <circle cx="12" cy="12" r="10" />
                                            <circle cx="17" cy="12" r="1.5" fill="var(--color-background)" />
                                            <circle cx="12" cy="12" r="1.5" fill="var(--color-background)" />
                                            <circle cx="7" cy="12" r="1.5" fill="var(--color-background)" />
                                        </svg>
                                    ) : (
                                        <CircleEllipsis className="w-7 h-7" />
                                    )}
                                    <span className="hidden xl:inline">{t("more")}</span>
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent side="right" align="start" className="w-60 rounded-xl border-border/70 p-1.5 shadow-xl">
                                <DropdownMenuItem
                                    onSelect={handleMoreMenuSelect("/gekaixing/likes")}
                                    className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-[15px] ${isActivePath("/gekaixing/likes") ? "font-bold" : "font-normal"}`}
                                >
                                    <Heart className="h-5 w-5" fill={isActivePath("/gekaixing/likes") ? "currentColor" : "none"} />
                                    <span>{t("likes")}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onSelect={handleMoreMenuSelect("/gekaixing/bookmarks")}
                                    className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-[15px] ${isActivePath("/gekaixing/bookmarks") ? "font-bold" : "font-normal"}`}
                                >
                                    <Bookmark className="h-5 w-5" fill={isActivePath("/gekaixing/bookmarks") ? "currentColor" : "none"} />
                                    <span>{t("bookmarks")}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onSelect={handleMoreMenuSelect("/gekaixing/notifications")}
                                    className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-[15px] ${isActivePath("/gekaixing/notifications") ? "font-bold" : "font-normal"}`}
                                >
                                    <Bell className="h-5 w-5" fill={isActivePath("/gekaixing/notifications") ? "currentColor" : "none"} />
                                    <span>{t("notifications")}</span>
                                    {displayMentionCount > 0 ? (
                                        <span className="ml-auto min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-xs font-semibold text-primary-foreground">
                                            {displayMentionCount > 99 ? "99+" : displayMentionCount}
                                        </span>
                                    ) : null}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onSelect={handleMoreMenuSelect("/gekaixing/jobs")}
                                    className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-[15px] ${isActivePath("/gekaixing/jobs") ? "font-bold" : "font-normal"}`}
                                >
                                    <BriefcaseBusiness className="h-5 w-5" fill={isActivePath("/gekaixing/jobs") ? "currentColor" : "none"} />
                                    <span>{t("jobs")}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onSelect={handleMoreMenuSelect("/gekaixing/history")}
                                    className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-[15px] ${isActivePath("/gekaixing/history") ? "font-bold" : "font-normal"}`}
                                >
                                    <History className="h-5 w-5" />
                                    <span>{t("history")}</span>
                                </DropdownMenuItem>
                                {user?.id && (
                                    <DropdownMenuItem
                                        onSelect={handleMoreMenuSelect(`/gekaixing/user/${user.id}`)}
                                        className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-[15px] ${profileActive ? "font-bold" : "font-normal"}`}
                                    >
                                        <UserIcon className="h-5 w-5" fill={profileActive ? "currentColor" : "none"} />
                                        <span>{t("profile")}</span>
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </li>

                    {user?.id && (
                        <li className="w-full">
                            <Link
                                href="/gekaixing/settings"
                                aria-current={settingsActive ? "page" : undefined}
                                className={`flex items-center justify-center xl:justify-start gap-0 xl:gap-3 text-xl rounded-full p-3 w-full transition-colors hover:bg-muted/70 ${settingsActive ? "font-bold" : "font-normal"}`}
                            >
                                {settingsActive ? (
                                    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
                                        <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
                                        <circle cx="12" cy="12" r="3" fill="var(--color-background)" />
                                    </svg>
                                ) : (
                                    <Settings className="w-7 h-7" />
                                )}
                                <span className="hidden xl:inline">{t("settings")}</span>
                            </Link>
                        </li>
                    )}
                    {user?.id && (
                        <li className="w-full mt-4 flex justify-center items-center">
                            <button
                                onClick={openModal}
                                className="w-12 h-12 xl:w-full xl:h-auto xl:py-3 bg-primary text-primary-foreground rounded-full flex items-center justify-center hover:opacity-90 transition-colors"
                            >
                                <Feather className="w-5 h-5 xl:hidden" />
                                <span className="hidden xl:inline font-bold text-lg">{t("publish")}</span>
                            </button>
                        </li>
                    )}

                    {!user?.id ? (
                        <li className="w-full">
                            <Link href="/account" className="flex items-center justify-center xl:justify-start gap-0 xl:gap-3 text-xl font-bold hover:bg-muted/70 rounded-full p-3 w-full transition-colors">
                                <LogIn className="w-7 h-7" />
                                <span className="hidden xl:inline">{t("login")}</span>
                            </Link>
                        </li>
                    ) : null}
                </ul>

                {user?.id && (
                    <div className="mt-auto mb-4 w-full flex justify-center  items-center ">
                        <SidebarAvatar />
                    </div>
                )}

                {user?.id && <EditPost />}
            </div>
        </nav>
    )
}

async function logoutfetch() {
    const result = await fetch('/api/logout', { method: 'POST' })
    return result
}

export function SidebarDropdownMenu() {
    const t = useTranslations("ImitationX.Sidebar")
    const { email, id } = userStore((state) => state)

    return (
        <DropdownMenu>
            <DropdownMenuTrigger>
                <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <Link href="/gekaixing/notifications"><DropdownMenuItem>{t("notifications")}</DropdownMenuItem></Link>
                <Link href="/account"><DropdownMenuItem onClick={logoutfetch}>{t("logout")} {email}</DropdownMenuItem></Link>
                <Link href={`/gekaixing/user/${id}`}><DropdownMenuItem>{t("profile")}</DropdownMenuItem></Link>
                <DropdownMenuItem onClick={() => copyToClipboard(`${process.env.NEXT_PUBLIC_URL}/gekaixing/user/${id}`)}>{t("copyProfileLink")}</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
