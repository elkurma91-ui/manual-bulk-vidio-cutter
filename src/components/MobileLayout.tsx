import React, { useState } from 'react';
import { Scissors, ListVideo, Crop, SlidersHorizontal, Download } from 'lucide-react';
import type { WorkspaceLayoutProps } from './DesktopLayout';
import { VideoUploader } from './VideoUploader';
import { VideoMonitor } from './VideoMonitor';
import { PlaybackControls } from './PlaybackControls';
import { InOutControlPanel, TimeInfoPanel } from './TimecodeDisplay';
import { ClipList } from './ClipList';
import { FrameSettings } from './FrameSettings';
import { ResolutionSettings } from './ResolutionSettings';
import { TimelineEditor } from './TimelineEditor';

type MobileTab = 'cut' | 'clips' | 'frame' | 'export';

export const MobileLayout: React.FC<WorkspaceLayoutProps> = (props) => {
  const [activeTab, setActiveTab] = useState<MobileTab>('cut');

  const selectedClip = props.clips.find((c) => c.id === props.selectedClipId) || null;
  const previewClip = props.clips.find((c) => c.id === props.previewingClipId) || null;

  return (
    <div className="flex-1 flex flex-col min-h-0 pb-16">
      {/* Scrollable Mobile Content Area */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
        {!props.videoUrl || !props.metadata ? (
          <VideoUploader
            metadata={null}
            isLoading={props.isVideoLoading}
            loadError={props.videoLoadError}
            needsRelinkName={props.needsRelinkName}
            onFileSelected={props.onFileSelected}
          />
        ) : (
          <>
            {/* 1. Video Monitor (stays visible on Cut & Frame tabs) */}
            {(activeTab === 'cut' || activeTab === 'frame') && (
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
                compact
              />
            )}

            {activeTab === 'cut' && (
              <div className="space-y-2.5">
                {/* 2. Professional Timeline with Audio Waveform directly below Video Monitor */}
                <TimelineEditor
                  durationMs={props.metadata.durationMs}
                  currentTimeMs={props.currentTimeMs}
                  fps={props.metadata.fps}
                  clips={props.clips}
                  selectedClipId={props.selectedClipId}
                  pendingInMs={props.pendingInMs}
                  waveformStatus={props.waveformStatus}
                  onRetryWaveform={props.onRetryWaveform}
                  onSeekMs={props.onSeekMs}
                  onSelectClip={props.onSelectClip}
                  onUpdateClipBounds={props.onUpdateClipBounds}
                  compact
                />

                {/* 3. Playback Controls & Thumb-Friendly IN / OUT */}
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
                  mobile
                />

                {/* 4. Time Information Panel (2x2 compact grid) */}
                <TimeInfoPanel
                  currentTimeMs={props.currentTimeMs}
                  durationMs={props.metadata.durationMs}
                  fps={props.metadata.fps}
                  fpsDetected={props.metadata.fpsDetected}
                  onFpsChange={props.onFpsChange}
                  compact
                />

                {/* 5. IN/OUT Control Panel */}
                <InOutControlPanel
                  currentTimeMs={props.currentTimeMs}
                  durationMs={props.metadata.durationMs}
                  pendingInMs={props.pendingInMs}
                  activeClipInMs={selectedClip ? selectedClip.inMs : null}
                  activeClipOutMs={selectedClip ? selectedClip.outMs : null}
                  activeClipName={selectedClip ? selectedClip.name : null}
                  isSelectedClipLocked={Boolean(selectedClip?.locked)}
                  onSeekMs={props.onSeekMs}
                  onManualRangeApply={props.onManualRangeApply}
                  compact
                />

                {/* 6. Clip List directly below Timeline */}
                <div className="bg-[#11151D] border border-[#232A38] rounded-lg p-3">
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
                  />
                </div>
              </div>
            )}

            {activeTab === 'clips' && (
              <div className="space-y-2.5">
                <TimeInfoPanel
                  currentTimeMs={props.currentTimeMs}
                  durationMs={props.metadata.durationMs}
                  fps={props.metadata.fps}
                  fpsDetected={props.metadata.fpsDetected}
                  onFpsChange={props.onFpsChange}
                  compact
                />

                <InOutControlPanel
                  currentTimeMs={props.currentTimeMs}
                  durationMs={props.metadata.durationMs}
                  pendingInMs={props.pendingInMs}
                  activeClipInMs={selectedClip ? selectedClip.inMs : null}
                  activeClipOutMs={selectedClip ? selectedClip.outMs : null}
                  activeClipName={selectedClip ? selectedClip.name : null}
                  isSelectedClipLocked={Boolean(selectedClip?.locked)}
                  onSeekMs={props.onSeekMs}
                  onManualRangeApply={props.onManualRangeApply}
                  compact
                />

                <div className="bg-[#11151D] border border-[#232A38] rounded-lg p-3 min-h-[280px]">
                  <ClipList
                    clips={props.clips}
                    selectedClipId={props.selectedClipId}
                    previewingClipId={props.previewingClipId}
                    onSelectClip={props.onSelectClip}
                    onPreviewClip={(clip) => {
                      props.onPreviewClip(clip);
                      setActiveTab('cut');
                    }}
                    onJumpToEditClip={(clip) => {
                      props.onJumpToEditClip(clip);
                      setActiveTab('cut');
                    }}
                    onToggleLock={props.onToggleLock}
                    onLockAll={props.onLockAll}
                    onUnlockAll={props.onUnlockAll}
                    onRenameClip={props.onRenameClip}
                    onDeleteClip={props.onDeleteClip}
                  />
                </div>
              </div>
            )}

            {activeTab === 'frame' && (
              <div className="bg-[#11151D] border border-[#232A38] rounded-lg p-3">
                <FrameSettings
                  frameSettings={props.frameSettings}
                  resolution={props.resolution}
                  metadata={props.metadata}
                  onChange={props.onFrameSettingsChange}
                  onReset={props.onResetFrameSettings}
                />
              </div>
            )}

            {activeTab === 'export' && (
              <div className="space-y-3">
                <VideoUploader
                  metadata={props.metadata}
                  isLoading={props.isVideoLoading}
                  loadError={props.videoLoadError}
                  needsRelinkName={props.needsRelinkName}
                  onFileSelected={props.onFileSelected}
                  compact
                />

                <div className="bg-[#11151D] border border-[#232A38] rounded-lg p-3">
                  <h3 className="text-xs font-semibold text-white mb-2">Resolusi Output</h3>
                  <ResolutionSettings
                    resolution={props.resolution}
                    frameSettings={props.frameSettings}
                    metadata={props.metadata}
                    onChange={props.onResolutionChange}
                  />
                </div>

                <button
                  type="button"
                  disabled={props.clips.length === 0}
                  onClick={props.onOpenExport}
                  className="w-full min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-[#1F2633] disabled:text-slate-500 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>POTONG SEMUA ({props.clips.length} Klip MP4)</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Fixed Bottom Mobile Tab Bar (compact 56px, thumb-zone friendly) */}
      <nav
        aria-label="Navigasi Mobile"
        className="fixed bottom-0 left-0 right-0 z-30 h-14 bg-[#11151D]/95 backdrop-blur-md border-t border-[#232A38] grid grid-cols-4 items-center"
      >
        <button
          type="button"
          onClick={() => setActiveTab('cut')}
          className={`h-full flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            activeTab === 'cut' ? 'text-blue-400' : 'text-slate-400'
          }`}
        >
          <Scissors className="w-5 h-5" />
          <span className="text-[10px] font-medium">Cut</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('clips')}
          className={`h-full flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            activeTab === 'clips' ? 'text-blue-400' : 'text-slate-400'
          }`}
        >
          <ListVideo className="w-5 h-5" />
          <span className="text-[10px] font-medium">Klip ({props.clips.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('frame')}
          className={`h-full flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            activeTab === 'frame' ? 'text-blue-400' : 'text-slate-400'
          }`}
        >
          <Crop className="w-5 h-5" />
          <span className="text-[10px] font-medium">Template</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('export')}
          className={`h-full flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            activeTab === 'export' ? 'text-blue-400' : 'text-slate-400'
          }`}
        >
          <SlidersHorizontal className="w-5 h-5" />
          <span className="text-[10px] font-medium">Ekspor</span>
        </button>
      </nav>
    </div>
  );
};
