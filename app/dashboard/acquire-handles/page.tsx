import { getTranslations } from "next-intl/server";

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
import { getDashboardAcquireHandlesData } from "@/lib/dashboard/service";
import { getDashboardViewer } from "@/lib/dashboard/viewer";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export default async function AcquireHandlesPage(): Promise<React.JSX.Element> {
  const { userId } = await getDashboardViewer();
  const [t, tc] = await Promise.all([
    getTranslations("Dashboard.handles"),
    getTranslations("Dashboard.common"),
  ]);
  const { summary, handles } = await getDashboardAcquireHandlesData(userId);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-3 lg:px-6">
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
            <CardDescription>{t("stats.activeCreators")}</CardDescription>
            <CardTitle>{summary.activeCreators}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.handle")}</TableHead>
                  <TableHead>{t("table.user")}</TableHead>
                  <TableHead>{t("table.posts")}</TableHead>
                  <TableHead>{t("table.followers")}</TableHead>
                  <TableHead>{t("table.tier")}</TableHead>
                  <TableHead className="text-right">{t("table.joinedAt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {handles.length ? (
                  handles.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">@{item.userid}</TableCell>
                      <TableCell>{item.name ?? tc("anonymousUser")}</TableCell>
                      <TableCell>{item.postCount}</TableCell>
                      <TableCell>{item.followerCount}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.isPremium ? tc("premium") : tc("standard")}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatDate(item.createdAt)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
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
