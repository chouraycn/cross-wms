/**
 * Web Content Extractors — 网页内容提取器管理器
 *
 * 管理内容提取器的注册、获取、排序以及链式回退提取。
 * 高级提取器失败时自动降级到低级提取器。
 */

import type {
  PluginWebContentExtractorEntry,
  WebContentExtractorPlugin,
  WebContentExtractionRequest,
  WebContentExtractionResult,
} from "./web-content-extractor-types.js";

// ==================== 内部状态 ====================

const registeredExtractors: Map<string, PluginWebContentExtractorEntry[]> = new Map();

// ==================== 排序函数 ====================

function compareExtractorsAlphabetically(
  a: Pick<PluginWebContentExtractorEntry, "id" | "pluginId">,
  b: Pick<PluginWebContentExtractorEntry, "id" | "pluginId">,
): number {
  return a.id.localeCompare(b.id) || a.pluginId.localeCompare(b.pluginId);
}

export function sortWebContentExtractors(
  extractors: PluginWebContentExtractorEntry[],
): PluginWebContentExtractorEntry[] {
  return [...extractors].sort(compareExtractorsAlphabetically);
}

export function sortWebContentExtractorsByPriority(
  extractors: PluginWebContentExtractorEntry[],
): PluginWebContentExtractorEntry[] {
  return [...extractors].sort((a, b) => {
    const aOrder = a.autoDetectOrder ?? Number.MIN_SAFE_INTEGER;
    const bOrder = b.autoDetectOrder ?? Number.MIN_SAFE_INTEGER;
    if (bOrder !== aOrder) {
      return bOrder - aOrder;
    }
    return compareExtractorsAlphabetically(a, b);
  });
}

// ==================== 注册与获取 ====================

export function registerWebContentExtractor(
  pluginId: string,
  extractor: WebContentExtractorPlugin,
): void {
  if (!registeredExtractors.has(pluginId)) {
    registeredExtractors.set(pluginId, []);
  }
  const entries = registeredExtractors.get(pluginId)!;
  const existingIndex = entries.findIndex((e) => e.id === extractor.id);
  const entry: PluginWebContentExtractorEntry = {
    ...extractor,
    pluginId,
  };
  if (existingIndex >= 0) {
    entries[existingIndex] = entry;
  } else {
    entries.push(entry);
  }
}

export function unregisterWebContentExtractor(
  pluginId: string,
  extractorId?: string,
): void {
  if (!extractorId) {
    registeredExtractors.delete(pluginId);
    return;
  }
  const entries = registeredExtractors.get(pluginId);
  if (!entries) return;
  const filtered = entries.filter((e) => e.id !== extractorId);
  if (filtered.length === 0) {
    registeredExtractors.delete(pluginId);
  } else {
    registeredExtractors.set(pluginId, filtered);
  }
}

export function getWebContentExtractors(
  options?: {
    onlyPluginIds?: readonly string[];
  },
): PluginWebContentExtractorEntry[] {
  const onlyPluginIdSet = options?.onlyPluginIds
    ? new Set(options.onlyPluginIds)
    : undefined;

  const allEntries: PluginWebContentExtractorEntry[] = [];
  registeredExtractors.forEach((entries, pluginId) => {
    if (onlyPluginIdSet && !onlyPluginIdSet.has(pluginId)) {
      return;
    }
    allEntries.push(...entries);
  });
  return sortWebContentExtractors(allEntries);
}

// ==================== 链式提取 ====================

export interface ExtractWebContentOptions {
  preferredExtractorId?: string;
  onlyPluginIds?: readonly string[];
  shouldFallback?: (result: WebContentExtractionResult | null, error?: Error) => boolean;
}

export interface ExtractWebContentResult {
  result: WebContentExtractionResult | null;
  extractorUsed: string | null;
  errors: Array<{ extractorId: string; error: string }>;
  allExtractors: PluginWebContentExtractorEntry[];
}

function buildExtractorChain(
  options: ExtractWebContentOptions,
): PluginWebContentExtractorEntry[] {
  const allExtractors = getWebContentExtractors({
    onlyPluginIds: options.onlyPluginIds,
  });

  if (options.preferredExtractorId) {
    const preferred = allExtractors.find((e) => e.id === options.preferredExtractorId);
    if (preferred) {
      const others = allExtractors.filter((e) => e.id !== options.preferredExtractorId);
      return [preferred, ...sortWebContentExtractorsByPriority(others)];
    }
  }

  return sortWebContentExtractorsByPriority(allExtractors);
}

export async function extractWebContent(
  request: WebContentExtractionRequest,
  options: ExtractWebContentOptions = {},
): Promise<ExtractWebContentResult> {
  const chain = buildExtractorChain(options);
  const errors: Array<{ extractorId: string; error: string }> = [];

  for (const extractor of chain) {
    try {
      const supported = await extractor.supports(request);
      if (!supported) {
        errors.push({ extractorId: extractor.id, error: "Extractor does not support this request" });
        continue;
      }

      const result = await extractor.extract(request);

      if (options.shouldFallback) {
        if (!options.shouldFallback(result)) {
          return {
            result,
            extractorUsed: extractor.id,
            errors,
            allExtractors: chain,
          };
        }
      } else if (result !== null) {
        return {
          result,
          extractorUsed: extractor.id,
          errors,
          allExtractors: chain,
        };
      }

      errors.push({ extractorId: extractor.id, error: "Extraction returned null or fallback condition met" });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      errors.push({ extractorId: extractor.id, error: errorMsg });
    }
  }

  return {
    result: null,
    extractorUsed: null,
    errors,
    allExtractors: chain,
  };
}

// ==================== 工具函数 ====================

export function getWebContentExtractorById(
  id: string,
  options?: { onlyPluginIds?: readonly string[] },
): PluginWebContentExtractorEntry | null {
  const all = getWebContentExtractors(options);
  return all.find((e) => e.id === id) ?? null;
}
