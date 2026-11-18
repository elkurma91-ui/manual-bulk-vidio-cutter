export type AspectRatioPreset = 'original' | '9:16' | '16:9' | '1:1' | '4:5' | 'custom';

export type ResolutionPreset = 'original' | '720p' | '1080p' | '1440p' | '2160p';

export type FitMode = 'fit' | 'fill';

export type BackgroundType = 'color' | 'blur';

export type ExportMode = 'smart' | 'fast' | 'accurate';

export type EncoderPreset = 'ultrafast' | 'superfast' | 'veryfast' | 'faster';

export type ExportBackend = 'wasm' | 'native';

export interface NativeCapabilities {
  available: boolean;
  isLocalhost: boolean;
  ffmpegVersion: string | null;
  cpuCores: number;
  freeMemoryMb: number;
  totalMemoryMb: number;
  recommendedConcurrency: number;
  hardwareEncoders: {
    name: string;
    label: string;
    supported: boolean;
  }[];
  activeHardwareEncoder: string | null;
}

export interface VideoMetadata {
  fileName: string;
  fileSize: number;
  mimeType: string;
  formatLabel: string;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  fpsDetected: boolean;
  lastModified: number;
}

export interface Clip {
  id: string;
  name: string;
  inMs: number;
  outMs: number;
  locked: boolean;
  createdAt: number;
}

export interface CropEdges {
  top: number;    // 0 to 40 (%)
  right: number;  // 0 to 40 (%)
  bottom: number; // 0 to 40 (%)
  left: number;   // 0 to 40 (%)
}

export interface TextOverlayLayer {
  enabled: boolean;
  text: string;
  fontSize: number; // relative to 1080p short-side, 24..96
  color: string;
  bgColor: string;
  bgOpacity: number; // 0..1
  position: 'top' | 'center' | 'bottom';
  offsetY: number; // -20..20 (% adjustment)
}

export interface FrameSettingsState {
  aspectRatio: AspectRatioPreset;
  customRatioW: number;
  customRatioH: number;
  fitMode: FitMode;
  zoom: number;       // 0.25 to 3.0
  posX: number;       // -100 to 100 (% of frame width)
  posY: number;       // -100 to 100 (% of frame height)
  rotate: 0 | 90 | 180 | 270;
  crop: CropEdges;
  bgType: BackgroundType;
  bgColor: string;
  blurIntensity: number; // 8 to 40
  videoVisible?: boolean;
  bgVisible?: boolean;
  textLayer?: TextOverlayLayer;
  appliedToAll: boolean;
}

export interface EditorSettings {
  defaultFps: number;
  seekStepSeconds: number;
  exportMode: ExportMode;
  encoderPreset: EncoderPreset;
  encoderCrf: number;
  threads: number; // 0 = auto
  backend: ExportBackend;
  filenamePrefix: string;
}

export type ClipExportState =
  | 'queued'
  | 'processing'
  | 'saved_folder'
  | 'downloaded'
  | 'error'
  | 'cancelled';

export interface ExportClipItem {
  clipId: string;
  clipName: string;
  outputFileName: string;
  inMs: number;
  outMs: number;
  durationMs: number;
  targetWidth: number;
  targetHeight: number;
  resolvedMethod?: 'fast_copy' | 'accurate_direct' | 'accurate_filter';
  status: ClipExportState;
  progress: number; // 0..100
  errorMessage?: string;
  blobUrl?: string;
  outputSizeBytes?: number;
}

export interface ProjectFileData {
  version: 1;
  appName: 'MANUAL BULK VIDEO CUTTER';
  projectName: string;
  savedAt: string;
  sourceVideo: {
    fileName: string;
    fileSize: number;
    durationMs: number;
    width: number;
    height: number;
    fps: number;
    formatLabel: string;
  } | null;
  clips: Clip[];
  frameSettings: FrameSettingsState;
  resolution: ResolutionPreset;
  editorSettings: EditorSettings;
}

export interface WaveformData {
  key: string;
  durationMs: number;
  channels: 1 | 2;
  bucketCount: number;
  hasAudio: boolean;
  leftMin: Int8Array;
  leftMax: Int8Array;
  leftRms: Uint8Array;
  rightMin?: Int8Array;
  rightMax?: Int8Array;
  rightRms?: Uint8Array;
}

export type WaveformStatus =
  | { state: 'idle' }
  | { state: 'loading'; progress: number; message: string }
  | { state: 'ready'; data: WaveformData }
  | { state: 'silent' }
  | { state: 'paused'; message: string }
  | { state: 'error'; message: string };

