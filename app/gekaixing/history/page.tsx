import ArrowLeftBack from "@/components/gekaixing/ArrowLeftBack"
import ClearHistoryButton from "@/components/gekaixing/ClearHistoryButton"
import PostStore from "@/components/gekaixing/PostStore"
import { getHistoryFeed } from "@/lib/feed/history"
import { createClient } from "@/utils/supabase/server"
import { getTranslations } from "next-intl/server"
import type { ReactElement } from "react"

export const dynamic = "force-dynamic"

export default async function HistoryPage(): Promise<ReactElement> {
  const tSidebar = await getTranslations("ImitationX.Sidebar")

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.id) {
    return (
      <div>
        <ArrowLeftBack name={tSidebar("history")} />
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          {tSidebar("historyEmpty")}
        </div>
      </div>
    )
  }

  const feed = await getHistoryFeed(user.id, 0)

  return (
    <div>
      <ArrowLeftBack name={tSidebar("history")} />
      {feed.data.length > 0 ? (
        <div className="px-4 pb-2">
          <ClearHistoryButton />
        </div>
      ) : (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          {tSidebar("historyEmpty")}
        </div>
      )}
      {feed.data.length > 0 && (
        <div className="px-4 pt-4">
          <PostStore
            data={feed.data}
            nextCursor={feed.page.nextCursor}
            hasMore={feed.page.hasMore}
            feedQuery={{ scope: "user-history", targetId: user.id }}
          />
        </div>
      )}
    </div>
  )
}
