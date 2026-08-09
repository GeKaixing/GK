import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { withTimeoutOrNull } from "@/lib/with-timeout";
import { prisma } from "@/lib/prisma";
import PremiumCardClient from "./PremiumCardClient";

const PREMIUM_CARD_DISMISSED_COOKIE = "gkx_premium_card_dismissed_at";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 关闭后 7 天内不再展示

export default async function PremiumCard() {
  // 已购买会员的用户不再展示升级引导
  const supabase = await createClient();
  let userId: string | null = null;
  try {
    const authResult = await withTimeoutOrNull(supabase.auth.getUser(), 8000);
    userId = authResult?.data.user?.id ?? null;
  } catch {
    userId = null;
  }

  if (userId) {
    const dbUser = await withTimeoutOrNull(
      prisma.user.findUnique({
        where: { id: userId },
        select: { isPremium: true },
      }),
      8000
    );
    if (dbUser?.isPremium) return null;
  }

  // 用户主动关闭后 7 天内不再展示（cookie 由服务端读取，首屏即隐藏、无闪烁）
  try {
    const cookieStore = await cookies();
    const dismissedAt = Number(cookieStore.get(PREMIUM_CARD_DISMISSED_COOKIE)?.value);
    // eslint-disable-next-line react-hooks/purity -- per-request TTL comparison in a server component
    if (!Number.isNaN(dismissedAt) && Date.now() - dismissedAt < DISMISS_TTL_MS) {
      return null;
    }
  } catch {
    // ignore
  }

  return <PremiumCardClient />;
}
