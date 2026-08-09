import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CATEGORY_FEEDS,
  GET,
  extractImageUrl,
  extractTag,
  getRssItems,
  parseRssItem,
  parseRssPubDate,
  stripHtml,
} from "./route";

describe("stripHtml", () => {
  it("strips tags, collapses whitespace, and decodes entities", () => {
    expect(stripHtml("<p>Hello &amp; <b>World</b></p>")).toBe("Hello & World");
    expect(stripHtml("  A   B\n\t C  ")).toBe("A B C");
    expect(stripHtml("&quot;quoted&quot; &#39;and&#39; &apos;more&apos;")).toBe("\"quoted\" 'and' 'more'");
    expect(stripHtml("&#8216;Demons&#8217; &amp; &#x2764;")).toBe("‘Demons’ & ❤");
  });
});

describe("extractTag", () => {
  it("extracts plain text content", () => {
    expect(extractTag("<item><title>Hello</title></item>", "title")).toBe("Hello");
  });

  it("extracts CDATA-wrapped content verbatim", () => {
    const block = "<item><title><![CDATA[ Breaking <news> & more ]]></title></item>";
    expect(extractTag(block, "title")).toBe("Breaking <news> & more");
  });

  it("handles namespaced tags", () => {
    expect(extractTag("<item><content:encoded><![CDATA[Body]]></content:encoded></item>", "content:encoded")).toBe(
      "Body"
    );
  });

  it("returns empty string for a missing tag", () => {
    expect(extractTag("<item><title>Hi</title></item>", "description")).toBe("");
  });
});

describe("getRssItems", () => {
  it("splits a document into item blocks", () => {
    const xml = "<rss><channel><item><title>One</title></item><item><title>Two</title></item></channel></rss>";
    expect(getRssItems(xml)).toHaveLength(2);
    expect(getRssItems(xml)[0]).toContain("<title>One</title>");
  });

  it("returns an empty array when there are no items", () => {
    expect(getRssItems("<rss><channel></channel></rss>")).toEqual([]);
  });
});

describe("parseRssPubDate", () => {
  it("parses RFC-822 pubDate into epoch ms", () => {
    const block = "<item><pubDate>Sat, 08 Aug 2026 20:56:21 -0400</pubDate></item>";
    expect(parseRssPubDate(block)).toBe(Date.parse("Sat, 08 Aug 2026 20:56:21 -0400"));
  });

  it("returns 0 for a missing or invalid date", () => {
    expect(parseRssPubDate("<item></item>")).toBe(0);
    expect(parseRssPubDate("<item><pubDate>nonsense</pubDate></item>")).toBe(0);
  });
});

describe("extractImageUrl", () => {
  it("prefers media:thumbnail", () => {
    const block =
      '<item><media:thumbnail url="https://cdn.example/thumb.jpg" width="800"/><enclosure url="https://cdn.example/encl.jpg" type="image/jpeg"/></item>';
    expect(extractImageUrl(block)).toBe("https://cdn.example/thumb.jpg");
  });

  it("falls back to an image medium:content", () => {
    const block =
      '<item><media:content url="https://cdn.example/hero.jpg" medium="image"><media:title>Pic</media:title></media:content></item>';
    expect(extractImageUrl(block)).toBe("https://cdn.example/hero.jpg");
  });

  it("accepts media:content tagged with type=\"image instead of medium", () => {
    const block =
      '<item><media:content url="https://cdn.example/fox.jpg?ve=1&amp;tl=1" type="image/jpeg" expression="full"/></item>';
    expect(extractImageUrl(block)).toBe("https://cdn.example/fox.jpg?ve=1&tl=1");
  });

  it("falls back to an image enclosure", () => {
    const block = '<item><enclosure url="https://cdn.example/shot.jpg" type="image/jpg"/></item>';
    expect(extractImageUrl(block)).toBe("https://cdn.example/shot.jpg");
  });

  it("falls back to an embedded <img>", () => {
    const block = '<item><content:encoded><![CDATA[<p><img src="https://cdn.example/inline.png"/></p>]]></content:encoded></item>';
    expect(extractImageUrl(block)).toBe("https://cdn.example/inline.png");
  });

  it("ignores non-image media:content/enclosure and returns empty when nothing usable", () => {
    const block =
      '<item><media:content/>' +
      '<enclosure url="https://cdn.example/video.mp4" type="video/mp4"/>' +
      '<media:content url="https://cdn.example/audio.mp3" type="audio/mpeg"/></item>';
    expect(extractImageUrl(block)).toBe("");
  });
});

describe("parseRssItem", () => {
  const block = [
    "<item>",
    "<title>Solar eclipse next week</title>",
    "<link>https://www.npr.org/2026/08/08/solar-eclipse</link>",
    "<description>&lt;p&gt;It will be visible in parts of the U.S.&lt;/p&gt;</description>",
    "<pubDate>Sat, 08 Aug 2026 20:56:21 -0400</pubDate>",
    "</item>",
  ].join("");

  it("builds a valid item from the feed brand as source_name", () => {
    expect(parseRssItem(block, "NPR")).toEqual({
      title: "Solar eclipse next week",
      summary: "It will be visible in parts of the U.S.",
      source_name: "NPR",
      url: "https://www.npr.org/2026/08/08/solar-eclipse",
      image_url: "",
      pubDate: Date.parse("Sat, 08 Aug 2026 20:56:21 -0400"),
    });
  });

  it("carries the extracted image_url through", () => {
    const withImage = block.replace(
      "</description>",
      "</description><media:thumbnail url=\"https://cdn.example/thumb.jpg\"/>"
    );
    expect(parseRssItem(withImage, "NPR")?.image_url).toBe("https://cdn.example/thumb.jpg");
  });

  it("returns null for an unusable link", () => {
    const bad = block.replace("https://www.npr.org/2026/08/08/solar-eclipse", "not-a-url");
    expect(parseRssItem(bad, "NPR")).toBeNull();
  });

  it("returns null for an empty title", () => {
    const bad = block.replace("<title>Solar eclipse next week</title>", "<title></title>");
    expect(parseRssItem(bad, "NPR")).toBeNull();
  });
});

describe("GET /api/news/hot-us", () => {
  const feedXml = (title: string, link: string, pubDate: string): string =>
    [
      "<rss><channel><item>",
      `<title>${title}</title>`,
      `<link>${link}</link>`,
      "<description>Summary</description>",
      `<pubDate>${pubDate}</pubDate>`,
      "</item></channel></rss>",
    ].join("");

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-robins across sources, dedupes URLs, and returns capped items in the expected shape", async () => {
    const responses = new Map<string, Response>([
      [
        CATEGORY_FEEDS.us[0].url,
        new Response(
          [
            feedXml("Old", "https://feed.example/a", "Sat, 01 Aug 2026 10:00:00 GMT"),
            feedXml("Duplicate", "https://feed.example/b", "Sun, 02 Aug 2026 10:00:00 GMT"),
          ].join("")
        ),
      ],
      // A second feed returns the same URL as the first feed — deduped.
      [
        CATEGORY_FEEDS.us[1].url,
        new Response(feedXml("Duplicate", "https://feed.example/b/", "Mon, 03 Aug 2026 10:00:00 GMT")),
      ],
      [
        CATEGORY_FEEDS.us[2].url,
        new Response(feedXml("Newest", "https://feed.example/c", "Tue, 04 Aug 2026 10:00:00 GMT")),
      ],
      // us[3] (Fox) is not stubbed → returns 404 → contributes nothing.
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const response = responses.get(url);
        if (!response) {
          return new Response("", { status: 404 });
        }
        responses.delete(url);
        return response;
      })
    );

    const request = new Request("http://localhost/api/news/hot-us?category=us");
    const response = await GET(request);
    const payload = (await response.json()) as {
      success: boolean;
      category: string;
      data: { title: string; url: string; source_name: string; summary: string }[];
    };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.category).toBe("us");
    // Round-robin: one item per source per pass, in source order.
    expect(payload.data.map((item) => item.title)).toEqual(["Old", "Duplicate", "Newest"]);
    expect(payload.data.map((item) => item.url)).toEqual([
      "https://feed.example/a",
      "https://feed.example/b/",
      "https://feed.example/c",
    ]);
    expect(payload.data[0]).not.toHaveProperty("pubDate");
  });

  it("falls back to 'us' for an unknown category", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    const request = new Request("http://localhost/api/news/hot-us?category=banana");
    const response = await GET(request);
    const payload = (await response.json()) as { category: string; data: unknown[] };
    expect(payload.category).toBe("us");
    expect(payload.data).toEqual([]);
  });
});
