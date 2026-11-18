import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Lock,
  Activity,
  VolumeX,
  RefreshCw,
} from 'lucide-react';
import type { Clip, WaveformStatus } from '../types/editor';
import { formatTimecode, snapToFrame } from '../utils/timecode';

interface TimelineEditorProps {
  durationMs: number;
  currentTimeMs: number;
  fps: number;
  clips: Clip[];
  selectedClipId: string | null;
  pendingInMs: number | null;
  waveformStatus: WaveformStatus;
  onRetryWaveform?: () => void;
  onSeekMs: (ms: number) => void;
  onSelectClip: (id: string) => void;
  onUpdateClipBounds: (id: string, inMs: number, outMs: number) => void;
  compact?: boolean;
}

export const TimelineEditor: React.FC<TimelineEditorProps> = ({
  durationMs,
  currentTimeMs,
  fps,
  clips,
  selectedClipId,
  pendingInMs,
  waveformStatus,
  onRetryWaveform,
  onSeekMs,
  onSelectClip,
  onUpdateClipBounds,
  compact = false,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafDrawRef = useRef<number>(0);

  const [zoom, setZoom] = useState(1); // 1x .. 50x
  const [viewportWidth, setViewportWidth] = useState(800);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [dragInfo, setDragInfo] = useState<{
    type: 'playhead' | 'in' | 'out';
    clipId?: string;
    startClientX: number;
    origInMs?: number;
    origOutMs?: number;
    liveMs: number;
  } | null>(null);

  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);
  const touchTapRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setViewportWidth(Math.floor(entry.contentRect.width));
        }
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Reset zoom when duration resets / new video loads
  useEffect(() => {
    setZoom(1);
    setScrollLeft(0);
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
    }
  }, [durationMs]);

  const safeDurationMs = Math.max(1000, durationMs);
  const baseViewportW = Math.max(280, viewportWidth - 2);
  const trackWidthPx = Math.max(baseViewportW, Math.round(baseViewportW * zoom));
  const msToPx = useCallback(
    (ms: number) => (ms / safeDurationMs) * trackWidthPx,
    [safeDurationMs, trackWidthPx]
  );
  const pxToMs = useCallback(
    (px: number) => Math.max(0, Math.min(safeDurationMs, (px / trackWidthPx) * safeDurationMs)),
    [safeDurationMs, trackWidthPx]
  );

  // Adaptive ruler major & minor ticks
  const { majorTicks, minorStepMs } = useMemo(() => {
    if (durationMs <= 0) return { majorTicks: [] as number[], minorStepMs: 1000 };
    const targetTickSpacingPx = compact ? 80 : 105;
    const approxTickCount = Math.max(2, Math.floor(trackWidthPx / targetTickSpacingPx));
    const rawStepMs = safeDurationMs / approxTickCount;
    const niceSteps = [
      200, 500, 1000, 2000, 5000, 10000, 15000, 30000,
      60000, 120000, 300000, 600000, 900000, 1800000,
    ];
    const stepMs = niceSteps.find((s) => s >= rawStepMs) || 1800000;
    const ticks: number[] = [];
    for (let t = 0; t <= safeDurationMs; t += stepMs) {
      ticks.push(t);
    }
    return { majorTicks: ticks, minorStepMs: stepMs / 4 };
  }, [compact, durationMs, safeDurationMs, trackWidthPx]);

  // Visible grid ticks inside current scroll window (fast virtualization)
  const visibleMinorTicks = useMemo(() => {
    if (durationMs <= 0 || minorStepMs < 50) return [];
    const startMs = Math.max(0, pxToMs(Math.max(0, scrollLeft - 40)));
    const endMs = Math.min(safeDurationMs, pxToMs(scrollLeft + viewportWidth + 40));
    const firstIdx = Math.floor(startMs / minorStepMs);
    const lastIdx = Math.ceil(endMs / minorStepMs);
    const out: number[] = [];
    for (let i = firstIdx; i <= lastIdx; i++) {
      const t = i * minorStepMs;
      if (t >= 0 && t <= safeDurationMs) out.push(t);
    }
    return out;
  }, [durationMs, minorStepMs, pxToMs, safeDurationMs, scrollLeft, viewportWidth]);

  const formatShortTick = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const frac = Math.floor(ms % 1000);
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    if (frac > 0) {
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${Math.floor(frac / 100)}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Draw only the visible viewport slice of the real audio waveform onto a DPR-scaled canvas
  const drawWaveformCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const scroller = scrollRef.current;
    if (!canvas || !scroller) return;

    const visW = Math.max(1, Math.min(viewportWidth, trackWidthPx));
    const visH = canvas.clientHeight || (compact ? 112 : 144);
    if (visH <= 0) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const targetW = Math.round(visW * dpr);
    const targetH = Math.round(visH * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, visW, visH);

    const curScrollLeft = scroller.scrollLeft;

    if (waveformStatus.state !== 'ready' || !waveformStatus.data.hasAudio) {
      // Subtle center guide axis when loading or silent
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(visH / 2) + 0.5);
      ctx.lineTo(visW, Math.round(visH / 2) + 0.5);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const wf = waveformStatus.data;
    const isStereo = wf.channels === 2 && wf.rightMin && wf.rightMax && wf.rightRms;

    const drawChannel = (
      minArr: Int8Array,
      maxArr: Int8Array,
      rmsArr: Uint8Array,
      centerY: number,
      halfAmpPx: number
    ) => {
      // Audio center axis line
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(centerY) + 0.5);
      ctx.lineTo(visW, Math.round(centerY) + 0.5);
      ctx.stroke();

      // Bar step = 1px or 2px depending on density for crisp proportional look
      const barStep = 2;
      const barW = 1.4;

      // 1) Outer Peak Envelope (Blue-Cyan)
      ctx.fillStyle = 'rgba(56, 189, 248, 0.42)';
      for (let x = 0; x < visW; x += barStep) {
        const trackX0 = curScrollLeft + x;
        const trackX1 = curScrollLeft + x + barStep;
        if (trackX0 >= trackWidthPx) break;

        const b0 = Math.max(0, Math.min(wf.bucketCount - 1, Math.floor((trackX0 / trackWidthPx) * wf.bucketCount)));
        const b1 = Math.max(b0 + 1, Math.min(wf.bucketCount, Math.ceil((trackX1 / trackWidthPx) * wf.bucketCount)));

        let peakPos = 0;
        let peakNeg = 0;
        for (let b = b0; b < b1; b++) {
          if (maxArr[b] > peakPos) peakPos = maxArr[b];
          if (minArr[b] < peakNeg) peakNeg = minArr[b];
        }

        const topPx = Math.max(1, (peakPos / 127) * halfAmpPx);
        const botPx = Math.max(1, (Math.abs(peakNeg) / 128) * halfAmpPx);
        ctx.fillRect(x, centerY - topPx, barW, topPx + botPx);
      }

      // 2) Inner RMS Energy Core (Bright Cyan)
      ctx.fillStyle = 'rgba(34, 211, 238, 0.88)';
      for (let x = 0; x < visW; x += barStep) {
        const trackX0 = curScrollLeft + x;
        const trackX1 = curScrollLeft + x + barStep;
        if (trackX0 >= trackWidthPx) break;

        const b0 = Math.max(0, Math.min(wf.bucketCount - 1, Math.floor((trackX0 / trackWidthPx) * wf.bucketCount)));
        const b1 = Math.max(b0 + 1, Math.min(wf.bucketCount, Math.ceil((trackX1 / trackWidthPx) * wf.bucketCount)));

        let rmsMax = 0;
        for (let b = b0; b < b1; b++) {
          if (rmsArr[b] > rmsMax) rmsMax = rmsArr[b];
        }

        const rmsPx = Math.max(0.8, (rmsMax / 127) * halfAmpPx);
        ctx.fillRect(x, centerY - rmsPx, barW, rmsPx * 2);
      }
    };

    if (isStereo && wf.rightMin && wf.rightMax && wf.rightRms) {
      const topCenter = visH * 0.27;
      const botCenter = visH * 0.73;
      const halfAmp = visH * 0.20;

      drawChannel(wf.leftMin, wf.leftMax, wf.leftRms, topCenter, halfAmp);
      drawChannel(wf.rightMin, wf.rightMax, wf.rightRms, botCenter, halfAmp);

      // Stereo divider line
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(visH / 2) + 0.5);
      ctx.lineTo(visW, Math.round(visH / 2) + 0.5);
      ctx.stroke();
    } else {
      drawChannel(wf.leftMin, wf.leftMax, wf.leftRms, visH * 0.5, visH * 0.41);
    }

    ctx.restore();
  }, [compact, trackWidthPx, viewportWidth, waveformStatus]);

  useEffect(() => {
    cancelAnimationFrame(rafDrawRef.current);
    rafDrawRef.current = requestAnimationFrame(drawWaveformCanvas);
    return () => cancelAnimationFrame(rafDrawRef.current);
  }, [drawWaveformCanvas, scrollLeft]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollLeft(el.scrollLeft);
  };

  // Keep zoom centered around playhead when using buttons/slider
  const applyZoom = (nextZoomRaw: number) => {
    const nextZoom = Math.max(1, Math.min(50, Number(nextZoomRaw.toFixed(2))));
    const scroller = scrollRef.current;
    if (scroller && durationMs > 0) {
      const ratio = currentTimeMs / safeDurationMs;
      const nextTrackW = Math.max(baseViewportW, Math.round(baseViewportW * nextZoom));
      const targetPlayheadX = ratio * nextTrackW;
      setZoom(nextZoom);
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          const nextLeft = Math.max(0, targetPlayheadX - scrollRef.current.clientWidth / 2);
          scrollRef.current.scrollLeft = nextLeft;
          setScrollLeft(nextLeft);
        }
      });
    } else {
      setZoom(nextZoom);
    }
  };

  const clientXToMs = (clientX: number): number => {
    const trackEl = trackRef.current;
    if (!trackEl) return 0;
    const rect = trackEl.getBoundingClientRect();
    const relX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    return snapToFrame(pxToMs(relX), fps, durationMs);
  };

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (durationMs <= 0) return;
    if ((e.target as HTMLElement).dataset.handle) return;

    const rulerHit = Boolean((e.target as HTMLElement).closest('[data-ruler="true"]'));

    // On touch devices: dragging the ruler scrubs playhead; touching waveform body preserves horizontal scroll & seeks on tap
    if (e.pointerType === 'touch' && !rulerHit) {
      touchTapRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    const ms = clientXToMs(e.clientX);
    setDragInfo({ type: 'playhead', startClientX: e.clientX, liveMs: ms });
    onSeekMs(ms);
  };

  const handleHandlePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    clip: Clip,
    edge: 'in' | 'out'
  ) => {
    e.stopPropagation();
    onSelectClip(clip.id);
    if (clip.locked || durationMs <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragInfo({
      type: edge,
      clipId: clip.id,
      startClientX: e.clientX,
      origInMs: clip.inMs,
      origOutMs: clip.outMs,
      liveMs: edge === 'in' ? clip.inMs : clip.outMs,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (touchTapRef.current && touchTapRef.current.pointerId === e.pointerId) {
      const dx = Math.abs(e.clientX - touchTapRef.current.startX);
      const dy = Math.abs(e.clientY - touchTapRef.current.startY);
      if (dx > 6 || dy > 6) {
        touchTapRef.current.moved = true;
      }
    }

    if (!dragInfo) return;
    const ms = clientXToMs(e.clientX);

    if (dragInfo.type === 'playhead') {
      setDragInfo({ ...dragInfo, liveMs: ms });
      onSeekMs(ms);
      return;
    }

    if (dragInfo.clipId && dragInfo.origInMs !== undefined && dragInfo.origOutMs !== undefined) {
      const minClipMs = Math.max(100, Math.round(1000 / fps));
      if (dragInfo.type === 'in') {
        const clampedIn = Math.min(ms, dragInfo.origOutMs - minClipMs);
        setDragInfo({ ...dragInfo, liveMs: clampedIn });
        onUpdateClipBounds(dragInfo.clipId, clampedIn, dragInfo.origOutMs);
        onSeekMs(clampedIn);
      } else if (dragInfo.type === 'out') {
        const clampedOut = Math.max(ms, dragInfo.origInMs + minClipMs);
        setDragInfo({ ...dragInfo, liveMs: clampedOut });
        onUpdateClipBounds(dragInfo.clipId, dragInfo.origInMs, clampedOut);
        onSeekMs(clampedOut);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (
      touchTapRef.current &&
      touchTapRef.current.pointerId === e.pointerId &&
      !touchTapRef.current.moved &&
      !pinchStartDistRef.current &&
      !dragInfo &&
      durationMs > 0
    ) {
      onSeekMs(clientXToMs(e.clientX));
    }
    if (touchTapRef.current?.pointerId === e.pointerId) {
      touchTapRef.current = null;
    }
    setDragInfo(null);
  };

  // Pinch-to-zoom on mobile touchscreens
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      pinchStartZoomRef.current = zoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchStartDistRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / pinchStartDistRef.current;
      const nextZoom = Math.max(1, Math.min(50, Number((pinchStartZoomRef.current * ratio).toFixed(2))));
      setZoom(nextZoom);
    }
  };

  const handleTouchEnd = () => {
    pinchStartDistRef.current = null;
  };

  // Ctrl/Alt + Wheel zoom on desktop
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (durationMs <= 0) return;
    if (e.ctrlKey || e.altKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.25 : 0.8;
      applyZoom(zoom * factor);
    }
  };

  const centerOnPlayhead = () => {
    const el = scrollRef.current;
    if (!el || durationMs <= 0) return;
    const playheadX = msToPx(currentTimeMs);
    el.scrollTo({ left: Math.max(0, playheadX - el.clientWidth / 2), behavior: 'smooth' });
  };

  // Playhead badge edge positioning so it never clips horizontally
  const playheadPx = msToPx(currentTimeMs);
  const relPlayheadX = playheadPx - scrollLeft;
  let badgeTransform = 'translateX(-50%)';
  if (relPlayheadX < 56) {
    badgeTransform = 'translateX(4px)';
  } else if (viewportWidth - relPlayheadX < 56) {
    badgeTransform = 'translateX(calc(-100% - 4px))';
  }

  const isStereo =
    waveformStatus.state === 'ready' &&
    waveformStatus.data.hasAudio &&
    waveformStatus.data.channels === 2;

  return (
    <section
      aria-label="Timeline Waveform Audio Profesional"
      className="bg-[#11151D] border border-[#232A38] rounded-lg flex flex-col select-none overflow-hidden"
    >
      {/* Timeline Header Toolbar */}
      <div className="px-3 py-2 border-b border-[#202736] bg-[#0E121A] flex items-center justify-between gap-2.5 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>Timeline Audio</span>
            {waveformStatus.state === 'ready' && waveformStatus.data.hasAudio && (
              <span className="text-[11px] font-normal text-cyan-300/90 font-mono-tc">
                · {isStereo ? 'Stereo (L/R)' : 'Mono'}
              </span>
            )}
          </div>

          {/* Waveform Extraction Status */}
          {waveformStatus.state === 'loading' && (
            <div className="flex items-center gap-2 text-[11px] text-cyan-300">
              <div className="w-20 h-1.5 bg-[#1B2230] rounded-full overflow-hidden">
                <div
                  style={{ width: `${waveformStatus.progress}%` }}
                  className="h-full bg-cyan-400 transition-[width] duration-150"
                />
              </div>
              <span className="font-mono-tc truncate max-w-[200px]">{waveformStatus.message}</span>
            </div>
          )}

          {waveformStatus.state === 'silent' && (
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <VolumeX className="w-3 h-3" />
              <span>Sumber tanpa stream audio</span>
            </span>
          )}

          {(waveformStatus.state === 'paused' || waveformStatus.state === 'error') && (
            <div className="flex items-center gap-2 text-[11px] text-amber-300">
              <span className="truncate max-w-[220px]">{waveformStatus.message}</span>
              {onRetryWaveform && (
                <button
                  type="button"
                  onClick={onRetryWaveform}
                  className="px-2 py-0.5 rounded bg-[#1A2130] hover:bg-[#242E42] border border-[#2D384F] text-cyan-300 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Analisis Ulang</span>
                </button>
              )}
            </div>
          )}

          {/* Live Drag IN/OUT Feedback */}
          {dragInfo && (dragInfo.type === 'in' || dragInfo.type === 'out') && (
            <span className="font-mono-tc text-xs text-white bg-[#1A2438] border border-cyan-500/60 rounded px-2 py-0.5">
              {dragInfo.type === 'in' ? 'IN' : 'OUT'}: {formatTimecode(dragInfo.liveMs)}
            </span>
          )}
        </div>

        {/* Zoom & Playhead Navigation */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={centerOnPlayhead}
            disabled={durationMs <= 0}
            title="Pusatkan tampilan ke posisi Playhead"
            className="min-h-[32px] px-2.5 py-1 rounded bg-[#181E2B] hover:bg-[#232C3F] border border-[#2A3346] text-[11px] font-medium text-slate-200 disabled:opacity-40 cursor-pointer whitespace-nowrap"
          >
            Playhead
          </button>

          <button
            type="button"
            onClick={() => applyZoom(zoom / 1.5)}
            disabled={zoom <= 1 || durationMs <= 0}
            aria-label="Perkecil Timeline"
            className="min-w-[34px] min-h-[32px] rounded bg-[#181E2B] hover:bg-[#232C3F] border border-[#2A3346] text-slate-200 disabled:opacity-40 flex items-center justify-center cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <input
            type="range"
            min={1}
            max={50}
            step={0.5}
            value={zoom}
            disabled={durationMs <= 0}
            onChange={(e) => applyZoom(Number(e.target.value))}
            aria-label="Zoom Timeline"
            className="nle-slider w-20 md:w-28"
          />

          <button
            type="button"
            onClick={() => applyZoom(zoom * 1.5)}
            disabled={zoom >= 50 || durationMs <= 0}
            aria-label="Perbesar Timeline"
            className="min-w-[34px] min-h-[32px] rounded bg-[#181E2B] hover:bg-[#232C3F] border border-[#2A3346] text-slate-200 disabled:opacity-40 flex items-center justify-center cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => applyZoom(1)}
            disabled={zoom === 1}
            title="Reset Zoom (1×)"
            aria-label="Reset Zoom"
            className="min-w-[34px] min-h-[32px] rounded bg-[#181E2B] hover:bg-[#232C3F] border border-[#2A3346] text-slate-300 disabled:opacity-40 flex items-center justify-center cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <span className="font-mono-tc text-[11px] text-cyan-300 w-11 text-right font-medium">
            {zoom.toFixed(1)}×
          </span>
        </div>
      </div>

      {/* Scrollable Horizontal Waveform + Clips Track */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="w-full overflow-x-auto overflow-y-hidden bg-[#080B10] relative"
      >
        <div
          ref={trackRef}
          onPointerDown={handleTrackPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ width: `${trackWidthPx}px` }}
          className={`relative ${compact ? 'h-36' : 'h-44'} cursor-crosshair touch-pan-x`}
        >
          {/* Time Ruler Header (touch-none allows direct ruler scrub on mobile) */}
          <div
            data-ruler="true"
            className="h-7 border-b border-[#1E2534] bg-[#0D1119] relative z-20 touch-none"
          >
            {/* Minor ticks */}
            {visibleMinorTicks.map((t) => (
              <div
                key={`m_${t}`}
                style={{ left: `${msToPx(t)}px` }}
                className="absolute bottom-0 h-1.5 border-l border-[#263042] pointer-events-none"
              />
            ))}

            {/* Major ticks & Labels */}
            {majorTicks.map((t) => (
              <div
                key={`M_${t}`}
                style={{ left: `${msToPx(t)}px` }}
                className="absolute top-0 bottom-0 border-l border-[#37455E] pl-1 flex items-center pointer-events-none"
              >
                <span className="font-mono-tc text-[10px] text-slate-300 whitespace-nowrap">
                  {formatShortTick(t)}
                </span>
              </div>
            ))}
          </div>

          {/* Main Audio Waveform + Clips Lane */}
          <div className={`relative ${compact ? 'h-[calc(100%-1.75rem)]' : 'h-[calc(100%-1.75rem)]'}`}>
            {/* Subtle Vertical Grid Lines extending across waveform */}
            <div className="absolute inset-0 pointer-events-none">
              {visibleMinorTicks.map((t) => (
                <div
                  key={`g_${t}`}
                  style={{ left: `${msToPx(t)}px` }}
                  className="absolute top-0 bottom-0 border-l border-[#121824]"
                />
              ))}
              {majorTicks.map((t) => (
                <div
                  key={`G_${t}`}
                  style={{ left: `${msToPx(t)}px` }}
                  className="absolute top-0 bottom-0 border-l border-[#1A2233]"
                />
              ))}
            </div>

            {/* Viewport-Windowed Sticky Audio Waveform Canvas (Zero GPU overflow at high zoom) */}
            <div
              style={{ width: `${Math.min(viewportWidth, trackWidthPx)}px` }}
              className="sticky left-0 top-0 h-full pointer-events-none z-0 overflow-hidden"
            >
              <canvas ref={canvasRef} className="w-full h-full block" />
              {isStereo && (
                <div className="absolute left-1.5 top-0 bottom-0 flex flex-col justify-around pointer-events-none">
                  <span className="font-mono-tc text-[9px] font-semibold text-cyan-400/75 bg-[#080B10]/70 px-1 rounded">
                    L
                  </span>
                  <span className="font-mono-tc text-[9px] font-semibold text-cyan-400/75 bg-[#080B10]/70 px-1 rounded">
                    R
                  </span>
                </div>
              )}
            </div>

            {/* Pending IN Active Highlight Range */}
            {pendingInMs !== null && durationMs > 0 && (
              <div
                style={{
                  left: `${msToPx(Math.min(pendingInMs, currentTimeMs))}px`,
                  width: `${Math.max(2, Math.abs(msToPx(currentTimeMs) - msToPx(pendingInMs)))}px`,
                }}
                className="absolute top-1.5 bottom-1.5 bg-blue-500/18 border border-dashed border-blue-400 rounded pointer-events-none z-10"
              >
                <div className="px-1.5 py-0.5 text-[10px] font-mono-tc text-blue-200 truncate">
                  IN aktif...
                </div>
              </div>
            )}

            {/* Clip Segments Layering Over Waveform */}
            {clips.map((clip, index) => {
              const left = msToPx(clip.inMs);
              const width = Math.max(12, msToPx(clip.outMs - clip.inMs));
              const isSelected = clip.id === selectedClipId;

              return (
                <div
                  key={clip.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectClip(clip.id);
                  }}
                  style={{ left: `${left}px`, width: `${width}px` }}
                  className={`absolute top-1.5 bottom-1.5 rounded border transition-colors flex flex-col justify-between overflow-visible z-10 ${
                    isSelected
                      ? 'bg-blue-500/20 border-cyan-400 ring-1 ring-cyan-400/40 z-20'
                      : clip.locked
                      ? 'bg-emerald-500/10 border-emerald-500/60 hover:border-emerald-400'
                      : 'bg-blue-600/12 border-blue-400/50 hover:border-blue-300'
                  }`}
                >
                  {/* Top Clip Header Strip */}
                  <div className="px-2 py-0.5 bg-[#0D131E]/85 border-b border-white/10 rounded-t flex items-center justify-between gap-1 pointer-events-none">
                    <span className="text-[10px] font-semibold text-white truncate">
                      {String(index + 1).padStart(2, '0')} · {clip.name}
                    </span>
                    {clip.locked && <Lock className="w-2.5 h-2.5 text-emerald-400 shrink-0" />}
                  </div>

                  {/* Bottom IN / OUT Duration Hint on wide clips */}
                  {width > 120 && (
                    <div className="px-2 py-0.5 flex items-center justify-between text-[9px] font-mono-tc text-slate-300/90 bg-[#080B10]/70 rounded-b pointer-events-none">
                      <span className="text-blue-300">{formatTimecode(clip.inMs)}</span>
                      <span className="text-amber-300">{formatTimecode(clip.outMs)}</span>
                    </div>
                  )}

                  {/* Left IN Drag Handle */}
                  <button
                    type="button"
                    data-handle="in"
                    onPointerDown={(e) => handleHandlePointerDown(e, clip, 'in')}
                    title={clip.locked ? 'Klip terkunci' : 'Geser batas awal (IN)'}
                    aria-label={`Geser IN ${clip.name}`}
                    className={`absolute -left-1.5 top-0 bottom-0 w-3.5 md:w-2.5 rounded-l flex items-center justify-center touch-none ${
                      clip.locked
                        ? 'cursor-not-allowed opacity-45 bg-slate-600'
                        : 'cursor-ew-resize bg-blue-500 hover:bg-blue-400'
                    }`}
                  >
                    <span className="w-0.5 h-5 bg-white/90 rounded-full pointer-events-none" />
                  </button>

                  {/* Right OUT Drag Handle */}
                  <button
                    type="button"
                    data-handle="out"
                    onPointerDown={(e) => handleHandlePointerDown(e, clip, 'out')}
                    title={clip.locked ? 'Klip terkunci' : 'Geser batas akhir (OUT)'}
                    aria-label={`Geser OUT ${clip.name}`}
                    className={`absolute -right-1.5 top-0 bottom-0 w-3.5 md:w-2.5 rounded-r flex items-center justify-center touch-none ${
                      clip.locked
                        ? 'cursor-not-allowed opacity-45 bg-slate-600'
                        : 'cursor-ew-resize bg-amber-500 hover:bg-amber-400'
                    }`}
                  >
                    <span className="w-0.5 h-5 bg-slate-950/85 rounded-full pointer-events-none" />
                  </button>
                </div>
              );
            })}

            {/* Pending IN Vertical Marker */}
            {pendingInMs !== null && durationMs > 0 && (
              <div
                style={{ left: `${msToPx(pendingInMs)}px` }}
                className="absolute top-0 bottom-0 w-0.5 bg-blue-400 z-20 pointer-events-none"
              >
                <div className="-translate-x-1/2 px-1 py-0.5 bg-blue-500 rounded-b text-[9px] font-bold text-white font-mono-tc">
                  IN
                </div>
              </div>
            )}
          </div>

          {/* Contrast Vertical Playhead + Floating Timecode Indicator */}
          {durationMs > 0 && (
            <div
              style={{ left: `${playheadPx}px` }}
              className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-30 pointer-events-none shadow-[0_0_8px_rgba(244,63,94,0.65)]"
            >
              {/* Playhead Cap */}
              <div className="w-3 h-3 bg-rose-500 -translate-x-[5px] rounded-t-sm shadow" />
              {/* Live Timecode Label on Playhead */}
              <div
                style={{ transform: badgeTransform }}
                className="absolute top-1 left-0 bg-rose-600 text-white border border-rose-300/60 rounded px-1.5 py-0.5 font-mono-tc text-[10px] font-semibold whitespace-nowrap shadow-lg"
              >
                {formatTimecode(currentTimeMs)}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
