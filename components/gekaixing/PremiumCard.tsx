import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import { withTimeoutOrNull } from "@/lib/with-timeout";
import { prisma } from "@/lib/prisma";

export default async function PremiumCard() {
  const t = await getTranslations("ImitationX.Premium");

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

  return (
    <div className="rounded-3xl border border-border/70 bg-background p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-lg font-bold">{t("title")}</p>
        <ShieldCheck className="h-6 w-6 shrink-0 text-blue-500" />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      <Link
        href="/premium"
        className="mt-3 block w-full rounded-full bg-primary py-2 text-center text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
      >
        {t("subscribe")}
      </Link>
    </div>
  );
}
