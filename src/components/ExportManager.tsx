import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  FolderOpen,
  Download,
  Play,
  Square,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Zap,
  Crosshair,
  Sparkles,
  Film,
  Cpu,
  Globe,
} from 'lucide-react';
import type {
  Clip,
  EditorSettings,
  EncoderPreset,
  ExportBackend,
  ExportClipItem,
  ExportMode,
  FrameSettingsState,
  NativeCapabilities,
  ResolutionPreset,
  VideoMetadata,
} from '../types/editor';
import { formatClipFileName, formatFileSize, formatTimecode } from '../utils/timecode';
import { ffmpegEngine, resolveExportPlan } from '../utils/ffmpegEngine';
import { renderTextOverlayPng } from '../utils/overlayRenderer';
import { assessDeviceCapability } from '../utils/videoProbe';

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

interface DirectoryHandleLike {
  name: string;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<{
    createWritable: () => Promise<{
      write: (data: BufferSource | Blob | string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

interface ExportManagerProps {
  isOpen: boolean;
  onClose: () => void;
  sourceFile: File | null;
  metadata: VideoMetadata | null;
  clips: Clip[];
  frameSettings: FrameSettingsState;
  resolution: ResolutionPreset;
  editorSettings: EditorSettings;
  onUpdateEditorSettings: (patch: Partial<EditorSettings>) => void;
  onExportRunningChange: (running: boolean) => void;
}

export const ExportManager: React.FC<ExportManagerProps> = ({
  isOpen,
  onClose,
  sourceFile,
  metadata,
  clips,
  frameSettings,
  resolution,
  editorSettings,
  onUpdateEditorSettings,
  onExportRunningChange,
}) => {
  const [queue, setQueue] = useState<ExportClipItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [engineStatus, setEngineStatus] = useState<string | null>(null);
  const [dirHandle, setDirHandle] = useState<DirectoryHandleLike | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [nativeCaps, setNativeCaps] = useState<NativeCapabilities | null>(null);
  const [useHardwareEncoder, setUseHardwareEncoder] = useState(true);

  const cancelRequestedRef = useRef(false);
  const activeNativeJobRef = useRef<string | null>(null);
  const activeNativeSessionRef = useRef<string | null>(null);
  const createdUrlsRef = useRef<string[]>([]);

  const capability = assessDeviceCapability(sourceFile?.size);
  const plan = metadata
    ? resolveExportPlan(
        metadata.width,
        metadata.height,
        frameSettings,
        resolution,
        editorSettings.exportMode
      )
    : {
        effectiveStrategy: 'fast_copy' as const,
        needsReencode: false,
        reason: '',
        width: 1920,
        height: 1080,
      };

  const canUseNative = Boolean(nativeCaps?.available && nativeCaps?.isLocalhost);
  const selectedBackend: ExportBackend =
    editorSettings.backend === 'native' && canUseNative ? 'native' : 'wasm';

  // Probe local native FFmpeg capabilities when modal opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch('/api/native/capabilities')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: NativeCapabilities | null) => {
        if (!cancelled && data) {
          setNativeCaps(data);
        }
      })
      .catch(() => {
        if (!cancelled) setNativeCaps(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Build fresh queue whenever modal opens (if not running)
  useEffect(() => {
    if (!isOpen || isRunning || !metadata) return;

    createdUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    createdUrlsRef.current = [];
    setValidationError(null);
    setEngineStatus(null);

    const invalid = clips.find(
      (c) => c.inMs < 0 || c.outMs > metadata.durationMs || c.outMs <= c.inMs
    );
    if (invalid) {
      setValidationError(
        `Klip "${invalid.name}" memiliki rentang waktu tidak valid. Periksa IN/OUT sebelum ekspor.`
      );
    }

    const items: ExportClipItem[] = clips.map((clip, index) => ({
      clipId: clip.id,
      clipName: clip.name,
      outputFileName: formatClipFileName(index, editorSettings.filenamePrefix, clip.name),
      inMs: clip.inMs,
      outMs: clip.outMs,
      durationMs: Math.max(0, clip.outMs - clip.inMs),
      targetWidth: plan.width,
      targetHeight: plan.height,
      resolvedMethod: plan.effectiveStrategy,
      status: 'queued',
      progress: 0,
    }));
    setQueue(items);
  }, [
    isOpen,
    isRunning,
    clips,
    metadata,
    editorSettings.filenamePrefix,
    plan.width,
    plan.height,
    plan.effectiveStrategy,
  ]);

  useEffect(() => {
    return () => {
      createdUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  if (!isOpen) return null;

  const handlePickFolder = async () => {
    try {
      const win = window as unknown as {
        showDirectoryPicker?: (opts?: { mode?: string }) => Promise<DirectoryHandleLike>;
      };
      if (!win.showDirectoryPicker) return;
      const handle = await win.showDirectoryPicker({ mode: 'readwrite' });
      setDirHandle(handle);
    } catch {
      // User cancelled picker
    }
  };

  const triggerBrowserDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const saveBlobOrDownload = async (blob: Blob, outName: string) => {
    const blobUrl = URL.createObjectURL(blob);
    createdUrlsRef.current.push(blobUrl);

    let savedDirectly = false;
    if (dirHandle) {
      try {
        const fileHandle = await dirHandle.getFileHandle(outName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        savedDirectly = true;
      } catch {
        savedDirectly = false;
      }
    }

    if (!savedDirectly) {
      triggerBrowserDownload(blobUrl, outName);
      await new Promise((r) => setTimeout(r, 350));
    }

    return { savedDirectly, blobUrl };
  };

  const runWasmExport = async () => {
    if (!sourceFile || !metadata) return;

    setEngineStatus('Memuat mesin FFmpeg.wasm...');
    await ffmpegEngine.ensureLoaded((msg) => setEngineStatus(msg));
    setEngineStatus('Memasang file sumber via WORKERFS (tanpa menyalin seluruh video ke RAM)...');
    await ffmpegEngine.mountSourceFile(sourceFile);
    const overlayPng = await renderTextOverlayPng(plan.width, plan.height, frameSettings);
    setEngineStatus(null);

    for (let i = 0; i < clips.length; i++) {
      if (cancelRequestedRef.current) {
        setQueue((prev) =>
          prev.map((item, idx) =>
            idx >= i && item.status === 'queued' ? { ...item, status: 'cancelled' } : item
          )
        );
        break;
      }

      const clip = clips[i];
      const outName = formatClipFileName(i, editorSettings.filenamePrefix, clip.name);

      setQueue((prev) =>
        prev.map((item) =>
          item.clipId === clip.id
            ? { ...item, status: 'processing', progress: 1, errorMessage: undefined }
            : item
        )
      );

      try {
        const result = await ffmpegEngine.exportSingleClip({
          file: sourceFile,
          metadata,
          clip,
          outputFileName: outName,
          frameSettings,
          resolution,
          exportMode: editorSettings.exportMode,
          encoderPreset: editorSettings.encoderPreset,
          encoderCrf: editorSettings.encoderCrf,
          overlayPng,
          onProgress: (pct) => {
            setQueue((prev) =>
              prev.map((item) =>
                item.clipId === clip.id ? { ...item, progress: pct } : item
              )
            );
          },
        });

        if (cancelRequestedRef.current) {
          setQueue((prev) =>
            prev.map((item) =>
              item.clipId === clip.id ? { ...item, status: 'cancelled' } : item
            )
          );
          continue;
        }

        const blob = new Blob([new Uint8Array(result.data)], { type: 'video/mp4' });
        const { savedDirectly, blobUrl } = await saveBlobOrDownload(blob, outName);

        setQueue((prev) =>
          prev.map((item) =>
            item.clipId === clip.id
              ? {
                  ...item,
                  status: savedDirectly ? 'saved_folder' : 'downloaded',
                  progress: 100,
                  blobUrl,
                  outputSizeBytes: blob.size,
                  targetWidth: result.width,
                  targetHeight: result.height,
                  resolvedMethod: result.strategy,
                }
              : item
          )
        );
      } catch (clipErr) {
        const msg = clipErr instanceof Error ? clipErr.message : 'Gagal memproses klip.';
        setQueue((prev) =>
          prev.map((item) =>
            item.clipId === clip.id ? { ...item, status: 'error', errorMessage: msg } : item
          )
        );
      }
    }
  };

  const runNativeExport = async () => {
    if (!sourceFile || !metadata) return;

    setEngineStatus('Menghubungkan video sumber ke sesi FFmpeg Native lokal...');
    const sessionResp = await fetch('/api/native/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent(sourceFile.name),
      },
      body: sourceFile,
    });

    if (!sessionResp.ok) {
      const err = await sessionResp.json().catch(() => ({ error: 'Gagal membuat sesi lokal.' }));
      throw new Error(err.error || 'Gagal membuat sesi lokal.');
    }

    const { sessionId } = (await sessionResp.json()) as { sessionId: string };
    activeNativeSessionRef.current = sessionId;

    const outputNames: Record<string, string> = {};
    clips.forEach((c, idx) => {
      outputNames[c.id] = formatClipFileName(idx, editorSettings.filenamePrefix, c.name);
    });

    const overlayPng = await renderTextOverlayPng(plan.width, plan.height, frameSettings);
    const overlayPngBase64 = overlayPng ? uint8ToBase64(overlayPng) : null;

    setEngineStatus('Menjalankan antrean batch FFmpeg Native...');
    const batchResp = await fetch('/api/native/export-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        clips,
        metadata: { width: metadata.width, height: metadata.height },
        frameSettings,
        resolution,
        exportMode: editorSettings.exportMode,
        encoderPreset: editorSettings.encoderPreset,
        encoderCrf: editorSettings.encoderCrf,
        threads: editorSettings.threads,
        useHardwareEncoder,
        overlayPngBase64,
        outputNames,
      }),
    });

    if (!batchResp.ok) {
      const err = await batchResp.json().catch(() => ({ error: 'Gagal memulai batch native.' }));
      throw new Error(err.error || 'Gagal memulai batch native.');
    }

    const { jobId, concurrency, videoCodec } = (await batchResp.json()) as {
      jobId: string;
      concurrency: number;
      videoCodec: string;
    };
    activeNativeJobRef.current = jobId;
    setEngineStatus(`FFmpeg Native aktif (konkurensi ${concurrency} klip · encoder ${videoCodec})...`);

    const savedClipIds = new Set<string>();

    while (!cancelRequestedRef.current) {
      await new Promise((r) => setTimeout(r, 350));
      const pollResp = await fetch(`/api/native/job/${jobId}`);
      if (!pollResp.ok) break;
      const jobData = (await pollResp.json()) as {
        finished: boolean;
        cancelled: boolean;
        tasks: Array<{
          clipId: string;
          outputFileName: string;
          status: 'queued' | 'processing' | 'done' | 'error' | 'cancelled';
          progress: number;
          width: number;
          height: number;
          strategy: 'fast_copy' | 'accurate_direct' | 'accurate_filter';
          sizeBytes?: number;
          errorMessage?: string;
        }>;
      };

      for (const task of jobData.tasks) {
        if (task.status === 'done' && !savedClipIds.has(task.clipId)) {
          savedClipIds.add(task.clipId);
          try {
            const fileResp = await fetch(`/api/native/download/${jobId}/${task.clipId}`);
            if (fileResp.ok) {
              const blob = await fileResp.blob();
              const { savedDirectly, blobUrl } = await saveBlobOrDownload(blob, task.outputFileName);
              setQueue((prev) =>
                prev.map((q) =>
                  q.clipId === task.clipId
                    ? {
                        ...q,
                        status: savedDirectly ? 'saved_folder' : 'downloaded',
                        progress: 100,
                        blobUrl,
                        outputSizeBytes: blob.size,
                        targetWidth: task.width,
                        targetHeight: task.height,
                        resolvedMethod: task.strategy,
                      }
                    : q
                )
              );
            }
          } catch {
            setQueue((prev) =>
              prev.map((q) =>
                q.clipId === task.clipId
                  ? { ...q, status: 'error', errorMessage: 'Gagal mengambil hasil file dari server lokal.' }
                  : q
              )
            );
          }
        } else if (task.status !== 'done') {
          const nextStatus = task.status;
          setQueue((prev) =>
            prev.map((q) =>
              q.clipId === task.clipId
                ? {
                    ...q,
                    status: nextStatus,
                    progress: task.progress,
                    targetWidth: task.width,
                    targetHeight: task.height,
                    resolvedMethod: task.strategy,
                    errorMessage: task.errorMessage,
                  }
                : q
            )
          );
        }
      }

      if (jobData.finished) break;
    }

    if (activeNativeSessionRef.current) {
      fetch(`/api/native/session/${activeNativeSessionRef.current}`, { method: 'DELETE' }).catch(() => {});
      activeNativeSessionRef.current = null;
    }
    activeNativeJobRef.current = null;
  };

  const handleStartBulkExport = async () => {
    if (!sourceFile || !metadata || clips.length === 0 || validationError) return;

    cancelRequestedRef.current = false;
    setIsRunning(true);
    onExportRunningChange(true);

    try {
      if (selectedBackend === 'native') {
        await runNativeExport();
      } else {
        await runWasmExport();
      }
    } catch (fatalErr) {
      const msg =
        fatalErr instanceof Error
          ? fatalErr.message
          : 'Gagal menjalankan mesin pemroses video.';
      setValidationError(msg);
    } finally {
      setIsRunning(false);
      onExportRunningChange(false);
      setEngineStatus(null);
    }
  };

  const handleCancel = () => {
    if (!isRunning) return;
    cancelRequestedRef.current = true;
    if (selectedBackend === 'native' && activeNativeJobRef.current) {
      fetch(`/api/native/cancel/${activeNativeJobRef.current}`, { method: 'POST' }).catch(() => {});
      if (activeNativeSessionRef.current) {
        fetch(`/api/native/session/${activeNativeSessionRef.current}`, { method: 'DELETE' }).catch(() => {});
      }
    } else {
      ffmpegEngine.terminate();
    }
    setQueue((prev) =>
      prev.map((item) =>
        item.status === 'processing' || item.status === 'queued'
          ? { ...item, status: 'cancelled' }
          : item
      )
    );
    setIsRunning(false);
    onExportRunningChange(false);
    setEngineStatus('Ekspor dibatalkan oleh pengguna.');
  };

  const completedCount = queue.filter(
    (q) => q.status === 'saved_folder' || q.status === 'downloaded'
  ).length;
  const overallPercent =
    queue.length > 0
      ? Math.round(queue.reduce((acc, q) => acc + q.progress, 0) / queue.length)
      : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 md:p-6">
      <div className="w-full max-w-3xl max-h-[92vh] bg-[#11151D] border border-[#283142] rounded-xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-4 md:px-5 py-3.5 border-b border-[#232A38] flex items-center justify-between gap-3 shrink-0">
          <div>
            <h2 className="text-sm md:text-base font-bold text-white">
              Ekspor Massal MP4 Terpisah ({clips.length} Klip)
            </h2>
            <p className="text-[11px] text-slate-400">
              Setiap klip diekspor sebagai file MP4 terpisah dengan audio sinkron (tanpa ZIP, tanpa digabung).
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!isRunning) onClose();
            }}
            disabled={isRunning}
            aria-label="Tutup Panel Ekspor"
            className="min-w-[36px] min-h-[36px] rounded bg-[#191F2C] hover:bg-[#232B3D] text-slate-300 disabled:opacity-30 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">
          {/* Backend Selector (Browser WASM vs Local Native FFmpeg) */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-200">Mesin Pemrosesan (Backend)</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isRunning}
                onClick={() => onUpdateEditorSettings({ backend: 'wasm' })}
                className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                  selectedBackend === 'wasm'
                    ? 'bg-blue-600/20 border-blue-500 text-white'
                    : 'bg-[#0D1118] border-[#232A38] text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs">
                  <Globe className="w-3.5 h-3.5 text-blue-400" />
                  <span>Browser FFmpeg.wasm (Lokal di Browser)</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Berjalan 100% di browser (Laptop & HP Android) via WORKERFS tanpa upload. Cocok untuk Mode SMART/FAST CUT & klip ringan.
                </p>
              </button>

              <button
                type="button"
                disabled={isRunning || !canUseNative}
                onClick={() => onUpdateEditorSettings({ backend: 'native' })}
                className={`text-left p-3 rounded-lg border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  selectedBackend === 'native'
                    ? 'bg-emerald-600/20 border-emerald-500 text-white'
                    : 'bg-[#0D1118] border-[#232A38] text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs">
                  <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Local Native FFmpeg (Laptop / Desktop)</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  {canUseNative && nativeCaps
                    ? `Aktif di localhost (${nativeCaps.cpuCores} core · ${
                        nativeCaps.activeHardwareEncoder
                          ? `GPU ${nativeCaps.activeHardwareEncoder}`
                          : 'CPU multi-thread libx264'
                      }). Jauh lebih cepat untuk re-encode video 60+ menit.`
                    : nativeCaps && !nativeCaps.isLocalhost
                    ? 'Hanya tersedia saat dijalankan lokal di Laptop/Desktop (localhost) agar video tidak diunggah ke internet.'
                    : 'Membutuhkan server pendamping lokal dengan FFmpeg terinstal.'}
                </p>
              </button>
            </div>
          </div>

          {/* Cut Mode Selection: SMART / FAST CUT / FRAME ACCURATE */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-200">Mode Pemotongan</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <button
                type="button"
                disabled={isRunning}
                onClick={() => onUpdateEditorSettings({ exportMode: 'smart' as ExportMode })}
                className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                  editorSettings.exportMode === 'smart'
                    ? 'bg-blue-600/20 border-blue-500 text-white'
                    : 'bg-[#0D1118] border-[#232A38] text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  <span>MODE SMART</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Otomatis pilih Fast Cut (-c copy) jika tanpa template, atau Frame Accurate jika ada crop/rasio/zoom/resolusi.
                </p>
              </button>

              <button
                type="button"
                disabled={isRunning}
                onClick={() => onUpdateEditorSettings({ exportMode: 'fast' as ExportMode })}
                className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                  editorSettings.exportMode === 'fast'
                    ? 'bg-blue-600/20 border-blue-500 text-white'
                    : 'bg-[#0D1118] border-[#232A38] text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>FAST CUT</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Stream copy (-c copy) tanpa re-encode. Titik awal mengikuti batas keyframe video sumber.
                </p>
              </button>

              <button
                type="button"
                disabled={isRunning}
                onClick={() => onUpdateEditorSettings({ exportMode: 'accurate' as ExportMode })}
                className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                  editorSettings.exportMode === 'accurate'
                    ? 'bg-blue-600/20 border-blue-500 text-white'
                    : 'bg-[#0D1118] border-[#232A38] text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs">
                  <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
                  <span>FRAME ACCURATE</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Re-encode presisi sesuai frame IN/OUT ({plan.width}×{plan.height}).
                </p>
              </button>
            </div>

            {/* Active Plan Explanation */}
            <div className="p-2.5 rounded bg-[#0D1118] border border-[#232A38] text-[11px] text-slate-300 flex flex-wrap items-center justify-between gap-2">
              <span>
                Strategi aktif: <strong className="text-white">{plan.reason}</strong>
              </span>
              {plan.needsReencode && (
                <div className="flex items-center gap-2">
                  <label className="text-slate-400">Preset:</label>
                  <select
                    disabled={isRunning}
                    value={editorSettings.encoderPreset}
                    onChange={(e) =>
                      onUpdateEditorSettings({ encoderPreset: e.target.value as EncoderPreset })
                    }
                    className="bg-[#161C28] border border-[#2A3346] rounded px-1.5 py-0.5 font-mono-tc text-[11px] text-white"
                  >
                    <option value="ultrafast">ultrafast</option>
                    <option value="superfast">superfast</option>
                    <option value="veryfast">veryfast</option>
                    <option value="faster">faster</option>
                  </select>
                  <label className="text-slate-400">CRF:</label>
                  <input
                    type="number"
                    disabled={isRunning}
                    min={18}
                    max={28}
                    value={editorSettings.encoderCrf}
                    onChange={(e) =>
                      onUpdateEditorSettings({
                        encoderCrf: Math.max(18, Math.min(28, Number(e.target.value) || 22)),
                      })
                    }
                    className="w-12 bg-[#161C28] border border-[#2A3346] rounded px-1.5 py-0.5 font-mono-tc text-[11px] text-white"
                  />
                </div>
              )}
            </div>

            {selectedBackend === 'native' && nativeCaps?.activeHardwareEncoder && plan.needsReencode && (
              <label className="flex items-center gap-2 text-xs text-emerald-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useHardwareEncoder}
                  onChange={(e) => setUseHardwareEncoder(e.target.checked)}
                />
                <span>
                  Gunakan Akselerasi Hardware Terdeteksi ({nativeCaps.activeHardwareEncoder})
                </span>
              </label>
            )}
          </div>

          {/* Destination Folder Picker */}
          <div className="p-3 rounded-lg bg-[#0D1118] border border-[#232A38] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="text-xs">
              <div className="font-semibold text-slate-200">Penyimpanan File Output</div>
              {dirHandle ? (
                <div className="text-[11px] text-emerald-400 mt-0.5">
                  Folder terpilih: <span className="font-mono-tc">{dirHandle.name}</span>
                </div>
              ) : capability.supportsDirectoryPicker ? (
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Pilih folder tujuan langsung, atau biarkan kosong untuk unduh otomatis satu per satu lewat browser.
                </div>
              ) : (
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Browser ini menggunakan unduhan otomatis satu per satu ke folder Download perangkat Anda.
                </div>
              )}
            </div>

            {capability.supportsDirectoryPicker && (
              <button
                type="button"
                disabled={isRunning}
                onClick={handlePickFolder}
                className="min-h-[38px] px-3 py-1.5 rounded bg-[#19202D] hover:bg-[#232D3F] border border-[#2D374B] text-xs font-medium text-slate-200 flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                <span>{dirHandle ? 'Ganti Folder' : 'Pilih Folder Tujuan'}</span>
              </button>
            )}
          </div>

          {capability.isMobile && plan.needsReencode && (
            <div className="p-2.5 rounded bg-amber-950/35 border border-amber-700/50 text-[11px] text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Perhatian HP Android: Ekspor mode re-encoding di browser HP memakan waktu lebih lama. Untuk pemotongan cepat video 60+ menit, gunakan Mode SMART tanpa transformasi (Fast Cut) atau gunakan Laptop.
              </span>
            </div>
          )}

          {validationError && (
            <div className="p-3 rounded bg-red-950/40 border border-red-800/60 text-xs text-red-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{validationError}</span>
            </div>
          )}

          {engineStatus && (
            <div className="p-2.5 rounded bg-blue-950/40 border border-blue-800/60 text-xs text-blue-200 flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
              <span>{engineStatus}</span>
            </div>
          )}

          {/* Overall Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium">
                Progres Keseluruhan ({completedCount} / {queue.length} klip selesai)
              </span>
              <span className="font-mono-tc text-blue-300 font-semibold">{overallPercent}%</span>
            </div>
            <div className="h-2 w-full bg-[#0A0D12] border border-[#232A38] rounded-full overflow-hidden">
              <div
                style={{ width: `${overallPercent}%` }}
                className="h-full bg-blue-500 transition-[width] duration-200"
              />
            </div>
          </div>

          {/* Per-Clip Queue List */}
          <div className="space-y-2">
            {queue.map((item) => (
              <div
                key={item.clipId}
                className="p-3 rounded-lg bg-[#0D1118] border border-[#232A38] space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white flex items-center gap-1.5 truncate">
                      <Film className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="font-mono-tc truncate">{item.outputFileName}</span>
                    </div>
                    <div className="text-[11px] font-mono-tc text-slate-400 mt-0.5">
                      {formatTimecode(item.durationMs)} · {item.targetWidth}×{item.targetHeight}
                      {item.resolvedMethod === 'fast_copy'
                        ? ' · Fast Copy'
                        : item.resolvedMethod === 'accurate_direct'
                        ? ' · Accurate Direct'
                        : ' · Accurate Filter'}
                      {item.outputSizeBytes ? ` · ${formatFileSize(item.outputSizeBytes)}` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.status === 'queued' && (
                      <span className="text-[11px] text-slate-400">Menunggu antrean</span>
                    )}
                    {item.status === 'processing' && (
                      <span className="text-[11px] text-blue-300 flex items-center gap-1 font-mono-tc">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {item.progress}%
                      </span>
                    )}
                    {item.status === 'saved_folder' && (
                      <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Tersimpan ke Folder
                      </span>
                    )}
                    {item.status === 'downloaded' && (
                      <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Unduhan Dikirim ke Browser
                      </span>
                    )}
                    {item.status === 'error' && (
                      <span className="text-[11px] text-red-400 flex items-center gap-1 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Gagal
                      </span>
                    )}
                    {item.status === 'cancelled' && (
                      <span className="text-[11px] text-amber-400">Dibatalkan</span>
                    )}

                    {item.blobUrl && (
                      <button
                        type="button"
                        onClick={() => triggerBrowserDownload(item.blobUrl!, item.outputFileName)}
                        className="px-2 py-1 rounded bg-[#192234] hover:bg-[#23304A] border border-[#2C3A54] text-[11px] text-blue-200 flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        <span>Unduh</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="h-1.5 w-full bg-[#151B26] rounded-full overflow-hidden">
                  <div
                    style={{ width: `${item.progress}%` }}
                    className={`h-full transition-[width] duration-150 ${
                      item.status === 'error'
                        ? 'bg-red-500'
                        : item.status === 'saved_folder' || item.status === 'downloaded'
                        ? 'bg-emerald-500'
                        : 'bg-blue-500'
                    }`}
                  />
                </div>

                {item.errorMessage && (
                  <div className="text-[11px] text-red-300">{item.errorMessage}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-4 md:px-5 py-3 border-t border-[#232A38] bg-[#0E121A] flex items-center justify-end gap-2.5 shrink-0">
          {isRunning ? (
            <button
              type="button"
              onClick={handleCancel}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Batalkan Ekspor</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] px-4 py-2 rounded-lg bg-[#191F2C] hover:bg-[#232C3E] border border-[#2B3548] text-slate-200 text-xs font-medium cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={!sourceFile || clips.length === 0 || Boolean(validationError)}
                onClick={handleStartBulkExport}
                className="min-h-[40px] px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Mulai Ekspor Semua ({clips.length} MP4)</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
