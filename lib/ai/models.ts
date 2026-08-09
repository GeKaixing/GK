import type { AiProvider } from "./types";

export const GOOGLE_MODEL_OPTIONS = [
  "gemini-3.1-flash-lite-preview",
  "gemini-3.1-flash-live-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
] as const;

export const OPENAI_MODEL_OPTIONS = [
  "gpt-5",
  "gpt-5-mini",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
] as const;

export const ANTHROPIC_MODEL_OPTIONS = [
  "claude-opus-4-5",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
  "claude-3-7-sonnet",
  "claude-3-5-haiku",
] as const;

export const DEFAULT_MODEL: Record<AiProvider, string> = {
  google: "gemini-3-flash-preview",
  "google-compatible": "",
  openai: "gpt-5",
  "openai-compatible": "",
  anthropic: "claude-sonnet-4-5",
  "anthropic-compatible": "",
};

/** Suggestive defaults for common OpenAI-compatible services. */
export const OPENAI_COMPATIBLE_PRESETS: Record<string, { label: string; baseURL: string; models: string[] }> = {
  deepseek: {
    label: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  glm: {
    label: "智谱 GLM",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-5", "glm-4-plus", "glm-4-flash"],
  },
  moonshot: {
    label: "Moonshot Kimi",
    baseURL: "https://api.moonshot.cn/v1",
    models: ["moonshot-v1-8k", "moonshot-v1-32k"],
  },
  minimax: {
    label: "MiniMax",
    baseURL: "https://api.minimaxi.com/v1",
    models: ["MiniMax-M2.5", "MiniMax-M2.7", "MiniMax-Text-01"],
  },
  openrouter: {
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    models: ["openrouter/auto"],
  },
  siliconflow: {
    label: "SiliconFlow 硅基流动",
    baseURL: "https://api.siliconflow.cn/v1",
    models: ["deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct"],
  },
  xai: {
    label: "xAI (Grok)",
    baseURL: "https://api.x.ai/v1",
    models: ["grok-4", "grok-3", "grok-2-latest"],
  },
  qwen: {
    label: "通义千问 Qwen",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-max", "qwen-plus", "qwen-turbo"],
  },
  modelscope: {
    label: "ModelScope 魔搭",
    baseURL: "https://api-inference.modelscope.cn/v1",
    models: ["Qwen/Qwen2.5-72B-Instruct"],
  },
  novita: {
    label: "Novita AI",
    baseURL: "https://api.novita.ai/v3/openai",
    models: ["deepseek/deepseek-chat"],
  },
  nvidia: {
    label: "Nvidia NIM",
    baseURL: "https://integrate.api.nvidia.com/v1",
    models: ["deepseek-ai/deepseek-r1", "meta/llama-3.3-70b-instruct"],
  },
  stepfun: {
    label: "StepFun 阶跃星辰",
    baseURL: "https://api.stepfun.com/v1",
    models: ["step-2-16k", "step-1-8k"],
  },
  groq: {
    label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile"],
  },
  mistral: {
    label: "Mistral",
    baseURL: "https://api.mistral.ai/v1",
    models: ["mistral-large-latest"],
  },
  opencode: {
    label: "OpenCode Go",
    baseURL: "https://opencode.ai/zen/go/v1",
    models: ["deepseek-v4-flash", "kimi-k3", "glm-5", "grok-4.5"],
  },
};

export function normalizeModel(provider: AiProvider, value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return DEFAULT_MODEL[provider];
  }

  const normalized = value.trim();

  if (provider === "google") {
    return (GOOGLE_MODEL_OPTIONS as readonly string[]).includes(normalized)
      ? normalized
      : DEFAULT_MODEL.google;
  }

  if (provider === "openai") {
    return (OPENAI_MODEL_OPTIONS as readonly string[]).includes(normalized)
      ? normalized
      : DEFAULT_MODEL.openai;
  }

  if (provider === "anthropic") {
    return (ANTHROPIC_MODEL_OPTIONS as readonly string[]).includes(normalized)
      ? normalized
      : DEFAULT_MODEL.anthropic;
  }

  return normalized;
}

/**
 * Ordered candidate models: preferred first, then the rest of the
 * provider's allowlist as fallbacks. openai-compatible providers have no
 * allowlist, so only the user-chosen model is tried.
 */
export function getModelCandidates(provider: AiProvider, preferred: unknown): string[] {
  const preferredModel = normalizeModel(provider, preferred);

  if (
    provider === "openai-compatible" ||
    provider === "anthropic-compatible" ||
    provider === "google-compatible"
  ) {
    return preferredModel ? [preferredModel] : [];
  }

  const list =
    provider === "google"
      ? GOOGLE_MODEL_OPTIONS
      : provider === "anthropic"
        ? ANTHROPIC_MODEL_OPTIONS
        : OPENAI_MODEL_OPTIONS;
  const rest = list.filter((model) => model !== preferredModel);
  return [preferredModel, ...rest];
}
