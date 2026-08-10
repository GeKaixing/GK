import { NextRequest } from "next/server";

import { getUserAiConfig } from "@/lib/ai/config";
import { createPiAgent, PI_SYSTEM_PROMPT } from "@/lib/ai/pi";
import { createClient } from "@/utils/supabase/server";

/**
 * Demo route: run the @earendil-works/pi agent harness with the user's
 * configured provider/model and the existing webSearch/fetchUrl tools,
 * streaming Pi's lifecycle events over SSE.
 *
 * Independent of app/api/chat/route.ts (production chat is untouched).
 */

// LLM + web search + SSE can exceed Vercel's 10s default; raise to 60s.
export const maxDuration = 60;

type DemoMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

function sse(controller: ReadableStreamDefaultController, event: string, data: unknown) {
  controller.enqueue(
    new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  );
}

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

  let body: { messages?: DemoMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const messages = body.messages?.filter((m) => m.content.trim().length > 0) ?? [];
  if (messages.length === 0) {
    return new Response("messages required", { status: 400 });
  }

  const { agent } = createPiAgent(config);
  const lastUserText = messages[messages.length - 1].content;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => sse(controller, event, data);

      agent.subscribe((event) => {
        switch (event.type) {
          case "agent_start":
            send("agent_start", { systemPrompt: PI_SYSTEM_PROMPT });
            break;
          case "message_update":
            if (event.assistantMessageEvent.type === "text_delta") {
              send("text_delta", { delta: event.assistantMessageEvent.delta });
            }
            break;
          case "tool_execution_start":
            send("tool_start", { tool: event.toolName, args: event.args });
            break;
          case "tool_execution_end":
            send("tool_end", { tool: event.toolName, isError: event.isError });
            break;
          case "turn_end":
            send("turn_end", {});
            break;
          case "agent_end":
            send("agent_end", {});
            break;
        }
      });

      try {
        await agent.prompt(lastUserText);
        controller.close();
      } catch (error) {
        console.error("Pi agent demo failed:", error);
        send("error", {
          message: error instanceof Error ? error.message : String(error),
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
