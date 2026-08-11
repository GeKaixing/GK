"use client";

import { useEffect, useRef } from "react";
import { liveDotStore } from "@/store/liveDot";

const POLL_INTERVAL_MS = 30_000;

/**
 * Polls a lightweight endpoint for followed authors currently live, keeping the
 * sidebar live-icon dot fresh without a full navigation. Unlike the feed/chat
 * dots this is presence-based, so it polls on every page (including the live
 * page itself) and only pauses while the tab is hidden (firing once on
 * becoming visible again).
 */
export default function LiveDotPoll({ initialHasLive }: { initialHasLive: boolean }) {
  const initialRef = useRef(initialHasLive);

  // Seed the store from the server-rendered value so there is no flicker
  // between SSR and the first poll response.
  useEffect(() => {
    liveDotStore.setState({ hasLive: initialRef.current });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;

    const poll = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await fetch("/api/live/now", {
          signal: controller.signal,
          credentials: "same-origin",
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as { hasLive: boolean };
          if (!cancelled) {
            liveDotStore.setState({ hasLive: data.hasLive });
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
  }, []);

  return null;
}
