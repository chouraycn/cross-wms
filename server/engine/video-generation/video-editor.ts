/**
 * Video Editor — 视频编辑器
 *
 * 提供视频剪辑、拼接、转场等纯计算逻辑。
 * 不依赖外部视频处理库，只做参数校验与时间轴计算。
 */

import { logger } from "../../logger.js";
import type { GeneratedVideoAsset } from "./types.js";

export type VideoClip = {
  asset: GeneratedVideoAsset;
  startSeconds?: number;
  endSeconds?: number;
  volume?: number;
  transitionIn?: "none" | "fade" | "dissolve";
  transitionOut?: "none" | "fade" | "dissolve";
};

export type VideoEditOptions = {
  outputWidth?: number;
  outputHeight?: number;
  outputFps?: number;
  outputFormat?: "mp4" | "webm" | "mov";
  audioMix?: "replace" | "overlay" | "mute";
};

export type VideoEditResult = {
  buffer: Buffer;
  durationSeconds: number;
  clipCount: number;
  width?: number;
  height?: number;
  mimeType: string;
  metadata?: Record<string, unknown>;
};

export function validateClips(clips: VideoClip[]): string[] {
  const errors: string[] = [];
  if (!Array.isArray(clips)) {
    errors.push("clips must be an array");
    return errors;
  }
  if (clips.length === 0) {
    errors.push("clips cannot be empty");
    return errors;
  }
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    if (!clip.asset) {
      errors.push(`clip[${i}]: asset is required`);
      continue;
    }
    if (!clip.asset.buffer && !clip.asset.url) {
      errors.push(`clip[${i}]: asset must have buffer or url`);
    }
    const start = clip.startSeconds ?? 0;
    const end = clip.endSeconds ?? (clip.asset.durationSeconds ?? 0);
    if (start < 0) {
      errors.push(`clip[${i}]: startSeconds must be >= 0`);
    }
    if (end < start) {
      errors.push(`clip[${i}]: endSeconds must be >= startSeconds`);
    }
    if (clip.volume !== undefined && (clip.volume < 0 || clip.volume > 1)) {
      errors.push(`clip[${i}]: volume must be in [0, 1]`);
    }
    if (
      clip.transitionIn &&
      !["none", "fade", "dissolve"].includes(clip.transitionIn)
    ) {
      errors.push(`clip[${i}]: invalid transitionIn`);
    }
    if (
      clip.transitionOut &&
      !["none", "fade", "dissolve"].includes(clip.transitionOut)
    ) {
      errors.push(`clip[${i}]: invalid transitionOut`);
    }
  }
  return errors;
}

export function estimateEditDuration(clips: VideoClip[]): number {
  if (clips.length === 0) return 0;
  let total = 0;
  for (const clip of clips) {
    const start = clip.startSeconds ?? 0;
    const end = clip.endSeconds ?? (clip.asset.durationSeconds ?? 0);
    total += Math.max(0, end - start);
  }
  return total;
}

export function trimClip(
  asset: GeneratedVideoAsset,
  startSeconds?: number,
  endSeconds?: number,
): VideoClip {
  const duration = asset.durationSeconds ?? 0;
  const start = Math.max(0, startSeconds ?? 0);
  const end = Math.min(duration, endSeconds ?? duration);
  return {
    asset: {
      ...asset,
      durationSeconds: Math.max(0, end - start),
    },
    startSeconds: start,
    endSeconds: end,
  };
}

export function applyTransitions(
  clips: VideoClip[],
  transition: "none" | "fade" | "dissolve" = "none",
): VideoClip[] {
  if (transition === "none" || clips.length < 2) return clips;
  return clips.map((clip, idx) => ({
    ...clip,
    transitionIn: idx > 0 ? transition : clip.transitionIn,
    transitionOut: idx < clips.length - 1 ? transition : clip.transitionOut,
  }));
}

export function validateEditOptions(options: VideoEditOptions): string[] {
  const errors: string[] = [];
  if (
    options.outputWidth !== undefined &&
    (!Number.isInteger(options.outputWidth) || options.outputWidth <= 0)
  ) {
    errors.push("outputWidth must be a positive integer");
  }
  if (
    options.outputHeight !== undefined &&
    (!Number.isInteger(options.outputHeight) || options.outputHeight <= 0)
  ) {
    errors.push("outputHeight must be a positive integer");
  }
  if (
    options.outputFps !== undefined &&
    (!Number.isInteger(options.outputFps) ||
      options.outputFps < 1 ||
      options.outputFps > 120)
  ) {
    errors.push("outputFps must be an integer in [1, 120]");
  }
  if (
    options.audioMix !== undefined &&
    !["replace", "overlay", "mute"].includes(options.audioMix)
  ) {
    errors.push("audioMix must be replace | overlay | mute");
  }
  return errors;
}

export async function editClips(
  clips: VideoClip[],
  options: VideoEditOptions = {},
): Promise<VideoEditResult> {
  const clipErrors = validateClips(clips);
  if (clipErrors.length > 0) {
    throw new Error(`Invalid clips: ${clipErrors.join("; ")}`);
  }
  const optErrors = validateEditOptions(options);
  if (optErrors.length > 0) {
    throw new Error(`Invalid options: ${optErrors.join("; ")}`);
  }

  const durationSeconds = estimateEditDuration(clips);
  logger.debug(
    `[VideoEditor] Editing ${clips.length} clip(s), total duration ${durationSeconds}s`,
  );

  // 模拟拼接：将所有 clip buffer 顺序拼接为占位输出
  const totalSize = clips.reduce(
    (acc, c) => acc + (c.asset.buffer?.length ?? 0),
    0,
  );
  const buffer = Buffer.alloc(Math.max(totalSize, 1));
  let offset = 0;
  for (const clip of clips) {
    if (!clip.asset.buffer) continue;
    clip.asset.buffer.copy(buffer, offset);
    offset += clip.asset.buffer.length;
  }

  return {
    buffer,
    durationSeconds,
    clipCount: clips.length,
    width: options.outputWidth,
    height: options.outputHeight,
    mimeType: `video/${options.outputFormat ?? "mp4"}`,
    metadata: {
      fps: options.outputFps,
      audioMix: options.audioMix,
      createdAt: Date.now(),
    },
  };
}

export function listOutputFormats(): string[] {
  return ["mp4", "webm", "mov"];
}
