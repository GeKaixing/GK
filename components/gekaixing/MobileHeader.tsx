"use client";

import {
  AlignJustify,
  Bell,
  Bookmark,
  BriefcaseBusiness,
  Feather,
  Heart,
  House,
  LogIn,
  MessageSquare,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

import type { userResult } from "@/app/gekaixing/layout";
import SidebarAvatar from "./SidebarAvatar";

type MobileTranslations = {
  home: string;
  search: string;
  settings: string;
  login: string;
  publish: string;
};

export default function MobileHeader({
  user,
  labels,
  mentionCount = 0,
}: {
  user: userResult | null;
  labels: MobileTranslations;
  mentionCount?: number;
}) {
  const pathname = usePathname();
  const isExplore = pathname === "/gekaixing/explore";
  const isNotifications = pathname === "/gekaixing/notifications";
  const displayMentionCount = isNotifications ? 0 : mentionCount;

  return (
    <div className="sm:hidden">
      <div className="fixed top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4">
          <MobileDrawer user={user} labels={labels} mentionCount={displayMentionCount} />
          <Link href="/gekaixing" className="inline-flex items-center">
            <Image src="/logo.svg" width={24} height={12} alt="logo" className="dark:hidden" />
            <Image src="/logo-white.svg" width={24} height={12} alt="logo white" className="hidden dark:block" />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/gekaixing/explore"
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-muted",
                isExplore && "bg-muted text-primary"
              )}
              aria-label={labels.search}
            >
              <Search className="h-5 w-5" />
            </Link>
            {user?.id ? (
              <Link
                href="/gekaixing/notifications"
                className={cn(
                  "relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-muted",
                  isNotifications && "bg-muted text-primary"
                )}
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {displayMentionCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold text-primary-foreground">
                    {displayMentionCount > 99 ? "99+" : displayMentionCount}
                  </span>
                ) : null}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
      <div className="h-14" />
    </div>
  );
}

function MobileDrawer({
  user,
  labels,
  mentionCount,
}: {
  user: userResult | null;
  labels: MobileTranslations;
  mentionCount: number;
}) {
  const t = useTranslations("ImitationX.Sidebar");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button type="button" aria-label="Open menu" className="inline-flex items-center justify-center">
        <AlignJustify />
      </button>
    );
  }

  return (
    <Sheet>
      <SheetTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-muted">
        <AlignJustify className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-[88%] max-w-sm p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Mobile navigation menu</SheetDescription>
          {user?.id ? (
            <SheetClose asChild>
              <Link href={`/gekaixing/user/${user.id}`} className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={user.avatar || ""} />
                  <AvatarFallback>{user.name?.charAt(0)?.toUpperCase() || "U"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{user.name || "User"}</p>
                  <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                </div>
              </Link>
            </SheetClose>
          ) : null}
        </SheetHeader>

        <div className="flex h-full flex-col overflow-y-auto p-3 pb-24">
          <div className="space-y-1">
            <DrawerItem href="/gekaixing" icon={<House className="h-5 w-5" />} label={labels.home} />
            <DrawerItem href="/gekaixing/chat" icon={<MessageSquare className="h-5 w-5" />} label={t("chat")} />
            <DrawerItem href="/gekaixing/connect_people" icon={<Users className="h-5 w-5" />} label={t("connect")} />
            <DrawerItem href="/gekaixing/explore" icon={<Search className="h-5 w-5" />} label={t("explore")} />
            <DrawerItem href="/gekaixing/gkx" icon={<Sparkles className="h-5 w-5" />} label="GKX" />
            <DrawerItem href="/premium" icon={<ShieldCheck className="h-5 w-5" />} label={t("premium")} />
            <DrawerItem href="/gekaixing/likes" icon={<Heart className="h-5 w-5" />} label={t("likes")} />
            <DrawerItem href="/gekaixing/bookmarks" icon={<Bookmark className="h-5 w-5" />} label={t("bookmarks")} />
            <DrawerItem
              href="/gekaixing/notifications"
              icon={<Bell className="h-5 w-5" />}
              label={t("notifications")}
              badge={mentionCount > 0 ? (mentionCount > 99 ? "99+" : String(mentionCount)) : undefined}
            />
            <DrawerItem href="/gekaixing/jobs" icon={<BriefcaseBusiness className="h-5 w-5" />} label={t("jobs")} />
            {user?.id ? (
              <>
                <DrawerItem href="/gekaixing/settings" icon={<Settings className="h-5 w-5" />} label={labels.settings} />
                <DrawerItem href={`/gekaixing/user/${user.id}`} icon={<UserIcon className="h-5 w-5" />} label={t("profile")} />
              </>
            ) : (
              <DrawerItem href="/account" icon={<LogIn className="h-5 w-5" />} label={labels.login} />
            )}
          </div>

      
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DrawerItem({
  href,
  icon,
  label,
  badge,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  badge?: string;
}) {
  const pathname = usePathname();
  const isActive =
    href === "/gekaixing"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <SheetClose asChild>
      <Link
        href={href}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] font-semibold transition-colors hover:bg-muted",
          isActive && "bg-muted text-primary"
        )}
      >
        {icon}
        <span className="flex-1">{label}</span>
        {badge ? (
          <span className="min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-xs font-semibold text-primary-foreground">
            {badge}
          </span>
        ) : null}
      </Link>
    </SheetClose>
  );
}
