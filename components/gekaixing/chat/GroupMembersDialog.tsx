"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, ShieldCheck, Trash2, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
import type { GroupMember } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  currentUserId: string | undefined;
}

export default function GroupMembersDialog({
  open,
  onOpenChange,
  conversationId,
  currentUserId,
}: Props) {
  const t = useTranslations("ImitationX.ChatPage");
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [callerRole, setCallerRole] = useState("member");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [kicking, setKicking] = useState<GroupMember | null>(null);

  const isAdmin = callerRole === "admin";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/chat/conversations/${conversationId}/members`
        );
        const result = await res.json();
        if (!cancelled && result.success) {
          setMembers(result.data.members);
          setCallerRole(result.data.callerRole);
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

  const toggleMute = async (member: GroupMember) => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/chat/conversations/${conversationId}/members/${member.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ muted: !member.mutedAt }),
        }
      );
      const result = await res.json();
      if (result.success) {
        setMembers((prev) =>
          prev.map((m) =>
            m.id === member.id
              ? { ...m, mutedAt: member.mutedAt ? null : new Date().toISOString() }
              : m
          )
        );
      } else {
        toast.error(result.error || t("updateFailed"));
      }
    } catch {
      toast.error(t("updateFailed"));
    } finally {
      setBusy(false);
    }
  };

  const doKick = async () => {
    if (!kicking) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/chat/conversations/${conversationId}/members/${kicking.id}`,
        { method: "DELETE" }
      );
      const result = await res.json();
      if (result.success) {
        setMembers((prev) => prev.filter((m) => m.id !== kicking.id));
      } else {
        toast.error(result.error || t("updateFailed"));
      }
    } catch {
      toast.error(t("updateFailed"));
    } finally {
      setBusy(false);
      setKicking(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="gap-0 p-0 sm:max-w-sm">
          <DialogHeader className="border-b border-border/60 px-4 py-3">
            <DialogTitle className="text-base font-bold tracking-tight">
              {t("groupMembers")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("groupMembers")}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("loading")}
            </div>
          ) : (
            <div className="max-h-[60vh] divide-y divide-border/60 overflow-y-auto">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar className="size-9 shrink-0 ring-1 ring-border/40">
                    <AvatarImage src={m.avatar || "/default-avatar.png"} alt={m.name} />
                    <AvatarFallback className="text-xs">
                      {m.name.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{m.name}</p>
                      {m.role === "admin" && (
                        <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          <ShieldCheck className="size-3" />
                          {t("memberAdmin")}
                        </span>
                      )}
                      {m.mutedAt && (
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {t("memberMuted")}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      @{m.userid}
                    </p>
                  </div>

                  {isAdmin && m.id !== currentUserId && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-full text-muted-foreground"
                        onClick={() => toggleMute(m)}
                        disabled={busy}
                        aria-label={m.mutedAt ? t("unmute") : t("mute")}
                      >
                        {m.mutedAt ? (
                          <VolumeX className="size-4" />
                        ) : (
                          <Volume2 className="size-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-full text-destructive"
                        onClick={() => setKicking(m)}
                        disabled={busy}
                        aria-label={t("kick")}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!kicking} onOpenChange={(o) => !o && setKicking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("kickConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("kickConfirmDesc", { name: kicking?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void doKick()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("kick")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
