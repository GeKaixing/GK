"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  Clapperboard,
  Flag,
  Maximize,
  Minimize,
  MonitorPlay,
  Pause,
  Play,
  Settings,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import FeedbackDialog from "./FeedbackDialog";
import { useVideoAspect } from "./useVideoAspect";

export type QualityOption = {
  label: string;
  value: string;
};

type PlayerControlsProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  title?: string;
  streamId?: string;
  qualityOptions?: QualityOption[];
  activeQuality?: string;
  onQualityChange?: (value: string) => void;
  className?: string;
  children: React.ReactNode;
};

/**
 * 自定义播放器控制栏：暂停/播放、音量、影院模式、全屏、设置
 * （迷你播放器 PiP、画质选择、问题反馈）。绑定到 videoRef 指向的 <video>。
 */
export default function PlayerControls({
  videoRef,
  title,
  streamId,
  qualityOptions = [],
  activeQuality,
  onQualityChange,
  className,
  children,
}: PlayerControlsProps) {
  const t = useTranslations("ImitationX.Live");
  const containerRef = useRef<HTMLDivElement>(null);
  const videoAspect = useVideoAspect(videoRef);

  // 视频初始为静音以允许自动播放，故 muted 初始为 true；playing 初始 false，
  // 播放事件触发后更新
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [cinema, setCinema] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // 同步视频播放/音量状态
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const handlePlay = () => setPlaying(true);
    const handlePause = () => setPlaying(false);
    const handleVolume = () => {
      setMuted(video.muted);
      setVolume(video.volume);
    };

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("volumechange", handleVolume);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("volumechange", handleVolume);
    };
  }, [videoRef]);

  // 全屏状态同步
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (video.paused) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [videoRef]);

  const handleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.muted = !video.muted;
  }, [videoRef]);

  const handleVolumeChange = useCallback(
    (value: number) => {
      const video = videoRef.current;
      if (!video) {
        return;
      }
      video.volume = value;
      video.muted = value === 0;
    },
    [videoRef]
  );

  const toggleCinema = useCallback(() => {
    setSettingsOpen(false);
    setCinema((prev) => !prev);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      containerRef.current?.requestFullscreen().catch(() => {});
    }
  }, []);

  const handleMiniPlayer = useCallback(async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    setSettingsOpen(false);
    if (!document.pictureInPictureEnabled) {
      toast.error(t("pipUnsupported"));
      return;
    }
    try {
      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (error) {
      console.error("Failed to enter mini player:", error);
      toast.error(t("pipFailed"));
    }
  }, [t, videoRef]);

  const selectQuality = useCallback(
    (value: string) => {
      onQualityChange?.(value);
      setQualityOpen(false);
      setSettingsOpen(false);
    },
    [onQualityChange]
  );

  const activeQualityLabel =
    qualityOptions.find((option) => option.value === activeQuality)?.label ??
    t("qualityAuto");

  return (
    <div
      className={cn(
        "relative",
        cinema && "fixed inset-0 z-[60] flex items-center justify-center bg-black px-4"
      )}
    >
      {/* 播放器容器：位置保持稳定，影院模式只切换外层 class，避免 <video> 重挂载导致 track 丢失 */}
      <div
        ref={containerRef}
        className={cn(
          "group relative aspect-video w-full overflow-hidden rounded-2xl bg-background",
          cinema && "max-w-[1200px]",
          className
        )}
        style={videoAspect ? { aspectRatio: String(videoAspect) } : undefined}
      >
        {children}

        {/* 顶部渐变 + 标题 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-black/60 to-transparent px-3 pb-8 pt-2 opacity-0 transition-opacity group-hover:opacity-100">
          {title ? <p className="truncate text-sm font-medium text-white">{title}</p> : null}
        </div>

        {/* 暂停时中央播放按钮 */}
        {!playing ? (
          <button
            type="button"
            onClick={togglePlay}
            aria-label={t("play")}
            className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70"
          >
            <Play className="h-8 w-8 fill-current" />
          </button>
        ) : null}

        {/* 底部渐变 + 控制栏 */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-1.5 pt-10 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="pointer-events-auto flex items-center gap-1">
            {/* 播放/暂停 */}
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? t("pause") : t("play")}
              className="rounded-full p-1.5 text-white hover:bg-white/20"
            >
              {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
            </button>

            {/* 音量 */}
            <button
              type="button"
              onClick={handleMute}
              aria-label={muted ? t("unmute") : t("mute")}
              className="rounded-full p-1.5 text-white hover:bg-white/20"
            >
              {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(event) => handleVolumeChange(Number(event.target.value))}
              aria-label={t("volume")}
              className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-white/40 accent-white"
            />

            <div className="flex-1" />

            {/* 影院模式 */}
            <button
              type="button"
              onClick={toggleCinema}
              aria-label={t("cinemaMode")}
              className={cn("rounded-full p-1.5 text-white hover:bg-white/20", cinema && "text-primary")}
            >
              {cinema ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>

            {/* 设置 */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setQualityOpen(false);
                  setSettingsOpen((prev) => !prev);
                }}
                aria-label={t("settings")}
                className="rounded-full p-1.5 text-white hover:bg-white/20"
              >
                <Settings className="h-5 w-5" />
              </button>

              {settingsOpen ? (
                <>
                  {/* 点击外部关闭 */}
                  <div className="fixed inset-0 z-10" onClick={() => setSettingsOpen(false)} />
                  <div className="absolute bottom-10 right-0 z-20 w-48 overflow-hidden rounded-xl border border-border/60 bg-background/95 shadow-xl backdrop-blur">
                    {qualityOpen ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setQualityOpen(false)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          {t("quality")}
                        </button>
                        <button
                          type="button"
                          onClick={() => selectQuality("auto")}
                          className={cn(
                            "flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted",
                            activeQuality === "auto" ? "font-semibold text-primary" : "text-foreground"
                          )}
                        >
                          {t("qualityAuto")}
                        </button>
                        {qualityOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => selectQuality(option.value)}
                            className={cn(
                              "flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted",
                              activeQuality === option.value
                                ? "font-semibold text-primary"
                                : "text-foreground"
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleMiniPlayer()}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted"
                        >
                          <MonitorPlay className="h-4 w-4" />
                          {t("miniPlayer")}
                        </button>
                        {qualityOptions.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setQualityOpen(true)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted"
                          >
                            <Clapperboard className="h-4 w-4" />
                            {t("quality")}
                            <span className="ml-auto text-xs text-muted-foreground">
                              {activeQualityLabel}
                            </span>
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setSettingsOpen(false);
                            setFeedbackOpen(true);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted"
                        >
                          <Flag className="h-4 w-4" />
                          {t("feedbackTitle")}
                        </button>
                      </>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/* 全屏 */}
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
              className="rounded-full p-1.5 text-white hover:bg-white/20"
            >
              {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <FeedbackDialog key={String(feedbackOpen)} open={feedbackOpen} onOpenChange={setFeedbackOpen} streamId={streamId} />
      </div>

      {/* 影院模式退出按钮 */}
      {cinema ? (
        <button
          type="button"
          onClick={toggleCinema}
          aria-label={t("exitCinemaMode")}
          className="absolute right-4 top-4 z-10 rounded-full p-2 text-white hover:bg-white/20"
        >
          <X className="h-6 w-6" />
        </button>
      ) : null}
    </div>
  );
}
