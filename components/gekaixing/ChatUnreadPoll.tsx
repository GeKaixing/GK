"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { chatDotStore } from "@/store/chatDot";

const POLL_INTERVAL_MS = 30_000;

/**
 * Polls a lightweight endpoint for unread conversation messages while the user
 * is anywhere except the chat page, keeping the sidebar/mobile chat-icon dot
 * live without a full navigation. Skips polling while the tab is hidden (but
 * fires once on becoming visible again) and while on /gekaixing/chat itself.
 */
export default function ChatUnreadPoll({ initialHasUnreadChat }: { initialHasUnreadChat: boolean }) {
  const pathname = usePathname();
  const onChat = pathname === "/gekaixing/chat" || pathname.startsWith("/gekaixing/chat/");
  const initialRef = useRef(initialHasUnreadChat);

  // Seed the store from the server-rendered value so there is no flicker
  // between SSR and the first poll response.
  useEffect(() => {
    chatDotStore.setState({ hasUnreadChat: initialRef.current });
  }, []);

  useEffect(() => {
    // On the chat page — the conversation list already shows unread badges and
    // marks conversations read as they are opened.
    if (onChat) {
      return;
    }

    let cancelled = false;
    let controller: AbortController | null = null;

    const poll = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await fetch("/api/chat/unread", {
          signal: controller.signal,
          credentials: "same-origin",
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as { hasUnread: boolean };
          if (!cancelled) {
            chatDotStore.setState({ hasUnreadChat: data.hasUnread });
          }
        }
      } catch {
        // Silent fail; the next poll retries.
      }
    };

    void poll();
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") {
        return;
      }
      void poll();
    }, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      controller?.abort();
    };
  }, [onChat]);

  return null;
}
