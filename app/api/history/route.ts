import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { UserActionType } from "@/generated/prisma/enums";
import { createClient } from "@/utils/supabase/server";
import { deleteFeedCache } from "@/lib/feed/cache";

export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { count } = await prisma.userAction.deleteMany({
      where: {
        userId: user.id,
        actionType: UserActionType.POST_CLICK,
      },
    });

    // Browsing-history clicks feed the home-feed behavior boost; invalidate the
    // ranked cache so the next compute no longer sees them.
    await deleteFeedCache(user.id);

    return NextResponse.json({ success: true, deleted: count });
  } catch (error) {
    console.error("Failed to clear browsing history:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
