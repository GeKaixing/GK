"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MinimalTiptapEditor } from "../ui/minimal-tiptap";
import { useRichPostEditor } from "./useRichPostEditor";

/**
 * Compose a reply to a REMOTE (federated) post. Creates a local Post + RemoteReply
 * and broadcasts the signed REPLY_CREATED to the post's country (/api/fed/reply).
 */
export default function FedReplyDialog(props: {
  countryId: string;
  actorId: string;
  remotePostId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReplied?: () => void;
}) {
  const { countryId, actorId, remotePostId, open, onOpenChange, onReplied } = props;
  const t = useTranslations("ImitationX.Federated");

  const {
    value,
    setValue,
    setEditor,
    hasPublishableContent,
    extractEmbeddedMediaUrls,
    cleanupMedia,
    reset,
  } = useRichPostEditor();

  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function handleReply() {
    if (!hasPublishableContent(value)) return;
    setSubmitting(true);
    const content = value as string;
    const { videoUrl, audioUrl, allUrls } = extractEmbeddedMediaUrls(content);
    try {
      const res = await fetch("/api/fed/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryId, actorId, remotePostId, content, videoUrl, audioUrl }),
      });
      const data = await res.json();
      if (data?.success) {
        cleanupMedia(allUrls);
        reset();
        onOpenChange(false);
        toast.success(t("replySuccess"));
        onReplied?.();
      } else {
        toast.error(data?.error ?? t("replyFailed"));
      }
    } catch {
      toast.error(t("replyFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("replyTitle")}</DialogTitle>
        </DialogHeader>
        {mounted ? (
          <MinimalTiptapEditor
            value={value}
            onChange={setValue}
            onEditorReady={setEditor}
            publish={handleReply}
            canPublish={hasPublishableContent(value) && !submitting}
            status={false}
            className="w-full"
            editorContentClassName="px-3 py-2"
            output="html"
            placeholder={t("replyPlaceholder")}
            editable
            editorClassName="focus:outline-hidden"
            toolbarOnFocus
          />
        ) : (
          <div className="h-32 w-full rounded-md border border-input" />
        )}
      </DialogContent>
    </Dialog>
  );
}
