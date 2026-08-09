'use client'
import { userStore } from "@/store/user";
import { postModalStore } from "@/store/postModal";
import { MessageSquare, House, LogIn, Settings, Users, Search, Sparkles, CircleEllipsis, Heart, Bookmark, Feather, User as UserIcon, ShieldCheck, Bell, BriefcaseBusiness } from "lucide-react";
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

export default function Sidebar({ user, mentionCount = 0 }: { user: userResult | null, mentionCount?: number }) {
    const t = useTranslations("ImitationX.Sidebar");
    const router = useRouter();
    const pathname = usePathname();
    const [isMoreOpen, setIsMoreOpen] = useState(false)
    const { openModal } = postModalStore()
    const displayMentionCount = pathname === "/gekaixing/notifications" ? 0 : mentionCount
    const isActivePath = (href: string) => pathname === href || pathname.startsWith(href + "/")
    const homeActive = pathname === "/gekaixing"
    const moreActive = ["/gekaixing/likes", "/gekaixing/bookmarks", "/gekaixing/notifications", "/gekaixing/jobs"].some(
      (href) => isActivePath(href)
    )
    const settingsActive = user?.id ? isActivePath("/gekaixing/settings") : false
    const profileActive = user?.id ? isActivePath(`/gekaixing/user/${user.id}`) : false

    const navItems = [
      { href: "/gekaixing", icon: House, label: t("home"), active: homeActive },
      { href: "/gekaixing/chat", icon: MessageSquare, label: t("chat"), active: isActivePath("/gekaixing/chat") },
      { href: "/gekaixing/connect_people", icon: Users, label: t("connect"), active: isActivePath("/gekaixing/connect_people") },
      { href: "/gekaixing/explore", icon: Search, label: t("explore"), active: isActivePath("/gekaixing/explore") },
      { href: "/gekaixing/gkx", icon: Sparkles, label: "GKX", active: isActivePath("/gekaixing/gkx") },
      { href: "/gekaixing/premium", icon: ShieldCheck, label: t("premium"), active: isActivePath("/gekaixing/premium") },
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
                                    <Icon className="w-7 h-7" fill={item.active ? "currentColor" : "none"} />
                                    <span className="hidden xl:inline">{item.label}</span>
                                </Link>
                            </li>
                        )
                    })}

                    <li className="w-full">
                        <DropdownMenu open={isMoreOpen} onOpenChange={setIsMoreOpen}>
                            <DropdownMenuTrigger asChild>
                                <button className={`flex items-center justify-center xl:justify-start gap-0 xl:gap-3 text-xl rounded-full p-3 w-full cursor-pointer transition-colors hover:bg-muted/70 ${moreActive ? "font-bold" : "font-normal"}`}>
                                    <CircleEllipsis className="w-7 h-7" fill={moreActive ? "currentColor" : "none"} />
                                    <span className="hidden xl:inline">{t("more")}</span>
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent side="right" align="start" className="w-48">
                                <DropdownMenuItem onSelect={handleMoreMenuSelect("/gekaixing/likes")} className="flex items-center gap-2 cursor-pointer">
                                    <Heart className="w-4 h-4" />
                                    <span>{t("likes")}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={handleMoreMenuSelect("/gekaixing/bookmarks")} className="flex items-center gap-2 cursor-pointer">
                                    <Bookmark className="w-4 h-4" />
                                    <span>{t("bookmarks")}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={handleMoreMenuSelect("/gekaixing/notifications")} className="flex items-center gap-2 cursor-pointer">
                                    <Bell className="w-4 h-4" />
                                    <span>{t("notifications")}</span>
                                    {displayMentionCount > 0 ? (
                                        <span className="ml-auto min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-xs font-semibold text-primary-foreground">
                                            {displayMentionCount > 99 ? "99+" : displayMentionCount}
                                        </span>
                                    ) : null}
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={handleMoreMenuSelect("/gekaixing/jobs")} className="flex items-center gap-2 cursor-pointer">
                                    <BriefcaseBusiness className="w-4 h-4" />
                                    <span>{t("jobs")}</span>
                                </DropdownMenuItem>
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
                                <Settings className="w-7 h-7" fill={settingsActive ? "currentColor" : "none"} />
                                <span className="hidden xl:inline">{t("settings")}</span>
                            </Link>
                        </li>
                    )}
                    {user?.id && (
                        <li className="w-full">
                            <Link
                                href={`/gekaixing/user/${user?.id}`}
                                aria-current={profileActive ? "page" : undefined}
                                className={`flex items-center justify-center xl:justify-start gap-0 xl:gap-3 text-xl rounded-full p-3 w-full transition-colors hover:bg-muted/70 ${profileActive ? "font-bold" : "font-normal"}`}
                            >
                                <UserIcon className="w-7 h-7" fill={profileActive ? "currentColor" : "none"} />
                                <span className="hidden xl:inline">{t("profile")}</span>
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
