import type { ReactElement } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import ArrowLeftBack from "@/components/gekaixing/ArrowLeftBack";
import AdCancelButton from "@/components/gekaixing/AdCancelButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdStatus } from "@/generated/prisma/enums";
import { getAdMetrics } from "@/lib/ads/metrics";
import { formatCents } from "@/lib/ads/format";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<AdStatus, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING_PAYMENT: "outline",
  PAID: "secondary",
  ACTIVE: "default",
  PAUSED: "secondary",
  ENDED: "outline",
  REJECTED: "destructive",
  CANCELLED: "outline",
};

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}): Promise<ReactElement> {
  const t = await getTranslations("ImitationX.Ads");
  const { success } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ads = user?.id
    ? await Promise.all(
        (
          await prisma.sponsoredAd.findMany({
            where: { advertiserId: user.id },
            orderBy: { createdAt: "desc" },
            include: { post: { select: { id: true, content: true } } },
          })
        ).map(async (ad) => ({ ...ad, metrics: await getAdMetrics(ad.postId) }))
      )
    : [];

  const canCancel = (status: AdStatus): boolean =>
    status === AdStatus.PENDING_PAYMENT || status === AdStatus.PAID;

  return (
    <div>
      <div className="flex items-center justify-between pr-4">
        <ArrowLeftBack name={t("title")} href="/gekaixing" />
        <Link href="/gekaixing/ads/new">
          <Button size="sm">
            <Plus />
            {t("createNew")}
          </Button>
        </Link>
      </div>

      {success === "1" && (
        <div className="px-4 pb-2 text-sm text-green-600">{t("successBanner")}</div>
      )}

      {!user?.id || ads.length === 0 ? (
        <div className="px-4 py-10 text-sm text-muted-foreground">{t("empty")}</div>
      ) : (
        <div className="flex flex-col gap-3 px-4">
          {ads.map((ad) => (
            <Card key={ad.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  <Badge variant={STATUS_VARIANT[ad.status]}>{t(`status${ad.status}`)}</Badge>
                  <span className="font-normal text-muted-foreground">
                    {formatCents(ad.priceCents, ad.currency)} · {t("durationDays", { days: ad.durationDays })}
                  </span>
                </CardTitle>
                {canCancel(ad.status) && <AdCancelButton adId={ad.id} confirmText={t("cancelConfirm")} />}
              </CardHeader>
              <CardContent>
                <div
                  className="line-clamp-2 text-sm text-foreground/90"
                  dangerouslySetInnerHTML={{ __html: ad.post.content }}
                />
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span>
                    {t("impressions")}: {ad.metrics.impressions}
                  </span>
                  <span>
                    {t("clicks")}: {ad.metrics.clicks}
                  </span>
                  <span>
                    {t("ctr")}: {(ad.metrics.ctr * 100).toFixed(2)}%
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
