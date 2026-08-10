import { getTranslations } from "next-intl/server";

import { DashboardPremiumRateChart } from "@/components/dashboard/dashboard-premium-rate-chart";
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
import { getDashboardBillingData } from "@/lib/dashboard/service";
import { getDashboardViewer } from "@/lib/dashboard/viewer";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export default async function BillingPage(): Promise<React.JSX.Element> {
  const { userId } = await getDashboardViewer();
  const [t, tc] = await Promise.all([
    getTranslations("Dashboard.billing"),
    getTranslations("Dashboard.common"),
  ]);
  const { summary, premiumUsers } = await getDashboardBillingData(userId);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardDescription>{t("stats.totalUsers")}</CardDescription>
            <CardTitle>{summary.totalUsers}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("stats.premiumUsers")}</CardDescription>
            <CardTitle>{summary.premiumUsers}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("stats.premiumRate")}</CardDescription>
            <CardTitle>{summary.premiumRate}%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("stats.newPremium7d")}</CardDescription>
            <CardTitle>{summary.newPremiumUsers7d}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-3 lg:px-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{t("stats.premiumRate")}</CardTitle>
            <CardDescription>{t("stats.premiumUsers")} / {t("stats.totalUsers")}</CardDescription>
          </CardHeader>
          <CardContent>
            <DashboardPremiumRateChart premiumUsers={summary.premiumUsers} totalUsers={summary.totalUsers} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.user")}</TableHead>
                  <TableHead>{t("table.handle")}</TableHead>
                  <TableHead>{t("table.posts")}</TableHead>
                  <TableHead className="text-right">{t("table.openedAt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {premiumUsers.length ? (
                  premiumUsers.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name ?? tc("anonymousUser")}</TableCell>
                      <TableCell>@{item.userid}</TableCell>
                      <TableCell>{item.postCount}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatDate(item.createdAt)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      {t("noData")}
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
