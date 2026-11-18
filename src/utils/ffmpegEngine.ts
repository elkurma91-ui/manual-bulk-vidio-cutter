import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import type {
  Clip,
  EncoderPreset,
  ExportMode,
  FrameSettingsState,
  ResolutionPreset,
  VideoMetadata,
} from '../types/editor';
import {
  buildClipFFmpegArgs,
  computeTargetDimensions,
  resolveExportPlan,
  type ResolvedExportPlan,
  type TargetDimensions,
} from './ffmpegPlan';

export { computeTargetDimensions, resolveExportPlan };
export type { ResolvedExportPlan, TargetDimensions };

class FFmpegWorkerEngine {
  private ffmpeg: FFmpeg | null = null;
  private loadingPromise: Promise<FFmpeg> | null = null;
  private mountedFile: File | null = null;
  private mountedPath: string | null = null;
  private fallbackWrittenPath: string | null = null;

  public isLoaded(): boolean {
    return Boolean(this.ffmpeg?.loaded);
  }

  public async ensureLoaded(onStatus?: (msg: string) => void): Promise<FFmpeg> {
    if (this.ffmpeg && this.ffmpeg.loaded) {
      return this.ffmpeg;
    }
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = (async () => {
      onStatus?.('Memuat mesin FFmpeg WebAssembly (0.12.10 single-thread)...');
      const instance = new FFmpeg();
      const baseURL = `${window.location.origin}/ffmpeg`;
      await instance.load({
        coreURL: `${baseURL}/ffmpeg-core.js`,
        wasmURL: `${baseURL}/ffmpeg-core.wasm`,
      });
      this.ffmpeg = instance;
      return instance;
    })();

    try {
      return await this.loadingPromise;
    } catch (err) {
      this.loadingPromise = null;
      throw err;
    }
  }

  public async mountSourceFile(file: File): Promise<string> {
    const ffmpeg = await this.ensureLoaded();

    if (this.mountedFile === file && this.mountedPath) {
      return this.mountedPath;
    }

    await this.cleanupSource();

    // Zero-copy WORKERFS mount: reads slices directly from File handle without loading multi-GB file into WASM heap
    try {
      try {
        await ffmpeg.createDir('/work');
      } catch {
        // Directory may already exist
      }
      await ffmpeg.mount('WORKERFS' as Parameters<FFmpeg['mount']>[0], { files: [file] }, '/work');
      this.mountedFile = file;
      this.mountedPath = `/work/${file.name}`;
      return this.mountedPath;
    } catch (mountErr) {
      if (file.size <= 350 * 1024 * 1024) {
        const ext = file.name.split('.').pop() || 'mp4';
        const memPath = `/input_source.${ext}`;
        const bytes = await fetchFile(file);
        await ffmpeg.writeFile(memPath, bytes);
        this.mountedFile = file;
        this.fallbackWrittenPath = memPath;
        this.mountedPath = memPath;
        return memPath;
      }
      throw new Error(
        `Browser gagal memasang file besar via WORKERFS (${mountErr instanceof Error ? mountErr.message : String(mountErr)}). File > 350 MB tidak dapat disalin ke RAM WASM.`
      );
    }
  }

  public async cleanupSource(): Promise<void> {
    if (!this.ffmpeg || !this.ffmpeg.loaded) return;
    if (this.mountedPath && this.mountedPath.startsWith('/work/')) {
      try {
        await this.ffmpeg.unmount('/work');
      } catch {
        // ignore
      }
    }
    if (this.fallbackWrittenPath) {
      try {
        await this.ffmpeg.deleteFile(this.fallbackWrittenPath);
      } catch {
        // ignore
      }
    }
    this.mountedFile = null;
    this.mountedPath = null;
    this.fallbackWrittenPath = null;
  }

  public terminate(): void {
    if (this.ffmpeg) {
      this.ffmpeg.terminate();
      this.ffmpeg = null;
    }
    this.loadingPromise = null;
    this.mountedFile = null;
    this.mountedPath = null;
    this.fallbackWrittenPath = null;
  }

  public async exportSingleClip(params: {
    file: File;
    metadata: VideoMetadata;
    clip: Clip;
    outputFileName: string;
    frameSettings: FrameSettingsState;
    resolution: ResolutionPreset;
    exportMode: ExportMode;
    encoderPreset: EncoderPreset;
    encoderCrf: number;
    overlayPng?: Uint8Array | null;
    onProgress: (percent: number) => void;
    onLog?: (line: string) => void;
  }): Promise<{
    data: Uint8Array;
    width: number;
    height: number;
    strategy: ResolvedExportPlan['effectiveStrategy'];
  }> {
    const {
      file,
      metadata,
      clip,
      outputFileName,
      frameSettings,
      resolution,
      exportMode,
      encoderPreset,
      encoderCrf,
      overlayPng,
      onProgress,
      onLog,
    } = params;

    const ffmpeg = await this.ensureLoaded();
    const inputPath = await this.mountSourceFile(file);
    const outPath = `/out_${clip.id.replace(/[^a-zA-Z0-9]/g, '')}.mp4`;
    let overlayPath: string | undefined;
    if (overlayPng && overlayPng.byteLength > 0) {
      overlayPath = '/overlay_layer.png';
      await ffmpeg.writeFile(overlayPath, overlayPng);
    }

    const durationMs = Math.max(100, clip.outMs - clip.inMs);
    const { args, plan } = buildClipFFmpegArgs({
      inputPath,
      outPath,
      overlayInputPath: overlayPath,
      clip,
      metadata,
      frameSettings,
      resolution,
      exportMode,
      encoderPreset,
      encoderCrf,
      videoCodec: 'libx264',
      threads: 0,
    });

    const handleProgress = ({ progress, time }: { progress: number; time: number }) => {
      let pct = 0;
      if (Number.isFinite(progress) && progress > 0 && progress <= 1) {
        pct = Math.round(progress * 100);
      } else if (Number.isFinite(time) && time > 0) {
        const processedMs = time / 1000;
        pct = Math.min(99, Math.round((processedMs / durationMs) * 100));
      }
      onProgress(Math.max(1, Math.min(99, pct)));
    };

    const handleLog = ({ message }: { message: string }) => {
      onLog?.(message);
    };

    ffmpeg.on('progress', handleProgress);
    ffmpeg.on('log', handleLog);

    try {
      const exitCode = await ffmpeg.exec(args);
      if (exitCode !== 0) {
        throw new Error(`FFmpeg keluar dengan kode ${exitCode} saat memproses ${outputFileName}.`);
      }

      const raw = await ffmpeg.readFile(outPath);
      const data = raw instanceof Uint8Array ? raw : new TextEncoder().encode(raw);
      if (data.byteLength < 1024) {
        throw new Error(`Output ${outputFileName} terlalu kecil/kosong (${data.byteLength} bytes).`);
      }

      onProgress(100);
      return {
        data,
        width: plan.width,
        height: plan.height,
        strategy: plan.effectiveStrategy,
      };
    } finally {
      ffmpeg.off('progress', handleProgress);
      ffmpeg.off('log', handleLog);
      try {
        await ffmpeg.deleteFile(outPath);
      } catch {
        // ignore cleanup errors
      }
      if (overlayPath) {
        try {
          await ffmpeg.deleteFile(overlayPath);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }
}

export const ffmpegEngine = new FFmpegWorkerEngine();
