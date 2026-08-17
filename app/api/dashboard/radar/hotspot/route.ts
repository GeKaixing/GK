import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

import { getGeminiModelCandidates, normalizeGeminiModel } from "@/lib/gemini-model";
import { createClient, getCurrentUserGeminiSettings } from "@/utils/auth-compat/server";

interface RadarHotspot {
  title: string;
  summary: string;
  whyRelated: string;
}

interface RadarPostIdea {
  title: string;
  content: string;
}

interface RadarAiResult {
  region: string;
  hotspots: RadarHotspot[];
  keywords: string[];
  postIdeas: RadarPostIdea[];
}

function normalizeRegionFromHeaders(request: Request): string {
  const country = request.headers.get("x-vercel-ip-country") || request.headers.get("cf-ipcountry") || "";
  const region = request.headers.get("x-vercel-ip-country-region") || "";
  const city = request.headers.get("x-vercel-ip-city") || "";

  const parts = [city, region, country].map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : "Unknown region";
}

function stripCodeFence(text: string): string {
  return text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function parseRadarResult(text: string, fallbackRegion: string): RadarAiResult {
  const cleaned = stripCodeFence(text);
  const parsed = JSON.parse(cleaned) as Partial<RadarAiResult>;

  const hotspots = Array.isArray(parsed.hotspots)
    ? parsed.hotspots
        .map((item) => ({
          title: String(item?.title ?? "").trim(),
          summary: String(item?.summary ?? "").trim(),
          whyRelated: String(item?.whyRelated ?? "").trim(),
        }))
        .filter((item) => item.title && item.summary)
        .slice(0, 5)
    : [];

  const keywords = Array.isArray(parsed.keywords)
    ? parsed.keywords
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];

  const postIdeas = Array.isArray(parsed.postIdeas)
    ? parsed.postIdeas
        .map((item) => ({
          title: String(item?.title ?? "").trim(),
          content: String(item?.content ?? "").trim(),
        }))
        .filter((item) => item.title && item.content)
        .slice(0, 3)
    : [];

  return {
    region: String(parsed.region ?? "").trim() || fallbackRegion,
    hotspots,
    keywords,
    postIdeas,
  };
}

function buildPrompt(region: string): string {
  return [
    "You are a social media trend analyst.",
    "Use Google Search tool to find fresh local hot events in the provided region.",
    "Only include recent and relevant local topics that can inspire social posts.",
    `Region: ${region}`,
    "Return strict JSON only with this shape:",
    "{",
    '  "region": "string",',
    '  "hotspots": [{"title":"string","summary":"string","whyRelated":"string"}],',
    '  "keywords": ["string"],',
    '  "postIdeas": [{"title":"string","content":"string"}]',
    "}",
    "Constraints:",
    "- hotspots: 3 to 5",
    "- keywords: 6 to 12",
    "- postIdeas: 2 to 3 short social posts",
    "- no markdown",
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
    message: "Gemini trend analysis failed. Please retry in a moment.",
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized", success: false }, { status: 401 });
    }

    const geminiSettings = await getCurrentUserGeminiSettings(user.id);
    const geminiApiKey = geminiSettings.apiKey;
    const geminiModel = normalizeGeminiModel(geminiSettings.model);
    const modelCandidates = getGeminiModelCandidates(geminiModel);

    if (!geminiApiKey) {
      return NextResponse.json(
        {
          error: "Gemini API key is not configured in your Settings",
          success: false,
        },
        { status: 503 }
      );
    }

    const region = normalizeRegionFromHeaders(request);
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    try {
      let text = "";
      let lastGenerateError: unknown = null;

      for (const candidateModel of modelCandidates) {
        try {
          const result = await ai.models.generateContent({
            model: candidateModel,
            contents: buildPrompt(region),
            config: {
              temperature: 0.6,
              maxOutputTokens: 1500,
              tools: [{ googleSearch: {} }],
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

      const parsed = parseRadarResult(text, region);
      if (!parsed.hotspots.length || !parsed.keywords.length || !parsed.postIdeas.length) {
        throw new Error("Gemini returned incomplete trend result");
      }

      return NextResponse.json({
        success: true,
        ...parsed,
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
    const message = error instanceof Error ? error.message : "Failed to generate radar hotspots";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
