"use client";

import { useEffect, useState, type ReactNode } from "react";
import { KeyRound, Settings } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "next-intl";
import Link from "next/link";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getUserAiConfig, normalizeProvider } from "@/lib/ai/config";
import {
  ANTHROPIC_MODEL_OPTIONS,
  DEFAULT_MODEL,
  GOOGLE_MODEL_OPTIONS,
  OPENAI_COMPATIBLE_PRESETS,
  OPENAI_MODEL_OPTIONS,
  normalizeModel,
} from "@/lib/ai/models";
import type { AiProvider } from "@/lib/ai/types";
import { createClient } from "@/utils/supabase/client";
import SettingAccountLi from "./SettingAccountLi";
import Spin from "./Spin";

function maskApiKey(key: string, configuredText: string): string {
  if (key.length < 10) {
    return configuredText;
  }

  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

const PROVIDER_OPTIONS: { value: AiProvider; label: string }[] = [
  { value: "google", label: "Gemini" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai-compatible", label: "OpenAI 兼容" },
];

type SettingAiText = {
  configured: string;
  loginFirst: string;
  saveFailed: string;
  saved: string;
  cleared: string;
  providerLabel: string;
  keyLabel: string;
  dialogTitle: string;
  dialogDescription: string;
  inputPlaceholder: string;
  modelLabel: string;
  modelPlaceholder: string;
  modelHint: string;
  baseUrlLabel: string;
  baseUrlPlaceholder: string;
  presetsLabel: string;
  clearHint: string;
  saveButton: string;
  noKeyText: string;
};

function getText(locale: string): SettingAiText {
  if (locale === "zh-CN") {
    return {
      configured: "已配置",
      loginFirst: "请先登录",
      saveFailed: "保存失败",
      saved: "AI Key 已保存",
      cleared: "AI Key 已清空",
      providerLabel: "提供商",
      keyLabel: "API Key",
      dialogTitle: "AI API Key",
      dialogDescription: "配置你自己的 AI 提供商 Key，用于 AI 发帖、对话和内容生成。",
      inputPlaceholder: "请输入 API Key",
      modelLabel: "模型",
      modelPlaceholder: "请选择模型",
      modelHint: "部分模型可能不支持所有能力，系统会自动回退到可用模型。",
      baseUrlLabel: "接口地址 (Base URL)",
      baseUrlPlaceholder: "例如 https://api.deepseek.com/v1",
      presetsLabel: "常用服务",
      clearHint: "输入框留空并保存即可清空当前 Key。",
      saveButton: "保存",
      noKeyText: "我没有key",
    };
  }

  return {
    configured: "Configured",
    loginFirst: "Please login first",
    saveFailed: "Save failed",
    saved: "AI key saved",
    cleared: "AI key cleared",
    providerLabel: "Provider",
    keyLabel: "API Key",
    dialogTitle: "AI API Key",
    dialogDescription:
      "Save your own AI provider key for post generation, chat, and content generation.",
    inputPlaceholder: "Enter API key",
    modelLabel: "Model",
    modelPlaceholder: "Choose model",
    modelHint: "Some models may not support all features; fallback will be applied automatically.",
    baseUrlLabel: "Base URL",
    baseUrlPlaceholder: "e.g. https://api.deepseek.com/v1",
    presetsLabel: "Presets",
    clearHint: "Leave blank and save to clear your key.",
    saveButton: "Save",
    noKeyText: "I don't have a key",
  };
}

function getKeyLink(provider: AiProvider): string {
  if (provider === "openai") {
    return "https://platform.openai.com/api-keys";
  }
  if (provider === "anthropic") {
    return "https://console.anthropic.com/";
  }
  if (provider === "openai-compatible") {
    return "https://api.deepseek.com/";
  }
  return "https://aistudio.google.com/api-keys";
}

export default function SettingAI({
  trigger,
  onSaved,
}: {
  /** 自定义触发器（用于聊天页顶栏等场景）；不传则用设置列表项样式 */
  trigger?: ReactNode;
  /** 保存成功后的回调（用于刷新界面上的模型显示） */
  onSaved?: () => void;
}) {
  const locale = useLocale();
  const text = getText(locale);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [providerInput, setProviderInput] = useState<AiProvider>("google");
  const [keyInput, setKeyInput] = useState("");
  const [modelInput, setModelInput] = useState(DEFAULT_MODEL.google);
  const [baseUrlInput, setBaseUrlInput] = useState("");

  const [savedProvider, setSavedProvider] = useState<AiProvider>("google");
  const [savedKey, setSavedKey] = useState("");
  const [savedModel, setSavedModel] = useState(DEFAULT_MODEL.google);
  const [savedBaseUrl, setSavedBaseUrl] = useState("");

  useEffect(() => {
    const init = async (): Promise<void> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const config = getUserAiConfig(user);
      setSavedProvider(config.provider);
      setSavedKey(config.apiKey);
      setSavedModel(config.model);
      setSavedBaseUrl(config.baseURL ?? "");
    };

    void init();
  }, []);

  async function loadCurrentConfig(): Promise<void> {
    const supabase = createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      toast.error(text.loginFirst);
      return;
    }

    const config = getUserAiConfig(user);
    setProviderInput(config.provider);
    setKeyInput(config.apiKey);
    setModelInput(config.model);
    setBaseUrlInput(config.baseURL ?? "");
    setSavedProvider(config.provider);
    setSavedKey(config.apiKey);
    setSavedModel(config.model);
    setSavedBaseUrl(config.baseURL ?? "");
  }

  function applyPreset(key: keyof typeof OPENAI_COMPATIBLE_PRESETS): void {
    const preset = OPENAI_COMPATIBLE_PRESETS[key];
    setProviderInput("openai-compatible");
    setBaseUrlInput(preset.baseURL);
    setModelInput(preset.models[0]);
  }

  async function saveAiKey(): Promise<void> {
    setLoading(true);
    try {
      const value = keyInput.trim();
      const provider = normalizeProvider(providerInput);
      const selectedModel = normalizeModel(provider, modelInput);
      const baseURL = baseUrlInput.trim();
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        toast.error(text.loginFirst);
        return;
      }

      const nextMetadata: Record<string, unknown> = {
        ...(user.user_metadata ?? {}),
      };

      nextMetadata.ai_provider = provider;
      if (value) {
        nextMetadata.ai_api_key = value;
      } else {
        delete nextMetadata.ai_api_key;
      }
      nextMetadata.ai_model = selectedModel;

      if (provider === "openai-compatible") {
        if (baseURL) {
          nextMetadata.ai_base_url = baseURL;
        } else {
          delete nextMetadata.ai_base_url;
        }
      } else {
        delete nextMetadata.ai_base_url;
      }

      // Mirror the legacy Gemini fields so older code paths keep working.
      if (provider === "google") {
        if (value) {
          nextMetadata.gemini_api_key = value;
        } else {
          delete nextMetadata.gemini_api_key;
        }
        nextMetadata.gemini_model = selectedModel;
      } else {
        delete nextMetadata.gemini_api_key;
        delete nextMetadata.gemini_model;
      }

      const { data, error } = await supabase.auth.updateUser({
        data: nextMetadata,
      });

      if (error) {
        toast.error(error.message || text.saveFailed);
        return;
      }

      const nextConfig = getUserAiConfig(data.user);
      setSavedProvider(nextConfig.provider);
      setSavedKey(nextConfig.apiKey);
      setSavedModel(nextConfig.model);
      setSavedBaseUrl(nextConfig.baseURL ?? "");
      setProviderInput(nextConfig.provider);
      setKeyInput(nextConfig.apiKey);
      setModelInput(nextConfig.model);
      setBaseUrlInput(nextConfig.baseURL ?? "");
      toast.success(nextConfig.apiKey ? text.saved : text.cleared);
      setOpen(false);
      onSaved?.();
    } finally {
      setLoading(false);
    }
  }

  const providerLabel = PROVIDER_OPTIONS.find((option) => option.value === savedProvider)?.label ?? "Gemini";
  const triggerModel = savedProvider === "openai-compatible" && savedBaseUrl ? savedBaseUrl : savedModel;
  const isCompatible = providerInput === "openai-compatible";
  const isSelectModel =
    providerInput === "google" || providerInput === "openai" || providerInput === "anthropic";
  const modelOptions =
    providerInput === "google"
      ? GOOGLE_MODEL_OPTIONS
      : providerInput === "anthropic"
        ? ANTHROPIC_MODEL_OPTIONS
        : OPENAI_MODEL_OPTIONS;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          void loadCurrentConfig();
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <button type="button" className="w-full text-left">
            <SettingAccountLi
              icon={<KeyRound />}
              text={`${text.keyLabel} (${providerLabel})${savedKey ? ` · ${maskApiKey(savedKey, text.configured)}` : ""} · ${triggerModel}`}
            />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="space-y-2">
          <DialogTitle>{text.dialogTitle}</DialogTitle>
          <DialogDescription>{text.dialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">{text.providerLabel}</p>
            <Select value={providerInput} onValueChange={(value) => setProviderInput(normalizeProvider(value))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={text.providerLabel} />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              type="password"
              placeholder={text.inputPlaceholder}
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              disabled={loading}
              className="w-full"
            />
            <Link
              href={getKeyLink(providerInput)}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-sm text-blue-600 hover:underline sm:text-xs"
            >
              {text.noKeyText}
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            {text.clearHint}
          </p>

          {isCompatible && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{text.presetsLabel}</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(OPENAI_COMPATIBLE_PRESETS).map(([key, preset]) => (
                  <Button
                    key={key}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyPreset(key as keyof typeof OPENAI_COMPATIBLE_PRESETS)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">{text.modelLabel}</p>
            {isSelectModel ? (
              <Select value={modelInput} onValueChange={(value) => setModelInput(normalizeModel(providerInput, value))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={text.modelPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder={text.modelPlaceholder}
                value={modelInput}
                onChange={(event) => setModelInput(event.target.value)}
                disabled={loading}
                className="w-full"
              />
            )}
            <p className="text-xs text-muted-foreground">{text.modelHint}</p>
          </div>

          {isCompatible && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{text.baseUrlLabel}</p>
              <Input
                placeholder={text.baseUrlPlaceholder}
                value={baseUrlInput}
                onChange={(event) => setBaseUrlInput(event.target.value)}
                disabled={loading}
                className="w-full"
              />
            </div>
          )}

          <Button
            type="button"
            className="w-full bg-black text-white"
            onClick={() => {
              void saveAiKey();
            }}
            disabled={loading}
          >
            {loading ? <Spin /> : text.saveButton}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
