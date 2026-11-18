import type {
  Clip,
  EncoderPreset,
  ExportMode,
  FrameSettingsState,
  ResolutionPreset,
  VideoMetadata,
} from '../types/editor.ts';

export interface TargetDimensions {
  width: number;
  height: number;
  isTransformed: boolean;
}

export interface ResolvedExportPlan {
  effectiveStrategy: 'fast_copy' | 'accurate_direct' | 'accurate_filter';
  needsReencode: boolean;
  reason: string;
  width: number;
  height: number;
}

const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2);

/**
 * Computes exact output pixel dimensions (always even integers for H.264 yuv420p compatibility).
 */
export function computeTargetDimensions(
  sourceWidth: number,
  sourceHeight: number,
  frame: FrameSettingsState,
  resolution: ResolutionPreset
): TargetDimensions {
  const rotSwapped = frame.rotate === 90 || frame.rotate === 270;
  const effSrcW = rotSwapped ? sourceHeight : sourceWidth;
  const effSrcH = rotSwapped ? sourceWidth : sourceHeight;

  let ratioW = effSrcW;
  let ratioH = effSrcH;

  switch (frame.aspectRatio) {
    case '9:16':
      ratioW = 9;
      ratioH = 16;
      break;
    case '16:9':
      ratioW = 16;
      ratioH = 9;
      break;
    case '1:1':
      ratioW = 1;
      ratioH = 1;
      break;
    case '4:5':
      ratioW = 4;
      ratioH = 5;
      break;
    case 'custom':
      ratioW = Math.max(1, frame.customRatioW || 16);
      ratioH = Math.max(1, frame.customRatioH || 9);
      break;
    case 'original':
    default:
      ratioW = effSrcW;
      ratioH = effSrcH;
      break;
  }

  let shortSide: number;
  switch (resolution) {
    case '720p':
      shortSide = 720;
      break;
    case '1080p':
      shortSide = 1080;
      break;
    case '1440p':
      shortSide = 1440;
      break;
    case '2160p':
      shortSide = 2160;
      break;
    case 'original':
    default:
      shortSide = Math.min(effSrcW, effSrcH) || 1080;
      break;
  }

  let targetW: number;
  let targetH: number;

  if (frame.aspectRatio === 'original' && resolution === 'original') {
    targetW = even(effSrcW);
    targetH = even(effSrcH);
  } else if (ratioW >= ratioH) {
    targetH = even(shortSide);
    targetW = even((shortSide * ratioW) / ratioH);
  } else {
    targetW = even(shortSide);
    targetH = even((shortSide * ratioH) / ratioW);
  }

  const hasCrop =
    frame.crop.top > 0 ||
    frame.crop.right > 0 ||
    frame.crop.bottom > 0 ||
    frame.crop.left > 0;

  const hasTextOverlay = Boolean(frame.textLayer?.enabled && frame.textLayer.text.trim().length > 0);
  const videoHidden = frame.videoVisible === false;

  const isTransformed =
    frame.aspectRatio !== 'original' ||
    resolution !== 'original' ||
    Math.abs(frame.zoom - 1) > 0.005 ||
    Math.abs(frame.posX) > 0.1 ||
    Math.abs(frame.posY) > 0.1 ||
    frame.rotate !== 0 ||
    hasCrop ||
    hasTextOverlay ||
    videoHidden;

  return { width: targetW, height: targetH, isTransformed };
}

/**
 * SMART EXPORT PLANNER:
 * Evaluates export mode + frame/resolution/layer transforms and chooses the fastest valid pipeline.
 */
export function resolveExportPlan(
  sourceWidth: number,
  sourceHeight: number,
  frame: FrameSettingsState,
  resolution: ResolutionPreset,
  exportMode: ExportMode
): ResolvedExportPlan {
  const dims = computeTargetDimensions(sourceWidth, sourceHeight, frame, resolution);

  if (exportMode === 'smart') {
    if (!dims.isTransformed) {
      return {
        effectiveStrategy: 'fast_copy',
        needsReencode: false,
        reason: 'Mode SMART: tidak ada transformasi frame/layer/resolusi -> Stream Copy (-c copy).',
        width: dims.width,
        height: dims.height,
      };
    }
    return {
      effectiveStrategy: 'accurate_filter',
      needsReencode: true,
      reason: 'Mode SMART: template/layer/resolusi aktif -> Frame Accurate dengan filter optimal.',
      width: dims.width,
      height: dims.height,
    };
  }

  if (exportMode === 'fast' && !dims.isTransformed) {
    return {
      effectiveStrategy: 'fast_copy',
      needsReencode: false,
      reason: 'Mode FAST CUT: stream copy langsung tanpa re-encoding.',
      width: dims.width,
      height: dims.height,
    };
  }

  if (!dims.isTransformed) {
    return {
      effectiveStrategy: 'accurate_direct',
      needsReencode: true,
      reason: 'Mode FRAME ACCURATE tanpa filter: re-encode langsung tanpa overhead filtergraph.',
      width: dims.width,
      height: dims.height,
    };
  }

  return {
    effectiveStrategy: 'accurate_filter',
    needsReencode: true,
    reason: 'Mode FRAME ACCURATE dengan filter template & layer.',
    width: dims.width,
    height: dims.height,
  };
}

export function formatFFmpegSec(ms: number): string {
  const sec = Math.max(0, ms) / 1000;
  return sec.toFixed(3);
}

/**
 * Builds optimized FFmpeg video filter arguments:
 * - Zero filters when untouched
 * - Single-stream `-vf` (crop/transpose/scale/crop/pad) for all solid background placements (preserves exact source FPS & timestamps!)
 * - 1/4-resolution boxblur `-filter_complex` only when Blur Background is enabled
 */
export function buildOptimizedFilterArgs(
  sourceWidth: number,
  sourceHeight: number,
  frame: FrameSettingsState,
  targetW: number,
  targetH: number
): { kind: 'none' | 'vf' | 'filter_complex'; value: string } {
  const effectiveBgType = frame.bgVisible === false ? 'color' : frame.bgType;
  const effectiveHex =
    frame.bgVisible === false ? '0x000000' : (frame.bgColor || '#000000').replace('#', '0x');

  if (frame.videoVisible === false) {
    if (effectiveBgType === 'blur') {
      const blurW = even(Math.max(120, Math.round(targetW / 4)));
      const blurH = even(Math.max(120, Math.round(targetH / 4)));
      const blurRadius = Math.max(2, Math.min(10, Math.round(frame.blurIntensity / 4)));
      return {
        kind: 'vf',
        value: `scale=${blurW}:${blurH}:force_original_aspect_ratio=increase:flags=fast_bilinear,crop=${blurW}:${blurH},boxblur=${blurRadius}:1,scale=${targetW}:${targetH}:flags=bilinear,setsar=1`,
      };
    }
    return {
      kind: 'vf',
      value: `scale=${targetW}:${targetH}:flags=fast_bilinear,drawbox=x=0:y=0:w=${targetW}:h=${targetH}:color=${effectiveHex}:t=fill,setsar=1`,
    };
  }

  const leftFrac = Math.min(0.4, Math.max(0, frame.crop.left / 100));
  const rightFrac = Math.min(0.4, Math.max(0, frame.crop.right / 100));
  const topFrac = Math.min(0.4, Math.max(0, frame.crop.top / 100));
  const bottomFrac = Math.min(0.4, Math.max(0, frame.crop.bottom / 100));
  const hasCrop = leftFrac > 0 || rightFrac > 0 || topFrac > 0 || bottomFrac > 0;

  const croppedW = even(sourceWidth * (1 - leftFrac - rightFrac));
  const croppedH = even(sourceHeight * (1 - topFrac - bottomFrac));
  const cropX = Math.round(sourceWidth * leftFrac);
  const cropY = Math.round(sourceHeight * topFrac);

  const simpleFilters: string[] = [];
  if (hasCrop) {
    simpleFilters.push(`crop=${croppedW}:${croppedH}:${cropX}:${cropY}`);
  }

  let postRotW = croppedW;
  let postRotH = croppedH;
  if (frame.rotate === 90) {
    simpleFilters.push('transpose=1');
    postRotW = croppedH;
    postRotH = croppedW;
  } else if (frame.rotate === 180) {
    simpleFilters.push('transpose=2,transpose=2');
  } else if (frame.rotate === 270) {
    simpleFilters.push('transpose=2');
    postRotW = croppedH;
    postRotH = croppedW;
  }

  const scaleContain = Math.min(targetW / postRotW, targetH / postRotH);
  const scaleCover = Math.max(targetW / postRotW, targetH / postRotH);
  const baseScale = frame.fitMode === 'fill' ? scaleCover : scaleContain;
  const finalScale = baseScale * Math.max(0.25, Math.min(3.0, frame.zoom));

  const fgW = even(postRotW * finalScale);
  const fgH = even(postRotH * finalScale);

  const offsetX = Math.round((targetW - fgW) / 2 + (frame.posX / 100) * targetW);
  const offsetY = Math.round((targetH - fgH) / 2 + (frame.posY / 100) * targetH);

  if (effectiveBgType === 'blur') {
    const complex: string[] = [];
    let currentLabel = '0:v';
    if (simpleFilters.length > 0) {
      complex.push(`[0:v]${simpleFilters.join(',')}[v_pre]`);
      currentLabel = 'v_pre';
    }

    const blurW = even(Math.max(120, Math.round(targetW / 4)));
    const blurH = even(Math.max(120, Math.round(targetH / 4)));
    const blurRadius = Math.max(2, Math.min(10, Math.round(frame.blurIntensity / 4)));

    const fgScalePart =
      fgW === postRotW && fgH === postRotH
        ? `[v_fg_in]null[v_fg]`
        : `[v_fg_in]scale=${fgW}:${fgH}:flags=fast_bilinear[v_fg]`;

    complex.push(
      `[${currentLabel}]split=2[v_fg_in][v_bg_in]`,
      fgScalePart,
      `[v_bg_in]scale=${blurW}:${blurH}:force_original_aspect_ratio=increase:flags=fast_bilinear,crop=${blurW}:${blurH},boxblur=${blurRadius}:1,scale=${targetW}:${targetH}:flags=bilinear[v_bg]`,
      `[v_bg][v_fg]overlay=${offsetX}:${offsetY}:shortest=1,setsar=1[v_out]`
    );
    return { kind: 'filter_complex', value: complex.join(';') };
  }

  // Solid background / single-stream pipeline (handles fill, zoom > 1, and off-edge positioning without synthetic color stream!)
  if (fgW !== postRotW || fgH !== postRotH) {
    simpleFilters.push(`scale=${fgW}:${fgH}:flags=fast_bilinear`);
  }

  if (fgW === targetW && fgH === targetH && offsetX === 0 && offsetY === 0) {
    if (simpleFilters.length === 0) {
      return { kind: 'none', value: '' };
    }
    simpleFilters.push('setsar=1');
    return { kind: 'vf', value: simpleFilters.join(',') };
  }

  const visX0 = Math.max(0, offsetX);
  const visY0 = Math.max(0, offsetY);
  const visX1 = Math.min(targetW, offsetX + fgW);
  const visY1 = Math.min(targetH, offsetY + fgH);

  if (visX1 - visX0 < 2 || visY1 - visY0 < 2) {
    // Video completely panned off-canvas: fill canvas with solid background while preserving exact input FPS/duration
    simpleFilters.push(
      `scale=${targetW}:${targetH}:flags=fast_bilinear`,
      `drawbox=x=0:y=0:w=${targetW}:h=${targetH}:color=${effectiveHex}:t=fill`,
      'setsar=1'
    );
    return { kind: 'vf', value: simpleFilters.join(',') };
  }

  const visW = even(Math.min(targetW - visX0, visX1 - visX0));
  const visH = even(Math.min(targetH - visY0, visY1 - visY0));

  if (visW < fgW || visH < fgH) {
    const fgCropX = Math.max(0, Math.min(fgW - visW, visX0 - offsetX));
    const fgCropY = Math.max(0, Math.min(fgH - visH, visY0 - offsetY));
    simpleFilters.push(`crop=${visW}:${visH}:${fgCropX}:${fgCropY}`);
  }

  if (visW < targetW || visH < targetH) {
    const padX = Math.max(0, Math.min(targetW - visW, visX0));
    const padY = Math.max(0, Math.min(targetH - visH, visY0));
    simpleFilters.push(`pad=${targetW}:${targetH}:${padX}:${padY}:${effectiveHex}`);
  }

  simpleFilters.push('setsar=1');
  return { kind: 'vf', value: simpleFilters.join(',') };
}

/**
 * Generates exact FFmpeg CLI arguments for a single clip (shared between WASM and Native backends).
 */
export function buildClipFFmpegArgs(params: {
  inputPath: string;
  outPath: string;
  overlayInputPath?: string;
  clip: Clip;
  metadata: Pick<VideoMetadata, 'width' | 'height'>;
  frameSettings: FrameSettingsState;
  resolution: ResolutionPreset;
  exportMode: ExportMode;
  encoderPreset: EncoderPreset;
  encoderCrf: number;
  videoCodec?: string;
  threads?: number;
}): { args: string[]; plan: ResolvedExportPlan } {
  const {
    inputPath,
    outPath,
    overlayInputPath,
    clip,
    metadata,
    frameSettings,
    resolution,
    exportMode,
    encoderPreset,
    encoderCrf,
    videoCodec = 'libx264',
    threads = 0,
  } = params;

  const plan = resolveExportPlan(
    metadata.width,
    metadata.height,
    frameSettings,
    resolution,
    exportMode
  );

  const durationMs = Math.max(100, clip.outMs - clip.inMs);
  const startSec = formatFFmpegSec(clip.inMs);
  const durationSec = formatFFmpegSec(durationMs);

  const args: string[] = ['-ss', startSec, '-i', inputPath];

  if (!plan.needsReencode) {
    args.push(
      '-t',
      durationSec,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-c',
      'copy',
      '-avoid_negative_ts',
      'make_zero',
      '-movflags',
      '+faststart',
      outPath
    );
    return { args, plan };
  }

  if (overlayInputPath) {
    args.push('-i', overlayInputPath);
  }
  args.push('-t', durationSec);

  const filter = buildOptimizedFilterArgs(
    metadata.width,
    metadata.height,
    frameSettings,
    plan.width,
    plan.height
  );

  if (overlayInputPath) {
    if (filter.kind === 'filter_complex') {
      const chained = `${filter.value};[v_out][1:v]overlay=0:0:format=auto[v_final]`;
      args.push('-filter_complex', chained, '-map', '[v_final]', '-map', '0:a:0?');
    } else if (filter.kind === 'vf') {
      const chained = `[0:v]${filter.value}[v_base];[v_base][1:v]overlay=0:0:format=auto[v_final]`;
      args.push('-filter_complex', chained, '-map', '[v_final]', '-map', '0:a:0?');
    } else {
      args.push(
        '-filter_complex',
        '[0:v][1:v]overlay=0:0:format=auto[v_final]',
        '-map',
        '[v_final]',
        '-map',
        '0:a:0?'
      );
    }
  } else if (filter.kind === 'filter_complex') {
    args.push('-filter_complex', filter.value, '-map', '[v_out]', '-map', '0:a:0?');
  } else if (filter.kind === 'vf') {
    args.push('-vf', filter.value, '-map', '0:v:0', '-map', '0:a:0?');
  } else {
    args.push('-map', '0:v:0', '-map', '0:a:0?');
  }

  args.push('-c:v', videoCodec);

  if (videoCodec === 'libx264') {
    args.push('-preset', encoderPreset, '-crf', String(encoderCrf));
    if (threads > 0) {
      args.push('-threads', String(threads));
    }
  } else if (videoCodec.includes('nvenc')) {
    args.push('-preset', 'p1', '-cq', String(encoderCrf));
  } else if (videoCodec.includes('qsv')) {
    args.push('-preset', 'veryfast', '-global_quality', String(encoderCrf));
  } else if (videoCodec.includes('amf')) {
    args.push('-quality', 'speed');
  }

  args.push(
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ac',
    '2',
    '-avoid_negative_ts',
    'make_zero',
    '-movflags',
    '+faststart',
    outPath
  );

  return { args, plan };
}
