import type { FrameSettingsState, TextOverlayLayer } from '../types/editor';

export const DEFAULT_TEXT_LAYER: TextOverlayLayer = {
  enabled: false,
  text: '',
  fontSize: 44,
  color: '#FFFFFF',
  bgColor: '#000000',
  bgOpacity: 0.65,
  position: 'top',
  offsetY: 0,
};

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function hasActiveTextOverlay(frame: FrameSettingsState): boolean {
  return Boolean(frame.textLayer?.enabled && frame.textLayer.text.trim().length > 0);
}

/**
 * Draws the Text Overlay Layer onto any 2D canvas of size (width x height).
 * Shared between VideoMonitor preview and PNG export generation so WYSIWYG matches FFmpeg output.
 */
export function drawTextOverlayOnCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  layer: TextOverlayLayer
): void {
  if (!layer.enabled || !layer.text.trim()) return;

  const shortSide = Math.min(width, height);
  const scale = shortSide / 1080;
  const fontPx = Math.max(12, Math.round(layer.fontSize * scale));
  const lineHeight = Math.round(fontPx * 1.28);
  const padX = Math.round(fontPx * 0.55);
  const padY = Math.round(fontPx * 0.32);
  const radius = Math.round(fontPx * 0.25);
  const maxTextWidth = Math.max(80, width * 0.86 - padX * 2);

  ctx.save();
  ctx.font = `700 ${fontPx}px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Word-wrap lines respecting explicit newlines
  const rawLines = layer.text.split(/\r?\n/);
  const lines: string[] = [];
  for (const raw of rawLines) {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = `${current} ${words[i]}`;
      if (ctx.measureText(test).width <= maxTextWidth) {
        current = test;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }

  let widest = 0;
  for (const line of lines) {
    widest = Math.max(widest, ctx.measureText(line).width);
  }

  const boxW = Math.min(width * 0.92, widest + padX * 2);
  const boxH = lines.length * lineHeight + padY * 2;

  let baseCenterY = height * 0.14;
  if (layer.position === 'center') baseCenterY = height * 0.5;
  else if (layer.position === 'bottom') baseCenterY = height * 0.86;

  const centerY = Math.max(
    boxH / 2 + 8,
    Math.min(height - boxH / 2 - 8, baseCenterY + (layer.offsetY / 100) * height)
  );
  const boxX = (width - boxW) / 2;
  const boxY = centerY - boxH / 2;

  if (layer.bgOpacity > 0.01) {
    ctx.fillStyle = hexToRgba(layer.bgColor || '#000000', layer.bgOpacity);
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, radius);
    ctx.fill();
  }

  ctx.fillStyle = layer.color || '#FFFFFF';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = Math.max(2, Math.round(fontPx * 0.12));
  ctx.shadowOffsetY = Math.max(1, Math.round(fontPx * 0.04));

  const firstLineY = boxY + padY + lineHeight / 2;
  lines.forEach((line, idx) => {
    ctx.fillText(line, width / 2, firstLineY + idx * lineHeight);
  });

  ctx.restore();
}

/**
 * Generates an exact-resolution transparent PNG Uint8Array for FFmpeg overlay compositing.
 */
export async function renderTextOverlayPng(
  width: number,
  height: number,
  frame: FrameSettingsState
): Promise<Uint8Array | null> {
  if (!frame.textLayer?.enabled || !frame.textLayer.text.trim()) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);
  drawTextOverlayOnCanvas(ctx, width, height, frame.textLayer);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}
