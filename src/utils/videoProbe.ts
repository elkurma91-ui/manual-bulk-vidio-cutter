import type { VideoMetadata } from '../types/editor';

export function inferFormatLabel(file: File): string {
  const ext = file.name.split('.').pop()?.toUpperCase() || '';
  if (ext) return ext;
  if (file.type) {
    const sub = file.type.split('/')[1]?.toUpperCase();
    if (sub) return sub;
  }
  return 'VIDEO';
}

export interface DeviceCapabilityInfo {
  isMobile: boolean;
  deviceMemoryGb: number | null;
  supportsDirectoryPicker: boolean;
  warningMessage: string | null;
}

export function assessDeviceCapability(fileSizeBytes?: number): DeviceCapabilityInfo {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }) : null;
  const deviceMemoryGb = nav?.deviceMemory ?? null;
  const supportsDirectoryPicker =
    typeof window !== 'undefined' &&
    'showDirectoryPicker' in window &&
    window.self === window.top;

  let warningMessage: string | null = null;
  if (fileSizeBytes !== undefined) {
    const mb = fileSizeBytes / (1024 * 1024);
    if (isMobile && mb > 450) {
      warningMessage = `File berukuran ${Math.round(mb)} MB tergolong berat untuk browser HP. Preview & pemilihan titik potong tetap ringan, namun proses ekspor re-encoding disarankan di Laptop/Desktop atau gunakan mode FAST CUT.`;
    } else if (!isMobile && mb > 1800) {
      warningMessage = `File berukuran ${(mb / 1024).toFixed(2)} GB sangat besar untuk pemrosesan WASM di browser. Gunakan mode FAST CUT untuk pemotongan cepat tanpa menyalin ulang seluruh video ke RAM.`;
    }
  }

  return {
    isMobile,
    deviceMemoryGb,
    supportsDirectoryPicker,
    warningMessage,
  };
}

/**
 * Probes basic video metadata via an off-DOM HTMLVideoElement without loading the entire file into memory.
 */
export function probeVideoFile(file: File, fallbackFps = 30): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(objectUrl);
    };

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          'Browser gagal membaca metadata video. Format atau codec mungkin tidak didukung oleh pemutar HTML5 browser (mis. MKV/HEVC tertentu).'
        )
      );
    }, 15000);

    video.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;

      if (durationMs <= 0 || width <= 0 || height <= 0) {
        cleanup();
        reject(
          new Error(
            'Video tidak memiliki stream gambar atau durasi yang valid di browser ini. Coba konversi ke MP4 (H.264/AAC) terlebih dahulu.'
          )
        );
        return;
      }

      const meta: VideoMetadata = {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'video/mp4',
        formatLabel: inferFormatLabel(file),
        durationMs,
        width,
        height,
        fps: fallbackFps,
        fpsDetected: false,
        lastModified: file.lastModified,
      };
      cleanup();
      resolve(meta);
    };

    video.onerror = () => {
      window.clearTimeout(timeout);
      cleanup();
      reject(
        new Error(
          `Format video "${file.name}" tidak dapat didekode oleh browser ini. Browser mendukung MP4 (H.264), WebM (VP8/VP9), dan sebagian MOV/MKV.`
        )
      );
    };

    video.src = objectUrl;
  });
}
