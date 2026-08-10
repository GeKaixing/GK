import { getUserAiConfig } from "@/lib/ai/config";
import { searchWeb, fetchPageContent } from "@/lib/ai/search";
import { streamAiText } from "@/lib/ai/text";
import { createWebTools } from "@/lib/ai/tools";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";
import { NextRequest } from "next/server";

const GKX_BASE_PROMPT =
  "You are GKX, a concise and practical AI assistant. When users ask who you are, you must identify yourself as GKX.";

// 原生 tool calling 的 provider（Google/OpenAI/Anthropic）：让模型自己决定何时搜索。
const NATIVE_TOOL_SUFFIX =
  " You have a webSearch tool: use it for recent events, live data, or anything that may have changed after your training. " +
  "If a search snippet is too short, use fetchUrl to read the full page. " +
  "When your answer relies on search results, cite the source URLs at the end.";

// 兼容 provider（DeepSeek/GLM/各种中转）通常不支持或不可靠地支持函数调用：
// 服务端把搜索结果直接注入上下文，模型只需要读，不需要「调用工具」。
const INJECT_SUFFIX =
  " You cannot browse the web or call tools yourself. Answer from your knowledge unless live web search results " +
  "are provided in your context; if they are, use them to answer accurately and cite the source URLs. " +
  "Never fabricate tool calls or URLs.";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s，。；（）()]+/);
  return match ? match[0].replace(/[),.;]+$/, "") : null;
}

const TIME_HINT_RE =
  /(最近|今天|今日|本周|本月|今年|最新|昨晚|昨天|today|yesterday|latest)/i;
const NEWS_HINT_RE = /(新闻|大新闻|头条|热搜|news|headlines)/i;
const FILLER_RE =
  /(请问|帮我|能不能|可以|一下|有没有|知道|什么|怎么|怎么样|哪些|吗|呢|有|新闻|大新闻|头条|热搜|最近|今天|今日|本周|本月|今年|最新|昨晚|昨天|news|today|yesterday|latest|headlines)/gi;

/** 用户消息像在问「当下/最近/链接」时，才触发联网搜索，避免每次请求都白等几秒。 */
function shouldSearch(text: string): boolean {
  return TIME_HINT_RE.test(text) || NEWS_HINT_RE.test(text) || /\b20(2[4-9])\b/.test(text);
}

/**
 * 把「时效性」提问整理成更容易命中信息的搜索词：
 * - 纯「最近有什么新闻」这类没有主题的问法 → 「今日新闻头条」；
 * - 带主题的问法（如「芯片行业最近有什么新闻」）→ 「芯片行业 新闻」；
 * - 非时效性提问原样返回，避免日期/改写反而把结果带偏（如「什么是相对论」）。
 */
function refineSearchQuery(text: string): string {
  const trimmed = text.trim();
  const newsHint = NEWS_HINT_RE.test(trimmed);
  const timeHint = TIME_HINT_RE.test(trimmed);

  if (!newsHint && !timeHint) return trimmed;

  const topic = trimmed
    .replace(/[，。？！、,.?!]+/g, " ")
    .replace(FILLER_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (newsHint) {
    return topic.length >= 2 ? `${topic} 新闻` : "今日新闻头条";
  }
  return topic.length >= 2 ? topic : trimmed;
}

/**
 * 为注入式方案取一段「实时上下文」：
 * - 消息里带了链接 → 抓取该页正文；
 * - 否则按关键字触发一次 webSearch（查询词先做时效性整理）。
 * 返回 "" 表示没有可用的联网内容。
 */
async function buildSearchContext(userText: string): Promise<string> {
  const url = extractUrl(userText);
  if (url) {
    const content = await fetchPageContent(url);
    return `[User shared a link]\n${url}\n\n[Page content]\n${content}`;
  }

  const results = await searchWeb(refineSearchQuery(userText));
  if (results.length === 0) return "";
  return results
    .map(
      (result, index) =>
        `${index + 1}. ${result.title}\n   URL: ${result.url}\n   ${result.snippet}`
    )
    .join("\n\n");
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

    const lastUserText = lastUserMessage?.role === "user" ? lastUserMessage.content : "";
    const usesNativeTools =
      config.provider === "google" ||
      config.provider === "openai" ||
      config.provider === "anthropic";

    let systemPrompt = systemMessage?.content ?? GKX_BASE_PROMPT;
    let tools: ReturnType<typeof createWebTools> | undefined;
    let maxSteps: number | undefined;

    if (usesNativeTools) {
      systemPrompt = `${systemMessage?.content ?? GKX_BASE_PROMPT}${NATIVE_TOOL_SUFFIX}`;
      tools = createWebTools();
      maxSteps = 5;
    } else {
      systemPrompt = `${systemMessage?.content ?? GKX_BASE_PROMPT}${INJECT_SUFFIX}`;
      const searchContext = shouldSearch(lastUserText)
        ? await buildSearchContext(lastUserText)
        : "";
      if (searchContext) {
        systemPrompt +=
          "\n\n[Live web search results relevant to the user's latest message]\n" +
          "Use these to answer accurately and cite the source URLs. Ignore them if not relevant.\n\n" +
          searchContext;
      }
    }

    const encoder = new TextEncoder();
    let fullText = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamAiText(config, {
            system: systemPrompt,
            messages: modelMessages,
            temperature: 0.7,
            maxOutputTokens: 1024,
            tools,
            maxSteps,
          })) {
            fullText += chunk;
            controller.enqueue(encoder.encode(chunk));
          }

          // 兜底：极端情况下模型没有产出任何文本，仍然给客户端一个可读的回复。
          if (!fullText.trim()) {
            fullText =
              "Sorry, I couldn't generate a response right now. Please try again or rephrase your question.";
            controller.enqueue(encoder.encode(fullText));
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
