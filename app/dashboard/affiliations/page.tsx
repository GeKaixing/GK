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
import { getDashboardAffiliationsData } from "@/lib/dashboard/service";
import { getDashboardViewer } from "@/lib/dashboard/viewer";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function AffiliationsPage(): Promise<React.JSX.Element> {
  const { userId } = await getDashboardViewer();
  const [t, tc] = await Promise.all([
    getTranslations("Dashboard.affiliations"),
    getTranslations("Dashboard.common"),
  ]);
  const { summary, links } = await getDashboardAffiliationsData(userId);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardDescription>{t("stats.totalLinks")}</CardDescription>
            <CardTitle>{summary.totalLinks}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("stats.following")}</CardDescription>
            <CardTitle>{summary.followingLinks}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("stats.requested")}</CardDescription>
            <CardTitle>{summary.requestedLinks}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("stats.blocked")}</CardDescription>
            <CardTitle>{summary.blockedLinks}</CardTitle>
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
                  <TableHead>{t("table.initiator")}</TableHead>
                  <TableHead>{t("table.target")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                  <TableHead className="text-right">{t("table.time")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.length ? (
                  links.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">{item.follower.name ?? tc("anonymousUser")}</div>
                        <div className="text-xs text-muted-foreground">@{item.follower.userid}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{item.following.name ?? tc("anonymousUser")}</div>
                        <div className="text-xs text-muted-foreground">@{item.following.userid}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.status}</Badge>
                      </TableCell>
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
