"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ImagePlus, Loader2, Radio, X } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadImageToSupabase } from "@/utils/function/uploadImageToSupabase";
import { cn } from "@/lib/utils";

const CATEGORIES = ["general", "gaming", "music", "tech", "chat", "sports"] as const;

export default function GoLiveDialog() {
  const t = useTranslations("ImitationX.Live");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleThumbnailChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploading(true);
    try {
      const url = await uploadImageToSupabase(file);
      if (!url) {
        toast.error(t("thumbnailFailed"));
        return;
      }
      setThumbnailUrl(url);
      toast.success(t("thumbnailUploaded"));
    } catch (error) {
      console.error("Failed to upload thumbnail:", error);
      toast.error(t("thumbnailFailed"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error(t("titleRequired"));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/live/streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category: category || null,
          description: description.trim() || null,
          streamUrl: streamUrl.trim() || null,
          thumbnailUrl: thumbnailUrl || null,
          scheduledAt: scheduledAt || null,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(t("createSuccess"));
        setOpen(false);
        resetForm();
        router.push(`/gekaixing/live/${result.data.id}`);
      } else {
        toast.error(result.error || t("createFailed"));
      }
    } catch (error) {
      console.error("Failed to start live:", error);
      toast.error(t("createFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setCategory("");
    setDescription("");
    setStreamUrl("");
    setThumbnailUrl("");
    setScheduledAt("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          resetForm();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-1.5 rounded-full">
          <Radio className="h-4 w-4" />
          {t("goLive")}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[88vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("startTitle")}</DialogTitle>
          <DialogDescription>{t("startDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 标题 */}
          <div className="space-y-2">
            <Label htmlFor="live-title">
              {t("formTitle")} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="live-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("formTitlePlaceholder")}
              maxLength={80}
            />
          </div>

          {/* 分类 */}
          <div className="space-y-2">
            <Label>{t("formCategory")}</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("categoryPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {t(`category.${cat}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 简介 */}
          <div className="space-y-2">
            <Label htmlFor="live-desc">{t("formDescription")}</Label>
            <textarea
              id="live-desc"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("formDescriptionPlaceholder")}
              maxLength={500}
              className="min-h-24 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* 直播流地址 */}
          <div className="space-y-2">
            <Label htmlFor="live-url">{t("formStreamUrl")}</Label>
            <Input
              id="live-url"
              value={streamUrl}
              onChange={(event) => setStreamUrl(event.target.value)}
              placeholder="https://example.com/stream.m3u8"
            />
            <p className="text-xs leading-5 text-muted-foreground">{t("formStreamUrlHint")}</p>
          </div>

          {/* 封面 */}
          <div className="space-y-2">
            <Label>{t("formThumbnail")}</Label>
            <div className="flex items-center gap-3">
              {thumbnailUrl ? (
                <div className="relative h-20 w-32 overflow-hidden rounded-lg border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbnailUrl} alt="cover" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setThumbnailUrl("")}
                    aria-label="remove cover"
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="gap-1.5 rounded-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                {t("uploadCover")}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void handleThumbnailChange(event)}
              />
            </div>
          </div>

          {/* 预约开播 */}
          <div className="space-y-2">
            <Label htmlFor="live-schedule">{t("formScheduledAt")}</Label>
            <Input
              id="live-schedule"
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              className="w-full"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <DialogClose asChild>
            <Button variant="ghost" className="rounded-full" disabled={submitting}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button
            className={cn("rounded-full", !title.trim() && "opacity-60")}
            onClick={() => void handleSubmit()}
            disabled={submitting || !title.trim()}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("start")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
