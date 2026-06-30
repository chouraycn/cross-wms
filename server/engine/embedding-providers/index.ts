import { globalEmbeddingRegistry } from './registry.js';
import { ONNX_PROVIDER_CONFIG, createOnnxEmbeddingProvider } from './onnxProvider.js';
import { logger } from '../../logger.js';

export function initEmbeddingProviders(): void {
  if (globalEmbeddingRegistry.has('onnx')) {
    logger.debug('[Embedding] 提供者已初始化，跳过');
    return;
  }

  globalEmbeddingRegistry.register(
    'onnx',
    createOnnxEmbeddingProvider,
    ONNX_PROVIDER_CONFIG,
    { isDefault: true, priority: 10 }
  );

  logger.info('[Embedding] 嵌入提供者初始化完成，可用:',
    globalEmbeddingRegistry.listProviders().map(p => `${p.providerId} (${p.displayName})`).join(', '));
}

export function getEmbeddingProvider(providerId?: string) {
  if (!globalEmbeddingRegistry.has('onnx')) {
    initEmbeddingProviders();
  }
  return globalEmbeddingRegistry.getProvider(providerId);
}

export async function embedText(text: string, providerId?: string) {
  if (!globalEmbeddingRegistry.has('onnx')) {
    initEmbeddingProviders();
  }
  return globalEmbeddingRegistry.embed(text, providerId);
}

export async function embedTextBatch(texts: string[], providerId?: string) {
  if (!globalEmbeddingRegistry.has('onnx')) {
    initEmbeddingProviders();
  }
  return globalEmbeddingRegistry.embedBatch(texts, providerId);
}

export { globalEmbeddingRegistry } from './registry.js';
export * from './types.js';
export { OnnxEmbeddingProvider, createOnnxEmbeddingProvider } from './onnxProvider.js';
