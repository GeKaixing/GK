"use client";

import { useEffect, useRef, useState } from "react";
import { toYouTubeEmbedUrl } from "@/utils/function/extractYouTubeEmbedUrl";
import { cn } from "@/lib/utils";
import PlayerControls, { type QualityOption } from "./PlayerControls";

/**
 * URL 直播播放器：根据 streamUrl 自动选择播放方式
 * - YouTube 链接 → iframe 内嵌（使用 YouTube 原生控制）
 * - .m3u8 (HLS) → hls.js 播放，支持画质选择
 * - 其他直接视频 → 原生 <video>
 * 非 YouTube 路径统一套自定义控制栏（暂停/音量/影院/全屏/设置）。
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
  const hlsRef = useRef<any>(null);
  const [qualityOptions, setQualityOptions] = useState<QualityOption[]>([]);
  const [activeQuality, setActiveQuality] = useState("auto");

  const normalizedUrl = (streamUrl ?? "").trim();

  const youtubeEmbed = normalizedUrl ? toYouTubeEmbedUrl(normalizedUrl) : null;
  const isHls = !youtubeEmbed && normalizedUrl.toLowerCase().includes(".m3u8");

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
          hlsRef.current = hls;
          hls.loadSource(normalizedUrl);
          hls.attachMedia(videoRef.current);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (disposed) {
              return;
            }
            // 画质选项：按 level 高度生成
            const levels = (hls?.levels ?? []) as { height?: number; index?: number }[];
            if (levels.length > 1) {
              setQualityOptions(
                levels.map((level) => ({
                  label: level.height ? `${level.height}p` : "auto",
                  value: String(level.index),
                }))
              );
            }
            videoRef.current?.play().catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (_event: unknown, data: any) => {
            if (data?.fatal) {
              console.error("HLS fatal error:", data.type, data.details);
            }
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
      hlsRef.current = null;
      setQualityOptions([]);
      setActiveQuality("auto");
      if (hls) {
        hls.destroy();
      }
    };
  }, [isHls, normalizedUrl]);

  const handleQualityChange = (value: string) => {
    setActiveQuality(value);
    const hls = hlsRef.current;
    if (!hls) {
      return;
    }
    if (value === "auto") {
      hls.currentLevel = -1;
    } else {
      const levelIndex = Number(value);
      if (!Number.isNaN(levelIndex)) {
        hls.currentLevel = levelIndex;
      }
    }
  };

  if (youtubeEmbed) {
    return (
      <div
        className={cn(
          "relative w-full aspect-video overflow-hidden rounded-2xl bg-black",
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
        <p className="text-sm text-muted-foreground">{title}</p>
      </div>
    );
  }

  return (
    <PlayerControls
      videoRef={videoRef}
      title={title}
      qualityOptions={qualityOptions}
      activeQuality={activeQuality}
      onQualityChange={handleQualityChange}
      className={className}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        src={isHls ? undefined : normalizedUrl}
        poster={poster ?? undefined}
        controls={false}
        autoPlay
        muted
        playsInline
      />
    </PlayerControls>
  );
}
