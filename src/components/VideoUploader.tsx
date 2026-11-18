import React, { useRef, useState } from 'react';
import {
  Upload,
  RefreshCw,
  AlertTriangle,
  FileVideo,
  CheckCircle2,
} from 'lucide-react';
import type { VideoMetadata } from '../types/editor';
import { formatFileSize, formatTimecode } from '../utils/timecode';
import { assessDeviceCapability } from '../utils/videoProbe';

interface VideoUploaderProps {
  metadata: VideoMetadata | null;
  isLoading: boolean;
  loadError: string | null;
  needsRelinkName?: string | null;
  onFileSelected: (file: File) => void;
  compact?: boolean;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({
  metadata,
  isLoading,
  loadError,
  needsRelinkName,
  onFileSelected,
  compact = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onFileSelected(files[0]);
  };

  const deviceCap = metadata ? assessDeviceCapability(metadata.fileSize) : null;

  if (!metadata) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-4 md:p-8">
        <input
          ref={inputRef}
          type="file"
          accept="video/*,.mp4,.mov,.mkv,.webm,.avi,.m4v"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
          className="hidden"
        />

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => !isLoading && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !isLoading) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={`w-full max-w-xl rounded-xl border border-dashed p-6 md:p-10 text-center transition-colors cursor-pointer ${
            isDragging
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-[#2D3648] bg-[#121620] hover:border-blue-500/70 hover:bg-[#151A26]'
          }`}
        >
          <div className="w-12 h-12 rounded-lg bg-[#1A2130] border border-[#2A3346] flex items-center justify-center mx-auto mb-4 text-blue-400">
            <Upload className="w-6 h-6" />
          </div>

          {needsRelinkName ? (
            <div className="mb-4 p-3 rounded-lg bg-amber-950/40 border border-amber-700/50 text-left text-xs text-amber-200 space-y-1">
              <div className="font-semibold flex items-center gap-1.5 text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Video Sumber Perlu Dipilih Ulang (Relink)</span>
              </div>
              <p className="text-amber-200/80">
                Proyek mengharapkan file: <span className="font-mono-tc text-white">{needsRelinkName}</span>.
                Pilih file video tersebut dari perangkat Anda untuk melanjutkan editing semua klip yang sudah tersimpan.
              </p>
            </div>
          ) : null}

          <h2 className="text-base md:text-lg font-semibold text-white mb-1.5">
            {isLoading ? 'Membaca Metadata Video...' : 'Impor Video Sumber'}
          </h2>
          <p className="text-xs md:text-sm text-slate-400 mb-5 max-w-md mx-auto">
            Pilih satu video panjang (YouTube, ceramah, kajian, atau edukasi) dari perangkat Anda. Video diproses lokal tanpa diunggah ke server.
          </p>

          <button
            type="button"
            disabled={isLoading}
            className="min-h-[44px] px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs md:text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
          >
            <FileVideo className="w-4 h-4" />
            <span>{isLoading ? 'Memproses...' : 'Pilih File Video (MP4, MOV, MKV)'}</span>
          </button>

          <div className="mt-4 text-[11px] text-slate-500">
            Mendukung MP4, MOV, MKV, WebM · Pemrosesan Lokal di Browser
          </div>

          {loadError && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="mt-4 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-left text-xs text-red-200 flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{loadError}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-[#121620] border border-[#232A38] rounded-lg ${compact ? 'p-3' : 'p-4'} space-y-3`}>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,.mp4,.mov,.mkv,.webm,.avi,.m4v"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-slate-400 mb-0.5">Video Sumber</div>
          <div className="text-xs md:text-sm font-semibold text-white truncate" title={metadata.fileName}>
            {metadata.fileName}
          </div>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isLoading}
          className="min-h-[34px] px-3 py-1.5 rounded bg-[#1B2230] hover:bg-[#252E40] border border-[#2D3648] text-xs font-medium text-slate-200 flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Ganti Video</span>
        </button>
      </div>

      {/* Unboxed Clean Metadata Grid */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 pt-2 border-t border-[#1E2534] text-xs">
        <div>
          <dt className="text-[11px] text-slate-400">Durasi</dt>
          <dd className="font-mono-tc text-slate-100 font-medium">
            {formatTimecode(metadata.durationMs)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-400">Resolusi</dt>
          <dd className="font-mono-tc text-slate-100 font-medium">
            {metadata.width} × {metadata.height}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-400">Frame Rate</dt>
          <dd className="font-mono-tc text-slate-100 font-medium">
            {metadata.fps} fps
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-400">Ukuran File</dt>
          <dd className="font-mono-tc text-slate-100 font-medium">
            {formatFileSize(metadata.fileSize)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-400">Format Sumber</dt>
          <dd className="font-mono-tc text-slate-100 font-medium">
            {metadata.formatLabel}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-400">Pemrosesan</dt>
          <dd className="text-emerald-400 font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Lokal</span>
          </dd>
        </div>
      </dl>

      {deviceCap?.warningMessage && (
        <div className="p-2.5 rounded bg-amber-950/35 border border-amber-700/50 text-[11px] text-amber-200 flex items-start gap-2 leading-relaxed">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>{deviceCap.warningMessage}</span>
        </div>
      )}

      {loadError && (
        <div className="p-2.5 rounded bg-red-950/40 border border-red-800/60 text-[11px] text-red-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{loadError}</span>
        </div>
      )}
    </div>
  );
};
