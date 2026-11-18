import React, { useEffect, useRef, useState } from 'react';
import { Move, RotateCw } from 'lucide-react';
import type { FrameSettingsState, ResolutionPreset, VideoMetadata } from '../types/editor';
import { computeTargetDimensions } from '../utils/ffmpegEngine';
import { drawTextOverlayOnCanvas } from '../utils/overlayRenderer';

interface VideoMonitorProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoUrl: string | null;
  metadata: VideoMetadata | null;
  frameSettings: FrameSettingsState;
  resolution: ResolutionPreset;
  previewClipRange: { name: string; inMs: number; outMs: number } | null;
  onTimeUpdateMs: (ms: number) => void;
  onPlayStateChange: (playing: boolean) => void;
  onFpsDetected: (fps: number) => void;
  onPositionChange: (posX: number, posY: number) => void;
  onStopClipPreview: () => void;
  compact?: boolean;
}

export const VideoMonitor: React.FC<VideoMonitorProps> = ({
  videoRef,
  videoUrl,
  metadata,
  frameSettings,
  resolution,
  previewClipRange,
  onTimeUpdateMs,
  onPlayStateChange,
  onFpsDetected,
  onPositionChange,
  onStopClipPreview,
  compact = false,
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const blurCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDraggingPos, setIsDraggingPos] = useState(false);
  const dragOriginRef = useRef<{
    clientX: number;
    clientY: number;
    startPosX: number;
    startPosY: number;
    stageW: number;
    stageH: number;
  } | null>(null);

  const srcW = metadata?.width || 1920;
  const srcH = metadata?.height || 1080;
  const targetDims = computeTargetDimensions(srcW, srcH, frameSettings, resolution);
  const targetRatio = targetDims.width / targetDims.height;

  const bgVisible = frameSettings.bgVisible !== false;
  const videoVisible = frameSettings.videoVisible !== false;

  // Render Text Overlay Layer onto dedicated canvas matching exact targetDims
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (frameSettings.textLayer?.enabled && frameSettings.textLayer.text.trim()) {
      drawTextOverlayOnCanvas(ctx, canvas.width, canvas.height, frameSettings.textLayer);
    }
  }, [frameSettings.textLayer, targetDims.width, targetDims.height]);

  // High-frequency timecode + clip preview boundary loop + blur background canvas mirror
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    let rafId = 0;
    let active = true;

    const drawBlurBg = () => {
      if (!bgVisible || frameSettings.bgType !== 'blur') return;
      const canvas = blurCanvasRef.current;
      if (!canvas || video.readyState < 2) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const cw = canvas.width;
      const ch = canvas.height;
      const vw = video.videoWidth || 16;
      const vh = video.videoHeight || 9;
      const coverScale = Math.max(cw / vw, ch / vh);
      const dw = vw * coverScale;
      const dh = vh * coverScale;
      const dx = (cw - dw) / 2;
      const dy = (ch - dh) / 2;

      ctx.save();
      ctx.filter = `blur(${Math.max(8, Math.round(frameSettings.blurIntensity * 0.65))}px)`;
      ctx.drawImage(video, dx - 12, dy - 12, dw + 24, dh + 24);
      ctx.restore();
    };

    const tick = () => {
      if (!active) return;
      const currentMs = Math.round(video.currentTime * 1000);
      onTimeUpdateMs(currentMs);

      if (previewClipRange && !video.paused && currentMs >= previewClipRange.outMs) {
        video.pause();
        video.currentTime = previewClipRange.outMs / 1000;
        onTimeUpdateMs(previewClipRange.outMs);
        onPlayStateChange(false);
        onStopClipPreview();
      }

      drawBlurBg();

      if (!video.paused && !video.ended) {
        rafId = requestAnimationFrame(tick);
      }
    };

    const onPlay = () => {
      onPlayStateChange(true);
      rafId = requestAnimationFrame(tick);
    };
    const onPause = () => {
      onPlayStateChange(false);
      cancelAnimationFrame(rafId);
      drawBlurBg();
    };
    const onSeeked = () => {
      onTimeUpdateMs(Math.round(video.currentTime * 1000));
      drawBlurBg();
    };
    const onTimeUpdate = () => {
      onTimeUpdateMs(Math.round(video.currentTime * 1000));
      drawBlurBg();
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('timeupdate', onTimeUpdate);

    // Draw initial blur frame if paused
    drawBlurBg();

    return () => {
      active = false;
      cancelAnimationFrame(rafId);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [
    videoRef,
    videoUrl,
    bgVisible,
    frameSettings.bgType,
    frameSettings.blurIntensity,
    previewClipRange,
    onTimeUpdateMs,
    onPlayStateChange,
    onStopClipPreview,
  ]);

  // Detect real source FPS via requestVideoFrameCallback when playing
  useEffect(() => {
    const video = videoRef.current as (HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
      cancelVideoFrameCallback?: (id: number) => void;
    }) | null;

    if (!video || !videoUrl || !video.requestVideoFrameCallback || metadata?.fpsDetected) return;

    let handle = 0;
    let lastMediaTime: number | null = null;
    const deltas: number[] = [];

    const onFrame = (_now: number, frameMeta: { mediaTime: number }) => {
      if (lastMediaTime !== null) {
        const diff = frameMeta.mediaTime - lastMediaTime;
        if (diff > 0.005 && diff < 0.1) {
          deltas.push(diff);
          if (deltas.length >= 12) {
            deltas.sort((a, b) => a - b);
            const median = deltas[Math.floor(deltas.length / 2)];
            const rawFps = 1 / median;
            const standardRates = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
            let closest = Math.round(rawFps);
            for (const std of standardRates) {
              if (Math.abs(rawFps - std) < 0.35) {
                closest = std;
                break;
              }
            }
            onFpsDetected(closest);
            return;
          }
        }
      }
      lastMediaTime = frameMeta.mediaTime;
      if (video.requestVideoFrameCallback) {
        handle = video.requestVideoFrameCallback(onFrame);
      }
    };

    handle = video.requestVideoFrameCallback(onFrame);
    return () => {
      if (handle && video.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(handle);
      }
    };
  }, [videoRef, videoUrl, metadata?.fpsDetected, onFpsDetected]);

  // Compute CSS preview geometry matching FFmpeg filtergraph (crop -> rotate -> scale -> overlay)
  const rotSwapped = frameSettings.rotate === 90 || frameSettings.rotate === 270;
  const cropWFrac = Math.max(0.2, 1 - (frameSettings.crop.left + frameSettings.crop.right) / 100);
  const cropHFrac = Math.max(0.2, 1 - (frameSettings.crop.top + frameSettings.crop.bottom) / 100);
  const postCropW = srcW * cropWFrac;
  const postCropH = srcH * cropHFrac;
  const postRotW = rotSwapped ? postCropH : postCropW;
  const postRotH = rotSwapped ? postCropW : postCropH;

  const scaleContain = Math.min(targetDims.width / postRotW, targetDims.height / postRotH);
  const scaleCover = Math.max(targetDims.width / postRotW, targetDims.height / postRotH);
  const baseScale = frameSettings.fitMode === 'fill' ? scaleCover : scaleContain;

  // Pre-rotation box dimensions in % of target stage, then rotated around center
  const preRotWidthPct = ((postCropW * baseScale * frameSettings.zoom) / targetDims.width) * 100;
  const preRotHeightPct = ((postCropH * baseScale * frameSettings.zoom) / targetDims.height) * 100;

  const innerVideoW = (1 / cropWFrac) * 100;
  const innerVideoH = (1 / cropHFrac) * 100;
  const innerOffsetX = -(frameSettings.crop.left / 100 / cropWFrac) * 100;
  const innerOffsetY = -(frameSettings.crop.top / 100 / cropHFrac) * 100;

  // Interactive pointer drag on monitor to adjust Position X / Y
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!videoUrl || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingPos(true);
    dragOriginRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startPosX: frameSettings.posX,
      startPosY: frameSettings.posY,
      stageW: rect.width || 1,
      stageH: rect.height || 1,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingPos || !dragOriginRef.current) return;
    const { clientX, clientY, startPosX, startPosY, stageW, stageH } = dragOriginRef.current;
    const dxPct = ((e.clientX - clientX) / stageW) * 100;
    const dyPct = ((e.clientY - clientY) / stageH) * 100;
    const nextX = Math.max(-100, Math.min(100, Number((startPosX + dxPct).toFixed(1))));
    const nextY = Math.max(-100, Math.min(100, Number((startPosY + dyPct).toFixed(1))));
    onPositionChange(nextX, nextY);
  };

  const handlePointerUp = () => {
    setIsDraggingPos(false);
    dragOriginRef.current = null;
  };

  return (
    <div
      className={`relative w-full bg-[#07090D] border border-[#232A38] rounded-lg overflow-hidden flex flex-col items-center justify-center ${
        compact ? 'h-[215px] sm:h-[260px]' : 'h-[280px] lg:h-[310px] xl:h-[350px]'
      }`}
    >
      {/* Top Info Strip inside monitor frame */}
      <div className="absolute top-2 left-2.5 right-2.5 z-20 flex items-center justify-between pointer-events-none">
        <div className="bg-black/70 backdrop-blur-sm border border-white/10 rounded px-2 py-1 text-[11px] font-mono-tc text-slate-200 flex items-center gap-2">
          <span>{frameSettings.aspectRatio === 'original' ? 'Rasio Asli' : frameSettings.aspectRatio}</span>
          <span className="text-slate-500">·</span>
          <span>{targetDims.width}×{targetDims.height}</span>
          {frameSettings.rotate !== 0 && (
            <>
              <span className="text-slate-500">·</span>
              <span className="inline-flex items-center gap-0.5 text-blue-300">
                <RotateCw className="w-3 h-3" />
                {frameSettings.rotate}°
              </span>
            </>
          )}
        </div>

        {previewClipRange ? (
          <div className="bg-emerald-950/85 border border-emerald-500/50 rounded px-2.5 py-1 text-[11px] font-medium text-emerald-200 pointer-events-auto flex items-center gap-2">
            <span>Preview: {previewClipRange.name}</span>
            <button
              type="button"
              onClick={onStopClipPreview}
              className="text-emerald-300 hover:text-white underline cursor-pointer"
            >
              Selesai
            </button>
          </div>
        ) : (
          videoUrl && (
            <div className="hidden sm:flex items-center gap-1 bg-black/65 border border-white/10 rounded px-2 py-1 text-[11px] text-slate-300">
              <Move className="w-3 h-3 text-blue-400" />
              <span>Geser video untuk atur posisi</span>
            </div>
          )
        )}
      </div>

      {/* Aspect-Ratio Locked Interactive Monitor Stage */}
      <div
        ref={stageRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          aspectRatio: `${targetRatio}`,
          backgroundColor:
            bgVisible && frameSettings.bgType === 'color' ? frameSettings.bgColor : '#000000',
          maxHeight: '100%',
          maxWidth: '100%',
        }}
        className={`relative h-full w-auto overflow-hidden select-none shadow-2xl ring-1 ring-white/15 ${
          videoUrl ? (isDraggingPos ? 'cursor-grabbing' : 'cursor-grab') : ''
        }`}
      >
        {/* Layer 1: Optional Blur Background Canvas */}
        {videoUrl && bgVisible && frameSettings.bgType === 'blur' && (
          <canvas
            ref={blurCanvasRef}
            width={160}
            height={160}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        )}

        {/* Layer 2: Foreground Video Layer with Exact Transform Parity (kept mounted when hidden so playback stays active) */}
        {videoUrl && (
          <div
            style={{
              width: `${preRotWidthPct}%`,
              height: `${preRotHeightPct}%`,
              left: `${50 + frameSettings.posX}%`,
              top: `${50 + frameSettings.posY}%`,
              transform: `translate(-50%, -50%) rotate(${frameSettings.rotate}deg)`,
              opacity: videoVisible ? 1 : 0,
            }}
            className="absolute pointer-events-none overflow-hidden"
          >
            <video
              ref={videoRef}
              src={videoUrl}
              playsInline
              preload="auto"
              style={{
                width: `${innerVideoW}%`,
                height: `${innerVideoH}%`,
                left: `${innerOffsetX}%`,
                top: `${innerOffsetY}%`,
              }}
              className="absolute max-w-none object-fill"
            />
          </div>
        )}

        {/* Layer 3: Text Overlay Layer Canvas */}
        {videoUrl && (
          <canvas
            ref={overlayCanvasRef}
            width={targetDims.width}
            height={targetDims.height}
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
          />
        )}
      </div>
    </div>
  );
};
