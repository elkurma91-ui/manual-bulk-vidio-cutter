import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import type {
  Clip,
  EditorSettings,
  FrameSettingsState,
  ProjectFileData,
  ResolutionPreset,
  VideoMetadata,
  WaveformStatus,
} from './types/editor';
import { formatTimecode, snapToFrame } from './utils/timecode';
import { probeVideoFile } from './utils/videoProbe';
import { ffmpegEngine } from './utils/ffmpegEngine';
import {
  abortWaveformExtraction,
  extractAudioWaveform,
  getCachedWaveform,
} from './utils/waveformExtractor';
import { TopBar } from './components/TopBar';
import { DesktopLayout } from './components/DesktopLayout';
import { MobileLayout } from './components/MobileLayout';
import { ExportManager } from './components/ExportManager';
import { ConfirmNewProjectModal, SettingsModal } from './components/ProjectManager';
import { DEFAULT_TEXT_LAYER } from './utils/overlayRenderer';

const DEFAULT_FRAME_SETTINGS: FrameSettingsState = {
  aspectRatio: 'original',
  customRatioW: 16,
  customRatioH: 9,
  fitMode: 'fit',
  zoom: 1,
  posX: 0,
  posY: 0,
  rotate: 0,
  crop: { top: 0, right: 0, bottom: 0, left: 0 },
  bgType: 'color',
  bgColor: '#000000',
  blurIntensity: 18,
  videoVisible: true,
  bgVisible: true,
  textLayer: { ...DEFAULT_TEXT_LAYER },
  appliedToAll: true,
};

const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  defaultFps: 30,
  seekStepSeconds: 5,
  exportMode: 'smart',
  encoderPreset: 'ultrafast',
  encoderCrf: 22,
  threads: 0,
  backend: 'wasm',
  filenamePrefix: 'Clip',
};

function generateClipId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);

  // Responsive mode: render either MobileLayout or DesktopLayout so only one <video> mounts
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = (e: MediaQueryListEvent) => setIsMobileViewport(e.matches);
    setIsMobileViewport(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Project & Video State
  const [projectName, setProjectName] = useState('Proyek Potong Video');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [videoLoadError, setVideoLoadError] = useState<string | null>(null);
  const [needsRelinkName, setNeedsRelinkName] = useState<string | null>(null);

  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Manual Cutting & Clips State
  const [pendingInMs, setPendingInMs] = useState<number | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [previewingClipId, setPreviewingClipId] = useState<string | null>(null);

  // Global Frame, Resolution & Editor Settings
  const [frameSettings, setFrameSettings] = useState<FrameSettingsState>(DEFAULT_FRAME_SETTINGS);
  const [resolution, setResolution] = useState<ResolutionPreset>('original');
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(DEFAULT_EDITOR_SETTINGS);

  // Modals & Notice Banner
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [isExportRunning, setIsExportRunning] = useState(false);
  const [waveformStatus, setWaveformStatus] = useState<WaveformStatus>({ state: 'idle' });
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [confirmNewOpen, setConfirmNewOpen] = useState(false);
  const [notice, setNotice] = useState<{ type: 'info' | 'error'; text: string } | null>(null);

  const showNotice = useCallback((type: 'info' | 'error', text: string) => {
    setNotice({ type, text });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Cleanup object URL on unmount or file change
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  // Sync volume & mute to HTMLVideoElement
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = isMuted;
  }, [volume, isMuted, videoUrl, isMobileViewport]);

  const startWaveformAnalysis = useCallback((file: File, durationMs: number) => {
    const cached = getCachedWaveform(file);
    if (cached) {
      setWaveformStatus(cached.hasAudio ? { state: 'ready', data: cached } : { state: 'silent' });
      return;
    }
    extractAudioWaveform(file, durationMs, setWaveformStatus);
  }, []);

  // Automatically extract audio waveform once after video loads (cached across session)
  useEffect(() => {
    if (!sourceFile || !metadata || metadata.durationMs <= 0) {
      abortWaveformExtraction();
      setWaveformStatus({ state: 'idle' });
      return;
    }
    startWaveformAnalysis(sourceFile, metadata.durationMs);
    return () => {
      abortWaveformExtraction();
    };
  }, [sourceFile, metadata?.durationMs, startWaveformAnalysis]);

  // Never let background waveform analysis compete with active export
  useEffect(() => {
    if (isExportRunning && waveformStatus.state === 'loading') {
      abortWaveformExtraction();
      setWaveformStatus({
        state: 'paused',
        message: 'Analisis waveform dijeda selama ekspor',
      });
    }
  }, [isExportRunning, waveformStatus.state]);

  // Import or Relink Video File
  const handleFileSelected = useCallback(
    async (file: File) => {
      setIsVideoLoading(true);
      setVideoLoadError(null);
      try {
        const probed = await probeVideoFile(file, editorSettings.defaultFps);
        const nextUrl = URL.createObjectURL(file);

        // Unmount previous file from FFmpeg worker if loaded
        await ffmpegEngine.cleanupSource();

        setSourceFile(file);
        setVideoUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return nextUrl;
        });
        setMetadata(probed);
        setCurrentTimeMs(0);
        setIsPlaying(false);
        setPendingInMs(null);
        setPreviewingClipId(null);

        if (needsRelinkName) {
          setNeedsRelinkName(null);
          showNotice('info', `Video "${file.name}" berhasil ditautkan kembali ke proyek.`);
        } else {
          setHasUnsavedChanges(true);
          showNotice('info', `Video "${file.name}" siap diedit.`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal memuat video.';
        setVideoLoadError(msg);
      } finally {
        setIsVideoLoading(false);
      }
    },
    [editorSettings.defaultFps, needsRelinkName, showNotice]
  );

  // Playback Actions
  const seekToMs = useCallback(
    (ms: number) => {
      const video = videoRef.current;
      const maxMs = metadata?.durationMs || 0;
      const clamped = Math.max(0, Math.min(maxMs, Math.round(ms)));
      setCurrentTimeMs(clamped);
      if (video && Number.isFinite(video.duration)) {
        video.currentTime = clamped / 1000;
      }
    },
    [metadata?.durationMs]
  );

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    if (video.paused) {
      video.play().catch(() => {
        showNotice('error', 'Browser memblokir pemutaran otomatis. Ketuk tombol Play lagi.');
      });
    } else {
      video.pause();
      setPreviewingClipId(null);
    }
  }, [videoUrl, showNotice]);

  const stepFrame = useCallback(
    (dir: -1 | 1) => {
      const video = videoRef.current;
      if (!video || !metadata) return;
      if (!video.paused) {
        video.pause();
        setPreviewingClipId(null);
      }
      const frameDurationMs = 1000 / (metadata.fps || 30);
      const nextMs = snapToFrame(
        currentTimeMs + dir * frameDurationMs,
        metadata.fps,
        metadata.durationMs
      );
      seekToMs(nextMs);
    },
    [currentTimeMs, metadata, seekToMs]
  );

  const jumpSeconds = useCallback(
    (deltaSec: number) => {
      if (!metadata) return;
      const nextMs = snapToFrame(
        currentTimeMs + deltaSec * 1000,
        metadata.fps,
        metadata.durationMs
      );
      seekToMs(nextMs);
    },
    [currentTimeMs, metadata, seekToMs]
  );

  // Manual IN / OUT Marking
  const handleMarkIn = useCallback(() => {
    if (!metadata) return;
    const snapped = snapToFrame(currentTimeMs, metadata.fps, metadata.durationMs);
    setPendingInMs(snapped);
    setPreviewingClipId(null);
    showNotice('info', `IN Point ditandai pada ${formatTimecode(snapped)}. Tekan OUT untuk menutup klip.`);
  }, [currentTimeMs, metadata, showNotice]);

  const handleMarkOut = useCallback(() => {
    if (!metadata || pendingInMs === null) return;
    const snappedOut = snapToFrame(currentTimeMs, metadata.fps, metadata.durationMs);

    if (snappedOut <= pendingInMs) {
      showNotice(
        'error',
        `OUT Point (${formatTimecode(snappedOut)}) harus lebih besar daripada IN Point (${formatTimecode(pendingInMs)}).`
      );
      return;
    }

    const nextIndex = clips.length + 1;
    const newClip: Clip = {
      id: generateClipId(),
      name: `Clip ${String(nextIndex).padStart(3, '0')}`,
      inMs: pendingInMs,
      outMs: snappedOut,
      locked: false,
      createdAt: Date.now(),
    };

    setClips((prev) => [...prev, newClip]);
    setSelectedClipId(newClip.id);
    setPendingInMs(null);
    setHasUnsavedChanges(true);
    showNotice(
      'info',
      `${newClip.name} ditambahkan (${formatTimecode(newClip.inMs)} → ${formatTimecode(newClip.outMs)}).`
    );
  }, [clips.length, currentTimeMs, metadata, pendingInMs, showNotice]);

  // Manual Timecode Form Update or New Clip Creation
  const handleManualRangeApply = useCallback(
    (inMs: number, outMs: number): string | null => {
      if (!metadata) return 'Belum ada video sumber.';
      const snappedIn = snapToFrame(inMs, metadata.fps, metadata.durationMs);
      const snappedOut = snapToFrame(outMs, metadata.fps, metadata.durationMs);
      if (snappedIn >= snappedOut) {
        return 'IN Point harus lebih kecil daripada OUT Point.';
      }
      if (snappedOut > metadata.durationMs) {
        return 'OUT Point melebihi durasi video.';
      }

      if (selectedClipId && pendingInMs === null) {
        const target = clips.find((c) => c.id === selectedClipId);
        if (target?.locked) {
          return 'Klip ini sedang terkunci. Buka gembok untuk mengubah waktunya.';
        }
        setClips((prev) =>
          prev.map((c) =>
            c.id === selectedClipId ? { ...c, inMs: snappedIn, outMs: snappedOut } : c
          )
        );
        setHasUnsavedChanges(true);
        seekToMs(snappedIn);
        return null;
      }

      // Otherwise create a new clip from the entered IN/OUT
      const newClip: Clip = {
        id: generateClipId(),
        name: `Clip ${String(clips.length + 1).padStart(3, '0')}`,
        inMs: snappedIn,
        outMs: snappedOut,
        locked: false,
        createdAt: Date.now(),
      };
      setClips((prev) => [...prev, newClip]);
      setSelectedClipId(newClip.id);
      setPendingInMs(null);
      setHasUnsavedChanges(true);
      seekToMs(snappedIn);
      return null;
    },
    [clips, metadata, pendingInMs, seekToMs, selectedClipId]
  );

  // Clip Preview
  const handlePreviewClip = useCallback(
    (clip: Clip) => {
      const video = videoRef.current;
      if (!video || !videoUrl) return;
      setSelectedClipId(clip.id);
      setPreviewingClipId(clip.id);
      video.currentTime = clip.inMs / 1000;
      setCurrentTimeMs(clip.inMs);
      video.play().catch(() => {
        showNotice('error', 'Gagal memutar preview klip.');
      });
    },
    [showNotice, videoUrl]
  );

  const handleStopClipPreview = useCallback(() => {
    setPreviewingClipId(null);
  }, []);

  const handleJumpToEditClip = useCallback(
    (clip: Clip) => {
      setSelectedClipId(clip.id);
      setPendingInMs(null);
      setPreviewingClipId(null);
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
      seekToMs(clip.inMs);
    },
    [seekToMs]
  );

  // Clip Lock / Rename / Delete / Timeline Drag Update
  const handleToggleLock = useCallback((id: string) => {
    setClips((prev) =>
      prev.map((c) => (c.id === id ? { ...c, locked: !c.locked } : c))
    );
    setHasUnsavedChanges(true);
  }, []);

  const handleLockAll = useCallback(() => {
    setClips((prev) => prev.map((c) => ({ ...c, locked: true })));
    setHasUnsavedChanges(true);
  }, []);

  const handleUnlockAll = useCallback(() => {
    setClips((prev) => prev.map((c) => ({ ...c, locked: false })));
    setHasUnsavedChanges(true);
  }, []);

  const handleRenameClip = useCallback((id: string, name: string) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
    setHasUnsavedChanges(true);
  }, []);

  const handleDeleteClip = useCallback(
    (id: string) => {
      const target = clips.find((c) => c.id === id);
      if (target?.locked) {
        showNotice('error', 'Klip sedang terkunci. Buka gembok terlebih dahulu untuk menghapus.');
        return;
      }
      setClips((prev) => prev.filter((c) => c.id !== id));
      if (selectedClipId === id) setSelectedClipId(null);
      if (previewingClipId === id) setPreviewingClipId(null);
      setHasUnsavedChanges(true);
    },
    [clips, previewingClipId, selectedClipId, showNotice]
  );

  const handleUpdateClipBounds = useCallback(
    (id: string, inMs: number, outMs: number) => {
      if (!metadata) return;
      const target = clips.find((c) => c.id === id);
      if (!target || target.locked) return;
      const clampedIn = Math.max(0, Math.min(inMs, metadata.durationMs - 100));
      const clampedOut = Math.max(clampedIn + 100, Math.min(outMs, metadata.durationMs));
      setClips((prev) =>
        prev.map((c) => (c.id === id ? { ...c, inMs: clampedIn, outMs: clampedOut } : c))
      );
      setHasUnsavedChanges(true);
    },
    [clips, metadata]
  );

  // Keyboard shortcuts (Space, Left, Right, I, O)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (exportModalOpen || settingsModalOpen || confirmNewOpen) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!videoUrl || !metadata) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        stepFrame(-1);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        stepFrame(1);
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        handleMarkIn();
      } else if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        if (pendingInMs !== null) handleMarkOut();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    confirmNewOpen,
    exportModalOpen,
    handleMarkIn,
    handleMarkOut,
    metadata,
    pendingInMs,
    settingsModalOpen,
    stepFrame,
    togglePlay,
    videoUrl,
  ]);

  // Manual Save Project (NO Auto Save)
  const handleSaveProject = () => {
    const payload: ProjectFileData = {
      version: 1,
      appName: 'MANUAL BULK VIDEO CUTTER',
      projectName: projectName.trim() || 'Proyek Tanpa Judul',
      savedAt: new Date().toISOString(),
      sourceVideo: metadata
        ? {
            fileName: metadata.fileName,
            fileSize: metadata.fileSize,
            durationMs: metadata.durationMs,
            width: metadata.width,
            height: metadata.height,
            fps: metadata.fps,
            formatLabel: metadata.formatLabel,
          }
        : null,
      clips,
      frameSettings,
      resolution,
      editorSettings,
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const safeName = (projectName.trim() || 'proyek').replace(/[^a-zA-Z0-9_-]/g, '_');

    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.mbvc.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setHasUnsavedChanges(false);
    showNotice('info', `Proyek disimpan manual sebagai "${safeName}.mbvc.json".`);
  };

  // Manual Open Project
  const handleOpenProjectClick = () => {
    projectFileInputRef.current?.click();
  };

  const handleProjectFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ProjectFileData;
      if (parsed.appName !== 'MANUAL BULK VIDEO CUTTER' || !Array.isArray(parsed.clips)) {
        throw new Error('Format file proyek tidak dikenali.');
      }

      setProjectName(parsed.projectName || 'Proyek Dibuka');
      setClips(parsed.clips);
      setFrameSettings({
        ...DEFAULT_FRAME_SETTINGS,
        ...(parsed.frameSettings || {}),
        crop: {
          ...DEFAULT_FRAME_SETTINGS.crop,
          ...(parsed.frameSettings?.crop || {}),
        },
        textLayer: {
          ...DEFAULT_TEXT_LAYER,
          ...(parsed.frameSettings?.textLayer || {}),
        },
      });
      setResolution(parsed.resolution || 'original');
      setEditorSettings({ ...DEFAULT_EDITOR_SETTINGS, ...(parsed.editorSettings || {}) });
      setPendingInMs(null);
      setSelectedClipId(parsed.clips[0]?.id || null);
      setPreviewingClipId(null);
      setHasUnsavedChanges(false);

      // Check if current loaded video matches saved source video
      const savedSource = parsed.sourceVideo;
      const sameVideoLoaded =
        savedSource &&
        metadata &&
        metadata.fileName === savedSource.fileName &&
        metadata.fileSize === savedSource.fileSize;

      if (savedSource && !sameVideoLoaded) {
        // Clear mismatched video & ask user to relink
        setSourceFile(null);
        setVideoUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        setMetadata(null);
        setNeedsRelinkName(savedSource.fileName);
        showNotice(
          'info',
          `Proyek "${parsed.projectName}" dimuat (${parsed.clips.length} klip). Silakan pilih ulang file video sumber: ${savedSource.fileName}.`
        );
      } else {
        setNeedsRelinkName(null);
        showNotice('info', `Proyek "${parsed.projectName}" berhasil dibuka (${parsed.clips.length} klip).`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuka file proyek.';
      showNotice('error', msg);
    }
  };

  // New Project
  const resetProjectState = useCallback(async () => {
    await ffmpegEngine.cleanupSource();
    setProjectName('Proyek Potong Video');
    setSourceFile(null);
    setVideoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setMetadata(null);
    setVideoLoadError(null);
    setNeedsRelinkName(null);
    setIsPlaying(false);
    setCurrentTimeMs(0);
    setPendingInMs(null);
    setClips([]);
    setSelectedClipId(null);
    setPreviewingClipId(null);
    setFrameSettings({
      ...DEFAULT_FRAME_SETTINGS,
      crop: { ...DEFAULT_FRAME_SETTINGS.crop },
      textLayer: { ...DEFAULT_TEXT_LAYER },
    });
    setResolution('original');
    setHasUnsavedChanges(false);
    setConfirmNewOpen(false);
  }, []);

  const handleNewProject = () => {
    if (hasUnsavedChanges || clips.length > 0 || metadata) {
      setConfirmNewOpen(true);
    } else {
      resetProjectState();
    }
  };

  const layoutProps = {
    videoRef,
    videoUrl,
    metadata,
    isVideoLoading,
    videoLoadError,
    needsRelinkName,
    isPlaying,
    currentTimeMs,
    volume,
    isMuted,
    pendingInMs,
    clips,
    selectedClipId,
    previewingClipId,
    frameSettings,
    resolution,
    editorSettings,
    waveformStatus,
    onRetryWaveform: () => {
      if (sourceFile && metadata) {
        startWaveformAnalysis(sourceFile, metadata.durationMs);
      }
    },
    onFileSelected: handleFileSelected,
    onTimeUpdateMs: setCurrentTimeMs,
    onPlayStateChange: setIsPlaying,
    onFpsDetected: (fps: number) => {
      setMetadata((prev) => (prev ? { ...prev, fps, fpsDetected: true } : prev));
    },
    onFpsChange: (fps: number) => {
      setMetadata((prev) => (prev ? { ...prev, fps } : prev));
      setHasUnsavedChanges(true);
    },
    onTogglePlay: togglePlay,
    onStepFrame: stepFrame,
    onJumpSeconds: jumpSeconds,
    onSeekMs: seekToMs,
    onVolumeChange: (v: number) => {
      setVolume(v);
      if (v > 0 && isMuted) setIsMuted(false);
    },
    onToggleMute: () => setIsMuted((m) => !m),
    onMarkIn: handleMarkIn,
    onMarkOut: handleMarkOut,
    onCancelPendingIn: () => setPendingInMs(null),
    onManualRangeApply: handleManualRangeApply,
    onSelectClip: (id: string) => setSelectedClipId(id),
    onPreviewClip: handlePreviewClip,
    onStopClipPreview: handleStopClipPreview,
    onJumpToEditClip: handleJumpToEditClip,
    onToggleLock: handleToggleLock,
    onLockAll: handleLockAll,
    onUnlockAll: handleUnlockAll,
    onRenameClip: handleRenameClip,
    onDeleteClip: handleDeleteClip,
    onUpdateClipBounds: handleUpdateClipBounds,
    onFrameSettingsChange: (next: FrameSettingsState) => {
      setFrameSettings(next);
      setHasUnsavedChanges(true);
    },
    onResetFrameSettings: () => {
      setFrameSettings({
        ...DEFAULT_FRAME_SETTINGS,
        crop: { ...DEFAULT_FRAME_SETTINGS.crop },
        textLayer: { ...DEFAULT_TEXT_LAYER },
      });
      setHasUnsavedChanges(true);
    },
    onResolutionChange: (res: ResolutionPreset) => {
      setResolution(res);
      setHasUnsavedChanges(true);
    },
    onOpenExport: () => setExportModalOpen(true),
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0D11] text-[#F1F5F9]">
      {/* Hidden Project JSON Input */}
      <input
        ref={projectFileInputRef}
        type="file"
        accept=".json,.mbvc.json,application/json"
        onChange={handleProjectFileChosen}
        className="hidden"
      />

      <TopBar
        projectName={projectName}
        onProjectNameChange={(name) => {
          setProjectName(name);
          setHasUnsavedChanges(true);
        }}
        hasUnsavedChanges={hasUnsavedChanges}
        clipCount={clips.length}
        hasVideo={Boolean(sourceFile && metadata)}
        isExporting={isExportRunning}
        onNewProject={handleNewProject}
        onSaveProject={handleSaveProject}
        onOpenProject={handleOpenProjectClick}
        onOpenSettings={() => setSettingsModalOpen(true)}
        onExportAll={() => setExportModalOpen(true)}
      />

      {/* Feedback Banner */}
      {notice && (
        <div
          role="status"
          className={`mx-3 mt-2 px-3 py-2 rounded-lg border text-xs flex items-center justify-between gap-2 ${
            notice.type === 'error'
              ? 'bg-red-950/60 border-red-700/60 text-red-200'
              : 'bg-[#142033] border-blue-700/50 text-blue-100'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {notice.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
            )}
            <span className="truncate">{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Tutup Notifikasi"
            className="text-slate-400 hover:text-white shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Responsive Workspace */}
      {isMobileViewport ? (
        <MobileLayout {...layoutProps} />
      ) : (
        <DesktopLayout {...layoutProps} />
      )}

      {/* Modals */}
      <ExportManager
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        sourceFile={sourceFile}
        metadata={metadata}
        clips={clips}
        frameSettings={frameSettings}
        resolution={resolution}
        editorSettings={editorSettings}
        onUpdateEditorSettings={(patch) => {
          setEditorSettings((prev) => ({ ...prev, ...patch }));
          setHasUnsavedChanges(true);
        }}
        onExportRunningChange={setIsExportRunning}
      />

      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        settings={editorSettings}
        onSaveSettings={(next) => {
          setEditorSettings(next);
          setHasUnsavedChanges(true);
        }}
      />

      <ConfirmNewProjectModal
        isOpen={confirmNewOpen}
        onCancel={() => setConfirmNewOpen(false)}
        onConfirm={resetProjectState}
      />
    </div>
  );
}
