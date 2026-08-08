import { getUserAiConfig } from "@/lib/ai/config";
import { streamAiText } from "@/lib/ai/text";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";
import { NextRequest } from "next/server";

const GKX_SYSTEM_PROMPT =
  "You are GKX, a concise and practical AI assistant. When users ask who you are, you must identify yourself as GKX.";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

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

    const config = getUserAiConfig(user);
    if (!config.apiKey) {
      return new Response(
        "AI API key is not configured. Please go to /gekaixing/settings/account to set it.",
        { status: 503 }
      );
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

    const systemMessage = messages.find((message) => message.role === "system");
    const modelMessages = messages
      .filter((message) => message.role !== "system" && message.content.trim().length > 0)
      .map((message) => ({
        role: message.role === "assistant" ? "assistant" as const : "user" as const,
        content: message.content,
      }));

    const encoder = new TextEncoder();
    let fullText = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamAiText(config, {
            system: systemMessage?.content ?? GKX_SYSTEM_PROMPT,
            messages: modelMessages,
            temperature: 0.7,
            maxOutputTokens: 1024,
          })) {
            fullText += chunk;
            controller.enqueue(encoder.encode(chunk));
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
          console.error("AI stream failed:", streamError);
          controller.error(streamError);
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
