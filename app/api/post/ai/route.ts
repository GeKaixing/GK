import { generateGeminiText } from "@/lib/gemini";
import { getGeminiModelCandidates, normalizeGeminiModel } from "@/lib/gemini-model";
import { createClient, getCurrentUserGeminiSettings } from "@/utils/auth-compat/server";
import { NextResponse } from "next/server";

interface GeneratePostBody {
  prompt?: string;
  content?: string;
  mode?: "generate" | "polish";
  locale?: string;
}

const DEFAULT_PROMPT = "Write a short social post";
const MAX_PROMPT_LENGTH = 500;
const MAX_CONTENT_LENGTH = 1500;
const MAX_POST_LENGTH = 280;

function cleanPrompt(prompt?: string): string {
  const normalized = prompt?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.slice(0, MAX_PROMPT_LENGTH) || DEFAULT_PROMPT;
}

function cleanOutput(text: string): string {
  const normalized = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\s+\n/g, "\n")
    .trim();

  return normalized.slice(0, MAX_POST_LENGTH);
}

function cleanContent(content?: string): string {
  const normalized = content?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.slice(0, MAX_CONTENT_LENGTH);
}

function buildGeneratePromptText(prompt: string, locale: "zh-CN" | "en"): string {
  const languageInstruction =
    locale === "zh-CN"
      ? "Please respond in Simplified Chinese."
      : "Please respond in concise English.";

  return [
    "You are a social media writing assistant.",
    languageInstruction,
    `Generate 1 short post under ${MAX_POST_LENGTH} characters.`,
    "Style: natural and human. No markdown. No quotation marks.",
    `Topic: ${prompt}`,
  ].join("\n");
}

function buildPolishPromptText(content: string, locale: "zh-CN" | "en"): string {
  const languageInstruction =
    locale === "zh-CN"
      ? "Please respond in Simplified Chinese."
      : "Please respond in concise English.";

  return [
    "You are a social media writing assistant.",
    languageInstruction,
    `Polish the post below while keeping the same meaning, tone, and intent.`,
    `Constraints: under ${MAX_POST_LENGTH} characters, natural style, no markdown, no quotation marks.`,
    `Original post: ${content}`,
  ].join("\n");
}

function mapGeminiErrorToHttp(errorMessage: string): { status: number; message: string } {
  const text = errorMessage.toLowerCase();

  if (
    text.includes("fetch failed") ||
    text.includes("network error") ||
    text.includes("econnrefused") ||
    text.includes("enotfound") ||
    text.includes("timed out")
  ) {
    return {
      status: 503,
      message: "Cannot reach Gemini service from server network. Please retry later or check network/proxy.",
    };
  }

  if (text.includes("api key") || text.includes("api_key") || text.includes("permission denied")) {
    return {
      status: 401,
      message: "Gemini API key is invalid or unauthorized. Please update it in Settings.",
    };
  }

  if (text.includes("quota") || text.includes("rate limit") || text.includes("resource exhausted")) {
    return {
      status: 429,
      message: "Gemini quota exceeded or rate limited. Please try again later.",
    };
  }

  if (text.includes("model") && text.includes("not found")) {
    return {
      status: 503,
      message: "Gemini model is currently unavailable. Please try again later.",
    };
  }

  return {
    status: 502,
    message: "Gemini request failed. Please retry in a moment.",
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as GeneratePostBody;
    const mode = body.mode === "polish" ? "polish" : "generate";
    const prompt = cleanPrompt(body.prompt);
    const content = cleanContent(body.content);
    const locale: "zh-CN" | "en" = body.locale === "zh-CN" ? "zh-CN" : "en";
    const promptText =
      mode === "polish"
        ? buildPolishPromptText(content || prompt, locale)
        : buildGeneratePromptText(prompt, locale);
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
    
    try {
      const { text, model } = await generateGeminiText({
        apiKey: geminiApiKey,
        preferredModel: geminiModel,
        modelCandidates,
        prompt: promptText,
        temperature: 0.85,
        maxOutputTokens: 220,
      });

      const content = cleanOutput(text);
      if (!content) {
        throw new Error("Gemini returned empty content");
      }

      return NextResponse.json({ content, success: true, source: `gemini:${model}` });
    } catch (error) {
      const warning =
        error instanceof Error ? error.message : "Gemini request failed";
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
    const message =
      error instanceof Error ? error.message : "Failed to generate AI post";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
