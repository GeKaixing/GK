"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const ISSUE_TYPES = ["playback", "quality", "audio", "connection", "other"] as const;

export default function FeedbackDialog({
  open,
  onOpenChange,
  streamId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  streamId?: string;
}) {
  const t = useTranslations("ImitationX.Live");
  const [issueType, setIssueType] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) {
      toast.error(t("feedbackMessageRequired"));
      return;
    }
    if (!streamId) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/live/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streamId,
          issueType: issueType || "other",
          message: message.trim(),
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(t("feedbackSubmitted"));
        onOpenChange(false);
      } else {
        toast.error(result.error || t("feedbackFailed"));
      }
    } catch (error) {
      console.error("Failed to submit feedback:", error);
      toast.error(t("feedbackFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4" />
            {t("feedbackTitle")}
          </DialogTitle>
          <DialogDescription>{t("feedbackDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("feedbackType")}</Label>
            <Select value={issueType} onValueChange={setIssueType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("feedbackTypePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {ISSUE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`feedbackTypeOptions.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-message">
              {t("feedbackMessage")} <span className="text-red-500">*</span>
            </Label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t("feedbackMessagePlaceholder")}
              maxLength={1000}
              className="min-h-24 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("cancel")}
          </Button>
          <Button
            className="rounded-full"
            onClick={() => void handleSubmit()}
            disabled={submitting || !message.trim()}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("feedbackSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
