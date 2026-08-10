import { generateText, streamText } from "ai";
import type { ModelMessage, ToolSet } from "ai";

import type { AiUserConfig } from "./types";
import { getModelCandidates } from "./models";
import { buildLanguageModel } from "./providers";

export interface AiTextOptions {
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  /** Tools available to the model (e.g. webSearch). Omit for providers without tool support. */
  tools?: ToolSet;
  /** Max model steps when tools are enabled (tool-call + follow-up = 1 step). */
  maxSteps?: number;
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

/** Stream one candidate model's response, forwarding any configured tools. */
async function* streamCandidate(
  config: AiUserConfig,
  options: AiTextOptions,
  model: string
): AsyncGenerator<string> {
  const result = await streamText({
    model: buildLanguageModel({ ...config, model }),
    system: options.system,
    ...(options.messages
      ? { messages: options.messages }
      : { prompt: options.prompt ?? "" }),
    temperature: options.temperature,
    maxOutputTokens: options.maxOutputTokens,
    ...(options.tools ? { tools: options.tools } : {}),
    ...(options.maxSteps ? { maxSteps: options.maxSteps } : {}),
  });

  for await (const chunk of result.textStream) {
    if (chunk.length > 0) {
      yield chunk;
    }
  }
}

/**
 * Streaming text generation as an async generator, with per-model fallback.
 * If a model fails mid-stream, already-yielded chunks are kept and the next
 * candidate model continues, matching the previous Gemini behavior.
 *
 * When tools are requested but every candidate fails with them — either by
 * throwing (e.g. a `*-compatible` endpoint that has no tool support) or by
 * replying with no text at all (some providers accept the tools param but
 * return an empty tool-call turn) — the whole request is retried once without
 * tools so chat still produces an answer.
 */
export async function* streamAiText(
  config: AiUserConfig,
  options: AiTextOptions
): AsyncGenerator<string> {
  const candidateModels = getCandidateModels(config);
  const passes: AiTextOptions[] = options.tools
    ? [options, { ...options, tools: undefined, maxSteps: undefined }]
    : [options];
  let lastError: unknown = null;

  for (const pass of passes) {
    let produced = false;

    for (const model of candidateModels) {
      try {
        for await (const chunk of streamCandidate(config, pass, model)) {
          produced = true;
          yield chunk;
        }
      } catch (error) {
        lastError = error;
      }

      if (produced) return; // streamed real text (even if it later errored) → done
      // Otherwise this model threw or answered empty; try the next candidate,
      // then fall through to the next pass (e.g. no-tools).
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI stream failed");
}
