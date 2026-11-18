import React, { useState } from 'react';
import { Crop, Monitor, Info } from 'lucide-react';
import type {
  Clip,
  EditorSettings,
  FrameSettingsState,
  ResolutionPreset,
  VideoMetadata,
  WaveformStatus,
} from '../types/editor';
import { VideoUploader } from './VideoUploader';
import { VideoMonitor } from './VideoMonitor';
import { PlaybackControls } from './PlaybackControls';
import { InOutControlPanel, TimeInfoPanel } from './TimecodeDisplay';
import { ClipList } from './ClipList';
import { FrameSettings } from './FrameSettings';
import { ResolutionSettings } from './ResolutionSettings';
import { TimelineEditor } from './TimelineEditor';

export interface WorkspaceLayoutProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoUrl: string | null;
  metadata: VideoMetadata | null;
  isVideoLoading: boolean;
  videoLoadError: string | null;
  needsRelinkName: string | null;
  isPlaying: boolean;
  currentTimeMs: number;
  volume: number;
  isMuted: boolean;
  pendingInMs: number | null;
  clips: Clip[];
  selectedClipId: string | null;
  previewingClipId: string | null;
  frameSettings: FrameSettingsState;
  resolution: ResolutionPreset;
  editorSettings: EditorSettings;
  waveformStatus: WaveformStatus;
  onRetryWaveform: () => void;
  onFileSelected: (file: File) => void;
  onTimeUpdateMs: (ms: number) => void;
  onPlayStateChange: (playing: boolean) => void;
  onFpsDetected: (fps: number) => void;
  onFpsChange: (fps: number) => void;
  onTogglePlay: () => void;
  onStepFrame: (dir: -1 | 1) => void;
  onJumpSeconds: (deltaSec: number) => void;
  onSeekMs: (ms: number) => void;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  onMarkIn: () => void;
  onMarkOut: () => void;
  onCancelPendingIn: () => void;
  onManualRangeApply: (inMs: number, outMs: number) => string | null;
  onSelectClip: (id: string) => void;
  onPreviewClip: (clip: Clip) => void;
  onStopClipPreview: () => void;
  onJumpToEditClip: (clip: Clip) => void;
  onToggleLock: (id: string) => void;
  onLockAll: () => void;
  onUnlockAll: () => void;
  onRenameClip: (id: string, name: string) => void;
  onDeleteClip: (id: string) => void;
  onUpdateClipBounds: (id: string, inMs: number, outMs: number) => void;
  onFrameSettingsChange: (next: FrameSettingsState) => void;
  onResetFrameSettings: () => void;
  onResolutionChange: (res: ResolutionPreset) => void;
  onOpenExport: () => void;
}

type DesktopInspectorTab = 'frame' | 'resolution' | 'source';

export const DesktopLayout: React.FC<WorkspaceLayoutProps> = (props) => {
  const [activeTab, setActiveTab] = useState<DesktopInspectorTab>('frame');

  const selectedClip = props.clips.find((c) => c.id === props.selectedClipId) || null;
  const previewClip = props.clips.find((c) => c.id === props.previewingClipId) || null;

  return (
    <div className="flex-1 flex flex-col min-h-0 p-2.5 lg:p-3 gap-2.5 max-w-[1920px] w-full mx-auto">
      {/* 1. Video Monitor + 2. Playback Controls + Right Frame/Res/Source Inspector */}
      <div className="grid grid-cols-12 gap-2.5 items-stretch">
        <div className="col-span-12 lg:col-span-8 xl:col-span-9 flex flex-col gap-2 min-h-0">
          {!props.videoUrl || !props.metadata ? (
            <div className="min-h-[300px] lg:h-[360px] bg-[#0D1017] border border-[#232A38] rounded-lg flex items-center justify-center">
              <VideoUploader
                metadata={null}
                isLoading={props.isVideoLoading}
                loadError={props.videoLoadError}
                needsRelinkName={props.needsRelinkName}
                onFileSelected={props.onFileSelected}
              />
            </div>
          ) : (
            <>
              {/* 1. Video Monitor */}
              <VideoMonitor
                videoRef={props.videoRef}
                videoUrl={props.videoUrl}
                metadata={props.metadata}
                frameSettings={props.frameSettings}
                resolution={props.resolution}
                previewClipRange={
                  previewClip
                    ? { name: previewClip.name, inMs: previewClip.inMs, outMs: previewClip.outMs }
                    : null
                }
                onTimeUpdateMs={props.onTimeUpdateMs}
                onPlayStateChange={props.onPlayStateChange}
                onFpsDetected={props.onFpsDetected}
                onPositionChange={(posX, posY) =>
                  props.onFrameSettingsChange({ ...props.frameSettings, posX, posY })
                }
                onStopClipPreview={props.onStopClipPreview}
              />

              {/* 2. Professional Timeline with Real Audio Waveform directly below Monitor */}
              <TimelineEditor
                durationMs={props.metadata.durationMs}
                currentTimeMs={props.currentTimeMs}
                fps={props.metadata.fps || props.editorSettings.defaultFps}
                clips={props.clips}
                selectedClipId={props.selectedClipId}
                pendingInMs={props.pendingInMs}
                waveformStatus={props.waveformStatus}
                onRetryWaveform={props.onRetryWaveform}
                onSeekMs={props.onSeekMs}
                onSelectClip={props.onSelectClip}
                onUpdateClipBounds={props.onUpdateClipBounds}
              />

              {/* 3. Playback Controls */}
              <PlaybackControls
                isPlaying={props.isPlaying}
                currentTimeMs={props.currentTimeMs}
                durationMs={props.metadata.durationMs}
                volume={props.volume}
                isMuted={props.isMuted}
                seekStepSeconds={props.editorSettings.seekStepSeconds}
                pendingInMs={props.pendingInMs}
                isPreviewingClip={Boolean(previewClip)}
                onTogglePlay={props.onTogglePlay}
                onStepFrame={props.onStepFrame}
                onJumpSeconds={props.onJumpSeconds}
                onSeekMs={props.onSeekMs}
                onVolumeChange={props.onVolumeChange}
                onToggleMute={props.onToggleMute}
                onMarkIn={props.onMarkIn}
                onMarkOut={props.onMarkOut}
                onCancelPendingIn={props.onCancelPendingIn}
              />
            </>
          )}
        </div>

        {/* Right Compact Inspector Sidebar (Template, Resolusi, Sumber) matching Monitor+Timeline+Playback height */}
        <aside className="col-span-12 lg:col-span-4 xl:col-span-3 bg-[#11151D] border border-[#232A38] rounded-lg flex flex-col min-h-[260px] lg:max-h-[615px] xl:max-h-[655px]">
          <div className="p-1.5 border-b border-[#232A38] grid grid-cols-3 gap-1 bg-[#0D1017] rounded-t-lg shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('frame')}
              className={`py-1.5 px-1.5 rounded text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'frame'
                  ? 'bg-[#1D2536] text-white border border-[#2E3A52]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Crop className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>Template</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('resolution')}
              className={`py-1.5 px-1.5 rounded text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'resolution'
                  ? 'bg-[#1D2536] text-white border border-[#2E3A52]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Monitor className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>Resolusi</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('source')}
              className={`py-1.5 px-1.5 rounded text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'source'
                  ? 'bg-[#1D2536] text-white border border-[#2E3A52]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>Sumber</span>
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {activeTab === 'frame' && (
              <FrameSettings
                frameSettings={props.frameSettings}
                resolution={props.resolution}
                metadata={props.metadata}
                onChange={props.onFrameSettingsChange}
                onReset={props.onResetFrameSettings}
              />
            )}

            {activeTab === 'resolution' && (
              <ResolutionSettings
                resolution={props.resolution}
                frameSettings={props.frameSettings}
                metadata={props.metadata}
                onChange={props.onResolutionChange}
              />
            )}

            {activeTab === 'source' && (
              <VideoUploader
                metadata={props.metadata}
                isLoading={props.isVideoLoading}
                loadError={props.videoLoadError}
                needsRelinkName={props.needsRelinkName}
                onFileSelected={props.onFileSelected}
                compact
              />
            )}
          </div>
        </aside>
      </div>

      {/* 4. Time Information Panel (Single-row 4-column readout) */}
      <TimeInfoPanel
        currentTimeMs={props.currentTimeMs}
        durationMs={props.metadata?.durationMs || 0}
        fps={props.metadata?.fps || props.editorSettings.defaultFps}
        fpsDetected={Boolean(props.metadata?.fpsDetected)}
        onFpsChange={props.onFpsChange}
      />

      {/* 5. IN / OUT Control Panel */}
      <InOutControlPanel
        currentTimeMs={props.currentTimeMs}
        durationMs={props.metadata?.durationMs || 0}
        pendingInMs={props.pendingInMs}
        activeClipInMs={selectedClip ? selectedClip.inMs : null}
        activeClipOutMs={selectedClip ? selectedClip.outMs : null}
        activeClipName={selectedClip ? selectedClip.name : null}
        isSelectedClipLocked={Boolean(selectedClip?.locked)}
        onSeekMs={props.onSeekMs}
        onManualRangeApply={props.onManualRangeApply}
      />

      {/* 6. Clip List Panel directly beneath Timeline */}
      <section
        aria-label="Panel Pengelolaan Klip"
        className="bg-[#11151D] border border-[#232A38] rounded-lg p-3"
      >
        <ClipList
          clips={props.clips}
          selectedClipId={props.selectedClipId}
          previewingClipId={props.previewingClipId}
          onSelectClip={props.onSelectClip}
          onPreviewClip={props.onPreviewClip}
          onJumpToEditClip={props.onJumpToEditClip}
          onToggleLock={props.onToggleLock}
          onLockAll={props.onLockAll}
          onUnlockAll={props.onUnlockAll}
          onRenameClip={props.onRenameClip}
          onDeleteClip={props.onDeleteClip}
          gridLayout
        />
      </section>
    </div>
  );
};
