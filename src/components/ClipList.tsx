import React from 'react';
import { Lock, Unlock, Scissors } from 'lucide-react';
import type { Clip } from '../types/editor';
import { formatTimecode } from '../utils/timecode';
import { ClipItem } from './ClipItem';

interface ClipListProps {
  clips: Clip[];
  selectedClipId: string | null;
  previewingClipId: string | null;
  onSelectClip: (id: string) => void;
  onPreviewClip: (clip: Clip) => void;
  onJumpToEditClip: (clip: Clip) => void;
  onToggleLock: (id: string) => void;
  onLockAll: () => void;
  onUnlockAll: () => void;
  onRenameClip: (id: string, name: string) => void;
  onDeleteClip: (id: string) => void;
  gridLayout?: boolean;
}

export const ClipList: React.FC<ClipListProps> = ({
  clips,
  selectedClipId,
  previewingClipId,
  onSelectClip,
  onPreviewClip,
  onJumpToEditClip,
  onToggleLock,
  onLockAll,
  onUnlockAll,
  onRenameClip,
  onDeleteClip,
  gridLayout = false,
}) => {
  const totalDurationMs = clips.reduce((acc, c) => acc + Math.max(0, c.outMs - c.inMs), 0);
  const allLocked = clips.length > 0 && clips.every((c) => c.locked);
  const anyLocked = clips.some((c) => c.locked);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header Toolbar */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#232A38] shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-xs font-semibold text-white">
            Daftar Klip ({clips.length})
          </h3>
          <span className="text-[11px] text-slate-400 font-mono-tc">
            Total Durasi Klip: {formatTimecode(totalDurationMs)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onLockAll}
            disabled={clips.length === 0 || allLocked}
            className="px-2.5 py-1.5 rounded bg-[#181E2B] hover:bg-[#222A3C] border border-[#2A3346] disabled:opacity-40 text-[11px] font-medium text-slate-200 flex items-center gap-1 cursor-pointer"
          >
            <Lock className="w-3 h-3 text-emerald-400" />
            <span>Lock All</span>
          </button>

          <button
            type="button"
            onClick={onUnlockAll}
            disabled={clips.length === 0 || !anyLocked}
            className="px-2.5 py-1.5 rounded bg-[#181E2B] hover:bg-[#222A3C] border border-[#2A3346] disabled:opacity-40 text-[11px] font-medium text-slate-200 flex items-center gap-1 cursor-pointer"
          >
            <Unlock className="w-3 h-3 text-slate-400" />
            <span>Unlock All</span>
          </button>
        </div>
      </div>

      {/* Scrollable Clips */}
      <div
        className={`flex-1 overflow-y-auto pt-2.5 pr-0.5 ${
          gridLayout && clips.length > 0
            ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 items-start'
            : 'space-y-2'
        }`}
      >
        {clips.length === 0 ? (
          <div className="py-6 px-4 text-center border border-dashed border-[#262E3E] rounded-lg bg-[#0E1219]">
            <Scissors className="w-5 h-5 text-slate-500 mx-auto mb-1.5" />
            <div className="text-xs font-medium text-slate-300 mb-1">
              Belum Ada Klip Potongan
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Putar video, tekan tombol <strong className="text-blue-400">IN</strong> untuk awal klip, lalu tekan <strong className="text-amber-400">OUT</strong> untuk menyimpan klip ke daftar.
            </p>
          </div>
        ) : (
          clips.map((clip, idx) => (
            <ClipItem
              key={clip.id}
              clip={clip}
              index={idx}
              isSelected={clip.id === selectedClipId}
              isPreviewing={clip.id === previewingClipId}
              onSelect={() => onSelectClip(clip.id)}
              onPreview={() => onPreviewClip(clip)}
              onJumpToEdit={() => onJumpToEditClip(clip)}
              onToggleLock={() => onToggleLock(clip.id)}
              onRename={(newName) => onRenameClip(clip.id, newName)}
              onDelete={() => onDeleteClip(clip.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};
