"use client";

import { useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  ControlBar,
  useTracks,
} from "@livekit/components-react";
import { Track, VideoQuality } from "livekit-client";
import { useTranslations } from "next-intl";
import { Loader2, Radio } from "lucide-react";
import "@livekit/components-styles";

import PlayerControls, { type QualityOption } from "./PlayerControls";

/**
 * LiveKit 直播房间：
 * - 主播：连接后自动开启摄像头/麦克风推流，自带 LiveKit ControlBar（麦克风/摄像头）
 * - 观众：仅订阅，自定义播放器控制栏（暂停/音量/影院/全屏/画质/迷你播放器/反馈）
 * - 直播聊天仍由 Supabase Realtime 提供（LiveChat 组件）
 */
export default function LiveWatchRoom({
  streamId,
  isHost,
  title,
}: {
  streamId: string;
  isHost: boolean;
  title: string;
}) {
  const t = useTranslations("ImitationX.Live");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadToken() {
      try {
        const response = await fetch("/api/live/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomName: `live-${streamId}`,
            canPublish: isHost,
          }),
        });
        const result = await response.json();
        if (!cancelled) {
          if (result.success && result.data?.token) {
            setToken(result.data.token);
          } else {
            setError(result.error || t("connectionFailed"));
          }
        }
      } catch (err) {
        console.error("Failed to get LiveKit token:", err);
        if (!cancelled) {
          setError(t("connectionFailed"));
        }
      }
    }

    void loadToken();

    return () => {
      cancelled = true;
    };
  }, [isHost, streamId, t]);

  if (error) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-muted/30 text-center">
        <Radio className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex aspect-video w-full items-center justify-center gap-2 rounded-2xl border border-border bg-muted/30 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("connecting")}
      </div>
    );
  }

  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  if (!serverUrl) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-border bg-muted/30 text-sm text-muted-foreground">
        {t("connectionFailed")}
      </div>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect={true}
      video={isHost}
      audio={isHost}
      options={{ adaptiveStream: true, dynacast: true }}
      data-lk-theme="default"
    >
      <RoomContent isHost={isHost} streamId={streamId} title={title} />
    </LiveKitRoom>
  );
}

function RoomContent({
  isHost,
  streamId,
  title,
}: {
  isHost: boolean;
  streamId: string;
  title: string;
}) {
  const t = useTranslations("ImitationX.Live");
  const tracks = useTracks([Track.Source.Camera]);
  const mainTrack = tracks[0];
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeQuality, setActiveQuality] = useState("high");

  // 将摄像头 track attach 到自有的 <video> 元素
  useEffect(() => {
    const track = mainTrack?.publication?.track;
    const videoEl = videoRef.current;
    if (!track || !videoEl) {
      return;
    }

    const element = track.attach(videoEl);
    return () => {
      track.detach(element);
    };
  }, [mainTrack?.publication?.track]);

  // 等待主播开播：观众且还没有摄像头 track
  const showWaiting = !isHost && !mainTrack;

  // 画质选择：仅观众观看远端摄像头 track 时可用（LiveKit simulcast 分层）
  const isRemoteCamera = !!mainTrack && !mainTrack.participant.isLocal;
  const qualityOptions: QualityOption[] = isRemoteCamera
    ? [
        { label: "1080p", value: "high" },
        { label: "720p", value: "medium" },
        { label: "480p", value: "low" },
      ]
    : [];

  const handleQualityChange = (value: string) => {
    setActiveQuality(value);
    const publication = mainTrack?.publication as unknown as {
      setVideoQuality?: (quality: VideoQuality) => void;
    };
    if (!publication?.setVideoQuality) {
      return;
    }
    if (value === "high") {
      publication.setVideoQuality(VideoQuality.HIGH);
    } else if (value === "medium") {
      publication.setVideoQuality(VideoQuality.MEDIUM);
    } else {
      publication.setVideoQuality(VideoQuality.LOW);
    }
  };

  const videoElement = (
    <video
      ref={videoRef}
      className="h-full w-full object-cover"
      autoPlay
      muted={isHost}
      playsInline
    />
  );

  return (
    <div className="relative">
      {isHost ? (
        /* 主播：自见 + LiveKit ControlBar（麦克风/摄像头开关） */
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
          {videoElement}
          <RoomAudioRenderer />
          <ControlBar
            className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border/50 bg-background/90 shadow-lg backdrop-blur"
            controls={{ leave: false }}
            variation="minimal"
          />
        </div>
      ) : (
        /* 观众：自定义播放器控制栏 */
        <PlayerControls
          videoRef={videoRef}
          title={title}
          streamId={streamId}
          qualityOptions={qualityOptions}
          activeQuality={activeQuality}
          onQualityChange={handleQualityChange}
        >
          {videoElement}
          <RoomAudioRenderer />
        </PlayerControls>
      )}

      {/* 等待主播开播 */}
      {showWaiting ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 rounded-2xl bg-background/85 text-center backdrop-blur-sm">
          <Radio className="h-12 w-12 animate-pulse text-muted-foreground/60" />
          <p className="text-sm font-medium text-muted-foreground">{t("waitingForHost")}</p>
        </div>
      ) : null}
    </div>
  );
}
