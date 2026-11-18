import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Volume2,
  VolumeX,
  LogIn,
  LogOut,
  XCircle,
} from 'lucide-react';
import { formatTimecode } from '../utils/timecode';

interface PlaybackControlsProps {
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  volume: number;
  isMuted: boolean;
  seekStepSeconds: number;
  pendingInMs: number | null;
  isPreviewingClip: boolean;
  onTogglePlay: () => void;
  onStepFrame: (direction: -1 | 1) => void;
  onJumpSeconds: (deltaSec: number) => void;
  onSeekMs: (ms: number) => void;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  onMarkIn: () => void;
  onMarkOut: () => void;
  onCancelPendingIn: () => void;
  mobile?: boolean;
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  isPlaying,
  currentTimeMs,
  durationMs,
  volume,
  isMuted,
  seekStepSeconds,
  pendingInMs,
  isPreviewingClip,
  onTogglePlay,
  onStepFrame,
  onJumpSeconds,
  onSeekMs,
  onVolumeChange,
  onToggleMute,
  onMarkIn,
  onMarkOut,
  onCancelPendingIn,
  mobile = false,
}) => {
  const disabled = durationMs <= 0;

  return (
    <div className="bg-[#121620] border border-[#232A38] rounded-lg p-2.5 md:p-3 space-y-2.5">
      {/* Main Seek Scrubber */}
      <div className="flex items-center gap-2.5">
        <span className="font-mono-tc text-[11px] text-slate-300 w-24 shrink-0">
          {formatTimecode(currentTimeMs)}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(1, durationMs)}
          step={10}
          value={Math.min(currentTimeMs, durationMs)}
          disabled={disabled}
          onChange={(e) => onSeekMs(Number(e.target.value))}
          aria-label="Seek Video"
          className="nle-slider flex-1"
        />
        <span className="font-mono-tc text-[11px] text-slate-400 w-24 text-right shrink-0">
          {formatTimecode(durationMs)}
        </span>
      </div>

      {/* Transport + IN / OUT Controls */}
      <div className={`flex ${mobile ? 'flex-col gap-2.5' : 'flex-wrap items-center justify-between gap-3'}`}>
        {/* Transport Group */}
        <div className={`flex items-center ${mobile ? 'justify-between w-full' : 'gap-1.5'}`}>
          <button
            type="button"
            onClick={() => onJumpSeconds(-seekStepSeconds)}
            disabled={disabled}
            title={`Mundur ${seekStepSeconds} detik`}
            className="min-w-[40px] min-h-[40px] md:min-w-[34px] md:min-h-[34px] px-2 rounded bg-[#191F2C] hover:bg-[#242C3D] border border-[#283142] text-slate-200 disabled:opacity-40 flex items-center justify-center gap-1 text-xs cursor-pointer"
          >
            <SkipBack className="w-3.5 h-3.5" />
            <span className="text-[11px] font-mono-tc">-{seekStepSeconds}s</span>
          </button>

          <button
            type="button"
            onClick={() => onStepFrame(-1)}
            disabled={disabled}
            title="Previous Frame (Panah Kiri)"
            className="min-w-[40px] min-h-[40px] md:min-w-[34px] md:min-h-[34px] px-2 rounded bg-[#191F2C] hover:bg-[#242C3D] border border-[#283142] text-slate-200 disabled:opacity-40 flex items-center justify-center gap-0.5 text-xs cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden xl:inline text-[11px]">1f</span>
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            disabled={disabled}
            title="Play / Pause (Spasi)"
            className="min-w-[52px] min-h-[44px] md:min-w-[44px] md:min-h-[36px] px-3 rounded bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white disabled:opacity-40 flex items-center justify-center transition-colors cursor-pointer"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => onStepFrame(1)}
            disabled={disabled}
            title="Next Frame (Panah Kanan)"
            className="min-w-[40px] min-h-[40px] md:min-w-[34px] md:min-h-[34px] px-2 rounded bg-[#191F2C] hover:bg-[#242C3D] border border-[#283142] text-slate-200 disabled:opacity-40 flex items-center justify-center gap-0.5 text-xs cursor-pointer"
          >
            <span className="hidden xl:inline text-[11px]">1f</span>
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onJumpSeconds(seekStepSeconds)}
            disabled={disabled}
            title={`Maju ${seekStepSeconds} detik`}
            className="min-w-[40px] min-h-[40px] md:min-w-[34px] md:min-h-[34px] px-2 rounded bg-[#191F2C] hover:bg-[#242C3D] border border-[#283142] text-slate-200 disabled:opacity-40 flex items-center justify-center gap-1 text-xs cursor-pointer"
          >
            <span className="text-[11px] font-mono-tc">+{seekStepSeconds}s</span>
            <SkipForward className="w-3.5 h-3.5" />
          </button>

          {/* Volume on Desktop / Compact Mute Toggle on Mobile */}
          {mobile ? (
            <button
              type="button"
              onClick={onToggleMute}
              disabled={disabled}
              aria-label={isMuted ? 'Nyalakan Suara' : 'Bisukan'}
              title={isMuted ? 'Nyalakan Suara' : 'Bisukan'}
              className="min-w-[38px] min-h-[40px] rounded bg-[#191F2C] hover:bg-[#242C3D] border border-[#283142] text-slate-200 disabled:opacity-40 flex items-center justify-center cursor-pointer"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-slate-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-blue-300" />
              )}
            </button>
          ) : (
            <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-[#232A38]">
              <button
                type="button"
                onClick={onToggleMute}
                aria-label={isMuted ? 'Nyalakan Suara' : 'Bisukan'}
                className="p-1.5 rounded hover:bg-[#1E2534] text-slate-300 cursor-pointer"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-slate-500" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => onVolumeChange(Number(e.target.value))}
                aria-label="Volume"
                className="nle-slider w-20"
              />
            </div>
          )}
        </div>

        {/* Manual IN / OUT Marking Group */}
        <div className={`flex items-center gap-2 ${mobile ? 'w-full' : ''}`}>
          {isPreviewingClip && (
            <span className="text-[11px] text-emerald-400 font-medium mr-1 whitespace-nowrap">
              Preview Klip Aktif
            </span>
          )}

          {pendingInMs !== null && (
            <button
              type="button"
              onClick={onCancelPendingIn}
              title="Batalkan IN Point sementara"
              className="min-h-[44px] md:min-h-[36px] px-2.5 rounded bg-[#1B202C] hover:bg-[#262E3F] border border-[#2D374B] text-slate-300 text-xs flex items-center gap-1 cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Batal IN</span>
            </button>
          )}

          <button
            type="button"
            onClick={onMarkIn}
            disabled={disabled}
            title="Tentukan Titik Awal Klip (Shortcut: I)"
            className={`${
              mobile ? 'flex-1 min-h-[48px]' : 'min-h-[36px] px-4'
            } rounded font-semibold text-xs flex items-center justify-center gap-1.5 border transition-colors cursor-pointer disabled:opacity-40 ${
              pendingInMs !== null
                ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                : 'bg-[#192234] hover:bg-blue-600/25 border-blue-500/60 text-blue-300'
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>IN</span>
            {pendingInMs !== null && (
              <span className="font-mono-tc text-[11px] text-blue-200 ml-1">
                {formatTimecode(pendingInMs)}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onMarkOut}
            disabled={disabled || pendingInMs === null}
            title="Tentukan Titik Akhir & Simpan Klip (Shortcut: O)"
            className={`${
              mobile ? 'flex-1 min-h-[48px]' : 'min-h-[36px] px-4'
            } rounded font-semibold text-xs flex items-center justify-center gap-1.5 border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              pendingInMs !== null
                ? 'bg-amber-500 hover:bg-amber-400 border-amber-400 text-slate-950'
                : 'bg-[#1A1F2B] border-[#2C3547] text-slate-400'
            }`}
          >
            <LogOut className="w-4 h-4" />
            <span>OUT</span>
          </button>
        </div>
      </div>
    </div>
  );
};
