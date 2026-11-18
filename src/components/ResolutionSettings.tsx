import React from 'react';
import { Monitor, Info } from 'lucide-react';
import type { FrameSettingsState, ResolutionPreset, VideoMetadata } from '../types/editor';
import { computeTargetDimensions } from '../utils/ffmpegEngine';

interface ResolutionSettingsProps {
  resolution: ResolutionPreset;
  frameSettings: FrameSettingsState;
  metadata: VideoMetadata | null;
  onChange: (res: ResolutionPreset) => void;
}

const RESOLUTION_OPTIONS: { id: ResolutionPreset; label: string; desc: string }[] = [
  { id: 'original', label: 'Original Resolution', desc: 'Pertahankan skala resolusi video sumber' },
  { id: '720p', label: '720p HD', desc: 'Ringan & cepat untuk HP dan media sosial' },
  { id: '1080p', label: '1080p Full HD', desc: 'Standar jernih untuk YouTube, Reels, Shorts' },
  { id: '1440p', label: '1440p 2K', desc: 'Resolusi tinggi (proses encoding lebih berat)' },
  { id: '2160p', label: '2160p 4K', desc: 'Ultra HD (butuh RAM besar, disarankan di Laptop)' },
];

export const ResolutionSettings: React.FC<ResolutionSettingsProps> = ({
  resolution,
  frameSettings,
  metadata,
  onChange,
}) => {
  const srcW = metadata?.width || 1920;
  const srcH = metadata?.height || 1080;

  return (
    <div className="space-y-3 text-xs">
      <div className="text-[11px] text-slate-400 leading-relaxed">
        Pengaturan resolusi berlaku untuk seluruh klip hasil ekspor dengan tetap menjaga rasio dan sinkronisasi audio.
      </div>

      <div className="space-y-1.5">
        {RESOLUTION_OPTIONS.map((opt) => {
          const active = resolution === opt.id;
          const dims = computeTargetDimensions(srcW, srcH, frameSettings, opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                active
                  ? 'bg-blue-600/20 border-blue-500 text-white'
                  : 'bg-[#0E1219] border-[#232A38] text-slate-300 hover:border-[#344056]'
              }`}
            >
              <div className="min-w-0">
                <div className="font-semibold text-xs flex items-center gap-1.5">
                  <Monitor className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>{opt.label}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">{opt.desc}</div>
              </div>
              <div className="font-mono-tc text-[11px] text-slate-200 shrink-0">
                {dims.width}×{dims.height}
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-2.5 rounded bg-[#0E1219] border border-[#232A38] text-[11px] text-slate-400 flex items-start gap-2 leading-relaxed">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <span>
          Catatan teknis: Memilih resolusi yang lebih tinggi dari video sumber hanya mengubah dimensi piksel wadah video, tidak dapat menciptakan detail optik baru yang tidak ada di video asli.
        </span>
      </div>
    </div>
  );
};
