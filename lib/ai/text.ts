import { generateText, streamText } from "ai";
import type { ModelMessage } from "ai";

import type { AiUserConfig } from "./types";
import { getModelCandidates } from "./models";
import { buildLanguageModel } from "./providers";

export interface AiTextOptions {
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
  temperature?: number;
  maxOutputTokens?: number;
}

function getCandidateModels(config: AiUserConfig): string[] {
  const candidates = getModelCandidates(config.provider, config.model);
  return Array.from(new Set(candidates)).filter(Boolean);
}

/**
 * Non-streaming text generation with per-model fallback: if the preferred
 * model fails, the rest of the provider's allowlist is tried in order.
 */
export async function generateAiText(
  config: AiUserConfig,
  options: AiTextOptions
): Promise<{ text: string; model: string }> {
  const candidateModels = getCandidateModels(config);
  let lastError: unknown = null;

  for (const model of candidateModels) {
    try {
      const result = await generateText(
        options.messages
          ? {
              model: buildLanguageModel({ ...config, model }),
              system: options.system,
              messages: options.messages,
              temperature: options.temperature,
              maxOutputTokens: options.maxOutputTokens,
            }
          : {
              model: buildLanguageModel({ ...config, model }),
              system: options.system,
              prompt: options.prompt ?? "",
              temperature: options.temperature,
              maxOutputTokens: options.maxOutputTokens,
            }
      );

      const text = (result.text ?? "").trim();
      if (!text) {
        throw new Error("AI returned empty content");
      }

      return { text, model };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI request failed");
}

/**
 * Streaming text generation as an async generator, with per-model fallback.
 * If a model fails mid-stream, already-yielded chunks are kept and the next
 * candidate model continues, matching the previous Gemini behavior.
 */
export async function* streamAiText(
  config: AiUserConfig,
  options: AiTextOptions
): AsyncGenerator<string> {
  const candidateModels = getCandidateModels(config);
  let lastError: unknown = null;

  for (const model of candidateModels) {
    try {
      const result = await streamText(
        options.messages
          ? {
              model: buildLanguageModel({ ...config, model }),
              system: options.system,
              messages: options.messages,
              temperature: options.temperature,
              maxOutputTokens: options.maxOutputTokens,
            }
          : {
              model: buildLanguageModel({ ...config, model }),
              system: options.system,
              prompt: options.prompt ?? "",
              temperature: options.temperature,
              maxOutputTokens: options.maxOutputTokens,
            }
      );

      for await (const chunk of result.textStream) {
        if (chunk.length > 0) {
          yield chunk;
        }
      }
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI stream failed");
}
