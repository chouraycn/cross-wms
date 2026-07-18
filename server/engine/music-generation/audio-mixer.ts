/**
 * Audio Mixer — 音频混音器
 *
 * 提供音频轨道合并、淡入淡出、音量调整、裁剪等纯计算逻辑。
 * 不依赖外部音频处理库，只做参数校验与坐标计算。
 */

import { logger } from "../../logger.js";
import type { GeneratedMusicAsset } from "./types.js";

export type MixTrack = {
  asset: GeneratedMusicAsset;
  volume?: number; // 0-1
  startOffsetMs?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
};

export type MixOptions = {
  crossfadeMs?: number;
  outputSampleRate?: number;
  outputChannels?: 1 | 2;
  normalize?: boolean;
};

export type MixResult = {
  buffer: Buffer;
  durationSeconds: number;
  trackCount: number;
  mimeType: string;
  metadata?: Record<string, unknown>;
};

export function validateMixTracks(tracks: MixTrack[]): string[] {
  const errors: string[] = [];
  if (!Array.isArray(tracks)) {
    errors.push("tracks must be an array");
    return errors;
  }
  if (tracks.length === 0) {
    errors.push("tracks cannot be empty");
    return errors;
  }
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    if (!track.asset) {
      errors.push(`track[${i}]: asset is required`);
      continue;
    }
    if (!track.asset.buffer) {
      errors.push(`track[${i}]: asset.buffer is required`);
    }
    if (track.volume !== undefined) {
      if (typeof track.volume !== "number" || track.volume < 0 || track.volume > 1) {
        errors.push(`track[${i}]: volume must be in [0, 1]`);
      }
    }
    if (track.startOffsetMs !== undefined && track.startOffsetMs < 0) {
      errors.push(`track[${i}]: startOffsetMs must be >= 0`);
    }
    if (track.fadeInMs !== undefined && track.fadeInMs < 0) {
      errors.push(`track[${i}]: fadeInMs must be >= 0`);
    }
    if (track.fadeOutMs !== undefined && track.fadeOutMs < 0) {
      errors.push(`track[${i}]: fadeOutMs must be >= 0`);
    }
  }
  return errors;
}

export function estimateMixDuration(tracks: MixTrack[]): number {
  if (tracks.length === 0) return 0;
  let maxEndMs = 0;
  for (const track of tracks) {
    const offset = track.startOffsetMs ?? 0;
    const durationMs = (track.asset.durationSeconds ?? 0) * 1000;
    const end = offset + durationMs;
    if (end > maxEndMs) maxEndMs = end;
  }
  return maxEndMs / 1000;
}

export function calculateVolumeCurve(
  durationMs: number,
  volume: number,
  fadeInMs?: number,
  fadeOutMs?: number,
): Array<{ timeMs: number; volume: number }> {
  const points: Array<{ timeMs: number; volume: number }> = [];
  if (durationMs <= 0) return points;
  const effectiveVolume = Math.max(0, Math.min(1, volume));

  if (fadeInMs && fadeInMs > 0) {
    points.push({ timeMs: 0, volume: 0 });
    points.push({ timeMs: fadeInMs, volume: effectiveVolume });
  } else {
    points.push({ timeMs: 0, volume: effectiveVolume });
  }

  if (fadeOutMs && fadeOutMs > 0) {
    points.push({ timeMs: durationMs - fadeOutMs, volume: effectiveVolume });
    points.push({ timeMs: durationMs, volume: 0 });
  } else {
    points.push({ timeMs: durationMs, volume: effectiveVolume });
  }

  return points;
}

export function normalizeVolume(tracks: MixTrack[]): MixTrack[] {
  return tracks.map((t) => ({
    ...t,
    volume: t.volume === undefined ? 1 : Math.max(0, Math.min(1, t.volume)),
  }));
}

export function applyCrossfade(
  tracks: MixTrack[],
  crossfadeMs: number,
): MixTrack[] {
  if (crossfadeMs <= 0 || tracks.length < 2) return tracks;
  const result: MixTrack[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const fadeOut = i < tracks.length - 1 ? crossfadeMs : track.fadeOutMs;
    const fadeIn = i > 0 ? crossfadeMs : track.fadeInMs;
    result.push({
      ...track,
      fadeInMs: fadeIn,
      fadeOutMs: fadeOut,
    });
  }
  return result;
}

export function clipTrack(
  track: MixTrack,
  startMs?: number,
  endMs?: number,
): MixTrack {
  const duration = (track.asset.durationSeconds ?? 0) * 1000;
  const start = Math.max(0, startMs ?? 0);
  const end = Math.min(duration, endMs ?? duration);
  return {
    ...track,
    startOffsetMs: (track.startOffsetMs ?? 0) + start,
    asset: {
      ...track.asset,
      durationSeconds: Math.max(0, (end - start) / 1000),
      metadata: {
        ...track.asset.metadata,
        clipStartMs: start,
        clipEndMs: end,
      },
    },
  };
}

export async function mixTracks(
  tracks: MixTrack[],
  options: MixOptions = {},
): Promise<MixResult> {
  const errors = validateMixTracks(tracks);
  if (errors.length > 0) {
    throw new Error(`Invalid mix tracks: ${errors.join("; ")}`);
  }

  let workingTracks = normalizeVolume(tracks);
  if (options.crossfadeMs && options.crossfadeMs > 0) {
    workingTracks = applyCrossfade(workingTracks, options.crossfadeMs);
  }

  const durationSeconds = estimateMixDuration(workingTracks);

  logger.debug(
    `[AudioMixer] Mixing ${workingTracks.length} track(s), total duration ${durationSeconds}s`,
  );

  // 模拟混音：将所有轨道 buffer 拼接为占位输出
  const totalSize = workingTracks.reduce(
    (acc, t) => acc + (t.asset.buffer?.length ?? 0),
    0,
  );
  const mixedBuffer = Buffer.alloc(Math.max(totalSize, 1));
  let offset = 0;
  for (const track of workingTracks) {
    if (!track.asset.buffer) continue;
    track.asset.buffer.copy(mixedBuffer, offset);
    offset += track.asset.buffer.length;
  }

  return {
    buffer: mixedBuffer,
    durationSeconds,
    trackCount: workingTracks.length,
    mimeType: "audio/wav",
    metadata: {
      crossfadeMs: options.crossfadeMs,
      normalize: options.normalize ?? false,
      sampleRate: options.outputSampleRate,
      channels: options.outputChannels,
      createdAt: Date.now(),
    },
  };
}

export function listMixFormats(): string[] {
  return ["wav", "mp3", "ogg", "flac"];
}

export function validateMixOptions(options: MixOptions): string[] {
  const errors: string[] = [];
  if (options.crossfadeMs !== undefined && options.crossfadeMs < 0) {
    errors.push("crossfadeMs must be >= 0");
  }
  if (
    options.outputSampleRate !== undefined &&
    ![8000, 16000, 22050, 44100, 48000].includes(options.outputSampleRate)
  ) {
    errors.push("outputSampleRate must be a standard sample rate");
  }
  if (
    options.outputChannels !== undefined &&
    ![1, 2].includes(options.outputChannels)
  ) {
    errors.push("outputChannels must be 1 or 2");
  }
  return errors;
}
