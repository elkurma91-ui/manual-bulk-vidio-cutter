import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import type { WaveformData, WaveformStatus } from '../types/editor';

const MAX_CACHED_WAVEFORMS = 3;
const waveformCache = new Map<string, WaveformData>();

let activeWorker: FFmpeg | null = null;
let activeJobToken = 0;

export function getFileWaveformKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function getCachedWaveform(file: File): WaveformData | null {
  return waveformCache.get(getFileWaveformKey(file)) || null;
}

function setCachedWaveform(key: string, data: WaveformData): void {
  if (waveformCache.has(key)) {
    waveformCache.delete(key);
  }
  waveformCache.set(key, data);
  while (waveformCache.size > MAX_CACHED_WAVEFORMS) {
    const oldest = waveformCache.keys().next().value;
    if (oldest) waveformCache.delete(oldest);
    else break;
  }
}

export function abortWaveformExtraction(): void {
  activeJobToken++;
  if (activeWorker) {
    try {
      activeWorker.terminate();
    } catch {
      // ignore
    }
    activeWorker = null;
  }
}

function chooseBucketCount(durationMs: number): number {
  const sec = Math.max(1, durationMs / 1000);
  // 8 buckets/sec for shorter videos, capped at 12,000 buckets for 60+ min videos (~48 KB RAM)
  return Math.max(1200, Math.min(12000, Math.round(sec * 8)));
}

function downsampleSigned8Pcm(
  pcmBytes: Uint8Array,
  detectedMono: boolean,
  durationMs: number,
  key: string
): WaveformData {
  const bucketCount = chooseBucketCount(durationMs);
  const frameCount = Math.floor(pcmBytes.byteLength / 2); // 2 channels interleaved s8: [L, R, L, R...]

  const leftMin = new Int8Array(bucketCount);
  const leftMax = new Int8Array(bucketCount);
  const leftRms = new Uint8Array(bucketCount);
  const rightMin = new Int8Array(bucketCount);
  const rightMax = new Int8Array(bucketCount);
  const rightRms = new Uint8Array(bucketCount);

  if (frameCount <= 0) {
    return {
      key,
      durationMs,
      channels: 1,
      bucketCount,
      hasAudio: false,
      leftMin,
      leftMax,
      leftRms,
    };
  }

  let maxChannelDelta = 0;
  let globalMaxAbs = 0;

  for (let b = 0; b < bucketCount; b++) {
    const startFrame = Math.floor((b * frameCount) / bucketCount);
    const endFrame = Math.max(startFrame + 1, Math.floor(((b + 1) * frameCount) / bucketCount));

    let lMin = 127;
    let lMax = -128;
    let lSqSum = 0;
    let rMin = 127;
    let rMax = -128;
    let rSqSum = 0;
    let count = 0;

    // Stride if a single bucket contains huge sample count
    const span = endFrame - startFrame;
    const step = span > 64 ? Math.floor(span / 64) : 1;

    for (let f = startFrame; f < endFrame; f += step) {
      const idx = f * 2;
      const rawL = pcmBytes[idx];
      const rawR = pcmBytes[idx + 1];
      const l = rawL > 127 ? rawL - 256 : rawL;
      const r = rawR > 127 ? rawR - 256 : rawR;

      if (l < lMin) lMin = l;
      if (l > lMax) lMax = l;
      lSqSum += l * l;

      if (r < rMin) rMin = r;
      if (r > rMax) rMax = r;
      rSqSum += r * r;

      const chDelta = Math.abs(l - r);
      if (chDelta > maxChannelDelta) maxChannelDelta = chDelta;
      const absMax = Math.max(Math.abs(l), Math.abs(r));
      if (absMax > globalMaxAbs) globalMaxAbs = absMax;

      count++;
    }

    leftMin[b] = lMin > lMax ? 0 : lMin;
    leftMax[b] = lMax < lMin ? 0 : lMax;
    leftRms[b] = count > 0 ? Math.min(127, Math.round(Math.sqrt(lSqSum / count))) : 0;

    rightMin[b] = rMin > rMax ? 0 : rMin;
    rightMax[b] = rMax < rMin ? 0 : rMax;
    rightRms[b] = count > 0 ? Math.min(127, Math.round(Math.sqrt(rSqSum / count))) : 0;
  }

  const isTrueStereo = !detectedMono && maxChannelDelta > 4;

  return {
    key,
    durationMs,
    channels: isTrueStereo ? 2 : 1,
    bucketCount,
    hasAudio: globalMaxAbs > 0,
    leftMin,
    leftMax,
    leftRms,
    ...(isTrueStereo ? { rightMin, rightMax, rightRms } : {}),
  };
}

function downsampleAudioBuffer(audioBuffer: AudioBuffer, durationMs: number, key: string): WaveformData {
  const bucketCount = chooseBucketCount(durationMs);
  const channels = audioBuffer.numberOfChannels >= 2 ? 2 : 1;
  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = channels === 2 ? audioBuffer.getChannelData(1) : null;
  const totalSamples = ch0.length;

  const leftMin = new Int8Array(bucketCount);
  const leftMax = new Int8Array(bucketCount);
  const leftRms = new Uint8Array(bucketCount);
  const rightMin = ch1 ? new Int8Array(bucketCount) : undefined;
  const rightMax = ch1 ? new Int8Array(bucketCount) : undefined;
  const rightRms = ch1 ? new Uint8Array(bucketCount) : undefined;

  let maxChannelDelta = 0;
  let globalMaxAbs = 0;

  for (let b = 0; b < bucketCount; b++) {
    const start = Math.floor((b * totalSamples) / bucketCount);
    const end = Math.max(start + 1, Math.floor(((b + 1) * totalSamples) / bucketCount));
    const span = end - start;
    const step = span > 128 ? Math.floor(span / 128) : 1;

    let lMin = 1;
    let lMax = -1;
    let lSq = 0;
    let rMin = 1;
    let rMax = -1;
    let rSq = 0;
    let count = 0;

    for (let i = start; i < end && i < totalSamples; i += step) {
      const l = ch0[i];
      if (l < lMin) lMin = l;
      if (l > lMax) lMax = l;
      lSq += l * l;

      if (ch1) {
        const r = ch1[i];
        if (r < rMin) rMin = r;
        if (r > rMax) rMax = r;
        rSq += r * r;
        const delta = Math.abs(l - r);
        if (delta > maxChannelDelta) maxChannelDelta = delta;
        if (Math.abs(r) > globalMaxAbs) globalMaxAbs = Math.abs(r);
      }

      if (Math.abs(l) > globalMaxAbs) globalMaxAbs = Math.abs(l);
      count++;
    }

    leftMin[b] = Math.max(-128, Math.min(0, Math.round(lMin * 127)));
    leftMax[b] = Math.max(0, Math.min(127, Math.round(lMax * 127)));
    leftRms[b] = count > 0 ? Math.min(127, Math.round(Math.sqrt(lSq / count) * 127)) : 0;

    if (rightMin && rightMax && rightRms) {
      rightMin[b] = Math.max(-128, Math.min(0, Math.round(rMin * 127)));
      rightMax[b] = Math.max(0, Math.min(127, Math.round(rMax * 127)));
      rightRms[b] = count > 0 ? Math.min(127, Math.round(Math.sqrt(rSq / count) * 127)) : 0;
    }
  }

  const isTrueStereo = channels === 2 && maxChannelDelta > 0.03;

  return {
    key,
    durationMs,
    channels: isTrueStereo ? 2 : 1,
    bucketCount,
    hasAudio: globalMaxAbs > 0.002,
    leftMin,
    leftMax,
    leftRms,
    ...(isTrueStereo && rightMin && rightMax && rightRms
      ? { rightMin, rightMax, rightRms }
      : {}),
  };
}

/**
 * Extracts real audio waveform peaks for a video File efficiently:
 * - Returns cached data immediately if already analyzed in this session.
 * - Uses native Web Audio fast path for small files (<= 30 MB).
 * - Uses an isolated FFmpeg.wasm WORKERFS worker with low-rate pcm_s8 (1-2 kHz) for large / 60+ min videos,
 *   keeping RAM minimal and terminating the worker right after peak reduction.
 */
export async function extractAudioWaveform(
  file: File,
  durationMs: number,
  onStatus: (status: WaveformStatus) => void
): Promise<void> {
  const key = getFileWaveformKey(file);
  const cached = waveformCache.get(key);
  if (cached) {
    onStatus(cached.hasAudio ? { state: 'ready', data: cached } : { state: 'silent' });
    return;
  }

  abortWaveformExtraction();
  const jobToken = ++activeJobToken;

  // Fast path for smaller files (<= 30 MB) via browser native AudioContext
  if (file.size <= 30 * 1024 * 1024 && typeof AudioContext !== 'undefined') {
    onStatus({ state: 'loading', progress: 15, message: 'Menganalisis audio asli...' });
    let audioCtx: AudioContext | null = null;
    try {
      const arrayBuf = await file.arrayBuffer();
      if (jobToken !== activeJobToken) return;

      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new Ctx();
      const decoded = await audioCtx.decodeAudioData(arrayBuf);
      if (jobToken !== activeJobToken) return;

      const waveform = downsampleAudioBuffer(decoded, durationMs, key);
      setCachedWaveform(key, waveform);
      onStatus(waveform.hasAudio ? { state: 'ready', data: waveform } : { state: 'silent' });
      return;
    } catch {
      // Fallback to FFmpeg.wasm if AudioContext cannot decode container/codec
      if (jobToken !== activeJobToken) return;
    } finally {
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
    }
  }

  // Dedicated FFmpeg.wasm worker path (handles 60+ min / multi-hundred MB videos via WORKERFS)
  onStatus({ state: 'loading', progress: 5, message: 'Memuat analyzer waveform...' });

  const ffmpeg = new FFmpeg();
  activeWorker = ffmpeg;

  let detectedMono = false;
  let noAudioStream = false;

  const onLog = ({ message }: { message: string }) => {
    if (/Audio:/i.test(message) && /\bmono\b/i.test(message)) {
      detectedMono = true;
    }
    if (/matches no streams|does not contain any stream/i.test(message)) {
      noAudioStream = true;
    }
  };

  const onProgress = ({ progress, time }: { progress: number; time: number }) => {
    if (jobToken !== activeJobToken) return;
    let pct = 10;
    if (Number.isFinite(progress) && progress > 0 && progress <= 1) {
      pct = Math.round(10 + progress * 85);
    } else if (Number.isFinite(time) && time > 0 && durationMs > 0) {
      const processedMs = time / 1000;
      pct = Math.round(10 + Math.min(1, processedMs / durationMs) * 85);
    }
    onStatus({
      state: 'loading',
      progress: Math.max(8, Math.min(95, pct)),
      message: `Menganalisis waveform audio (${Math.max(8, Math.min(95, pct))}%)...`,
    });
  };

  ffmpeg.on('log', onLog);
  ffmpeg.on('progress', onProgress);

  try {
    const baseURL = `${window.location.origin}/ffmpeg`;
    await ffmpeg.load({
      coreURL: `${baseURL}/ffmpeg-core.js`,
      wasmURL: `${baseURL}/ffmpeg-core.wasm`,
    });
    if (jobToken !== activeJobToken) return;

    let inputPath = '';
    try {
      await ffmpeg.createDir('/wavework');
    } catch {
      // ignore
    }

    try {
      await ffmpeg.mount('WORKERFS' as Parameters<FFmpeg['mount']>[0], { files: [file] }, '/wavework');
      inputPath = `/wavework/${file.name}`;
    } catch {
      if (file.size <= 350 * 1024 * 1024) {
        const ext = file.name.split('.').pop() || 'mp4';
        inputPath = `/wave_src.${ext}`;
        await ffmpeg.writeFile(inputPath, await fetchFile(file));
      } else {
        throw new Error('Gagal membaca stream audio file besar via WORKERFS.');
      }
    }

    if (jobToken !== activeJobToken) return;

    onStatus({ state: 'loading', progress: 12, message: 'Membaca amplitudo audio asli...' });

    // Low sample rate pcm_s8 keeps 60-min stereo temp PCM ~7-14 MB instead of 1.3 GB
    const targetRate = durationMs > 1_800_000 ? '1000' : '2000';
    const outPcm = '/wave.pcm';

    const rc = await ffmpeg.exec([
      '-nostdin',
      '-y',
      '-vn',
      '-sn',
      '-dn',
      '-i',
      inputPath,
      '-map',
      '0:a:0',
      '-ac',
      '2',
      '-ar',
      targetRate,
      '-c:a',
      'pcm_s8',
      '-f',
      's8',
      outPcm,
    ]);

    if (jobToken !== activeJobToken) return;

    if (noAudioStream || rc !== 0) {
      const silentData: WaveformData = {
        key,
        durationMs,
        channels: 1,
        bucketCount: 1200,
        hasAudio: false,
        leftMin: new Int8Array(1200),
        leftMax: new Int8Array(1200),
        leftRms: new Uint8Array(1200),
      };
      setCachedWaveform(key, silentData);
      onStatus({ state: 'silent' });
      return;
    }

    const raw = await ffmpeg.readFile(outPcm);
    const bytes = raw instanceof Uint8Array ? raw : new Uint8Array();
    const waveform = downsampleSigned8Pcm(bytes, detectedMono, durationMs, key);

    setCachedWaveform(key, waveform);
    onStatus(waveform.hasAudio ? { state: 'ready', data: waveform } : { state: 'silent' });
  } catch (err) {
    if (jobToken !== activeJobToken) return;
    onStatus({
      state: 'error',
      message: err instanceof Error ? err.message : 'Gagal mengekstrak waveform audio.',
    });
  } finally {
    ffmpeg.off('log', onLog);
    ffmpeg.off('progress', onProgress);
    if (activeWorker === ffmpeg) {
      activeWorker = null;
    }
    try {
      ffmpeg.terminate();
    } catch {
      // ignore
    }
  }
}
