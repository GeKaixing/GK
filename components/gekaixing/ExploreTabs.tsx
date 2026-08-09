"use client";

import { useEffect, useState } from "react";
import { ChartNoAxesColumn } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import NEWs from "./NEWs";

interface ToutiaoHotItem {
  url: string;
  title: string;
  hot_value: string;
}

const TOUTIAO_CACHE_TTL_MS = 5 * 60 * 1000;
let toutiaoCache: { data: ToutiaoHotItem[]; fetchedAt: number } | null = null;

export async function ToutiaoHotGTE() {
  return await fetch("https://dabenshi.cn/other/api/hot.php?type=toutiaoHot", {
    method: "GET",
    next: {
      revalidate: 60,
    },
    cache: "force-cache",
  });
}

export default
function ExploreTabs() {
  const t = useTranslations("ImitationX.Explore");
  const locale = useLocale();
  const isChinese = locale === "zh-CN";
  const [data, setData] = useState<ToutiaoHotItem[]>([]);

  useEffect(() => {
    // 头条热榜仅对中文环境有意义；其他语言用 RSS 新闻（见下方 TabsContent）。
    if (!isChinese) {
      return;
    }
    async function fetchf(): Promise<void> {
      if (toutiaoCache && Date.now() - toutiaoCache.fetchedAt < TOUTIAO_CACHE_TTL_MS) {
        setData(toutiaoCache.data);
        return;
      }
      try {
        const result = await ToutiaoHotGTE();
        const json = (await result.json()) as { success?: boolean; data?: ToutiaoHotItem[] };
        if (json.success) {
          const items = Array.isArray(json.data) ? json.data : [];
          toutiaoCache = { data: items, fetchedAt: Date.now() };
          setData(items);
        }
      } catch (error) {
        console.error(error);
        setData([]);
      }
    }
    void fetchf();
  }, [isChinese]);

  return (
    <Tabs defaultValue="ToutiaoHot" className="mt-2 w-full">
      <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto bg-muted/60 p-1">
        <TabsTrigger value="ToutiaoHot" className="shrink-0 rounded-full px-3 py-1.5 text-xs sm:text-sm">
          {t("tabs.toutiao")}
        </TabsTrigger>
        <TabsTrigger value="us" className="shrink-0 rounded-full px-3 py-1.5 text-xs sm:text-sm">
          {t("tabs.us")}
        </TabsTrigger>
        <TabsTrigger value="tech" className="shrink-0 rounded-full px-3 py-1.5 text-xs sm:text-sm">
          {t("tabs.tech")}
        </TabsTrigger>
        <TabsTrigger value="sports" className="shrink-0 rounded-full px-3 py-1.5 text-xs sm:text-sm">
          {t("tabs.sports")}
        </TabsTrigger>
        <TabsTrigger value="entertainment" className="shrink-0 rounded-full px-3 py-1.5 text-xs sm:text-sm">
          {t("tabs.entertainment")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="ToutiaoHot" className="mt-3">
        {isChinese ? (
          data.length !== 0 &&
          data.map((item, idx) => (
            <Link
              href={item.url}
              key={idx}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-20 flex-col justify-start rounded-2xl border border-transparent p-3 transition-colors hover:border-border hover:bg-muted/60"
            >
              <span className="line-clamp-2 text-sm text-foreground sm:text-base">{item.title}</span>
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground sm:text-sm">
                <ChartNoAxesColumn className="h-4 w-4" /> <span>{item.hot_value}</span>
              </div>
            </Link>
          ))
        ) : (
          <NEWs url="/api/news/hot-us?category=us" />
        )}
      </TabsContent>
      <TabsContent value="us">
        <NEWs url="/api/news/hot-us?category=us" />
      </TabsContent>
      <TabsContent value="tech">
        <NEWs url="/api/news/hot-us?category=tech" />
      </TabsContent>
      <TabsContent value="sports">
        <NEWs url="/api/news/hot-us?category=sports" />
      </TabsContent>
      <TabsContent value="entertainment">
        <NEWs url="/api/news/hot-us?category=entertainment" />
      </TabsContent>
    </Tabs>
  );
}
