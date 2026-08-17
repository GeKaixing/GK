import { GoogleGenAI } from "@google/genai";
import { getGeminiModelCandidates, normalizeGeminiModel } from "@/lib/gemini-model";
import { prisma } from "@/lib/prisma";
import { createClient, getCurrentUserGeminiSettings } from "@/utils/auth-compat/server";
import { NextRequest } from "next/server";

const GKX_SYSTEM_PROMPT =
  "You are GKX, a concise and practical AI assistant. When users ask who you are, you must identify yourself as GKX.";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function mapGeminiStreamError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "gemini stream failed";

  if (
    message.includes("fetch failed") ||
    message.includes("network error") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("timed out") ||
    message.includes("connect timeout")
  ) {
    return "Gemini network is currently unreachable. Please retry later.";
  }

  if (message.includes("api key") || message.includes("permission denied")) {
    return "Gemini API key is invalid or unauthorized. Please update it in Settings.";
  }

  if (message.includes("quota") || message.includes("rate limit") || message.includes("resource exhausted")) {
    return "Gemini quota exceeded or rate limited. Please try again later.";
  }

  return "Gemini request failed. Please retry in a moment.";
}

function mapMessagesForGemini(messages: ChatMessage[]): Array<{
  role: "user" | "model";
  parts: Array<{ text: string }>;
}> {
  return messages
    .filter((message) => message.role !== "system" && message.content.trim().length > 0)
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      messages?: ChatMessage[];
      sessionId?: string;
    };

    const { messages, sessionId } = body;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const userId = user?.id;
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (!messages?.length) {
      return new Response("messages required", { status: 400 });
    }

    let currentSessionId = sessionId;

    if (!currentSessionId) {
      const session = await prisma.chatAISession.create({
        data: {
          userId,
        },
      });

      currentSessionId = session.id;
    }

    await prisma.chatAISession.upsert({
      where: { id: currentSessionId },
      create: {
        id: currentSessionId,
        userId,
      },
      update: {},
    });

    const lastUserMessage = messages[messages.length - 1];

    if (lastUserMessage?.role === "user") {
      await prisma.chatAIMessage.create({
        data: {
          id: crypto.randomUUID(),
          role: "user",
          content: lastUserMessage.content,
          sessionId: currentSessionId,
        },
      });
    }

    const geminiSettings = await getCurrentUserGeminiSettings(user.id);
    const geminiApiKey = geminiSettings.apiKey;
    const geminiModel = normalizeGeminiModel(geminiSettings.model);
    const modelCandidates = getGeminiModelCandidates(geminiModel);

    if (!geminiApiKey) {
      return new Response(
        "Gemini API key is not configured. Please go to /gekaixing/settings/account to set it.",
        { status: 503 }
      );
    }

    const geminiClient = new GoogleGenAI({ apiKey: geminiApiKey });
    const geminiMessages = mapMessagesForGemini(messages);

    const encoder = new TextEncoder();
    let fullText = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let streamWorked = false;
          let lastStreamError: unknown = null;

          for (const candidateModel of modelCandidates) {
            try {
              const result = await geminiClient.models.generateContentStream({
                model: candidateModel,
                contents: geminiMessages,
                config: {
                  systemInstruction: GKX_SYSTEM_PROMPT,
                  temperature: 0.7,
                  maxOutputTokens: 1024,
                },
              });

              for await (const chunk of result) {
                const chunkText = chunk.text ?? "";
                if (chunkText.length > 0) {
                  fullText += chunkText;
                  controller.enqueue(encoder.encode(chunkText));
                }
              }
              streamWorked = true;
              break;
            } catch (candidateError) {
              lastStreamError = candidateError;
            }
          }

          if (!streamWorked) {
            throw lastStreamError instanceof Error ? lastStreamError : new Error("Gemini stream failed");
          }

          await prisma.chatAIMessage.create({
            data: {
              id: crypto.randomUUID(),
              role: "assistant",
              content: fullText,
              sessionId: currentSessionId,
            },
          });

          controller.close();
        } catch (streamError) {
          console.error("Gemini stream failed:", streamError);
          const fallback = mapGeminiStreamError(streamError);
          controller.enqueue(encoder.encode(fallback));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Session-Id": currentSessionId,
      },
    });
  } catch (error) {
    console.error(error);
    return new Response("Internal Error", { status: 500 });
  }
}
