import React, { useState } from 'react';
import { Play, Pencil, Trash2, Check, X } from 'lucide-react';
import type { Clip } from '../types/editor';
import { formatTimecode } from '../utils/timecode';
import { ClipLock } from './ClipLock';

interface ClipItemProps {
  clip: Clip;
  index: number;
  isSelected: boolean;
  isPreviewing: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onJumpToEdit: () => void;
  onToggleLock: () => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
}

export const ClipItem: React.FC<ClipItemProps> = ({
  clip,
  index,
  isSelected,
  isPreviewing,
  onSelect,
  onPreview,
  onJumpToEdit,
  onToggleLock,
  onRename,
  onDelete,
}) => {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(clip.name);

  const durationMs = Math.max(0, clip.outMs - clip.inMs);
  const numLabel = String(index + 1).padStart(3, '0');

  const commitRename = () => {
    const trimmed = draftName.trim();
    if (trimmed) {
      onRename(trimmed);
    } else {
      setDraftName(clip.name);
    }
    setEditingName(false);
  };

  return (
    <div
      onClick={onSelect}
      className={`rounded-lg border p-2.5 transition-colors cursor-pointer ${
        isSelected
          ? 'bg-[#182132] border-blue-500/80'
          : 'bg-[#121620] border-[#232A38] hover:border-[#323C50]'
      }`}
    >
      {/* Top Row: Index + Clip Name + Lock + Actions */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-mono-tc text-[11px] font-semibold text-slate-400 shrink-0">
            #{numLabel}
          </span>

          {editingName ? (
            <div
              className="flex items-center gap-1 flex-1 min-w-0"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') {
                    setDraftName(clip.name);
                    setEditingName(false);
                  }
                }}
                autoFocus
                className="w-full bg-[#0B0D11] border border-blue-500 rounded px-2 py-0.5 text-xs text-white outline-none"
              />
              <button
                type="button"
                onClick={commitRename}
                className="p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                aria-label="Simpan Nama"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftName(clip.name);
                  setEditingName(false);
                }}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
                aria-label="Batal"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <span
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (!clip.locked) {
                  setDraftName(clip.name);
                  setEditingName(true);
                }
              }}
              className="text-xs font-semibold text-white truncate"
              title={clip.name}
            >
              {clip.name}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <ClipLock locked={clip.locked} onToggle={onToggleLock} />

          <button
            type="button"
            onClick={onPreview}
            title="Preview Klip Ini"
            aria-label="Preview Klip"
            className={`w-7 h-7 rounded border flex items-center justify-center transition-colors cursor-pointer ${
              isPreviewing
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'bg-[#191F2C] border-[#2A3346] text-slate-300 hover:text-white hover:bg-[#232B3D]'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (!clip.locked) {
                setDraftName(clip.name);
                setEditingName(true);
              }
              onJumpToEdit();
            }}
            disabled={clip.locked}
            title={clip.locked ? 'Buka gembok untuk mengedit klip' : 'Edit Klip & Ubah Nama'}
            aria-label="Edit Klip"
            className="w-7 h-7 rounded bg-[#191F2C] border border-[#2A3346] text-slate-300 hover:text-white hover:bg-[#232B3D] disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onDelete}
            disabled={clip.locked}
            title={clip.locked ? 'Buka gembok untuk menghapus klip' : 'Hapus Klip'}
            aria-label="Hapus Klip"
            className="w-7 h-7 rounded bg-[#191F2C] border border-[#2A3346] text-slate-400 hover:text-red-400 hover:border-red-500/50 disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom Row: IN, OUT, Duration */}
      <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-[#1F2634] text-[11px]">
        <div>
          <span className="text-slate-400 block">IN</span>
          <span className="font-mono-tc text-blue-300">{formatTimecode(clip.inMs)}</span>
        </div>
        <div>
          <span className="text-slate-400 block">OUT</span>
          <span className="font-mono-tc text-amber-300">{formatTimecode(clip.outMs)}</span>
        </div>
        <div className="text-right">
          <span className="text-slate-400 block">Durasi</span>
          <span className="font-mono-tc text-emerald-300 font-medium">
            {formatTimecode(durationMs)}
          </span>
        </div>
      </div>
    </div>
  );
};
