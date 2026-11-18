import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  Clip,
  EncoderPreset,
  ExportMode,
  FrameSettingsState,
  NativeCapabilities,
  ResolutionPreset,
} from './src/types/editor.ts';
import { buildClipFFmpegArgs } from './src/utils/ffmpegPlan.ts';

const execFileAsync = promisify(execFile);

const TEMP_ROOT = path.join(os.tmpdir(), 'mbvc-native');
fs.mkdirSync(TEMP_ROOT, { recursive: true });

interface NativeSession {
  id: string;
  dir: string;
  sourcePath: string;
  fileName: string;
  createdAt: number;
}

interface NativeClipTask {
  clipId: string;
  outputFileName: string;
  outPath: string;
  status: 'queued' | 'processing' | 'done' | 'error' | 'cancelled';
  progress: number;
  width: number;
  height: number;
  strategy: 'fast_copy' | 'accurate_direct' | 'accurate_filter';
  sizeBytes?: number;
  errorMessage?: string;
}

interface NativeBatchJob {
  id: string;
  sessionId: string;
  cancelled: boolean;
  finished: boolean;
  tasks: NativeClipTask[];
  activeProcesses: Set<ChildProcess>;
}

const sessions = new Map<string, NativeSession>();
const jobs = new Map<string, NativeBatchJob>();

let cachedCapabilities: Omit<NativeCapabilities, 'isLocalhost' | 'freeMemoryMb'> | null = null;

async function testEncoderSupport(encoderName: string): Promise<boolean> {
  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=64x64:d=0.1',
        '-c:v',
        encoderName,
        '-f',
        'null',
        '-',
      ],
      { timeout: 5000 }
    );
    return true;
  } catch {
    return false;
  }
}

async function detectNativeCapabilities(): Promise<Omit<NativeCapabilities, 'isLocalhost' | 'freeMemoryMb'>> {
  if (cachedCapabilities) return cachedCapabilities;

  const cpuCores = Math.max(1, os.cpus().length);
  const totalMemoryMb = Math.round(os.totalmem() / (1024 * 1024));
  const recommendedConcurrency = Math.min(2, Math.max(1, Math.floor(cpuCores / 2)));

  let ffmpegVersion: string | null = null;
  try {
    const { stdout } = await execFileAsync('ffmpeg', ['-version'], { timeout: 3000 });
    ffmpegVersion = stdout.split('\n')[0]?.trim() || 'ffmpeg';
  } catch {
    cachedCapabilities = {
      available: false,
      ffmpegVersion: null,
      cpuCores,
      totalMemoryMb,
      recommendedConcurrency,
      hardwareEncoders: [],
      activeHardwareEncoder: null,
    };
    return cachedCapabilities;
  }

  const candidates = [
    { name: 'h264_nvenc', label: 'NVIDIA NVENC' },
    { name: 'h264_qsv', label: 'Intel Quick Sync (QSV)' },
    { name: 'h264_amf', label: 'AMD AMF' },
    { name: 'h264_videotoolbox', label: 'Apple VideoToolbox' },
    { name: 'h264_vaapi', label: 'Linux VA-API' },
  ];

  const hardwareEncoders = await Promise.all(
    candidates.map(async (c) => ({
      name: c.name,
      label: c.label,
      supported: await testEncoderSupport(c.name),
    }))
  );

  const firstSupported = hardwareEncoders.find((e) => e.supported)?.name || null;

  cachedCapabilities = {
    available: true,
    ffmpegVersion,
    cpuCores,
    totalMemoryMb,
    recommendedConcurrency,
    hardwareEncoders,
    activeHardwareEncoder: firstSupported,
  };
  return cachedCapabilities;
}

function isLocalRequest(req: express.Request): boolean {
  const host = (req.headers.host || req.hostname || '').toLowerCase();
  return (
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1') ||
    host.startsWith('[::1]')
  );
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '5mb' }));

  app.get('/api/native/capabilities', async (req, res) => {
    const base = await detectNativeCapabilities();
    res.json({
      ...base,
      isLocalhost: isLocalRequest(req),
      freeMemoryMb: Math.round(os.freemem() / (1024 * 1024)),
    } satisfies NativeCapabilities);
  });

  // Stream source file once into temp disk session (zero RAM buffering)
  app.post('/api/native/session', (req, res) => {
    const rawName = String(req.headers['x-file-name'] || 'source.mp4');
    const safeName = path.basename(decodeURIComponent(rawName)).replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = path.extname(safeName) || '.mp4';
    const sessionId = crypto.randomUUID();
    const dir = path.join(TEMP_ROOT, sessionId);
    fs.mkdirSync(dir, { recursive: true });
    const sourcePath = path.join(dir, `source${ext}`);

    const ws = fs.createWriteStream(sourcePath);
    let aborted = false;

    req.on('aborted', () => {
      aborted = true;
      ws.destroy();
      fs.rmSync(dir, { recursive: true, force: true });
    });

    ws.on('error', (err) => {
      if (!res.headersSent) {
        res.status(500).json({ error: `Gagal menyimpan file sesi lokal: ${err.message}` });
      }
    });

    ws.on('finish', () => {
      if (aborted) return;
      sessions.set(sessionId, {
        id: sessionId,
        dir,
        sourcePath,
        fileName: safeName,
        createdAt: Date.now(),
      });
      res.json({ sessionId });
    });

    req.pipe(ws);
  });

  app.delete('/api/native/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);
    if (session) {
      fs.rmSync(session.dir, { recursive: true, force: true });
      sessions.delete(sessionId);
    }
    res.json({ ok: true });
  });

  app.post('/api/native/export-batch', async (req, res) => {
    const {
      sessionId,
      clips,
      metadata,
      frameSettings,
      resolution,
      exportMode,
      encoderPreset,
      encoderCrf,
      threads,
      useHardwareEncoder,
      overlayPngBase64,
      outputNames,
    } = req.body as {
      sessionId: string;
      clips: Clip[];
      metadata: { width: number; height: number };
      frameSettings: FrameSettingsState;
      resolution: ResolutionPreset;
      exportMode: ExportMode;
      encoderPreset: EncoderPreset;
      encoderCrf: number;
      threads: number;
      useHardwareEncoder?: boolean;
      overlayPngBase64?: string | null;
      outputNames: Record<string, string>;
    };

    const session = sessions.get(sessionId);
    if (!session || !fs.existsSync(session.sourcePath)) {
      res.status(404).json({ error: 'Sesi video sumber tidak ditemukan.' });
      return;
    }

    const caps = await detectNativeCapabilities();
    if (!caps.available) {
      res.status(503).json({ error: 'FFmpeg native tidak tersedia pada sistem ini.' });
      return;
    }

    const jobId = crypto.randomUUID();
    const outDir = path.join(session.dir, `job_${jobId}`);
    fs.mkdirSync(outDir, { recursive: true });

    let overlayInputPath: string | undefined;
    if (overlayPngBase64) {
      const cleanB64 = overlayPngBase64.replace(/^data:image\/png;base64,/, '');
      overlayInputPath = path.join(outDir, 'overlay_layer.png');
      fs.writeFileSync(overlayInputPath, Buffer.from(cleanB64, 'base64'));
    }

    const videoCodec =
      useHardwareEncoder && caps.activeHardwareEncoder ? caps.activeHardwareEncoder : 'libx264';

    const tasks: NativeClipTask[] = clips.map((clip, i) => {
      const safeOut = (outputNames?.[clip.id] || `Clip_${String(i + 1).padStart(3, '0')}.mp4`).replace(
        /[^a-zA-Z0-9._-]/g,
        '_'
      );
      const outPath = path.join(outDir, safeOut);
      const { plan } = buildClipFFmpegArgs({
        inputPath: session.sourcePath,
        outPath,
        overlayInputPath,
        clip,
        metadata,
        frameSettings,
        resolution,
        exportMode,
        encoderPreset,
        encoderCrf,
        videoCodec,
        threads,
      });

      return {
        clipId: clip.id,
        outputFileName: safeOut,
        outPath,
        status: 'queued',
        progress: 0,
        width: plan.width,
        height: plan.height,
        strategy: plan.effectiveStrategy,
      };
    });

    const job: NativeBatchJob = {
      id: jobId,
      sessionId,
      cancelled: false,
      finished: false,
      tasks,
      activeProcesses: new Set(),
    };
    jobs.set(jobId, job);

    res.json({ jobId, concurrency: caps.recommendedConcurrency, videoCodec });

    // Controlled concurrency worker pool
    const concurrency = caps.recommendedConcurrency;
    let nextIdx = 0;

    const runNext = async (): Promise<void> => {
      while (nextIdx < clips.length && !job.cancelled) {
        const currentIdx = nextIdx++;
        const clip = clips[currentIdx];
        const task = tasks[currentIdx];

        task.status = 'processing';
        task.progress = 1;

        const durationMs = Math.max(100, clip.outMs - clip.inMs);
        const { args } = buildClipFFmpegArgs({
          inputPath: session.sourcePath,
          outPath: task.outPath,
          overlayInputPath,
          clip,
          metadata,
          frameSettings,
          resolution,
          exportMode,
          encoderPreset,
          encoderCrf,
          videoCodec,
          threads: threads > 0 ? threads : Math.max(1, Math.floor(caps.cpuCores / concurrency)),
        });

        await new Promise<void>((resolve) => {
          const ffArgs = ['-y', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', ...args];
          const child = spawn('ffmpeg', ffArgs);
          job.activeProcesses.add(child);

          let stderrBuf = '';
          child.stderr.on('data', (chunk: Buffer) => {
            stderrBuf += chunk.toString();
          });

          child.stdout.on('data', (chunk: Buffer) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
              if (line.startsWith('out_time_us=')) {
                const us = Number(line.split('=')[1]);
                if (Number.isFinite(us) && us > 0) {
                  const pct = Math.min(99, Math.round((us / 1000 / durationMs) * 100));
                  task.progress = Math.max(1, pct);
                }
              }
            }
          });

          child.on('close', (code) => {
            job.activeProcesses.delete(child);
            if (job.cancelled) {
              task.status = 'cancelled';
            } else if (code === 0 && fs.existsSync(task.outPath)) {
              task.status = 'done';
              task.progress = 100;
              task.sizeBytes = fs.statSync(task.outPath).size;
            } else {
              task.status = 'error';
              task.errorMessage = stderrBuf.trim() || `FFmpeg exited with code ${code}`;
            }
            resolve();
          });

          child.on('error', (err) => {
            job.activeProcesses.delete(child);
            task.status = 'error';
            task.errorMessage = err.message;
            resolve();
          });
        });
      }
    };

    Promise.all(Array.from({ length: concurrency }, () => runNext())).finally(() => {
      if (job.cancelled) {
        for (const t of job.tasks) {
          if (t.status === 'queued' || t.status === 'processing') {
            t.status = 'cancelled';
          }
        }
      }
      job.finished = true;
    });
  });

  app.get('/api/native/job/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Job tidak ditemukan.' });
      return;
    }
    res.json({
      id: job.id,
      cancelled: job.cancelled,
      finished: job.finished,
      tasks: job.tasks.map((t) => ({
        clipId: t.clipId,
        outputFileName: t.outputFileName,
        status: t.status,
        progress: t.progress,
        width: t.width,
        height: t.height,
        strategy: t.strategy,
        sizeBytes: t.sizeBytes,
        errorMessage: t.errorMessage,
      })),
    });
  });

  app.get('/api/native/download/:jobId/:clipId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    const task = job?.tasks.find((t) => t.clipId === req.params.clipId);
    if (!task || !fs.existsSync(task.outPath)) {
      res.status(404).json({ error: 'File klip tidak ditemukan.' });
      return;
    }
    res.download(task.outPath, task.outputFileName);
  });

  app.post('/api/native/cancel/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Job tidak ditemukan.' });
      return;
    }
    job.cancelled = true;
    for (const proc of job.activeProcesses) {
      try {
        proc.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
    res.json({ ok: true });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve('dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`MANUAL BULK VIDEO CUTTER server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
