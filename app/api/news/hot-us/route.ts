import { NextResponse } from "next/server";

import { getCachedJson, setCachedJson } from "@/lib/redis";

type NewsCategory = "us" | "tech" | "sports" | "entertainment";

interface NewsItem {
  title: string;
  summary: string;
  source_name: string;
  url: string;
  image_url: string;
}

interface FeedSource {
  name: string;
  url: string;
}

/** Curated free RSS feeds per category. All verified reachable, no API key needed. */
export const CATEGORY_FEEDS: Record<NewsCategory, FeedSource[]> = {
  us: [
    { name: "NPR", url: "https://feeds.npr.org/1001/rss.xml" },
    { name: "CBS News", url: "https://www.cbsnews.com/latest/rss/main" },
    { name: "WSJ", url: "https://feeds.a.dj.com/rss/RSSWorldNews.xml" },
    { name: "Fox News", url: "https://moxie.foxnews.com/google-publisher/world.xml" },
  ],
  tech: [
    { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
    { name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
    { name: "Wired", url: "https://www.wired.com/feed/rss" },
  ],
  sports: [
    { name: "ESPN", url: "https://www.espn.com/espn/rss/news" },
    { name: "CBS Sports", url: "https://www.cbssports.com/rss/headlines/" },
    { name: "Sky Sports", url: "https://www.skysports.com/rss/12040" },
  ],
  entertainment: [
    { name: "Variety", url: "https://variety.com/feed/" },
    { name: "Hollywood Reporter", url: "https://www.hollywoodreporter.com/feed/" },
    { name: "Rolling Stone", url: "https://www.rollingstone.com/feed/" },
  ],
};

const MAX_ITEMS = 10;
const FEED_TIMEOUT_MS = 8000;
const FEED_REVALIDATE_SECONDS = 300;
const FEED_USER_AGENT = "Mozilla/5.0 (compatible; GekaixingNews/1.0)";
const CACHE_PREFIX = "sidebar:news:hot-us";

interface ParsedItem extends NewsItem {
  pubDate: number;
}

/** Strip HTML tags and decode XML entities into plain text. */
export function stripHtml(value: string): string {
  // Decode entities BEFORE stripping tags so entity-encoded markup
  // (&lt;p&gt;...) is removed too. &amp; goes last to avoid double-decoding.
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (_match, hex: string) => {
      const code = parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _match;
    })
    .replace(/&#(\d{1,7});/g, (_match, dec: string) => {
      const code = Number(dec);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _match;
    })
    .replace(/&amp;/g, "&")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract the text content of `<tag>...</tag>` from an XML block,
 * tolerating both plain content and `<![CDATA[...]]>` wrappers.
 */
export function extractTag(block: string, tag: string): string {
  const re = new RegExp(
    `<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`,
    "i"
  );
  const match = block.match(re);
  return match ? match[1].trim() : "";
}

/** Split an RSS 2.0 document into its `<item>` blocks. */
export function getRssItems(xml: string): string[] {
  const items: string[] = [];
  const re = /<item\b[\s\S]*?<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    items.push(match[0]);
  }
  return items;
}

/** Parse the RFC-822 pubDate of an item into epoch ms (0 when missing/invalid). */
export function parseRssPubDate(block: string): number {
  const raw = extractTag(block, "pubDate");
  const time = Date.parse(raw);
  return Number.isNaN(time) ? 0 : time;
}

/** Collect the `attr` values of every `<tag ...>` (self-closing or not) in a block. */
function collectAttr(block: string, tag: string, attr: string, requireContains: string): string[] {
  const escaped = tag.replace(":", "\\:");
  const re = new RegExp(`<${escaped}\\b[^>]*?>`, "gi");
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(block)) !== null) {
    const tagText = match[0];
    if (requireContains && !tagText.includes(requireContains)) {
      continue;
    }
    const attrMatch = tagText.match(new RegExp(`${attr}\\s*=\\s*"([^"]+)"`, "i"));
    if (attrMatch) {
      out.push(attrMatch[1]);
    }
  }
  return out;
}

/**
 * Extract the first usable image URL for an item, or "" when the feed
 * publishes none. Priority: media:thumbnail, image media:content,
 * image enclosure, then an <img> embedded in the description.
 */
export function extractImageUrl(block: string): string {
  const candidates = [
    ...collectAttr(block, "media:thumbnail", "url", ""),
    // Some feeds tag media:content with medium="image", others with type="image/*".
    ...collectAttr(block, "media:content", "url", 'medium="image"'),
    ...collectAttr(block, "media:content", "url", 'type="image'),
    ...collectAttr(block, "enclosure", "url", 'type="image'),
  ];

  const imgMatch = block.match(/<img[^>]+src="([^"]+)"/i);
  if (imgMatch) {
    candidates.push(imgMatch[1]);
  }

  for (const candidate of candidates) {
    const url = candidate.replace(/&amp;/g, "&");
    if (isValidUrl(url)) {
      return url;
    }
  }
  return "";
}

/** Parse one `<item>` block. Returns null when the title or link is unusable. */
export function parseRssItem(block: string, sourceName: string): ParsedItem | null {
  const title = stripHtml(extractTag(block, "title"));
  const url = stripHtml(extractTag(block, "link"));
  if (!title || !isValidUrl(url)) {
    return null;
  }

  const description =
    stripHtml(extractTag(block, "description")) || stripHtml(extractTag(block, "content:encoded"));

  return {
    title,
    summary: description.slice(0, 300),
    source_name: sourceName,
    url,
    image_url: extractImageUrl(block),
    pubDate: parseRssPubDate(block),
  };
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Fetch and parse one feed; a single slow/broken feed never blocks the tab. */
async function fetchFeed(source: FeedSource): Promise<ParsedItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(source.url, {
      next: { revalidate: FEED_REVALIDATE_SECONDS },
      headers: { "User-Agent": FEED_USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) {
      return [];
    }
    const xml = await res.text();
    return getRssItems(xml)
      .map((block) => parseRssItem(block, source.name))
      .filter((item): item is ParsedItem => item !== null);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function parseCategory(value: string | null): NewsCategory {
  const raw = (value ?? "us").trim().toLowerCase();
  return raw === "tech" || raw === "sports" || raw === "entertainment" ? raw : "us";
}

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const category = parseCategory(requestUrl.searchParams.get("category"));
  const cacheKey = `${CACHE_PREFIX}:${category}`;

  const cached = await getCachedJson<NewsItem[]>(cacheKey);
  if (Array.isArray(cached)) {
    return NextResponse.json({ success: true, category, data: cached });
  }

  const sources = CATEGORY_FEEDS[category];
  const feeds = await Promise.all(sources.map((source) => fetchFeed(source)));

  // Round-robin across sources so no single feed can crowd out the list
  // (each feed keeps its own newest-first order). Capped at MAX_ITEMS.
  const seen = new Set<string>();
  const selected: ParsedItem[] = [];
  const cursor = feeds.map(() => 0);
  let progressed = true;
  while (selected.length < MAX_ITEMS && progressed) {
    progressed = false;
    for (let s = 0; s < feeds.length; s++) {
      const items = feeds[s];
      while (cursor[s] < items.length) {
        const item = items[cursor[s]++];
        const key = item.url.replace(/\/+$/, "").toLowerCase();
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        selected.push(item);
        progressed = true;
        break;
      }
      if (selected.length >= MAX_ITEMS) {
        break;
      }
    }
  }

  const data: NewsItem[] = selected.map(({ pubDate: _pubDate, ...rest }) => rest);

  await setCachedJson(cacheKey, data, FEED_REVALIDATE_SECONDS);

  return NextResponse.json({ success: true, category, data });
}
