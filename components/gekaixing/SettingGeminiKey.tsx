"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
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
import { DEFAULT_GEMINI_MODEL, GEMINI_MODEL_OPTIONS, normalizeGeminiModel } from "@/lib/gemini-model";
import { createClient } from "@/utils/auth-compat/client";
import SettingAccountLi from "./SettingAccountLi";
import Spin from "./Spin";

function maskApiKey(key: string, configuredText: string): string {
  if (key.length < 10) {
    return configuredText;
  }

  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

type SettingGeminiKeyText = {
  configured: string;
  loginFirst: string;
  saveFailed: string;
  saved: string;
  cleared: string;
  keyLabel: string;
  dialogTitle: string;
  dialogDescription: string;
  inputPlaceholder: string;
  modelLabel: string;
  modelPlaceholder: string;
  modelHint: string;
  clearHint: string;
  lastUpdatedLabel: string;
  neverUpdated: string;
  saveButton: string;
  noKeyText: string;
};

function getText(locale: string): SettingGeminiKeyText {
  if (locale === "zh-CN") {
    return {
      configured: "已配置",
      loginFirst: "请先登录",
      saveFailed: "保存失败",
      saved: "Gemini Key 已保存到本地 PostgreSQL",
      cleared: "Gemini Key 已从本地 PostgreSQL 清空",
      keyLabel: "Gemini API Key",
      dialogTitle: "Gemini API Key",
      dialogDescription: "配置你自己的 Gemini Key，用于 AI 发帖和会话标题生成。配置会保存到本地 PostgreSQL。",
      inputPlaceholder: "请输入 Gemini Key（例如 AIzaSy...）",
      modelLabel: "Gemini 模型",
      modelPlaceholder: "请选择模型",
      modelHint: "部分模型可能不支持所有能力，系统会自动回退到可用模型。",
      clearHint: "输入框留空并保存即可清空当前 Key。",
      lastUpdatedLabel: "最近更新时间",
      neverUpdated: "尚未更新",
      saveButton: "保存",
      noKeyText: "我没有key",
    };
  }

  return {
    configured: "Configured",
    loginFirst: "Please login first",
    saveFailed: "Save failed",
    saved: "Gemini key saved to local PostgreSQL",
    cleared: "Gemini key cleared from local PostgreSQL",
    keyLabel: "Gemini API Key",
    dialogTitle: "Gemini API Key",
    dialogDescription:
      "Save your own Gemini key for AI post generation and chat title generation. Settings are stored in local PostgreSQL.",
    inputPlaceholder: "Enter Gemini key (for example AIzaSy...)",
    modelLabel: "Gemini Model",
    modelPlaceholder: "Choose model",
    modelHint: "Some models may not support all features; fallback will be applied automatically.",
    clearHint: "Leave blank and save to clear your key.",
    lastUpdatedLabel: "Last updated",
    neverUpdated: "Not updated yet",
    saveButton: "Save",
    noKeyText: "I don't have a key",
  };
}

function formatUpdatedAt(value: string | null, locale: string, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toLocaleString(locale);
}

export default function SettingGeminiKey() {
  const locale = useLocale();
  const text = getText(locale);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [hasConfiguredKey, setHasConfiguredKey] = useState(false);
  const [savedModel, setSavedModel] = useState(DEFAULT_GEMINI_MODEL);
  const [modelInput, setModelInput] = useState(DEFAULT_GEMINI_MODEL);
  const [savedUpdatedAt, setSavedUpdatedAt] = useState<string | null>(null);

  const compactModelLabel = savedModel.replace(/^gemini-/, "");

  useEffect(() => {
    const init = async (): Promise<void> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const storedKey = "";
      const configured = Boolean(user?.user_metadata?.has_gemini_key);
      const storedModel = normalizeGeminiModel(user?.user_metadata?.gemini_model);
      const storedUpdatedAt =
        typeof user?.user_metadata?.gemini_updated_at === "string"
          ? user.user_metadata.gemini_updated_at
          : null;

      setSavedKey(storedKey);
      setHasConfiguredKey(configured);
      setSavedModel(storedModel);
      setSavedUpdatedAt(storedUpdatedAt);
    };

    void init();
  }, []);

  async function loadCurrentKey(): Promise<void> {
    const supabase = createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      toast.error(text.loginFirst);
      return;
    }

    const storedKey = "";
    const configured = Boolean(user.user_metadata?.has_gemini_key);
    const storedModel = normalizeGeminiModel(user.user_metadata?.gemini_model);
    const storedUpdatedAt =
      typeof user.user_metadata?.gemini_updated_at === "string"
        ? user.user_metadata.gemini_updated_at
        : null;

    setSavedKey(storedKey);
    setHasConfiguredKey(configured);
    setKeyInput(storedKey);
    setSavedModel(storedModel);
    setModelInput(storedModel);
    setSavedUpdatedAt(storedUpdatedAt);
  }

  async function saveGeminiKey(): Promise<void> {
    setLoading(true);
    try {
      const value = keyInput.trim();
      const selectedModel = normalizeGeminiModel(modelInput);
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

      if (value) {
        nextMetadata.gemini_api_key = value;
      } else {
        delete nextMetadata.gemini_api_key;
      }
      nextMetadata.gemini_model = selectedModel;

      const { data, error } = await supabase.auth.updateUser({
        data: nextMetadata,
      });

      if (error) {
        toast.error(error.message || text.saveFailed);
        return;
      }

      const nextStoredKey = "";
      const nextHasGeminiKey = Boolean(data.user?.user_metadata?.has_gemini_key);
      const nextStoredModel = normalizeGeminiModel(data.user?.user_metadata?.gemini_model);
      const nextUpdatedAt =
        typeof data.user?.user_metadata?.gemini_updated_at === "string"
          ? data.user.user_metadata.gemini_updated_at
          : null;

      setSavedKey(nextStoredKey);
      setHasConfiguredKey(nextHasGeminiKey);
      setKeyInput(nextStoredKey);
      setSavedModel(nextStoredModel);
      setModelInput(nextStoredModel);
      setSavedUpdatedAt(nextUpdatedAt);
      toast.success(nextHasGeminiKey ? text.saved : text.cleared);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          void loadCurrentKey();
        }
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="w-full text-left">
          <SettingAccountLi
            icon={<KeyRound />}
            text={`${text.keyLabel}${hasConfiguredKey ? ` (${text.configured})` : ""} · ${compactModelLabel}`}
          />        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="space-y-2">
          <DialogTitle>{text.dialogTitle}</DialogTitle>
          <DialogDescription>{text.dialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
              href="https://aistudio.google.com/api-keys"
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
          <div className="space-y-2">
            <p className="text-sm font-medium">{text.modelLabel}</p>
            <Select value={modelInput} onValueChange={(value) => setModelInput(normalizeGeminiModel(value))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={text.modelPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {GEMINI_MODEL_OPTIONS.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{text.modelHint}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {text.lastUpdatedLabel}: {formatUpdatedAt(savedUpdatedAt, locale, text.neverUpdated)}
          </p>
          <Button
            type="button"
            className="w-full bg-black text-white"
            onClick={() => {
              void saveGeminiKey();
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
