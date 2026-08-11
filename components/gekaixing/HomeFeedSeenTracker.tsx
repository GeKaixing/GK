"use client";

import { useEffect } from "react";

export default function HomeFeedSeenTracker() {
  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/feed/seen", {
      method: "POST",
      signal: controller.signal,
      credentials: "same-origin",
      cache: "no-store",
    }).catch(() => {
      // Silent fail: dot will update on next successful seen write.
    });

    return () => {
      controller.abort();
    };
  }, []);

  return null;
}
