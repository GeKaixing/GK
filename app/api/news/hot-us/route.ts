import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

import { getUserAiConfig } from "@/lib/ai/config";
import { getModelCandidates } from "@/lib/ai/models";
import { createClient } from "@/utils/supabase/server";

interface HotNewsItem {
  title: string;
  summary: string;
  source_name: string;
  url: string;
  category: "us" | "tech" | "sports" | "entertainment";
}

interface GeminiNewsResult {
  news: HotNewsItem[];
}

type NewsCategory = "us" | "tech" | "sports" | "entertainment";

const CATEGORY_MAP: Record<NewsCategory, string> = {
  us: "United States general headlines",
  tech: "United States technology",
  sports: "United States sports",
  entertainment: "United States entertainment",
};

function stripCodeFence(text: string): string {
  return text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function parseNewsResult(text: string, category: NewsCategory): HotNewsItem[] {
  const cleaned = stripCodeFence(text);
  const parsed = JSON.parse(cleaned) as Partial<GeminiNewsResult>;

  const list = Array.isArray(parsed.news)
    ? parsed.news
        .map((item) => ({
          title: String(item?.title ?? "").trim(),
          summary: String(item?.summary ?? "").trim(),
          source_name: String(item?.source_name ?? "").trim(),
          url: String(item?.url ?? "").trim(),
        }))
        .filter((item) => item.title && item.summary && item.source_name && isValidUrl(item.url))
        .slice(0, 10)
    : [];

  return list.map((item) => ({ ...item, category }));
}

function getNewsResponseSchema() {
  return {
    type: Type.OBJECT,
    properties: {
      news: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            source_name: { type: Type.STRING },
            url: { type: Type.STRING },
          },
          required: ["title", "summary", "source_name", "url"],
        },
      },
    },
    required: ["news"],
  };
}

function getUsDateText(): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return formatter.format(new Date());
}

function buildPrompt(category: NewsCategory): string {
  const dateText = getUsDateText();
  const scope = CATEGORY_MAP[category];

  return [
    "You are a real-time US news editor.",
    "Use Google Search tool to find real news from credible media websites.",
    `Date in the United States (America/New_York): ${dateText}`,
    `News scope: ${scope}`,
    "Return strict JSON only. Do not return markdown.",
    "JSON shape:",
    "{",
    '  "news": [',
    '    {"title":"string","summary":"string","source_name":"string","url":"https://..."}',
    "  ]",
    "}",
    "Rules:",
    "- exactly 10 items",
    "- title: concise and factual",
    "- summary: 1 to 2 sentences",
    "- source_name: media brand only, e.g. Reuters, AP, CNN, ESPN, Variety",
    "- url: direct article page URL",
    "- prioritize freshness and relevance for the date shown above",
    "- avoid duplicates",
  ].join("\n");
}

function mapGeminiErrorToHttp(errorMessage: string): { status: number; message: string } {
  const text = errorMessage.toLowerCase();

  if (text.includes("api key") || text.includes("permission denied")) {
    return {
      status: 401,
      message: "Gemini API key is invalid or unauthorized. Please update it in Settings.",
    };
  }

  if (
    text.includes("fetch failed") ||
    text.includes("network error") ||
    text.includes("timed out") ||
    text.includes("econnrefused")
  ) {
    return {
      status: 503,
      message: "Cannot reach Gemini service from server network. Please retry later.",
    };
  }

  if (text.includes("quota") || text.includes("rate limit") || text.includes("resource exhausted")) {
    return {
      status: 429,
      message: "Gemini quota exceeded or rate limited. Please try again later.",
    };
  }

  return {
    status: 502,
    message: "Gemini news generation failed. Please retry in a moment.",
  };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const requestUrl = new URL(request.url);
    const rawCategory = (requestUrl.searchParams.get("category") ?? "us").trim().toLowerCase();
    const category: NewsCategory =
      rawCategory === "tech" || rawCategory === "sports" || rawCategory === "entertainment"
        ? rawCategory
        : "us";

    const supabase = await createClient();
    let config = getUserAiConfig(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      config = getUserAiConfig(user);
    } catch {
      config = getUserAiConfig(null);
    }

    if (config.provider !== "google") {
      return NextResponse.json(
        {
          error: "News generation with Google Search grounding is only supported with the Gemini provider. Switch back to Gemini in Settings.",
          success: false,
        },
        { status: 400 }
      );
    }

    if (!config.apiKey) {
      return NextResponse.json(
        {
          error: "AI API key is not configured in your Settings",
          success: false,
        },
        { status: 503 }
      );
    }

    const modelCandidates = getModelCandidates("google", config.model);

    const ai = new GoogleGenAI({ apiKey: config.apiKey });

    try {
      let text = "";
      let lastGenerateError: unknown = null;

      for (const candidateModel of modelCandidates) {
        try {
          const result = await ai.models.generateContent({
            model: candidateModel,
            contents: buildPrompt(category),
            config: {
              temperature: 0.4,
              maxOutputTokens: 2500,
              tools: [{ googleSearch: {} }],
              responseMimeType: "application/json",
              responseSchema: getNewsResponseSchema(),
            },
          });

          text = (result.text ?? "").trim();
          if (text) {
            break;
          }
        } catch (candidateError) {
          lastGenerateError = candidateError;
        }
      }

      if (!text) {
        if (lastGenerateError instanceof Error) {
          throw lastGenerateError;
        }
        throw new Error("Gemini returned empty content");
      }

      const news = parseNewsResult(text, category);
      if (news.length === 0) {
        throw new Error("Gemini returned incomplete news result");
      }

      return NextResponse.json({
        success: true,
        category,
        data: news,
      });
    } catch (error) {
      const warning = error instanceof Error ? error.message : "Gemini request failed";
      const mapped = mapGeminiErrorToHttp(warning);

      return NextResponse.json(
        {
          error: mapped.message,
          details: warning,
          success: false,
        },
        { status: mapped.status }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load US hot news";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
