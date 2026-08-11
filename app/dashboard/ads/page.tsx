import { getTranslations } from "next-intl/server";

import AdsAdminActions from "@/components/dashboard/ads-admin-actions";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdStatus } from "@/generated/prisma/enums";
import { formatCents } from "@/lib/ads/format";
import { getAdMetrics } from "@/lib/ads/metrics";
import { prisma } from "@/lib/prisma";

const STATUS_VARIANT: Record<AdStatus, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING_PAYMENT: "outline",
  PAID: "secondary",
  ACTIVE: "default",
  PAUSED: "secondary",
  ENDED: "outline",
  REJECTED: "destructive",
  CANCELLED: "outline",
};

function formatDate(date: Date | null): string {
  if (!date) {
    return "—";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function DashboardAdsPage(): Promise<React.JSX.Element> {
  const t = await getTranslations("Dashboard.ads");

  const ads = await Promise.all(
    (
      await prisma.sponsoredAd.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          advertiser: { select: { id: true, name: true, userid: true } },
          post: { select: { id: true, content: true } },
        },
      })
    ).map(async (ad) => ({ ...ad, metrics: await getAdMetrics(ad.postId) }))
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("desc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.advertiser")}</TableHead>
              <TableHead>{t("table.post")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead>{t("table.price")}</TableHead>
              <TableHead>{t("table.duration")}</TableHead>
              <TableHead>{t("table.period")}</TableHead>
              <TableHead>{t("table.impressions")}</TableHead>
              <TableHead>{t("table.clicks")}</TableHead>
              <TableHead>{t("table.ctr")}</TableHead>
              <TableHead>{t("table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ads.length ? (
              ads.map((ad) => (
                <TableRow key={ad.id}>
                  <TableCell className="font-medium">
                    {ad.advertiser.name ?? `@${ad.advertiser.userid}`}
                  </TableCell>
                  <TableCell className="max-w-[240px]">
                    <span
                      className="line-clamp-2 text-sm text-muted-foreground"
                      dangerouslySetInnerHTML={{ __html: ad.post.content }}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[ad.status]}>{t(`status.${ad.status}`)}</Badge>
                  </TableCell>
                  <TableCell>{formatCents(ad.priceCents, ad.currency)}</TableCell>
                  <TableCell>{ad.durationDays}d</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDate(ad.startsAt)} → {formatDate(ad.endsAt)}
                  </TableCell>
                  <TableCell>{ad.metrics.impressions}</TableCell>
                  <TableCell>{ad.metrics.clicks}</TableCell>
                  <TableCell>{(ad.metrics.ctr * 100).toFixed(2)}%</TableCell>
                  <TableCell>
                    <AdsAdminActions adId={ad.id} status={ad.status} />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  {t("noData")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
