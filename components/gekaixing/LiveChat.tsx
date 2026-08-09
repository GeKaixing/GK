"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/utils/supabase/client";
import { userStore } from "@/store/user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  streamId: string;
  authorId: string;
  authorName: string | null;
  authorAvatar: string | null;
  authorUserid: string | null;
  content: string;
  createdAt: string;
  isMe?: boolean;
};

async function fetchHistory(streamId: string): Promise<ChatMessage[]> {
  const response = await fetch(`/api/live/streams/${streamId}/messages`);
  const result = await response.json();
  if (!result.success) {
    return [];
  }
  return (result.data as ChatMessage[]).map((m) => ({
    ...m,
    isMe: false,
  }));
}

export default function LiveChat({
  streamId,
  streamStatus,
}: {
  streamId: string;
  streamStatus: string;
}) {
  const t = useTranslations("ImitationX.Live");
  const locale = useLocale();
  const supabase = createClient();
  const { id: currentUserId, name: currentName, user_avatar, userid } = userStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isLive = streamStatus === "LIVE";

  useEffect(() => {
    void fetchHistory(streamId).then((history) => {
      setMessages(history);
    });
  }, [streamId]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    const channel = supabase
      .channel(`live-${streamId}`)
      .on("broadcast", { event: "new-message" }, (payload) => {
        const newMessage = payload.payload as ChatMessage;
        if (newMessage.streamId !== streamId) {
          return;
        }

        setMessages((prev) => {
          if (prev.some((m) => m.id === newMessage.id)) {
            return prev;
          }
          return [
            ...prev,
            { ...newMessage, isMe: newMessage.authorId === currentUserId },
          ];
        });
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.error("Live chat channel error occurred");
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [currentUserId, streamId, supabase]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending || !isLive) {
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const tempMessage: ChatMessage = {
      id: tempId,
      streamId,
      authorId: currentUserId || "",
      authorName: currentName || null,
      authorAvatar: user_avatar || null,
      authorUserid: userid || null,
      content,
      createdAt: new Date().toISOString(),
      isMe: true,
    };

    setMessages((prev) => [...prev, tempMessage]);
    setInput("");
    setSending(true);

    try {
      const response = await fetch(`/api/live/streams/${streamId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      const result = await response.json();

      if (result.success) {
        const savedMessage = result.data as ChatMessage;
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...savedMessage, isMe: true } : m)));

        await supabase.channel(`live-${streamId}`).send({
          type: "broadcast",
          event: "new-message",
          payload: {
            ...savedMessage,
            streamId,
          },
        });
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        toast.error(result.error || t("sendFailed"));
      }
    } catch (error) {
      console.error("Failed to send live message:", error);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast.error(t("sendFailed"));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-base font-bold">{t("chatTitle")}</h2>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("chatEmpty")}</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn("flex items-start gap-2.5", msg.isMe && "flex-row-reverse")}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={msg.authorAvatar ?? undefined} />
                <AvatarFallback>
                  {(msg.authorName || msg.authorUserid || "U").slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className={cn("min-w-0 max-w-[80%]", msg.isMe && "text-right")}>
                <div className={cn("mb-0.5 flex items-baseline gap-1.5", msg.isMe && "flex-row-reverse")}>
                  <span className="truncate text-xs font-semibold text-foreground">
                    {msg.authorName || `@${msg.authorUserid || "user"}`}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(msg.createdAt)}</span>
                </div>
                <p
                  className={cn(
                    "inline-block rounded-2xl px-3 py-1.5 text-left text-sm break-words",
                    msg.isMe
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  {msg.content}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-border p-3">
        {isLive ? (
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("chatPlaceholder")}
              className="h-9 flex-1 rounded-full border border-border bg-muted/40 px-4 text-sm outline-none focus:border-primary/50"
            />
            <button
              onClick={() => void handleSend()}
              disabled={!input.trim() || sending}
              aria-label={t("send")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <p className="py-2 text-center text-sm text-muted-foreground">{t("ended")}</p>
        )}
      </div>
    </div>
  );
}
