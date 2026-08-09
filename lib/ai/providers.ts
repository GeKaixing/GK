import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import type { AiUserConfig } from "./types";

export function buildLanguageModel(config: AiUserConfig): LanguageModel {
  switch (config.provider) {
    case "openai":
      return createOpenAI({ apiKey: config.apiKey })(config.model);
    case "openai-compatible":
      return createOpenAI({
        apiKey: config.apiKey,
        ...(config.baseURL ? { baseURL: config.baseURL } : {}),
      })(config.model);
    case "anthropic":
      return createAnthropic({ apiKey: config.apiKey })(config.model);
    case "google":
    default:
      return createGoogleGenerativeAI({ apiKey: config.apiKey })(config.model);
  }
}
