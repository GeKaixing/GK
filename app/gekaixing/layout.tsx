import Footer from "@/components/gekaixing/Footer";
import ChatMain from "@/components/gekaixing/ChatMain";
import HomeFeedPoll from "@/components/gekaixing/HomeFeedPoll";
import MobileFooter from "@/components/gekaixing/MobileFooter";
import MobileHeader from "@/components/gekaixing/MobileHeader";
import RightRail from "@/components/gekaixing/RightRail";
import Sidebar from "@/components/gekaixing/Sidebar";
import { prisma } from "@/lib/prisma";
import { hasNewHomeFeedTweets } from "@/lib/feed/newTweets";
import { withTimeoutOrNull } from "@/lib/with-timeout";
import { createClient } from "@/utils/supabase/server";
import { Prisma } from "@/generated/prisma/client";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import type { ReactElement, ReactNode } from "react";
import "highlight.js/styles/github-dark.css";

export interface userResult {
  name: string | null;
  id: string;
  userid: string;
  email: string;
  avatar: string | null;
  backgroundImage: string | null;
  briefIntroduction: string | null;
  createdAt: Date;
  isPremium: boolean;
  updatedAt: Date;
  _count: {
    followers: number;
    following: number;
  };
}

const NOTIFICATIONS_LAST_SEEN_COOKIE = "gkx_notifications_last_seen_at";
const HOME_FEED_LAST_SEEN_COOKIE = "gkx_home_feed_last_seen_at";

function parseSeenAt(raw: string | undefined): Date | null {
  if (!raw) {
    return null;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  const mobileT = await getTranslations("ImitationX.Mobile");
  const supabase = await createClient();
  let userId: string | null = null;

  try {
    const authResult = await withTimeoutOrNull(supabase.auth.getUser(), 8000);
    const user = authResult?.data.user ?? null;
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  let userInfo: userResult | null = null;
  if (userId) {
    try {
      userInfo = await withTimeoutOrNull(
        prisma.user.findUnique({
          where: {
            id: userId,
          },
          include: {
            _count: {
              select: {
                followers: true,
                following: true,
              },
            },
          },
        }),
        8000
      );
    } catch {
      userInfo = null;
    }
  }

  let mentionCount = 0;
  if (userInfo?.id) {
    try {
      const cookieStore = await cookies();
      const lastSeenAt = parseSeenAt(cookieStore.get(NOTIFICATIONS_LAST_SEEN_COOKIE)?.value);
      const mentionWhere: Prisma.PostWhereInput = {
        authorId: { not: userInfo.id },
        content: { contains: `@${userInfo.userid}`, mode: "insensitive" },
      };
      if (lastSeenAt) {
        mentionWhere.createdAt = { gt: lastSeenAt };
      }

      const mentionResult = await withTimeoutOrNull(
        prisma.post.count({
          where: mentionWhere,
        }),
        8000
      );
      mentionCount = mentionResult ?? 0;
    } catch {
      mentionCount = 0;
    }
  }

  let hasNewTweets = false;
  if (userInfo?.id) {
    try {
      const cookieStore = await cookies();
      const lastSeenAt = parseSeenAt(cookieStore.get(HOME_FEED_LAST_SEEN_COOKIE)?.value);
      hasNewTweets = await hasNewHomeFeedTweets(userInfo.id, lastSeenAt);
    } catch {
      hasNewTweets = false;
    }
  }

  return (
    <div className="min-h-screen">
      {userInfo?.id ? <HomeFeedPoll initialHasNewTweets={hasNewTweets} /> : null}
      <MobileHeader
        user={userInfo}
        mentionCount={mentionCount}
        labels={{
          home: mobileT("home"),
          search: mobileT("search"),
          settings: mobileT("settings"),
          login: mobileT("login"),
          publish: mobileT("publish"),
        }}
      />
      <div className="flex justify-center w-full mx-auto min-h-screen">
        <header className="hidden sm:flex w-[88px] xl:w-[275px] shrink-0 sticky top-0 h-screen transition-all duration-200">
          <Sidebar user={userInfo} mentionCount={mentionCount} hasNewTweets={hasNewTweets} />
        </header>
        <ChatMain>{children}</ChatMain>
        <RightRail>
          <Footer />
        </RightRail>
      </div>
      <MobileFooter
        hasNewTweets={hasNewTweets}
        labels={{
          home: mobileT("home"),
          search: mobileT("search"),
          notifications: mobileT("notifications"),
          chat: mobileT("chat"),
          gkx: mobileT("gkx"),
        }}
      />
    </div>
  );
}
