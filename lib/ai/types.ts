export type AiProvider = "google" | "openai" | "openai-compatible" | "anthropic";

export interface AiUserConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
  /** Required for openai-compatible providers (e.g. DeepSeek, GLM). */
  baseURL?: string;
}
