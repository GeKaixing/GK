import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { JobPostPublisher } from "@/components/dashboard/job-post-publisher";
import { JobPostManager } from "@/components/dashboard/job-post-manager";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDashboardHireTalentData } from "@/lib/dashboard/service";
import { getDashboardViewer } from "@/lib/dashboard/viewer";
import { Input } from "@/components/ui/input";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function getSingleValue(value: string | string[] | undefined): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return "";
}

function cleanKeyword(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 100);
}

export default async function HireTalentPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<React.JSX.Element> {
  const { userId } = await getDashboardViewer();
  const params = await searchParams;
  const keyword = cleanKeyword(getSingleValue(params.keyword));
  const t = await getTranslations("Dashboard.talent");
  const { summary, jobPosts } = await getDashboardHireTalentData(userId, { keyword });

  return (
    <>
      <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-3 lg:px-6">
        <Card>
          <CardHeader>
            <CardDescription>{t("stats.totalJobPosts")}</CardDescription>
            <CardTitle>{summary.totalJobPosts}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("stats.remoteJobPosts")}</CardDescription>
            <CardTitle>{summary.remoteJobPosts}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("stats.hybridJobPosts")}</CardDescription>
            <CardTitle>{summary.hybridJobPosts}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("publishTitle")}</CardTitle>
            <CardDescription>{t("publishDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <JobPostPublisher />
          </CardContent>
        </Card>
      </div>

      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action="/dashboard/hire-talent" method="get" className="flex flex-col gap-3 md:flex-row md:items-center">
              <Input
                name="keyword"
                defaultValue={keyword}
                placeholder={t("searchPlaceholder")}
                maxLength={100}
              />
              <div className="flex items-center gap-2">
                <Button type="submit">{t("actions.search")}</Button>
                {keyword ? (
                  <Button type="button" variant="outline" asChild>
                    <Link href="/dashboard/hire-talent">{t("actions.reset")}</Link>
                  </Button>
                ) : null}
              </div>
            </form>
            <JobPostManager initialJobPosts={jobPosts} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
