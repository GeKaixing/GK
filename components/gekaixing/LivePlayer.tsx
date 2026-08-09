"use client";

import { useEffect, useRef } from "react";
import { toYouTubeEmbedUrl } from "@/utils/function/extractYouTubeEmbedUrl";
import { cn } from "@/lib/utils";

/**
 * 直播播放器：根据 streamUrl 自动选择播放方式
 * - YouTube 链接 → iframe 内嵌
 * - .m3u8 (HLS) → hls.js 播放
 * - 其他直接视频 → 原生 <video>
 */
export default function LivePlayer({
  streamUrl,
  title,
  poster,
  className,
}: {
  streamUrl?: string | null;
  title: string;
  poster?: string | null;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const normalizedUrl = (streamUrl ?? "").trim();

  const youtubeEmbed = normalizedUrl ? toYouTubeEmbedUrl(normalizedUrl) : null;
  const isHls =
    !youtubeEmbed &&
    normalizedUrl.toLowerCase().includes(".m3u8");

  useEffect(() => {
    if (!isHls || !videoRef.current) {
      return;
    }

    let disposed = false;
    let hls: any = null;

    async function setupHls() {
      try {
        const { default: Hls } = await import("hls.js");
        if (disposed || !videoRef.current) {
          return;
        }

        if (Hls.isSupported()) {
          hls = new Hls();
          hls.loadSource(normalizedUrl);
          hls.attachMedia(videoRef.current);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            videoRef.current?.play().catch(() => {});
          });
        } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
          // Safari 原生支持 HLS
          videoRef.current.src = normalizedUrl;
          videoRef.current.play().catch(() => {});
        }
      } catch (error) {
        console.error("Failed to load HLS player:", error);
      }
    }

    void setupHls();

    return () => {
      disposed = true;
      if (hls) {
        hls.destroy();
      }
    };
  }, [isHls, normalizedUrl]);

  if (youtubeEmbed) {
    return (
      <div
        className={cn(
          "relative w-full aspect-video overflow-hidden bg-black",
          className
        )}
      >
        <iframe
          src={youtubeEmbed}
          title={title}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  if (!normalizedUrl) {
    return (
      <div
        className={cn(
          "relative flex aspect-video w-full items-center justify-center bg-gradient-to-br from-muted to-background",
          className
        )}
      >
        <p className="text-sm text-muted-foreground">
          {title}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden bg-black",
        className
      )}
    >
      <video
        ref={videoRef}
        className="h-full w-full"
        src={isHls ? undefined : normalizedUrl}
        poster={poster ?? undefined}
        controls
        autoPlay
        muted
        playsInline
      />
    </div>
  );
}
