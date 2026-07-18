/**
 * Provider Registry — 媒体分析 Provider 注册表
 *
 * 管理多模态 Provider 和 OCR Provider 的注册、查询、能力匹配。
 */

import { logger } from '../../logger.js';
import type { MediaCapability, MultimodalProvider, OcrProvider } from './types.js';

export interface ProviderRegistry {
  /** 多模态 Provider 列表 */
  multimodal: Map<string, MultimodalProvider>;
  /** OCR Provider 列表 */
  ocr: Map<string, OcrProvider>;
}

/** 创建新的 Provider 注册表 */
export function createProviderRegistry(): ProviderRegistry {
  return {
    multimodal: new Map<string, MultimodalProvider>(),
    ocr: new Map<string, OcrProvider>(),
  };
}

/** 注册多模态 Provider */
export function registerMultimodalProvider(
  registry: ProviderRegistry,
  provider: MultimodalProvider,
): void {
  registry.multimodal.set(provider.id, provider);
  logger.debug(`[ProviderRegistry] registered multimodal provider: ${provider.id}`);
}

/** 注册 OCR Provider */
export function registerOcrProvider(
  registry: ProviderRegistry,
  provider: OcrProvider,
): void {
  registry.ocr.set(provider.id, provider);
  logger.debug(`[ProviderRegistry] registered OCR provider: ${provider.id}`);
}

/** 注销多模态 Provider */
export function unregisterMultimodalProvider(registry: ProviderRegistry, id: string): boolean {
  const removed = registry.multimodal.delete(id);
  if (removed) logger.debug(`[ProviderRegistry] unregistered multimodal provider: ${id}`);
  return removed;
}

/** 注销 OCR Provider */
export function unregisterOcrProvider(registry: ProviderRegistry, id: string): boolean {
  const removed = registry.ocr.delete(id);
  if (removed) logger.debug(`[ProviderRegistry] unregistered OCR provider: ${id}`);
  return removed;
}

/** 获取多模态 Provider */
export function getMultimodalProvider(
  registry: ProviderRegistry,
  id: string,
): MultimodalProvider | undefined {
  return registry.multimodal.get(id);
}

/** 获取 OCR Provider */
export function getOcrProvider(
  registry: ProviderRegistry,
  id: string,
): OcrProvider | undefined {
  return registry.ocr.get(id);
}

/** 查找支持指定能力的多模态 Provider 列表 */
export function findProvidersByCapability(
  registry: ProviderRegistry,
  capability: MediaCapability,
): MultimodalProvider[] {
  const result: MultimodalProvider[] = [];
  for (const provider of registry.multimodal.values()) {
    if (provider.capabilities.includes(capability)) {
      result.push(provider);
    }
  }
  return result;
}

/** 查找支持指定能力且具备目标方法的多模态 Provider */
export function findProviderForCapability(
  registry: ProviderRegistry,
  capability: MediaCapability,
  preferredId?: string,
): MultimodalProvider | undefined {
  if (preferredId) {
    const preferred = registry.multimodal.get(preferredId);
    if (preferred && preferred.capabilities.includes(capability)) {
      return preferred;
    }
    logger.debug(`[ProviderRegistry] preferred provider not found or lacks capability: ${preferredId}`);
  }
  return findProvidersByCapability(registry, capability)[0];
}

/** 获取第一个 OCR Provider（可指定 id） */
export function findOcrProvider(
  registry: ProviderRegistry,
  preferredId?: string,
): OcrProvider | undefined {
  if (preferredId) {
    return registry.ocr.get(preferredId);
  }
  return registry.ocr.values().next().value;
}
