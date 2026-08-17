import { generateGeminiText } from "@/lib/gemini";
import { getGeminiModelCandidates, normalizeGeminiModel, type GeminiModel } from "@/lib/gemini-model";
import { prisma } from "@/lib/prisma";
import { createClient, getCurrentUserGeminiSettings } from "@/utils/auth-compat/server";
import { NextResponse } from "next/server";

const DEFAULT_TITLE = "新对话";
const MAX_TITLE_LENGTH = 20;

function buildFallbackTitle(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return DEFAULT_TITLE;
  return normalized.slice(0, MAX_TITLE_LENGTH);
}

function normalizeTitle(title: string): string {
  const cleaned = title
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return DEFAULT_TITLE;
  return cleaned.slice(0, MAX_TITLE_LENGTH);
}

async function generateAiTitle(text: string, apiKey: string, model: GeminiModel): Promise<string | null> {
  if (!apiKey.trim()) {
    return null;
  }

  try {
    const { text: title } = await generateGeminiText({
      apiKey,
      modelCandidates: getGeminiModelCandidates(model),
      temperature: 0.2,
      maxOutputTokens: 32,
      prompt: [
        "你是标题生成助手。",
        "根据用户第一条消息生成简短会话标题。",
        `要求：不超过${MAX_TITLE_LENGTH}个中文字符，不要句号和引号，只返回标题。`,
        `用户消息：${text}`,
      ].join("\n"),
    });

    return normalizeTitle(title);
  } catch (error) {
    console.error("AI 生成标题失败:", error);
    return null;
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const { sessionId, text } = (await req.json()) as {
      sessionId?: string;
      text?: string;
    };

    if (!sessionId || !text?.trim()) {
      return NextResponse.json(
        { error: "sessionId and text are required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await prisma.chatAISession.findFirst({
      where: {
        id: sessionId,
        userId: user.id,
      },
      select: {
        id: true,
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const geminiSettings = await getCurrentUserGeminiSettings(user.id);
    const geminiApiKey = geminiSettings.apiKey;
    const geminiModel = normalizeGeminiModel(geminiSettings.model);

    const fallbackTitle = buildFallbackTitle(text);
    const aiTitle = await generateAiTitle(text, geminiApiKey, geminiModel);
    const nextTitle = aiTitle ?? fallbackTitle;

    await prisma.chatAISession.update({
      where: { id: session.id },
      data: { title: nextTitle },
    });

    return NextResponse.json({ title: nextTitle });
  } catch (error) {
    console.error("更新会话标题失败:", error);
    return NextResponse.json(
      { error: "Failed to generate title" },
      { status: 500 }
    );
  }
}
