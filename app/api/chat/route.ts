import { NextRequest } from "next/server";

import { AI_SERVICE_ACTOR_ID } from "@/lib/osp";
import { getUserAiConfig } from "@/lib/ai/config";
import { createPiAgent } from "@/lib/ai/pi";
import { appendChatMessage, openOrResetChatSession } from "@/lib/ai/pi-chat";
import { createPiSessionRepo, loadPiSessionMessages } from "@/lib/ai/pi-session";
import { createClient } from "@/utils/supabase/server";

/**
 * GKX AI chat — powered by the @earendil-works/pi agent harness.
 *
 * Uses Pi's native tool calling uniformly for all providers (no provider
 * special-casing / no server-injection fallback). Conversations persist to
 * Supabase Postgres via Pi's session layer (PiSessionFile through
 * lib/ai/pi-session.ts + lib/ai/pi-fs.ts). Pass `sessionId` (from
 * `X-Session-Id`) to continue a conversation.
 *
 * Wire contract with ChatUI is unchanged: `text/plain` stream + `X-Session-Id`.
 */

// LLM + web search + SSE can exceed Vercel's 10s default; raise to 60s.
export const maxDuration = 60;

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const config = getUserAiConfig(user);
  if (!config.apiKey) {
    return new Response(
      "AI API key is not configured. Please go to /gekaixing/settings/account to set it.",
      { status: 503 }
    );
  }

  let body: { messages?: ChatMessage[]; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const messages = body.messages?.filter((m) => m.content.trim().length > 0) ?? [];
  if (messages.length === 0) {
    return new Response("messages required", { status: 400 });
  }

  const sessionId = body.sessionId || crypto.randomUUID();
  const repo = createPiSessionRepo();
  const session = await openOrResetChatSession(repo, sessionId, user.id);

  // The persisted Pi session is the authoritative transcript; seed the agent
  // from it so multi-turn context survives serverless restarts.
  const history = await loadPiSessionMessages(session);
  const seededCount = history.length;

  const { agent } = createPiAgent(config, {
    initialMessages: history,
    // OSP RFC-015: the assistant acts as the GKX AI service Actor; its tools are
    // gated by that actor's capabilities (seeded by the OSP bootstrap).
    actorId: AI_SERVICE_ACTOR_ID,
  });

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const lastUserText = lastUserMessage?.content ?? messages[messages.length - 1].content;

  const encoder = new TextEncoder();
  let fullText = "";

  const stream = new ReadableStream({
    async start(controller) {
      agent.subscribe((event) => {
        if (
          event.type === "message_update" &&
          event.assistantMessageEvent.type === "text_delta"
        ) {
          const delta = event.assistantMessageEvent.delta;
          fullText += delta;
          controller.enqueue(encoder.encode(delta));
        } else if (event.type === "tool_execution_start") {
          // Inline markers let the client show tool activity while text
          // pauses between tool calls (see ChatUI's marker parser).
          controller.enqueue(encoder.encode(`⟪tool_start:${event.toolName}⟫`));
        } else if (event.type === "tool_execution_end") {
          controller.enqueue(encoder.encode(`⟪tool_end:${event.toolName}⟫`));
        }
      });

      try {
        await agent.prompt(lastUserText);

        // Persist the messages this turn produced back to the Pi session.
        const newMessages = agent.state.messages.slice(seededCount);
        for (const message of newMessages) {
          await appendChatMessage(session, message);
        }

        if (!fullText.trim()) {
          fullText =
            "Sorry, I couldn't generate a response right now. Please try again or rephrase your question.";
          controller.enqueue(encoder.encode(fullText));
        }

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
      "X-Session-Id": sessionId,
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
