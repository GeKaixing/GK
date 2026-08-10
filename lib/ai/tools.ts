import { tool } from "ai";
import { z } from "zod";

import { fetchPageContent, searchWeb } from "./search";

/**
 * AI SDK tools that give GKX chat live web access.
 * Registered into the streaming chat request in app/api/chat/route.ts.
 */
export function createWebTools() {
  return {
    webSearch: tool({
      description:
        "Search the web for current or factual information and return a list of matching results (title, URL, snippet). " +
        "Use when the user asks about recent events, live data, or anything that may postdate your training knowledge.",
      inputSchema: z.object({
        query: z.string().describe("The search query. Make it concise and specific."),
      }),
      execute: async ({ query }) => {
        const results = await searchWeb(query);
        if (results.length === 0) {
          return "No search results found. The web sources may be unreachable right now.";
        }
        // 返回纯文本而不是数组：对兼容性 provider（DeepSeek/GLM 等）更稳妥。
        return results
          .map(
            (result, index) =>
              `${index + 1}. ${result.title}\n   URL: ${result.url}\n   ${result.snippet}`
          )
          .join("\n\n");
      },
    }),
    fetchUrl: tool({
      description:
        "Fetch the readable text content of a web page by URL. " +
        "Use to read a full article or page when a search snippet is insufficient.",
      inputSchema: z.object({
        url: z.string().describe("The full http(s) URL to fetch."),
      }),
      execute: async ({ url }) => fetchPageContent(url),
    }),
  };
}
