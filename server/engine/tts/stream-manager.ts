/**
 * 流式管理 — 文本分段流式合成与分块传输。
 *
 * 将长文本按句段切分，逐段调用 Provider 合成并按序产出分块，
 * 支持背压（消费者 await 期间暂停生产）。
 */

import type {
  AudioFormat,
  ProviderConfig,
  TTSProviderPlugin,
  TTSStreamChunk,
} from './types.js';
import { segmentText } from './text-processor.js';

/** 流式合成参数。 */
export interface StreamSynthesizeParams {
  text: string;
  provider: TTSProviderPlugin;
  providerConfig: ProviderConfig;
  voice: string;
  format: AudioFormat;
  sampleRate?: number;
  speed?: number;
  pitch?: number;
  volume?: number;
  /** 单段最大字符数。 */
  maxLength?: number;
  timeoutMs?: number;
  /** 可注入的 fetch 实现，便于测试。 */
  fetchFn?: typeof fetch;
}

/**
 * 流式合成：逐段产出音频分块。
 * 实现 AsyncIterable，可被 for-await-of 消费。
 */
export async function* streamSynthesize(
  params: StreamSynthesizeParams,
): AsyncGenerator<TTSStreamChunk, void, void> {
  const {
    text,
    provider,
    providerConfig,
    voice,
    format,
    sampleRate,
    speed,
    pitch,
    volume,
    maxLength = 1500,
    timeoutMs,
    fetchFn,
  } = params;

  const segments = segmentText(text, maxLength);
  const queue = segments.length > 0 ? segments : [''];

  let sequence = 0;
  for (const segment of queue) {
    const result = await provider.synthesize({
      text: segment,
      config: providerConfig,
      voice,
      format,
      sampleRate,
      speed,
      pitch,
      volume,
      timeoutMs,
      fetchFn,
    });
    sequence++;
    yield {
      audio: result.audio,
      sequence,
      isFinal: sequence === queue.length,
      format: result.format,
    };
  }
}

/**
 * 收集流式输出为单个 Buffer。
 * 用于非流式消费场景（如一次性返回完整音频）。
 */
export async function collectStream(
  stream: AsyncIterable<TTSStreamChunk>,
): Promise<{ audio: Buffer; format: AudioFormat }> {
  const chunks: Buffer[] = [];
  let format: AudioFormat = 'mp3';
  for await (const chunk of stream) {
    chunks.push(chunk.audio);
    format = chunk.format;
  }
  return { audio: Buffer.concat(chunks), format };
}
