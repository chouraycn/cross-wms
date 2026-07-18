/**
 * Multimodal Provider — 多模态分析 Provider
 *
 * 使用 LLM 视觉/多模态能力描述图像、视频、音频、文档。
 * 实际 LLM 调用通过可注入的 describeFn 实现，便于测试。
 */

import { logger } from '../../../logger.js';
import type {
  AnalyzeOptions,
  AudioAnalysis,
  DocumentAnalysis,
  ImageDescription,
  ImageSafetyResult,
  MediaInput,
  MultimodalProvider,
  VideoAnalysis,
} from '../types.js';

/** 可注入的多模态描述函数：接收输入和提示词，返回文本 */
export type MultimodalDescribeFn = (
  input: MediaInput,
  prompt: string,
  options?: AnalyzeOptions,
) => Promise<string>;

export interface MultimodalProviderOptions {
  id?: string;
  model?: string;
  describeFn?: MultimodalDescribeFn;
}

const DEFAULT_ID = 'multimodal';
const DEFAULT_MODEL = 'multimodal-default';

/** 简单文本解析：从 LLM 输出提取标签列表 */
function parseTags(text: string): string[] {
  const tags: string[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const match = line.match(/^(?:tags?|标签)\s*[:：]\s*(.+)$/i);
    if (match) {
      for (const tag of match[1].split(/[,，;；]/)) {
        const trimmed = tag.trim();
        if (trimmed) tags.push(trimmed);
      }
    }
  }
  return tags;
}

function buildImagePrompt(options?: AnalyzeOptions): string {
  const parts = ['请详细描述这张图片的内容。'];
  if (options?.ocr) parts.push('同时识别图片中的文字。');
  if (options?.faceDetection) parts.push('检测图片中的人脸数量。');
  if (options?.safetyDetection !== false) parts.push('检测图片是否包含不安全内容。');
  parts.push('在最后一行用 "tags: tag1, tag2" 格式列出关键词标签。');
  return parts.join(' ');
}

export function createMultimodalProvider(opts: MultimodalProviderOptions = {}): MultimodalProvider {
  const id = opts.id ?? DEFAULT_ID;
  const model = opts.model ?? DEFAULT_MODEL;
  const describeFn = opts.describeFn;

  return {
    id,
    capabilities: ['image', 'audio', 'video', 'document'],

    async describeImage(
      input: MediaInput,
      options?: AnalyzeOptions,
    ): Promise<ImageDescription> {
      if (!describeFn) {
        throw new Error(`MultimodalProvider[${id}] 未配置 describeFn`);
      }
      const prompt = buildImagePrompt(options);
      const output = await describeFn(input, prompt, options);
      const tags = parseTags(output);
      const description = tags.length > 0
        ? output.split('\n').filter((l) => !/^tags?[:：]/i.test(l.trim())).join('\n').trim()
        : output;

      const result: ImageDescription = {
        description,
        tags,
        model,
      };

      if (options?.ocr) {
        const ocrMatch = output.match(/(?:ocr|文字)\s*[:：]\s*(.+)/i);
        if (ocrMatch) {
          result.ocrText = ocrMatch[1].trim();
        }
      }
      if (options?.faceDetection) {
        const faceMatch = output.match(/(?:faces?|人脸)\s*[:：]\s*(\d+)/i);
        if (faceMatch) {
          result.faceCount = parseInt(faceMatch[1], 10);
        }
      }
      if (options?.safetyDetection !== false) {
        const safeMatch = output.match(/(?:safe|安全)\s*[:：]\s*(yes|no|true|false|是|否)/i);
        if (safeMatch) {
          const isSafe = /^(yes|true|是)$/i.test(safeMatch[1]);
          const safety: ImageSafetyResult = {
            safe: isSafe,
            categories: isSafe ? [] : ['flagged'],
            confidence: 0.9,
          };
          result.safety = safety;
        }
      }
      logger.debug(`[Multimodal] described image: ${input.fileName ?? input.url ?? 'buffer'}`);
      return result;
    },

    async describeVideo(
      input: MediaInput,
      options?: AnalyzeOptions,
    ): Promise<VideoAnalysis> {
      if (!describeFn) {
        throw new Error(`MultimodalProvider[${id}] 未配置 describeFn`);
      }
      const prompt = '请描述视频内容，包括关键场景、动作和时长。';
      const output = await describeFn(input, prompt, options);
      const actions: string[] = [];
      for (const line of output.split('\n')) {
        const match = line.match(/^(?:actions?|动作)\s*[:：]\s*(.+)$/i);
        if (match) {
          for (const a of match[1].split(/[,，;；]/)) {
            const trimmed = a.trim();
            if (trimmed) actions.push(trimmed);
          }
        }
      }
      const durationMatch = output.match(/(?:duration|时长)\s*[:：]\s*(\d+(?:\.\d+)?)/i);
      return {
        description: output,
        keyframes: [],
        scenes: [],
        actions,
        durationSeconds: durationMatch ? parseFloat(durationMatch[1]) : undefined,
        model,
      };
    },

    async transcribeAudio(
      input: MediaInput,
      options?: AnalyzeOptions,
    ): Promise<AudioAnalysis> {
      if (!describeFn) {
        throw new Error(`MultimodalProvider[${id}] 未配置 describeFn`);
      }
      const prompt = '请转写音频内容并分析情绪。';
      const output = await describeFn(input, prompt, options);
      const emotionMatch = output.match(/(?:emotion|情绪)\s*[:：]\s*(\S+)/i);
      const hasMusicMatch = output.match(/(?:music|音乐)\s*[:：]\s*(yes|no|true|false|是|否)/i);
      return {
        transcript: output,
        hasMusic: hasMusicMatch ? /^(yes|true|是)$/i.test(hasMusicMatch[1]) : false,
        emotion: emotionMatch
          ? { primary: emotionMatch[1], distribution: { [emotionMatch[1]]: 1 } }
          : undefined,
        model,
      };
    },

    async extractDocument(
      input: MediaInput,
      options?: AnalyzeOptions,
    ): Promise<DocumentAnalysis> {
      if (!describeFn) {
        throw new Error(`MultimodalProvider[${id}] 未配置 describeFn`);
      }
      const prompt = '请提取文档内容。';
      const output = await describeFn(input, prompt, options);
      const maxLength = options?.maxLength ?? 100_000;
      const truncated = output.length > maxLength;
      return {
        text: truncated ? output.slice(0, maxLength) : output,
        documentType: 'unknown',
        truncated,
        model,
      };
    },
  };
}

/** 默认多模态 Provider（无 describeFn，需调用方注入后使用） */
export const defaultMultimodalProvider = createMultimodalProvider();
