import React, { useEffect, useState } from 'react';
import { AlertCircle, Check, Crosshair } from 'lucide-react';
import { formatTimecode, msToFrame, parseTimecode } from '../utils/timecode';

interface TimeInfoPanelProps {
  currentTimeMs: number;
  durationMs: number;
  fps: number;
  fpsDetected: boolean;
  onFpsChange: (newFps: number) => void;
  compact?: boolean;
}

/**
 * Kelompok Pertama: CURRENT TIME, TOTAL DURATION, FRAME POSITION, FRAME RATE
 * Ditampilkan dalam satu baris panel informasi profesional pada layar laptop/desktop,
 * dan grid 2x2 responsif pada layar HP.
 */
export const TimeInfoPanel: React.FC<TimeInfoPanelProps> = ({
  currentTimeMs,
  durationMs,
  fps,
  fpsDetected,
  onFpsChange,
  compact = false,
}) => {
  const currentFrame = msToFrame(currentTimeMs, fps);
  const totalFrames = msToFrame(durationMs, fps);

  return (
    <section
      aria-label="Informasi Waktu Video"
      className="bg-[#11151D] border border-[#232A38] rounded-lg overflow-hidden"
    >
      <div
        className={`grid ${
          compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'
        } divide-y md:divide-y-0 md:divide-x divide-[#1E2534]`}
      >
        {/* 1. CURRENT TIME */}
        <div className="px-3.5 py-2 flex flex-col justify-center bg-[#0D1017]/60">
          <span className="text-[10px] font-semibold tracking-wider text-slate-400">
            CURRENT TIME
          </span>
          <span className="font-mono-tc text-base lg:text-lg font-bold text-white leading-tight mt-0.5">
            {formatTimecode(currentTimeMs)}
          </span>
        </div>

        {/* 2. TOTAL DURATION */}
        <div className="px-3.5 py-2 flex flex-col justify-center border-l border-[#1E2534] md:border-l-0">
          <span className="text-[10px] font-semibold tracking-wider text-slate-400">
            TOTAL DURATION
          </span>
          <span className="font-mono-tc text-base lg:text-lg font-medium text-slate-300 leading-tight mt-0.5">
            {formatTimecode(durationMs)}
          </span>
        </div>

        {/* 3. FRAME POSITION */}
        <div className="px-3.5 py-2 flex flex-col justify-center">
          <span className="text-[10px] font-semibold tracking-wider text-slate-400">
            FRAME POSITION
          </span>
          <div className="font-mono-tc text-sm lg:text-base font-medium text-cyan-300 leading-tight mt-0.5 truncate">
            {currentFrame.toLocaleString('id-ID')}{' '}
            <span className="text-slate-500 text-xs">
              / {totalFrames.toLocaleString('id-ID')}
            </span>
          </div>
        </div>

        {/* 4. FRAME RATE */}
        <div className="px-3.5 py-2 flex items-center justify-between gap-2 border-l border-[#1E2534] md:border-l-0">
          <div className="min-w-0">
            <span className="text-[10px] font-semibold tracking-wider text-slate-400 block truncate">
              FRAME RATE {fpsDetected ? '(AUTO)' : ''}
            </span>
            <span className="font-mono-tc text-sm lg:text-base font-medium text-slate-200 leading-tight mt-0.5 block">
              {fps} fps
            </span>
          </div>
          <select
            aria-label="Frame Rate"
            value={fps}
            onChange={(e) => onFpsChange(Number(e.target.value))}
            className="bg-[#181E2B] border border-[#2A3346] rounded px-2 py-1 text-xs font-mono-tc text-slate-200 outline-none focus:border-blue-500 shrink-0 cursor-pointer"
          >
            <option value={23.976}>23.976</option>
            <option value={24}>24</option>
            <option value={25}>25</option>
            <option value={29.97}>29.97</option>
            <option value={30}>30</option>
            <option value={50}>50</option>
            <option value={59.94}>59.94</option>
            <option value={60}>60</option>
          </select>
        </div>
      </div>
    </section>
  );
};

interface InOutControlPanelProps {
  currentTimeMs: number;
  durationMs: number;
  pendingInMs: number | null;
  activeClipInMs: number | null;
  activeClipOutMs: number | null;
  activeClipName?: string | null;
  isSelectedClipLocked: boolean;
  onSeekMs: (ms: number) => void;
  onManualRangeApply: (inMs: number, outMs: number) => string | null;
  compact?: boolean;
}

/**
 * Kelompok Kedua: IN POINT, OUT POINT, CLIP DURATION + Input Timecode Manual.
 * Ditempatkan terpisah tepat di atas Timeline agar mudah diakses & disinkronkan.
 */
export const InOutControlPanel: React.FC<InOutControlPanelProps> = ({
  currentTimeMs,
  durationMs,
  pendingInMs,
  activeClipInMs,
  activeClipOutMs,
  activeClipName,
  isSelectedClipLocked,
  onSeekMs,
  onManualRangeApply,
  compact = false,
}) => {
  const displayInMs = pendingInMs !== null ? pendingInMs : activeClipInMs;
  const displayOutMs = pendingInMs !== null ? null : activeClipOutMs;

  const [inInput, setInInput] = useState('');
  const [outInput, setOutInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [appliedFlash, setAppliedFlash] = useState(false);

  useEffect(() => {
    setInInput(displayInMs !== null ? formatTimecode(displayInMs) : '');
  }, [displayInMs]);

  useEffect(() => {
    setOutInput(displayOutMs !== null ? formatTimecode(displayOutMs) : '');
  }, [displayOutMs]);

  // Live duration readout from manual inputs, active clip, or pending IN vs playhead
  const parsedLiveIn = parseTimecode(inInput);
  const parsedLiveOut = parseTimecode(outInput);
  let liveClipDurationMs: number | null = null;
  if (parsedLiveIn !== null && parsedLiveOut !== null && parsedLiveOut > parsedLiveIn) {
    liveClipDurationMs = parsedLiveOut - parsedLiveIn;
  } else if (pendingInMs !== null && currentTimeMs > pendingInMs) {
    liveClipDurationMs = currentTimeMs - pendingInMs;
  } else if (displayInMs !== null && displayOutMs !== null && displayOutMs > displayInMs) {
    liveClipDurationMs = displayOutMs - displayInMs;
  }

  const handleApplyManual = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (isSelectedClipLocked && activeClipInMs !== null && pendingInMs === null) {
      setErrorMsg('Klip sedang terkunci. Buka ikon gembok terlebih dahulu untuk mengubah IN/OUT.');
      return;
    }

    const parsedIn = parseTimecode(inInput);
    const parsedOut = parseTimecode(outInput);

    if (parsedIn === null) {
      setErrorMsg('Format IN Point tidak valid. Gunakan format HH:MM:SS.mmm (mis. 00:01:25.250).');
      return;
    }
    if (parsedOut === null) {
      setErrorMsg('Format OUT Point tidak valid. Gunakan format HH:MM:SS.mmm (mis. 00:02:10.500).');
      return;
    }
    if (parsedIn < 0 || parsedOut > durationMs) {
      setErrorMsg(
        `Titik potong harus berada di dalam durasi video (00:00:00.000 - ${formatTimecode(durationMs)}).`
      );
      return;
    }
    if (parsedIn >= parsedOut) {
      setErrorMsg('IN Point harus lebih kecil daripada OUT Point dan durasi harus positif.');
      return;
    }

    const err = onManualRangeApply(parsedIn, parsedOut);
    if (err) {
      setErrorMsg(err);
      return;
    }
    setAppliedFlash(true);
    window.setTimeout(() => setAppliedFlash(false), 1200);
  };

  return (
    <section
      aria-label="Kontrol IN OUT dan Durasi Klip"
      className="bg-[#11151D] border border-[#232A38] rounded-lg px-3 py-2.5 space-y-2"
    >
      <form
        onSubmit={handleApplyManual}
        className={`grid ${
          compact ? 'grid-cols-1 gap-2.5' : 'grid-cols-1 md:grid-cols-12 gap-2.5 items-end'
        }`}
      >
        {/* IN POINT */}
        <div className={compact ? '' : 'md:col-span-4'}>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] font-semibold tracking-wider text-blue-400">
              IN POINT (HH:MM:SS.mmm)
            </label>
            {activeClipName && pendingInMs === null && (
              <span className="text-[10px] text-slate-400 truncate max-w-[140px]">
                {activeClipName}
              </span>
            )}
          </div>
          <div className="flex gap-1">
            <input
              type="text"
              value={inInput}
              onChange={(e) => {
                setInInput(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="00:00:00.000"
              disabled={durationMs <= 0}
              className="w-full min-h-[36px] bg-[#0B0E14] border border-[#283142] focus:border-blue-500 rounded px-2.5 py-1.5 font-mono-tc text-xs text-white outline-none"
            />
            <button
              type="button"
              disabled={durationMs <= 0}
              onClick={() => {
                setInInput(formatTimecode(currentTimeMs));
                setErrorMsg(null);
              }}
              title="Ambil posisi playhead ke IN Point"
              className="px-2 min-h-[36px] bg-[#181F2D] hover:bg-[#222B3E] border border-[#2A3346] rounded text-[11px] text-blue-300 shrink-0 disabled:opacity-40 cursor-pointer flex items-center gap-1"
            >
              <Crosshair className="w-3 h-3" />
              <span>Set</span>
            </button>
            {displayInMs !== null && (
              <button
                type="button"
                onClick={() => onSeekMs(displayInMs)}
                title="Lompat monitor ke IN Point"
                className="px-2.5 min-h-[36px] bg-[#181F2D] hover:bg-[#222B3E] border border-[#2A3346] rounded text-[11px] text-slate-200 shrink-0 cursor-pointer"
              >
                Go
              </button>
            )}
          </div>
        </div>

        {/* OUT POINT */}
        <div className={compact ? '' : 'md:col-span-4'}>
          <label className="block text-[10px] font-semibold tracking-wider text-amber-400 mb-1">
            OUT POINT (HH:MM:SS.mmm)
          </label>
          <div className="flex gap-1">
            <input
              type="text"
              value={outInput}
              onChange={(e) => {
                setOutInput(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="00:00:15.000"
              disabled={durationMs <= 0}
              className="w-full min-h-[36px] bg-[#0B0E14] border border-[#283142] focus:border-amber-500 rounded px-2.5 py-1.5 font-mono-tc text-xs text-white outline-none"
            />
            <button
              type="button"
              disabled={durationMs <= 0}
              onClick={() => {
                setOutInput(formatTimecode(currentTimeMs));
                setErrorMsg(null);
              }}
              title="Ambil posisi playhead ke OUT Point"
              className="px-2 min-h-[36px] bg-[#181F2D] hover:bg-[#222B3E] border border-[#2A3346] rounded text-[11px] text-amber-300 shrink-0 disabled:opacity-40 cursor-pointer flex items-center gap-1"
            >
              <Crosshair className="w-3 h-3" />
              <span>Set</span>
            </button>
            {displayOutMs !== null && (
              <button
                type="button"
                onClick={() => onSeekMs(displayOutMs)}
                title="Lompat monitor ke OUT Point"
                className="px-2.5 min-h-[36px] bg-[#181F2D] hover:bg-[#222B3E] border border-[#2A3346] rounded text-[11px] text-slate-200 shrink-0 cursor-pointer"
              >
                Go
              </button>
            )}
          </div>
        </div>

        {/* CLIP DURATION + APPLY */}
        <div
          className={`${
            compact ? 'grid grid-cols-2 gap-2' : 'md:col-span-4 grid grid-cols-2 gap-2 items-end'
          }`}
        >
          <div className="bg-[#0B0E14] border border-[#1E2534] rounded px-2.5 py-1.5 min-h-[36px] flex flex-col justify-center">
            <span className="text-[10px] font-semibold tracking-wider text-slate-400">
              CLIP DURATION
            </span>
            <span className="font-mono-tc text-xs lg:text-sm font-semibold text-cyan-300 leading-tight">
              {liveClipDurationMs !== null ? formatTimecode(liveClipDurationMs) : '00:00:00.000'}
            </span>
          </div>

          <button
            type="submit"
            disabled={durationMs <= 0}
            className="min-h-[38px] px-3 py-1.5 rounded bg-blue-600/20 hover:bg-blue-600/35 border border-blue-500/60 disabled:opacity-40 text-xs font-semibold text-blue-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            {appliedFlash ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Diterapkan</span>
              </>
            ) : (
              <span>Terapkan IN/OUT</span>
            )}
          </button>
        </div>
      </form>

      {errorMsg && (
        <div className="flex items-start gap-2 text-xs text-red-300 bg-red-950/40 border border-red-800/60 rounded px-3 py-1.5">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}
    </section>
  );
};
