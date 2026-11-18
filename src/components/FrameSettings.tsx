import React, { useState } from 'react';
import {
  RotateCw,
  RotateCcw,
  Maximize,
  Minimize,
  Check,
  Info,
  Layers,
  Eye,
  EyeOff,
  Type,
  Film,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react';
import type {
  AspectRatioPreset,
  FrameSettingsState,
  ResolutionPreset,
  TextOverlayLayer,
  VideoMetadata,
} from '../types/editor';
import { computeTargetDimensions } from '../utils/ffmpegEngine';
import { DEFAULT_TEXT_LAYER } from '../utils/overlayRenderer';

interface FrameSettingsProps {
  frameSettings: FrameSettingsState;
  resolution: ResolutionPreset;
  metadata: VideoMetadata | null;
  onChange: (next: FrameSettingsState) => void;
  onReset: () => void;
}

const ASPECT_OPTIONS: { id: AspectRatioPreset; label: string; sub: string }[] = [
  { id: '9:16', label: '9:16', sub: 'Reels / Shorts' },
  { id: '16:9', label: '16:9', sub: 'YouTube' },
  { id: '1:1', label: '1:1', sub: 'Square Feed' },
  { id: '4:5', label: '4:5', sub: 'IG Portrait' },
  { id: 'original', label: 'Asli', sub: 'Video Sumber' },
  { id: 'custom', label: 'Custom', sub: 'Rasio Bebas' },
];

const TEMPLATE_PRESETS: {
  id: string;
  label: string;
  apply: (cur: FrameSettingsState) => FrameSettingsState;
}[] = [
  {
    id: 'reels-blur',
    label: '9:16 Blur',
    apply: (cur) => ({
      ...cur,
      aspectRatio: '9:16',
      fitMode: 'fit',
      zoom: 1,
      posX: 0,
      posY: 0,
      bgType: 'blur',
      bgVisible: true,
      videoVisible: true,
      appliedToAll: true,
    }),
  },
  {
    id: 'reels-dark',
    label: '9:16 Hitam',
    apply: (cur) => ({
      ...cur,
      aspectRatio: '9:16',
      fitMode: 'fit',
      zoom: 1,
      posX: 0,
      posY: 0,
      bgType: 'color',
      bgColor: '#000000',
      bgVisible: true,
      videoVisible: true,
      appliedToAll: true,
    }),
  },
  {
    id: 'yt-16-9',
    label: '16:9 Full',
    apply: (cur) => ({
      ...cur,
      aspectRatio: '16:9',
      fitMode: 'fill',
      zoom: 1,
      posX: 0,
      posY: 0,
      bgType: 'color',
      bgColor: '#000000',
      bgVisible: true,
      videoVisible: true,
      appliedToAll: true,
    }),
  },
  {
    id: 'sq-1-1',
    label: '1:1 Blur',
    apply: (cur) => ({
      ...cur,
      aspectRatio: '1:1',
      fitMode: 'fit',
      zoom: 1,
      posX: 0,
      posY: 0,
      bgType: 'blur',
      bgVisible: true,
      videoVisible: true,
      appliedToAll: true,
    }),
  },
  {
    id: 'ig-4-5',
    label: '4:5 Portrait',
    apply: (cur) => ({
      ...cur,
      aspectRatio: '4:5',
      fitMode: 'fit',
      zoom: 1,
      posX: 0,
      posY: 0,
      bgType: 'blur',
      bgVisible: true,
      videoVisible: true,
      appliedToAll: true,
    }),
  },
];

const BG_SWATCHES = ['#000000', '#0F172A', '#1E293B', '#FFFFFF', '#1D4ED8', '#064E3B'];
const TEXT_SWATCHES = ['#FFFFFF', '#FDE047', '#38BDF8', '#4ADE80', '#F87171', '#000000'];

type ActiveLayerId = 'text' | 'video' | 'background';

export const FrameSettings: React.FC<FrameSettingsProps> = ({
  frameSettings,
  resolution,
  metadata,
  onChange,
  onReset,
}) => {
  const [appliedToast, setAppliedToast] = useState(false);
  const [activeLayer, setActiveLayer] = useState<ActiveLayerId>('video');

  const textLayer: TextOverlayLayer = frameSettings.textLayer
    ? { ...DEFAULT_TEXT_LAYER, ...frameSettings.textLayer }
    : DEFAULT_TEXT_LAYER;
  const videoVisible = frameSettings.videoVisible !== false;
  const bgVisible = frameSettings.bgVisible !== false;

  const dims = computeTargetDimensions(
    metadata?.width || 1920,
    metadata?.height || 1080,
    frameSettings,
    resolution
  );

  const update = (patch: Partial<FrameSettingsState>) => {
    onChange({ ...frameSettings, ...patch, appliedToAll: true });
  };

  const updateTextLayer = (patch: Partial<TextOverlayLayer>) => {
    update({
      textLayer: {
        ...textLayer,
        ...patch,
      },
    });
  };

  const handleApplyToAll = () => {
    onChange({ ...frameSettings, appliedToAll: true });
    setAppliedToast(true);
    window.setTimeout(() => setAppliedToast(false), 1400);
  };

  return (
    <div className="space-y-3.5 text-xs">
      {/* Global Output Banner */}
      <div className="p-2 rounded bg-blue-950/30 border border-blue-800/50 text-[11px] text-blue-200 flex items-start gap-2">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <span>
          Template & layer ini diterapkan seragam ke <strong>semua klip</strong> saat ekspor. Output:{' '}
          <span className="font-mono-tc text-white font-semibold">
            {dims.width}×{dims.height}
          </span>
        </span>
      </div>

      {/* Quick Template Presets */}
      <div>
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300 mb-1.5">
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span>Preset Template Cepat</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange(preset.apply(frameSettings))}
              className="px-2 py-1.5 rounded bg-[#0E1219] hover:bg-[#192233] border border-[#232A38] hover:border-blue-500/50 text-[11px] font-medium text-slate-200 transition-colors cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Aspect Ratio Grid */}
      <div className="pt-2 border-t border-[#1E2534]">
        <div className="text-[11px] font-medium text-slate-300 mb-1.5">Aspect Ratio Kanvas</div>
        <div className="grid grid-cols-3 gap-1.5">
          {ASPECT_OPTIONS.map((opt) => {
            const active = frameSettings.aspectRatio === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => update({ aspectRatio: opt.id })}
                className={`text-left px-2 py-1.5 rounded border transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-600/20 border-blue-500 text-white'
                    : 'bg-[#0E1219] border-[#232A38] text-slate-300 hover:border-[#344056]'
                }`}
              >
                <div className="font-semibold text-[11px]">{opt.label}</div>
                <div className="text-[10px] text-slate-400 truncate">{opt.sub}</div>
              </button>
            );
          })}
        </div>

        {frameSettings.aspectRatio === 'custom' && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Lebar Rasio</label>
              <input
                type="number"
                min={1}
                max={32}
                value={frameSettings.customRatioW}
                onChange={(e) =>
                  update({ customRatioW: Math.max(1, Number(e.target.value) || 1) })
                }
                className="w-full bg-[#0C0F16] border border-[#283142] rounded px-2 py-1.5 font-mono-tc text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Tinggi Rasio</label>
              <input
                type="number"
                min={1}
                max={32}
                value={frameSettings.customRatioH}
                onChange={(e) =>
                  update({ customRatioH: Math.max(1, Number(e.target.value) || 1) })
                }
                className="w-full bg-[#0C0F16] border border-[#283142] rounded px-2 py-1.5 font-mono-tc text-xs text-white"
              />
            </div>
          </div>
        )}
      </div>

      {/* Interactive Layer Stack (Top-to-Bottom Render Order) */}
      <div className="pt-2 border-t border-[#1E2534] space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sistem Layer (Urutan Atas → Bawah)</span>
          </div>
          <span className="text-[10px] text-slate-500">Pilih untuk edit</span>
        </div>

        <div className="space-y-1">
          {/* Layer 3: Text Overlay */}
          <div
            onClick={() => setActiveLayer('text')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveLayer('text');
              }
            }}
            className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded border cursor-pointer transition-colors ${
              activeLayer === 'text'
                ? 'bg-[#172133] border-cyan-500/70 text-white'
                : 'bg-[#0C0F16] border-[#232A38] text-slate-300 hover:border-[#344056]'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono-tc text-[10px] px-1 py-0.5 rounded bg-[#1E2738] text-cyan-300 shrink-0">
                L3
              </span>
              <Type className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold text-[11px] truncate">Teks / Judul Overlay</div>
                <div className="text-[10px] text-slate-400 truncate">
                  {textLayer.enabled
                    ? textLayer.text.trim()
                      ? `"${textLayer.text.trim()}"`
                      : 'Aktif · belum diisi teks'
                    : 'Nonaktif'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const nextEnabled = !textLayer.enabled;
                updateTextLayer({ enabled: nextEnabled });
                if (nextEnabled) setActiveLayer('text');
              }}
              aria-label={textLayer.enabled ? 'Sembunyikan Layer Teks' : 'Aktifkan Layer Teks'}
              className={`p-1.5 rounded border cursor-pointer shrink-0 ${
                textLayer.enabled
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                  : 'bg-[#131823] border-[#263042] text-slate-500'
              }`}
            >
              {textLayer.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Layer 2: Main Video */}
          <div
            onClick={() => setActiveLayer('video')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveLayer('video');
              }
            }}
            className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded border cursor-pointer transition-colors ${
              activeLayer === 'video'
                ? 'bg-[#172133] border-blue-500/70 text-white'
                : 'bg-[#0C0F16] border-[#232A38] text-slate-300 hover:border-[#344056]'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono-tc text-[10px] px-1 py-0.5 rounded bg-[#1E2738] text-blue-300 shrink-0">
                L2
              </span>
              <Film className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold text-[11px] truncate">Video Utama</div>
                <div className="text-[10px] text-slate-400 font-mono-tc truncate">
                  {videoVisible
                    ? `${frameSettings.fitMode.toUpperCase()} · ${Math.round(
                        frameSettings.zoom * 100
                      )}% · ${frameSettings.rotate}°`
                    : 'Disembunyikan'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                update({ videoVisible: !videoVisible });
              }}
              aria-label={videoVisible ? 'Sembunyikan Video Utama' : 'Tampilkan Video Utama'}
              className={`p-1.5 rounded border cursor-pointer shrink-0 ${
                videoVisible
                  ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                  : 'bg-[#131823] border-[#263042] text-slate-500'
              }`}
            >
              {videoVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Layer 1: Background */}
          <div
            onClick={() => setActiveLayer('background')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveLayer('background');
              }
            }}
            className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded border cursor-pointer transition-colors ${
              activeLayer === 'background'
                ? 'bg-[#172133] border-emerald-500/70 text-white'
                : 'bg-[#0C0F16] border-[#232A38] text-slate-300 hover:border-[#344056]'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono-tc text-[10px] px-1 py-0.5 rounded bg-[#1E2738] text-emerald-300 shrink-0">
                L1
              </span>
              <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold text-[11px] truncate">Latar Belakang</div>
                <div className="text-[10px] text-slate-400 truncate">
                  {!bgVisible
                    ? 'Hitam Default (Nonaktif)'
                    : frameSettings.bgType === 'blur'
                    ? `Blur Video (${frameSettings.blurIntensity}px)`
                    : `Warna Solid ${frameSettings.bgColor.toUpperCase()}`}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                update({ bgVisible: !bgVisible });
              }}
              aria-label={bgVisible ? 'Sembunyikan Latar Belakang' : 'Aktifkan Latar Belakang'}
              className={`p-1.5 rounded border cursor-pointer shrink-0 ${
                bgVisible
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                  : 'bg-[#131823] border-[#263042] text-slate-500'
              }`}
            >
              {bgVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Selected Layer Inspector */}
      {activeLayer === 'text' && (
        <div className="p-2.5 rounded-lg bg-[#0C1018] border border-cyan-800/40 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[11px] text-cyan-300">
              Pengaturan Layer 3: Teks Overlay
            </span>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={textLayer.enabled}
                onChange={(e) => updateTextLayer({ enabled: e.target.checked })}
              />
              <span>Aktifkan</span>
            </label>
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 mb-1">
              Teks Judul / Topik Kajian (mendukung multi-baris)
            </label>
            <textarea
              rows={2}
              value={textLayer.text}
              onChange={(e) =>
                updateTextLayer({
                  text: e.target.value,
                  enabled: e.target.value.trim().length > 0 ? true : textLayer.enabled,
                })
              }
              placeholder="Contoh: Keutamaan Sabar dalam Ujian"
              className="w-full bg-[#090C12] border border-[#283142] rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-1">
            {(['top', 'center', 'bottom'] as const).map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => updateTextLayer({ position: pos })}
                className={`py-1.5 rounded border text-[11px] font-medium cursor-pointer ${
                  textLayer.position === pos
                    ? 'bg-cyan-600/25 border-cyan-500 text-white'
                    : 'bg-[#0E131C] border-[#232A38] text-slate-400'
                }`}
              >
                {pos === 'top' ? 'Atas' : pos === 'center' ? 'Tengah' : 'Bawah'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                <span>Ukuran Teks</span>
                <span className="font-mono-tc text-slate-200">{textLayer.fontSize}px</span>
              </div>
              <input
                type="range"
                min={24}
                max={96}
                step={2}
                value={textLayer.fontSize}
                onChange={(e) => updateTextLayer({ fontSize: Number(e.target.value) })}
                className="nle-slider w-full"
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                <span>Geser Vertikal</span>
                <span className="font-mono-tc text-slate-200">{textLayer.offsetY}%</span>
              </div>
              <input
                type="range"
                min={-20}
                max={20}
                step={1}
                value={textLayer.offsetY}
                onChange={(e) => updateTextLayer({ offsetY: Number(e.target.value) })}
                className="nle-slider w-full"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400">Warna Teks</span>
              <div className="flex items-center gap-1">
                {TEXT_SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => updateTextLayer({ color: hex })}
                    aria-label={`Warna teks ${hex}`}
                    style={{ backgroundColor: hex }}
                    className={`w-5 h-5 rounded border cursor-pointer ${
                      textLayer.color.toLowerCase() === hex.toLowerCase()
                        ? 'border-cyan-400 ring-1 ring-cyan-400'
                        : 'border-white/20'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400 shrink-0">Kotak Latar Teks</span>
              <div className="flex items-center gap-2 flex-1 justify-end">
                <input
                  type="color"
                  value={textLayer.bgColor}
                  onChange={(e) => updateTextLayer({ bgColor: e.target.value })}
                  aria-label="Warna kotak latar teks"
                  className="w-6 h-5 bg-transparent border-0 cursor-pointer"
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={textLayer.bgOpacity}
                  onChange={(e) => updateTextLayer({ bgOpacity: Number(e.target.value) })}
                  aria-label="Opasitas kotak latar teks"
                  className="nle-slider w-24"
                />
                <span className="font-mono-tc text-[10px] text-slate-300 w-8 text-right">
                  {Math.round(textLayer.bgOpacity * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeLayer === 'video' && (
        <div className="p-2.5 rounded-lg bg-[#0C1018] border border-blue-900/40 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[11px] text-blue-300">
              Pengaturan Layer 2: Video Utama
            </span>
            {!videoVisible && (
              <span className="text-[10px] text-amber-300">Layer sedang tersembunyi</span>
            )}
          </div>

          {/* Fit / Fill & Rotate */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] font-medium text-slate-400 mb-1">Mode Skala</div>
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#090C12] border border-[#232A38] rounded">
                <button
                  type="button"
                  onClick={() => update({ fitMode: 'fit' })}
                  className={`py-1 rounded text-[11px] font-medium flex items-center justify-center gap-1 cursor-pointer ${
                    frameSettings.fitMode === 'fit'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Minimize className="w-3 h-3" />
                  Fit
                </button>
                <button
                  type="button"
                  onClick={() => update({ fitMode: 'fill' })}
                  className={`py-1 rounded text-[11px] font-medium flex items-center justify-center gap-1 cursor-pointer ${
                    frameSettings.fitMode === 'fill'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Maximize className="w-3 h-3" />
                  Fill
                </button>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-medium text-slate-400 mb-1">Rotasi</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    update({
                      rotate: (((frameSettings.rotate + 270) % 360) as 0 | 90 | 180 | 270),
                    })
                  }
                  aria-label="Putar Kiri 90 Derajat"
                  className="flex-1 py-1.5 rounded bg-[#0E1219] hover:bg-[#19202D] border border-[#232A38] text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono-tc text-[11px] text-slate-200 w-9 text-center">
                  {frameSettings.rotate}°
                </span>
                <button
                  type="button"
                  onClick={() =>
                    update({
                      rotate: (((frameSettings.rotate + 90) % 360) as 0 | 90 | 180 | 270),
                    })
                  }
                  aria-label="Putar Kanan 90 Derajat"
                  className="flex-1 py-1.5 rounded bg-[#0E1219] hover:bg-[#19202D] border border-[#232A38] text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Zoom & Position X/Y */}
          <div className="space-y-2 pt-2 border-t border-[#1A2130]">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-slate-300">Zoom In / Out</span>
                <span className="font-mono-tc text-[11px] text-blue-300">
                  {Math.round(frameSettings.zoom * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    update({ zoom: Math.max(0.25, Number((frameSettings.zoom - 0.1).toFixed(2))) })
                  }
                  className="px-2 py-0.5 rounded bg-[#0E1219] border border-[#232A38] text-slate-200 cursor-pointer"
                >
                  -
                </button>
                <input
                  type="range"
                  min={0.25}
                  max={3}
                  step={0.05}
                  value={frameSettings.zoom}
                  onChange={(e) => update({ zoom: Number(e.target.value) })}
                  className="nle-slider flex-1"
                />
                <button
                  type="button"
                  onClick={() =>
                    update({ zoom: Math.min(3, Number((frameSettings.zoom + 0.1).toFixed(2))) })
                  }
                  className="px-2 py-0.5 rounded bg-[#0E1219] border border-[#232A38] text-slate-200 cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-slate-400">Posisi X</span>
                  <span className="font-mono-tc text-[10px] text-slate-200">
                    {frameSettings.posX}%
                  </span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={frameSettings.posX}
                  onChange={(e) => update({ posX: Number(e.target.value) })}
                  className="nle-slider w-full"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-slate-400">Posisi Y</span>
                  <span className="font-mono-tc text-[10px] text-slate-200">
                    {frameSettings.posY}%
                  </span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={frameSettings.posY}
                  onChange={(e) => update({ posY: Number(e.target.value) })}
                  className="nle-slider w-full"
                />
              </div>
            </div>
          </div>

          {/* Crop Edges */}
          <div className="pt-2 border-t border-[#1A2130] space-y-1.5">
            <div className="text-[11px] font-medium text-slate-300">Crop Sisi Video (%)</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {(['top', 'bottom', 'left', 'right'] as const).map((edge) => {
                const labels = { top: 'Atas', bottom: 'Bawah', left: 'Kiri', right: 'Kanan' };
                return (
                  <div key={edge}>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                      <span>{labels[edge]}</span>
                      <span className="font-mono-tc text-slate-200">
                        {frameSettings.crop[edge]}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      step={1}
                      value={frameSettings.crop[edge]}
                      onChange={(e) =>
                        update({
                          crop: {
                            ...frameSettings.crop,
                            [edge]: Number(e.target.value),
                          },
                        })
                      }
                      className="nle-slider w-full"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeLayer === 'background' && (
        <div className="p-2.5 rounded-lg bg-[#0C1018] border border-emerald-900/40 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[11px] text-emerald-300">
              Pengaturan Layer 1: Background
            </span>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={bgVisible}
                onChange={(e) => update({ bgVisible: e.target.checked })}
              />
              <span>Tampilkan</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 bg-[#090C12] border border-[#232A38] rounded">
            <button
              type="button"
              onClick={() => update({ bgType: 'color', bgVisible: true })}
              className={`py-1.5 rounded text-[11px] font-medium cursor-pointer ${
                frameSettings.bgType === 'color'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Warna Solid
            </button>
            <button
              type="button"
              onClick={() => update({ bgType: 'blur', bgVisible: true })}
              className={`py-1.5 rounded text-[11px] font-medium cursor-pointer ${
                frameSettings.bgType === 'blur'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Blur Video
            </button>
          </div>

          {frameSettings.bgType === 'color' ? (
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5">
                {BG_SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => update({ bgColor: hex, bgVisible: true })}
                    aria-label={`Pilih warna ${hex}`}
                    style={{ backgroundColor: hex }}
                    className={`w-6 h-6 rounded border cursor-pointer ${
                      frameSettings.bgColor.toLowerCase() === hex.toLowerCase()
                        ? 'border-emerald-400 ring-2 ring-emerald-500/40'
                        : 'border-white/20'
                    }`}
                  />
                ))}
              </div>
              <input
                type="color"
                value={frameSettings.bgColor}
                onChange={(e) => update({ bgColor: e.target.value, bgVisible: true })}
                aria-label="Pilih Warna Latar Kustom"
                className="w-8 h-6 bg-transparent border-0 cursor-pointer"
              />
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span>Intensitas Blur</span>
                <span className="font-mono-tc text-slate-200">{frameSettings.blurIntensity}px</span>
              </div>
              <input
                type="range"
                min={8}
                max={35}
                step={1}
                value={frameSettings.blurIntensity}
                onChange={(e) => update({ blurIntensity: Number(e.target.value), bgVisible: true })}
                className="nle-slider w-full"
              />
            </div>
          )}
        </div>
      )}

      {/* Global Actions */}
      <div className="pt-2 border-t border-[#1E2534] grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleApplyToAll}
          className="min-h-[38px] px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
        >
          {appliedToast ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Diterapkan ke Semua</span>
            </>
          ) : (
            <span>Apply to All</span>
          )}
        </button>

        <button
          type="button"
          onClick={onReset}
          className="min-h-[38px] px-3 py-2 rounded bg-[#181E2B] hover:bg-[#232C3F] border border-[#2A3346] text-slate-200 text-xs font-medium cursor-pointer"
        >
          Reset Template
        </button>
      </div>
    </div>
  );
};
