/**
 * OCR Provider — 文字识别 Provider
 *
 * 通过可注入的 recognizeFn 实现图片文字识别，便于测试与替换。
 */

import { logger } from '../../../logger.js';
import type { OcrProvider } from '../types.js';

export type OcrRecognizeFn = (buffer: Buffer, mime?: string) => Promise<string>;

export interface OcrProviderOptions {
  id?: string;
  recognizeFn?: OcrRecognizeFn;
}

const DEFAULT_ID = 'ocr';

export function createOcrProvider(opts: OcrProviderOptions = {}): OcrProvider {
  const id = opts.id ?? DEFAULT_ID;
  const recognizeFn = opts.recognizeFn;

  return {
    id,
    async recognize(buffer: Buffer, mime?: string): Promise<string> {
      if (!recognizeFn) {
        throw new Error(`OcrProvider[${id}] 未配置 recognizeFn`);
      }
      const text = await recognizeFn(buffer, mime);
      logger.debug(`[OCR] recognized ${buffer.length} bytes -> ${text.length} chars`);
      return text;
    },
  };
}

/** 默认 OCR Provider（无 recognizeFn，需调用方注入后使用） */
export const defaultOcrProvider = createOcrProvider();
