import type { AiProvider, AiUserConfig } from "./types";
import { normalizeModel } from "./models";

const VALID_PROVIDERS: AiProvider[] = ["google", "openai", "openai-compatible", "anthropic"];

export function normalizeProvider(value: unknown): AiProvider {
  return VALID_PROVIDERS.includes(value as AiProvider) ? (value as AiProvider) : "google";
}

/**
 * Resolve the user's AI provider configuration from Supabase `user_metadata`.
 *
 * Backward compatibility: users who configured the legacy Gemini fields
 * (`gemini_api_key` / `gemini_model`) keep working with provider = "google".
 * Once `ai_provider` is set, the new `ai_*` fields take over.
 */
export function getUserAiConfig(
  user: { user_metadata?: Record<string, unknown> | null } | null | undefined
): AiUserConfig {
  const metadata = user?.user_metadata ?? {};
  const hasProvider = typeof metadata.ai_provider === "string";

  if (!hasProvider) {
    const apiKey = typeof metadata.gemini_api_key === "string" ? metadata.gemini_api_key.trim() : "";
    return {
      provider: "google",
      apiKey,
      model: normalizeModel("google", metadata.gemini_model),
    };
  }

  const provider = normalizeProvider(metadata.ai_provider);
  const apiKey = typeof metadata.ai_api_key === "string" ? metadata.ai_api_key.trim() : "";
  const baseURL = typeof metadata.ai_base_url === "string" ? metadata.ai_base_url.trim() : "";

  return {
    provider,
    apiKey,
    model: normalizeModel(provider, metadata.ai_model),
    ...(provider === "openai-compatible" && baseURL ? { baseURL } : {}),
  };
}
