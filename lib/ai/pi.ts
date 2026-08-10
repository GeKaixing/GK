import { Agent } from "@earendil-works/pi-agent-core";
import type { AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";
import { createModels, createProvider, Type } from "@earendil-works/pi-ai";
import type { Api, Model, Provider, ProviderStreams } from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { googleGenerativeAIApi } from "@earendil-works/pi-ai/api/google-generative-ai.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";

import { fetchPageContent, searchWeb } from "./search";
import type { AiProvider, AiUserConfig } from "./types";

/**
 * Demo wiring for the @earendil-works/pi agent harness.
 *
 * Builds a single-provider `Models` from the user's runtime AI config
 * (`AiUserConfig`, sourced from Supabase user_metadata via getUserAiConfig),
 * registers the existing `webSearch` / `fetchUrl` helpers (lib/ai/search.ts)
 * as Pi AgentTools, and exposes a stateless Agent that streams lifecycle
 * events. Independent of the production chat route.
 */

export const PI_SYSTEM_PROMPT =
  "You are GKX, a concise and practical AI assistant. When users ask who you are, you must identify yourself as GKX. " +
  "You have a webSearch tool: use it for recent events, live data, or anything that may have changed after your training. " +
  "If a search snippet is too short, use fetchUrl to read the full page. " +
  "When your answer relies on search results, cite the source URLs at the end.";

/** Default API bases for native providers; compatible providers use config.baseURL. */
const DEFAULT_BASE_URL: Partial<Record<AiProvider, string>> = {
  google: "https://generativelanguage.googleapis.com/v1beta",
  "google-compatible": "https://generativelanguage.googleapis.com/v1beta",
  openai: "https://api.openai.com/v1",
  "openai-compatible": "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  "anthropic-compatible": "https://api.anthropic.com",
};

/** Which pi-ai API implementation each provider uses. */
const API_FACTORY: Record<AiProvider, () => ProviderStreams> = {
  google: googleGenerativeAIApi,
  "google-compatible": googleGenerativeAIApi,
  openai: openAIResponsesApi,
  "openai-compatible": openAICompletionsApi, // chat/completions — DeepSeek/GLM relays
  anthropic: anthropicMessagesApi,
  "anthropic-compatible": anthropicMessagesApi,
};

/** The model's `api` tag must match the provider's API implementation. */
const MODEL_API: Record<AiProvider, Api> = {
  google: "google-generative-ai",
  "google-compatible": "google-generative-ai",
  openai: "openai-responses",
  "openai-compatible": "openai-completions",
  anthropic: "anthropic-messages",
  "anthropic-compatible": "anthropic-messages",
};

/** Build a single-model provider from the user's config. */
export function buildPiProvider(config: AiUserConfig): Provider {
  const baseUrl = config.baseURL ?? DEFAULT_BASE_URL[config.provider] ?? "";
  const model: Model<Api> = {
    id: config.model,
    name: config.model,
    api: MODEL_API[config.provider],
    provider: config.provider,
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  };

  return createProvider({
    id: config.provider,
    name: config.provider,
    baseUrl,
    // Auth always resolves to the user's own key (superseded by the Agent's
    // getApiKey hook, which is threaded as options.apiKey in applyAuth).
    auth: {
      apiKey: {
        name: "User API key",
        resolve: async () => ({ auth: { apiKey: config.apiKey } }),
      },
    },
    models: [model],
    api: API_FACTORY[config.provider](),
  });
}

const webSearchSchema = Type.Object({
  query: Type.String({ description: "The search query. Make it concise and specific." }),
});
const fetchUrlSchema = Type.Object({
  url: Type.String({ description: "The full http(s) URL to fetch." }),
});

/** webSearch / fetchUrl as Pi AgentTools, backed by lib/ai/search.ts. */
export function createPiTools(): AgentTool[] {
  const webSearch: AgentTool<typeof webSearchSchema> = {
    name: "webSearch",
    label: "Web search",
    description:
      "Search the web for current or factual information and return a list of matching results (title, URL, snippet). " +
      "Use when the user asks about recent events, live data, or anything that may postdate your training knowledge.",
    parameters: webSearchSchema,
    execute: async (_toolCallId, params) => {
      const results = await searchWeb(params.query);
      const text =
        results.length === 0
          ? "No search results found. The web sources may be unreachable right now."
          : results
              .map(
                (result, index) =>
                  `${index + 1}. ${result.title}\n   URL: ${result.url}\n   ${result.snippet}`
              )
              .join("\n\n");
      return { content: [{ type: "text", text }], details: {} };
    },
  };

  const fetchUrl: AgentTool<typeof fetchUrlSchema> = {
    name: "fetchUrl",
    label: "Fetch a web page",
    description:
      "Fetch the readable text content of a web page by URL. " +
      "Use to read a full article or page when a search snippet is insufficient.",
    parameters: fetchUrlSchema,
    execute: async (_toolCallId, params) => {
      const text = await fetchPageContent(params.url);
      return { content: [{ type: "text", text }], details: {} };
    },
  };

  return [webSearch, fetchUrl];
}

/** A ready-to-prompt Agent bound to the user's provider/model and tools. */
export function createPiAgent(
  config: AiUserConfig,
  options: { initialMessages?: AgentMessage[] } = {}
) {
  const models = createModels();
  models.setProvider(buildPiProvider(config));

  const provider = models.getProvider(config.provider);
  const model = provider?.getModels().find((entry) => entry.id === config.model);
  if (!model) {
    throw new Error(`Pi model not found: ${config.provider}/${config.model}`);
  }

  const agent = new Agent({
    initialState: {
      systemPrompt: PI_SYSTEM_PROMPT,
      model,
      tools: createPiTools(),
      messages: options.initialMessages ?? [],
    },
    streamFn: models.streamSimple.bind(models),
    getApiKey: () => config.apiKey,
  });

  return { agent, models };
}
