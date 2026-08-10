import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { DashboardEngagementPanel } from "@/components/dashboard/dashboard-engagement-panel";
import { DashboardTrendChart } from "@/components/dashboard/dashboard-trend-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { getDashboardHomeData } from "@/lib/dashboard/service";
import { getDashboardViewer } from "@/lib/dashboard/viewer";

function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatRate(value: number): string {
  return `${value.toFixed(2)}%`;
}

function computeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return (numerator / denominator) * 100;
}

type DashboardPageSearchParams = {
  metricMode?: string | string[];
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardPageSearchParams>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const selectedModeRaw = Array.isArray(params.metricMode) ? params.metricMode[0] : params.metricMode;
  const selectedMode = selectedModeRaw === "pv" ? "pv" : "uv";
  const uvMode = selectedMode === "uv";
  const locale = await getLocale();
  const { userId } = await getDashboardViewer();

  const [t, tc, te] = await Promise.all([
    getTranslations("Dashboard.home"),
    getTranslations("Dashboard.common"),
    getTranslations("Dashboard.engagement"),
  ]);

  const { summary, rates, trend, recentPosts, engagement } = await getDashboardHomeData(userId);

  const formatMetricPair = (uvValue: number, uvBase: number, pvValue: number, pvBase: number): string => {
    return uvMode ? `UV ${uvValue}/${uvBase}` : `PV ${pvValue}/${pvBase}`;
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2 xl:grid-cols-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardDescription>{t("stats.totalUsers")}</CardDescription>
            <CardTitle>{summary.totalUsers}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("stats.premiumUsers")}</CardDescription>
            <CardTitle>{summary.totalPremiumUsers}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("stats.postsReplies")}</CardDescription>
            <CardTitle>
              {summary.totalPosts} / {summary.totalReplies}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("stats.weeklyAdded")}</CardDescription>
            <CardTitle>
              {summary.weeklyNewUsers} / {summary.weeklyNewPosts}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="px-4 lg:px-6">
        <DashboardEngagementPanel
          engagement={engagement}
          locale={locale}
          labels={{
            title: te("title"),
            impressions: te("impressions"),
            engagementRate: te("engagementRate"),
            replies: te("replies"),
            posts: te("posts"),
            growth: te("growth"),
          }}
        />
      </div>

      <div className="flex justify-end px-4 lg:px-6">
        <div className="inline-flex items-center gap-2 rounded-md border p-1">
          <Button asChild size="sm" variant={uvMode ? "default" : "outline"}>
            <Link href="/dashboard?metricMode=uv">UV</Link>
          </Button>
          <Button asChild size="sm" variant={uvMode ? "outline" : "default"}>
            <Link href="/dashboard?metricMode=pv">PV</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-3 lg:px-6">
        <Card>
          <CardHeader>
            <CardDescription>{te("postClickRate")}</CardDescription>
            <CardTitle>
              {formatRate(uvMode ? rates.postClickRate : computeRate(rates.postClicksPv, rates.impressionsPv))}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {formatMetricPair(rates.postClicks, rates.impressions, rates.postClicksPv, rates.impressionsPv)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{te("replyRate")}</CardDescription>
            <CardTitle>
              {formatRate(uvMode ? rates.replyRate : computeRate(rates.repliesReceivedPv, rates.impressionsPv))}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {formatMetricPair(rates.repliesReceived, rates.impressions, rates.repliesReceivedPv, rates.impressionsPv)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{te("profileEnterRate")}</CardDescription>
            <CardTitle>
              {formatRate(uvMode ? rates.profileEnterRate : computeRate(rates.profileEntersPv, rates.impressionsPv))}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {formatMetricPair(rates.profileEnters, rates.impressions, rates.profileEntersPv, rates.impressionsPv)}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("trendTitle")}</CardTitle>
            <CardDescription>{t("trendDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {trend.length ? (
              <DashboardTrendChart data={trend} />
            ) : (
              <div className="text-sm text-muted-foreground">{t("noTrend")}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("recentTitle")}</CardTitle>
            <CardDescription>{t("recentDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.author")}</TableHead>
                  <TableHead>{t("table.content")}</TableHead>
                  <TableHead>{t("table.engagement")}</TableHead>
                  <TableHead className="text-right">{t("table.time")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPosts.length ? (
                  recentPosts.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">{item.author.name ?? tc("anonymousUser")}</div>
                        <div className="text-xs text-muted-foreground">@{item.author.userid}</div>
                      </TableCell>
                      <TableCell className="max-w-[320px]">
                        <div
                          className="whitespace-pre-wrap break-words"
                          dangerouslySetInnerHTML={{ __html: item.content }}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{t("badge.likes", { count: item.likeCount })}</Badge>
                          <Badge variant="outline">{t("badge.replies", { count: item.replyCount })}</Badge>
                          <Badge variant="outline">{t("badge.shares", { count: item.shareCount })}</Badge>
                          <Badge variant="secondary">
                            {te("postClickRate")}: {formatRate(uvMode ? item.metrics.postClickRate : computeRate(item.metrics.postClicksPv, item.metrics.impressionsPv))}
                          </Badge>
                          <Badge variant="secondary">
                            {te("replyRate")}: {formatRate(uvMode ? item.metrics.replyRate : computeRate(item.metrics.repliesReceivedPv, item.metrics.impressionsPv))}
                          </Badge>
                          <Badge variant="secondary">
                            {te("profileEnterRate")}: {formatRate(uvMode ? item.metrics.profileEnterRate : computeRate(item.metrics.profileEntersPv, item.metrics.impressionsPv))}
                          </Badge>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {formatMetricPair(item.metrics.postClicks, item.metrics.impressions, item.metrics.postClicksPv, item.metrics.impressionsPv)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatMetricPair(item.metrics.repliesReceived, item.metrics.impressions, item.metrics.repliesReceivedPv, item.metrics.impressionsPv)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatMetricPair(item.metrics.profileEnters, item.metrics.impressions, item.metrics.profileEntersPv, item.metrics.impressionsPv)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatDate(item.createdAt, locale)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      {t("noPosts")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
