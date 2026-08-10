// Server-side web-search helpers backing the GKX `webSearch` / `fetchUrl`
// AI tools. Multi-source and fail-soft so a slow/blocked host never throws:
//   1. Bing HTML (cn.bing.com) — keyless, reachable from mainland China and Vercel.
//   2. Wikipedia (en/zh)       — clean factual results; reachable on Vercel.

const WIKIPEDIA_LANGS = ["en", "zh"] as const;
const SEARCH_TIMEOUT_MS = 6000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_PAGE_CHARS = 4000;
const BING_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** Decode HTML entities, strip tags, and collapse whitespace into plain text. */
function cleanText(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (_m, hex: string) =>
      String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff))
    )
    .replace(/&#(\d{1,7});/g, (_m, dec: string) =>
      String.fromCodePoint(Math.min(Number(dec), 0x10ffff))
    )
    .replace(/&ensp;/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fetch with a timeout; returns null on timeout / network error. Never throws. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = SEARCH_TIMEOUT_MS
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": BING_USER_AGENT,
        ...init.headers,
      },
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve a result href to a plain http(s) URL, unwrapping Bing /ck/a redirects. */
function normalizeResultUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.pathname.includes("/ck/a")) {
      const target = parsed.searchParams.get("u");
      if (target) {
        const decoded = decodeURIComponent(target);
        const inner = new URL(decoded);
        if (inner.protocol === "http:" || inner.protocol === "https:") {
          return inner.href;
        }
      }
    }
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    // fall through to empty
  }
  return "";
}

/** Scrape organic results from Bing's HTML search page. */
async function searchBing(query: string): Promise<SearchResult[]> {
  const url =
    "https://cn.bing.com/search?" +
    new URLSearchParams({ q: query, count: "8" }).toString();

  const res = await fetchWithTimeout(url);
  if (!res) return [];
  const html = await res.text().catch(() => "");
  if (!html) return [];

  const results: SearchResult[] = [];
  const blockRe = /<li class="b_algo"[\s\S]*?<\/li>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html)) !== null) {
    const block = match[0];
    const link = block.match(/<h2[^>]*><a[^>]*href="([^"]+)"/i);
    const linkUrl = link ? normalizeResultUrl(cleanText(link[1])) : "";
    if (!linkUrl) continue;

    const titleMatch = block.match(/<h2[^>]*><a[^>]*>([\s\S]*?)<\/a><\/h2>/i);
    const title = titleMatch ? cleanText(titleMatch[1]) : "";
    if (!title) continue;

    const snipMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = snipMatch ? cleanText(snipMatch[1]) : "";

    results.push({ title, url: linkUrl, snippet });
  }
  return results;
}

async function searchWikipedia(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  for (const lang of WIKIPEDIA_LANGS) {
    const url =
      `https://${lang}.wikipedia.org/w/api.php?` +
      new URLSearchParams({
        action: "query",
        list: "search",
        srsearch: query,
        format: "json",
        srlimit: "4",
        srprop: "snippet",
      }).toString();

    const res = await fetchWithTimeout(url);
    if (!res) continue;

    const data = (await res.json().catch(() => null)) as {
      query?: { search?: Array<{ title: string; snippet: string }> };
    } | null;

    for (const item of data?.query?.search ?? []) {
      results.push({
        title: item.title,
        url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(
          item.title.replace(/ /g, "_")
        )}`,
        snippet: cleanText(item.snippet),
      });
    }
  }
  return results;
}

/**
 * Search the web for `query`. Returns a deduped list of
 * { title, url, snippet } hits; empty array when nothing is reachable.
 */
export async function searchWeb(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const [bing, wiki] = await Promise.all([
    searchBing(trimmed),
    searchWikipedia(trimmed),
  ]);

  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (const item of [...bing, ...wiki]) {
    const key = item.url.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged.slice(0, 15);
}

/**
 * Fetch a URL and return its readable text (HTML stripped, truncated),
 * or a short human-readable reason when the fetch fails.
 */
export async function fetchPageContent(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return "Unable to parse that URL.";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Only http/https URLs are supported.";
  }

  const res = await fetchWithTimeout(parsed.href, {}, FETCH_TIMEOUT_MS);
  if (!res) return "Failed to fetch the page (timeout or network error).";
  if (!res.ok) return `Fetch failed: HTTP ${res.status}.`;

  const html = await res.text().catch(() => "");
  if (!html) return "Page content is empty.";
  return cleanText(html).slice(0, MAX_PAGE_CHARS);
}
