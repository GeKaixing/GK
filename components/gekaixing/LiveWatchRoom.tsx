"use client";

import { useEffect, useState } from "react";
import {
  LiveKitRoom,
  TrackLoop,
  ParticipantTile,
  RoomAudioRenderer,
  ControlBar,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { useTranslations } from "next-intl";
import { Loader2, Radio } from "lucide-react";
import "@livekit/components-styles";

/**
 * LiveKit 直播房间：
 * - 主播：连接后自动开启摄像头/麦克风推流（video/audio = true）
 * - 观众：仅订阅，看到主播画面
 * - 直播聊天仍由 Supabase Realtime 提供（LiveChat 组件）
 */
export default function LiveWatchRoom({
  streamId,
  isHost,
}: {
  streamId: string;
  isHost: boolean;
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
      <RoomContent isHost={isHost} />
    </LiveKitRoom>
  );
}

function RoomContent({ isHost }: { isHost: boolean }) {
  const t = useTranslations("ImitationX.Live");
  // 摄像头 track（含主播自己）；未推流时为空数组 → 显示等待遮罩
  const tracks = useTracks([Track.Source.Camera]);

  const showWaiting = !isHost && tracks.length === 0;

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
      <TrackLoop tracks={tracks}>
        <ParticipantTile className="h-full w-full" />
      </TrackLoop>
      <RoomAudioRenderer />

      {showWaiting ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 text-center backdrop-blur-sm">
          <Radio className="h-12 w-12 animate-pulse text-muted-foreground/60" />
          <p className="text-sm font-medium text-muted-foreground">
            {t("waitingForHost")}
          </p>
        </div>
      ) : null}

      {isHost ? (
        <ControlBar
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-border/50 bg-background/90 shadow-lg backdrop-blur"
          controls={{ leave: false }}
          variation="minimal"
        />
      ) : null}
    </div>
  );
}
