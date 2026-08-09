export type AiProvider =
  | "google"
  | "google-compatible"
  | "openai"
  | "openai-compatible"
  | "anthropic"
  | "anthropic-compatible";

export interface AiUserConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
  /** Required for openai-compatible providers (e.g. DeepSeek, GLM). */
  baseURL?: string;
}
