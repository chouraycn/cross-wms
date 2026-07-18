/**
 * Document Analyzer — 文档分析器
 *
 * 提取 PDF / Word / Excel 文档内容。
 * 通过动态加载可选依赖（pdf-parse、mammoth）实现，缺失时回退到 Provider。
 */

import { logger } from '../../logger.js';
import { buildCacheKey, MediaAnalysisCache } from './cache.js';
import { findProviderForCapability, type ProviderRegistry } from './provider-registry.js';
import type {
  AnalyzeOptions,
  DocumentAnalysis,
  MediaAnalysis,
  MediaAnalyzer,
  MediaInput,
} from './types.js';

export interface DocumentAnalyzerOptions {
  registry: ProviderRegistry;
  cache?: MediaAnalysisCache<DocumentAnalysis>;
  defaultMultimodalProviderId?: string;
}

const SUPPORTED_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.ms-excel',
];

/** 根据文件名或 MIME 推断文档子类型 */
export function inferDocumentType(
  mime?: string,
  fileName?: string,
): DocumentAnalysis['documentType'] {
  const lower = (fileName ?? '').toLowerCase();
  if (mime === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf';
  if (
    mime?.includes('wordprocessing') ||
    mime === 'application/msword' ||
    lower.endsWith('.doc') ||
    lower.endsWith('.docx')
  ) {
    return 'word';
  }
  if (
    mime?.includes('spreadsheet') ||
    mime === 'application/vnd.ms-excel' ||
    lower.endsWith('.xls') ||
    lower.endsWith('.xlsx')
  ) {
    return 'excel';
  }
  return 'unknown';
}

export function createDocumentAnalyzer(opts: DocumentAnalyzerOptions): MediaAnalyzer {
  const cache = opts.cache ?? new MediaAnalysisCache<DocumentAnalysis>();

  async function analyze(
    input: MediaInput,
    options?: AnalyzeOptions,
  ): Promise<MediaAnalysis> {
    const useCache = options?.skipCache !== true;
    const cacheKey = buildCacheKey(input);
    if (useCache) {
      const cached = cache.get(cacheKey);
      if (cached) {
        logger.debug(`[DocumentAnalyzer] cache hit: ${input.fileName ?? input.url ?? 'buffer'}`);
        return { kind: 'document', result: cached };
      }
    }

    const docType = inferDocumentType(input.mime, input.fileName);
    let result: DocumentAnalysis | null = null;

    if (input.buffer) {
      try {
        result = await tryLocalExtraction(input.buffer, docType, options?.maxLength ?? 100_000);
      } catch (e) {
        logger.warn(
          `[DocumentAnalyzer] local extraction failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    if (!result) {
      const provider = findProviderForCapability(
        opts.registry,
        'document',
        options?.providerId ?? opts.defaultMultimodalProviderId,
      );
      if (!provider || !provider.extractDocument) {
        throw new Error('未找到支持文档分析的 Provider，且本地提取失败');
      }
      result = await provider.extractDocument(input, options);
      result.documentType = docType;
    }

    if (useCache) {
      cache.set(cacheKey, result);
    }
    return { kind: 'document', result };
  }

  return {
    id: 'document',
    supportedMimes: SUPPORTED_MIMES,
    analyze,
  };
}

/**
 * 尝试本地提取：按文档类型动态加载可选依赖。
 * 依赖缺失时抛出错误，由上层回退到 Provider。
 */
async function tryLocalExtraction(
  buffer: Buffer,
  docType: DocumentAnalysis['documentType'],
  maxLength: number,
): Promise<DocumentAnalysis> {
  if (docType === 'pdf') {
    // @ts-ignore - pdf-parse 没有类型声明
    const mod = await import('pdf-parse');
    const pdfParse = (mod && (mod.default ?? mod)) as (buf: Buffer) => Promise<{
      text: string;
      numpages?: number;
    }>;
    const data = await pdfParse(buffer);
    const truncated = data.text.length > maxLength;
    return {
      text: truncated ? data.text.slice(0, maxLength) : data.text,
      documentType: 'pdf',
      pageCount: data.numpages,
      truncated,
    };
  }
  if (docType === 'word') {
    const mod = await import('mammoth');
    const result = await mod.extractRawText({ buffer });
    const truncated = result.value.length > maxLength;
    return {
      text: truncated ? result.value.slice(0, maxLength) : result.value,
      documentType: 'word',
      truncated,
    };
  }
  if (docType === 'excel') {
    const mod = await import('@e965/xlsx');
    const workbook = mod.read(buffer, { type: 'buffer' });
    const sheets: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = mod.utils.sheet_to_csv(sheet);
      sheets.push(`## ${sheetName}\n${csv}`);
    }
    const text = sheets.join('\n\n');
    const truncated = text.length > maxLength;
    return {
      text: truncated ? text.slice(0, maxLength) : text,
      documentType: 'excel',
      truncated,
    };
  }
  throw new Error(`不支持的文档类型: ${docType}`);
}
