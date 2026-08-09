"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Camera, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { uploadImageToSupabase } from "@/utils/function/uploadImageToSupabase";
import { LogOut } from "lucide-react";
import type { GroupInfo } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  onDisbanded: () => void;
  onLeft: () => void;
}

export default function GroupInfoDialog({
  open,
  onOpenChange,
  conversationId,
  onDisbanded,
  onLeft,
}: Props) {
  const t = useTranslations("ImitationX.ChatPage");
  const locale = useLocale();
  const [info, setInfo] = useState<GroupInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [nameDraft, setNameDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isAdmin = info?.callerRole === "admin";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/chat/conversations/${conversationId}`);
        const result = await res.json();
        if (!cancelled && result.success) {
          setInfo(result.data);
          setNameDraft(result.data.name ?? "");
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, conversationId]);

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || !info) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const result = await res.json();
      if (result.success) {
        setInfo({ ...info, name: trimmed });
        toast.success(t("groupUpdated"));
      } else {
        toast.error(result.error || t("updateFailed"));
      }
    } catch {
      toast.error(t("updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    try {
      const url = await uploadImageToSupabase(file, "images", "group-avatars");
      if (!url) {
        toast.error(t("uploadFailed"));
        return;
      }
      const res = await fetch(`/api/chat/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: url }),
      });
      const result = await res.json();
      if (result.success) {
        setInfo((prev) => (prev ? { ...prev, avatar: url } : prev));
        toast.success(t("groupUpdated"));
      } else {
        toast.error(result.error || t("updateFailed"));
      }
    } catch {
      toast.error(t("updateFailed"));
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const doDisband = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}`, {
        method: "DELETE",
      });
      const result = await res.json();
      setConfirmOpen(false);
      if (result.success) {
        toast.success(t("disbanded"));
        onDisbanded();
      } else {
        toast.error(result.error || t("updateFailed"));
      }
    } catch {
      toast.error(t("updateFailed"));
      setConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const doLeave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}/me`, {
        method: "DELETE",
      });
      const result = await res.json();
      setLeaveOpen(false);
      if (result.success) {
        toast.success(t("leftGroup"));
        onLeft();
      } else {
        toast.error(result.error || t("updateFailed"));
      }
    } catch {
      toast.error(t("updateFailed"));
      setLeaveOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const createdStr = info
    ? new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(new Date(info.createdAt))
    : "";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="gap-0 p-0 sm:max-w-sm">
          <DialogHeader className="border-b border-border/60 px-4 py-3">
            <DialogTitle className="text-base font-bold tracking-tight">
              {t("groupInfo")}
            </DialogTitle>
            <DialogDescription className="sr-only">{t("groupInfo")}</DialogDescription>
          </DialogHeader>

          {loading || !info ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("loading")}
            </div>
          ) : (
            <div className="space-y-4 px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <Avatar className="size-14 ring-1 ring-border/50">
                    <AvatarImage src={info.avatar || "/default-avatar.png"} alt={info.name} />
                    <AvatarFallback className="text-base">
                      {info.name.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
                      aria-label={t("changeAvatar")}
                    >
                      <Camera className="size-3" />
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onPickFile}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold">{info.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("membersCount", { count: info.participantCount })}
                  </p>
                  <p className="text-xs text-muted-foreground/80">
                    {t("groupCreatedAt", { date: createdStr })}
                  </p>
                </div>
              </div>

              {isAdmin && (
                <div className="space-y-4 border-t border-border/60 pt-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {t("rename")}
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        className="h-9 flex-1"
                      />
                      <Button
                        onClick={() => void saveName()}
                        disabled={saving || !nameDraft.trim()}
                        className="h-9 shrink-0"
                      >
                        {saving ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Pencil className="size-4" />
                        )}
                        {t("save")}
                      </Button>
                    </div>
                  </div>

                  <Button
                    variant="destructive"
                    onClick={() => setConfirmOpen(true)}
                    disabled={saving}
                    className="w-full"
                  >
                    <Trash2 className="size-4" />
                    {t("disbandGroup")}
                  </Button>
                </div>
              )}

              <div className="border-t border-border/60 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setLeaveOpen(true)}
                  disabled={saving}
                  className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <LogOut className="size-4" />
                  {t("leaveGroup")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("disbandConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("disbandConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void doDisband()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("disbandGroup")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("leaveGroupConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("leaveGroupConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void doLeave()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("leaveGroup")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
