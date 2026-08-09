 "use client"
import { House, Search, Bell, MessageSquare, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React from 'react'
import { cn } from '@/lib/utils'

type MobileFooterTranslations = {
    home: string
    search: string
    notifications: string
    chat: string
    gkx: string
}

export default function MobileFooter({
    labels,
}: {
    labels: MobileFooterTranslations
}) {
    const pathname = usePathname()
    const isHome = pathname === "/gekaixing"
    const isExplore = pathname === "/gekaixing/explore"
    const isNotifications = pathname === "/gekaixing/notifications"
    const isChat = pathname === "/gekaixing/chat"
    const isGkx = pathname === "/gekaixing/gkx" || pathname.startsWith("/gekaixing/gkx/")

    return (
        <div className='sm:hidden fixed bottom-0 w-full flex flex-row px-2 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow bg-background/95 backdrop-blur border-t border-border'>
            <ul className='w-full flex items-center justify-around'>
                <Link
                    href={'/gekaixing'}
                    data-value={labels.home}
                    className={cn("rounded-full p-2 transition-colors", isHome && "bg-muted text-primary")}
                >
                    <House />
                </Link>
                <Link
                    href={'/gekaixing/explore'}
                    data-value={labels.search}
                    className={cn("rounded-full p-2 transition-colors", isExplore && "bg-muted text-primary")}
                >
                    <Search />
                </Link>
                <Link
                    href={'/gekaixing/gkx'}
                    data-value={labels.gkx}
                    className={cn("rounded-full p-2 transition-colors", isGkx && "bg-muted text-primary")}
                >
                    <Sparkles />
                </Link>
                <Link
                    href={'/gekaixing/notifications'}
                    data-value={labels.notifications}
                    className={cn("rounded-full p-2 transition-colors", isNotifications && "bg-muted text-primary")}
                >
                    <Bell />
                </Link>
                <Link
                    href={'/gekaixing/chat'}
                    data-value={labels.chat}
                    className={cn("rounded-full p-2 transition-colors", isChat && "bg-muted text-primary")}
                >
                    <MessageSquare />
                </Link>
            </ul>
        </div>
    )
}
