"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface NewsItem {
  url: string;
  source_name: string;
  title: string;
  summary?: string;
  author?: string;
  image_url?: string;
}

interface NewsResponse {
  success?: boolean;
  data?: NewsItem[];
  error?: string;
}

async function newsFetch(url: string): Promise<Response> {
  return fetch(url, {
    cache: "no-store",
  });
}

export default function NEWs({ url }: { url: string }) {
  const t = useTranslations("ImitationX.Explore");
  const [data, setData] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadNews(): Promise<void> {
      setLoading(true);
      setError("");

      try {
        const result = await newsFetch(url);
        const json = (await result.json()) as NewsResponse;
        if (!result.ok || !json.success) {
          throw new Error(json.error ?? "Failed to load news");
        }

        if (!cancelled) {
          setData(Array.isArray(json.data) ? json.data : []);
        }
      } catch (fetchError) {
        if (!cancelled) {
          console.error(fetchError);
          setData([]);
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load news");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadNews();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loading) {
    return <div className="rounded-2xl border p-3 text-sm text-muted-foreground">{t("loading")}</div>;
  }

  if (error) {
    return (
      <div className="rounded-2xl border p-3 text-sm text-muted-foreground">
        <span>{t("error")}</span>
        <span className="mt-1 block text-xs opacity-70">{error}</span>
      </div>
    );
  }

  if (data.length === 0) {
    return <div className="rounded-2xl border p-3 text-sm text-muted-foreground">{t("empty")}</div>;
  }

  return (
    <div className="space-y-2">
      {data.map((item, index) => (
        <Link
          href={item.url}
          key={`${item.url}-${index}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-24 items-start justify-start gap-3 rounded-2xl border border-transparent p-3 transition-colors hover:border-border hover:bg-muted/60"
        >
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="line-clamp-1 text-sm font-semibold text-foreground sm:text-base">{item.source_name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">#{index + 1}</span>
            </div>
            <span className="line-clamp-2 text-sm text-foreground sm:text-base">{item.title}</span>
            <span className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:text-sm">{item.summary ?? item.author ?? ""}</span>
          </div>
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url}
              alt=""
              loading="lazy"
              className="h-16 w-16 shrink-0 rounded-xl object-cover sm:h-20 sm:w-20"
            />
          ) : null}
        </Link>
      ))}
    </div>
  );
}
