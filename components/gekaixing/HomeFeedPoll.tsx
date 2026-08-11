"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { feedDotStore } from "@/store/feedDot";

const POLL_INTERVAL_MS = 30_000;

/**
 * Polls a lightweight endpoint for new home-feed tweets while the user is
 * anywhere except the home feed, keeping the sidebar/mobile home-icon dot live
 * without a full navigation. Skips polling while the tab is hidden (but fires
 * once on becoming visible again) and while on /gekaixing itself.
 */
export default function HomeFeedPoll({ initialHasNewTweets }: { initialHasNewTweets: boolean }) {
  const pathname = usePathname();
  const isHome = pathname === "/gekaixing";
  const initialRef = useRef(initialHasNewTweets);

  // Seed the store from the server-rendered value so there is no flicker
  // between SSR and the first poll response.
  useEffect(() => {
    feedDotStore.setState({ hasNewTweets: initialRef.current });
  }, []);

  useEffect(() => {
    // On the feed already — the cookie tracks the last-seen time and the dot is hidden.
    if (isHome) {
      return;
    }

    let cancelled = false;
    let controller: AbortController | null = null;

    const poll = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await fetch("/api/feed/new", {
          signal: controller.signal,
          credentials: "same-origin",
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as { hasNewTweets: boolean };
          if (!cancelled) {
            feedDotStore.setState({ hasNewTweets: data.hasNewTweets });
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
  }, [isHome]);

  return null;
}
