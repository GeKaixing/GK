"use client";

import { useEffect, useState } from "react";

/**
 * 监听 <video> 的内在尺寸，返回宽高比（videoWidth / videoHeight）。
 * 视频未就绪时返回 null，调用方回退到 16/9。
 *
 * 触发方式尽量稳：
 * - 监听 loadedmetadata / loadeddata / resize（后者在直播分辨率变化时也会触发）
 * - 轮询兜底，避免某些路径（HLS/MSE、LiveKit attach 时机）事件不触发导致比例一直拿不到
 * 用于让播放器外框贴合视频实际比例，避免露出比视频大的背景框。
 */
export function useVideoAspect(
  videoRef: React.RefObject<HTMLVideoElement | null>
): number | null {
  const [aspect, setAspect] = useState<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const update = () => {
      const { videoWidth, videoHeight } = video;
      if (videoWidth > 0 && videoHeight > 0) {
        setAspect(videoWidth / videoHeight);
      }
    };

    video.addEventListener("loadedmetadata", update);
    video.addEventListener("loadeddata", update);
    video.addEventListener("resize", update);
    update(); // 视频可能已就绪

    // 兜底：个别浏览器/流可能不触发上面的事件，轮询直到拿到有效尺寸
    const pollId = window.setInterval(() => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        update();
        window.clearInterval(pollId);
      }
    }, 250);
    // 流结束或很久没拿到尺寸就不再轮询，避免一直空转
    const timeoutId = window.setTimeout(
      () => window.clearInterval(pollId),
      60_000
    );

    return () => {
      video.removeEventListener("loadedmetadata", update);
      video.removeEventListener("loadeddata", update);
      video.removeEventListener("resize", update);
      window.clearInterval(pollId);
      window.clearTimeout(timeoutId);
    };
  }, [videoRef]);

  return aspect;
}
