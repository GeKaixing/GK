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
import { getDashboardSettingsData } from "@/lib/dashboard/service";
import { getDashboardViewer } from "@/lib/dashboard/viewer";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function SettingsPage(): Promise<React.JSX.Element> {
  const { userId } = await getDashboardViewer();
  const [t, tc] = await Promise.all([
    getTranslations("Dashboard.settings"),
    getTranslations("Dashboard.common"),
  ]);
  const { summary, recentActions } = await getDashboardSettingsData(userId);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-3 lg:px-6">
        <Card>
          <CardHeader>
            <CardDescription>{t("stats.totalLogs")}</CardDescription>
            <CardTitle>{summary.totalActions}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("stats.logsToday")}</CardDescription>
            <CardTitle>{summary.actionsToday}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("stats.env")}</CardDescription>
            <CardTitle>
              <Badge variant={summary.environmentReady ? "default" : "destructive"}>
                {summary.environmentReady ? tc("ready") : tc("missing")}
              </Badge>
            </CardTitle>
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
                  <TableHead>{t("table.action")}</TableHead>
                  <TableHead>{t("table.user")}</TableHead>
                  <TableHead>{t("table.targetPost")}</TableHead>
                  <TableHead className="text-right">{t("table.time")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentActions.length ? (
                  recentActions.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Badge variant="outline">{item.actionType}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{item.user.name ?? tc("anonymousUser")}</div>
                        <div className="text-xs text-muted-foreground">@{item.user.userid}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.targetPostId ?? "-"}</TableCell>
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
