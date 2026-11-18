/**
 * Precision frame & millisecond timecode utilities.
 * All internal computations operate on integer milliseconds to prevent floating-point drift.
 */

export function formatTimecode(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1_000);
  const millis = clamped % 1_000;

  return (
    String(hours).padStart(2, '0') +
    ':' +
    String(minutes).padStart(2, '0') +
    ':' +
    String(seconds).padStart(2, '0') +
    '.' +
    String(millis).padStart(3, '0')
  );
}

/**
 * Parses HH:MM:SS.mmm, MM:SS.mmm, SS.mmm, or HH:MM:SS into integer milliseconds.
 * Returns null if invalid syntax.
 */
export function parseTimecode(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Accept HH:MM:SS.mmm or HH:MM:SS or MM:SS.mmm or SS.mmm
  const match = trimmed.match(/^(?:(\d{1,2}):)?(?:(\d{1,2}):)?(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!match) return null;

  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  let millis = 0;

  const [, g1, g2, g3, g4] = match;

  if (g1 !== undefined && g2 !== undefined) {
    hours = Number(g1);
    minutes = Number(g2);
    seconds = Number(g3);
  } else if (g1 !== undefined && g2 === undefined) {
    minutes = Number(g1);
    seconds = Number(g3);
  } else {
    seconds = Number(g3);
  }

  if (g4 !== undefined) {
    millis = Number(g4.padEnd(3, '0'));
  }

  if (minutes > 59 || seconds > 59) return null;
  if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds) || Number.isNaN(millis)) {
    return null;
  }

  return hours * 3_600_000 + minutes * 60_000 + seconds * 1_000 + millis;
}

export function msToFrame(ms: number, fps: number): number {
  const safeFps = fps > 0 ? fps : 30;
  return Math.max(0, Math.round((ms / 1000) * safeFps));
}

export function frameToMs(frame: number, fps: number): number {
  const safeFps = fps > 0 ? fps : 30;
  return Math.max(0, Math.round((frame / safeFps) * 1000));
}

export function snapToFrame(ms: number, fps: number, maxMs?: number): number {
  const frame = msToFrame(ms, fps);
  const snapped = frameToMs(frame, fps);
  if (maxMs !== undefined) {
    return Math.min(Math.max(0, snapped), Math.max(0, Math.round(maxMs)));
  }
  return Math.max(0, snapped);
}

export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(idx >= 2 ? 2 : 0)} ${units[idx]}`;
}

export function formatClipFileName(index: number, prefix = 'Clip', customName?: string): string {
  const num = String(index + 1).padStart(3, '0');
  const safePrefix = (prefix || 'Clip').replace(/[^a-zA-Z0-9_-]/g, '_') || 'Clip';
  if (customName && customName.trim()) {
    const clean = customName
      .trim()
      .replace(/[^a-zA-Z0-9_\-\s]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 48);
    if (clean) {
      // If user left default name like "Clip 001", format cleanly as Clip_001.mp4
      if (/^Clip[_\s]*\d+$/i.test(clean)) {
        return `${safePrefix}_${num}.mp4`;
      }
      return `${num}_${clean}.mp4`;
    }
  }
  return `${safePrefix}_${num}.mp4`;
}
