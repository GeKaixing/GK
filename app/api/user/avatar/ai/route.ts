import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { getUserAiConfig } from "@/lib/ai/config";
import { createClient } from "@/utils/supabase/server";

interface GenerateAvatarBody {
  prompt?: string;
  target?: "avatar" | "background";
}

const MAX_PROMPT_LENGTH = 300;

function cleanPrompt(prompt?: string): string {
  return (prompt ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_PROMPT_LENGTH);
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
      message: "Cannot reach Gemini service from server network. Please retry later.",
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

  return {
    status: 502,
    message: "Gemini image generation failed. Please retry in a moment.",
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

    const config = getUserAiConfig(user);

    if (config.provider !== "google") {
      return NextResponse.json(
        {
          error: "Image generation is only supported with the Gemini provider. Switch back to Gemini in Settings.",
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

    const body = (await request.json()) as GenerateAvatarBody;
    const prompt = cleanPrompt(body.prompt);
    const target = body.target === "background" ? "background" : "avatar";

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required", success: false }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey: config.apiKey });
    const finalPrompt =
      target === "background"
        ? [
            "Generate a high-quality social profile background image.",
            "Wide composition, visually rich but clean, suitable for social profile header.",
            "No text, no watermark, no logo.",
            `User prompt: ${prompt}`,
          ].join("\n")
        : [
            "Generate a high-quality social profile avatar illustration.",
            "Single subject, centered composition, clear facial details, clean background.",
            "No text, no watermark, no logo.",
            `User prompt: ${prompt}`,
          ].join("\n");

    try {
      const result = await ai.models.generateImages({
        model: "imagen-4.0-generate-001",
        prompt: finalPrompt,
        config: {
          numberOfImages: 1,
          aspectRatio: target === "background" ? "16:9" : "1:1",
        },
      });

      const image = result.generatedImages?.[0]?.image;
      if (!image?.imageBytes) {
        return NextResponse.json(
          { error: "Gemini returned empty image", success: false },
          { status: 502 }
        );
      }

      return NextResponse.json({
        success: true,
        imageBase64: image.imageBytes,
        mimeType: image.mimeType || "image/png",
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
    const message = error instanceof Error ? error.message : "Failed to generate avatar";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
