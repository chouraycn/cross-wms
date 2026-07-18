/**
 * 音频编码器 — PCM/WAV 互转与格式处理。
 *
 * 完整实现 WAV（RIFF/WAVE）封装与解封装；MP3/Opus/AAC 因依赖原生编码库，
 * 仅做透传与格式识别，保持 API 一致。所有操作基于 Buffer，便于测试。
 */

import type { AudioFormat } from './types.js';

const DEFAULT_CHANNELS = 1;
const DEFAULT_BIT_DEPTH = 16;

/** 构造 WAV 文件头。 */
export function buildWavHeader(
  dataLength: number,
  sampleRate: number,
  channels = DEFAULT_CHANNELS,
  bitDepth = DEFAULT_BIT_DEPTH,
): Buffer {
  const byteRate = (sampleRate * channels * bitDepth) / 8;
  const blockAlign = (channels * bitDepth) / 8;
  const buffer = Buffer.alloc(44);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM fmt chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitDepth, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);
  return buffer;
}

/** 将 PCM 裸数据封装为 WAV。 */
export function pcmToWav(
  pcm: Buffer,
  sampleRate: number,
  channels = DEFAULT_CHANNELS,
  bitDepth = DEFAULT_BIT_DEPTH,
): Buffer {
  const header = buildWavHeader(pcm.length, sampleRate, channels, bitDepth);
  return Buffer.concat([header, pcm]);
}

/** WAV 解封装结果。 */
export interface WavInfo {
  pcm: Buffer;
  sampleRate: number;
  channels: number;
  bitDepth: number;
}

/** 从 WAV 中提取 PCM 裸数据与格式信息。 */
export function wavToPcm(wav: Buffer): WavInfo {
  if (wav.length < 44) throw new Error('Invalid WAV: too short');
  if (wav.toString('ascii', 0, 4) !== 'RIFF') throw new Error('Invalid WAV: missing RIFF');
  if (wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid WAV: missing WAVE');

  const channels = wav.readUInt16LE(22);
  const sampleRate = wav.readUInt32LE(24);
  const bitDepth = wav.readUInt16LE(34);

  // 查找 data chunk（fmt chunk 长度可变，需扫描）
  let offset = 12;
  let pcmStart = -1;
  let pcmLength = 0;
  while (offset + 8 <= wav.length) {
    const chunkId = wav.toString('ascii', offset, offset + 4);
    const chunkSize = wav.readUInt32LE(offset + 4);
    if (chunkId === 'data') {
      pcmStart = offset + 8;
      pcmLength = chunkSize;
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2); // 块对齐填充
  }
  if (pcmStart < 0) throw new Error('Invalid WAV: missing data chunk');

  return {
    pcm: wav.subarray(pcmStart, pcmStart + pcmLength),
    sampleRate,
    channels,
    bitDepth,
  };
}

/** 拼接多段 PCM 数据。 */
export function concatPcm(chunks: readonly Buffer[]): Buffer {
  return Buffer.concat(chunks);
}

/** 通过魔术字节识别音频格式。 */
export function detectFormat(buffer: Buffer): AudioFormat | undefined {
  if (buffer.length < 4) return undefined;
  // RIFF....WAVE
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') {
    return 'wav';
  }
  // ID3 标签或帧同步 0xFFEx/0xFFFx
  if (buffer.toString('ascii', 0, 3) === 'ID3') return 'mp3';
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return 'mp3';
  // OggS (Opus 通常封装在 Ogg 中)
  if (buffer.toString('ascii', 0, 4) === 'OggS') return 'opus';
  // ADTS AAC 帧同步 0xFFF0
  if (buffer[0] === 0xff && (buffer[1] & 0xf0) === 0xf0) return 'aac';
  return undefined;
}

/** 转码选项。 */
export interface EncodeOptions {
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
}

/**
 * 在格式之间转换音频数据。
 * - pcm ↔ wav：完整实现
 * - 其它格式（mp3/opus/aac）：无原生编码器时透传，仅更新格式标签
 */
export function encodeAudio(
  buffer: Buffer,
  from: AudioFormat,
  to: AudioFormat,
  options: EncodeOptions = {},
): Buffer {
  if (from === to) return buffer;

  const sampleRate = options.sampleRate ?? 16000;
  const channels = options.channels ?? DEFAULT_CHANNELS;
  const bitDepth = options.bitDepth ?? DEFAULT_BIT_DEPTH;

  // PCM → WAV
  if (from === 'pcm' && to === 'wav') {
    return pcmToWav(buffer, sampleRate, channels, bitDepth);
  }
  // WAV → PCM
  if (from === 'wav' && to === 'pcm') {
    return wavToPcm(buffer).pcm;
  }
  // 经 PCM 中转（WAV ↔ 其它）
  if (from === 'wav' && to !== 'pcm') {
    const pcm = wavToPcm(buffer).pcm;
    return encodeAudio(pcm, 'pcm', to, options);
  }
  if (from !== 'wav' && to === 'wav') {
    // 非 pcm/wav → wav 无法解码，透传并交由调用方处理
    return buffer;
  }
  // 其它组合透传
  return buffer;
}

/**
 * 对 16-bit PCM 做线性插值重采样。
 * 仅用于简单采样率转换，不抗混叠。
 */
export function resamplePcm(
  pcm: Buffer,
  fromRate: number,
  toRate: number,
  channels = DEFAULT_CHANNELS,
): Buffer {
  if (fromRate === toRate) return Buffer.from(pcm);
  if (fromRate <= 0 || toRate <= 0) throw new Error('sample rate must be positive');

  const bytesPerFrame = 2 * channels; // 16-bit
  const frameCount = Math.floor(pcm.length / bytesPerFrame);
  const outFrames = Math.floor((frameCount * toRate) / fromRate);
  const out = Buffer.alloc(outFrames * bytesPerFrame);

  for (let i = 0; i < outFrames; i++) {
    const srcPos = (i * fromRate) / toRate;
    const srcIdx = Math.floor(srcPos);
    const frac = srcPos - srcIdx;
    for (let c = 0; c < channels; c++) {
      const base = srcIdx * bytesPerFrame + c * 2;
      const s1 = base + bytesPerFrame < pcm.length ? pcm.readInt16LE(base) : 0;
      const s2 = base + bytesPerFrame + 2 < pcm.length ? pcm.readInt16LE(base + 2) : s1;
      const value = Math.round(s1 + (s2 - s1) * frac);
      out.writeInt16LE(value, i * bytesPerFrame + c * 2);
    }
  }
  return out;
}

/** 估算 PCM 数据对应的时长（毫秒）。 */
export function estimateDurationMs(
  pcm: Buffer,
  sampleRate: number,
  channels = DEFAULT_CHANNELS,
  bitDepth = DEFAULT_BIT_DEPTH,
): number {
  const bytesPerSecond = (sampleRate * channels * bitDepth) / 8;
  if (bytesPerSecond <= 0) return 0;
  return Math.round((pcm.length / bytesPerSecond) * 1000);
}
