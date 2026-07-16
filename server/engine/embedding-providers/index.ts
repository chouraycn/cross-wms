/**
 * Embedding 模块 - 向量嵌入管理
 */

export { EmbeddingProviderRegistry, globalEmbeddingRegistry } from './registry.js';
export { OnnxEmbeddingProvider, createOnnxEmbeddingProvider } from './onnxProvider.js';
export type { EmbeddingResult, EmbeddingProviderConfig, BaseEmbeddingProvider } from './types.js';

// ONNX 嵌入功能
export {
  embedText,
  embedBatch,
  initOnnxEmbedding,
  getOnnxStatus,
  ONNX_EMBEDDING_DIMENSIONS,
} from '../onnxEmbedding.js';

// 兼容别名
export { initOnnxEmbedding as initEmbeddingProviders } from '../onnxEmbedding.js';