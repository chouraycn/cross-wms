export * from './types';
export {
  MemoryQueryEngine,
  memoryQueryEngine,
} from './query';
export type { MemoryQueryEngineEvents } from './query';
export {
  MemoryEventBus,
  memoryEventBus,
} from './events';
export type { MemoryEventBusEvents } from './events';
export {
  MemoryDreaming,
  memoryDreaming,
} from './dreaming';
export type {
  DreamingOptions,
  DreamingStats,
  DreamingPhase,
  MemoryCluster,
  DreamingEvents,
} from './dreaming';
export {
  EngineStorage,
  engineStorage,
} from './engine-storage';
export type {
  EngineStorageEvents,
  StorageUsage,
  MigrationPlan,
} from './engine-storage';
export {
  MemorySecretManager,
  memorySecretManager,
} from './secret';
export type { MemorySecretConfig, EncryptedValue } from './secret';
export {
  MultimodalProcessor,
  multimodalProcessor,
  createMultimodalEntry,
  TextProcessor,
  ImageProcessor,
  AudioProcessor,
  VideoProcessor,
  PdfProcessor,
  CodeProcessor,
} from './multimodal';
export type {
  ModalityType,
  MultimodalContent,
  MultimodalMemoryEntry,
  ModalityProcessor,
} from './multimodal';
export { AdvancedSearchEngine, advancedSearchEngine } from './advanced-search';
export type { SearchRanking, AdvancedSearchOptions } from './advanced-search';
export { MemoryClustering, memoryClustering } from './clustering';
export type { Cluster, ClusteringOptions, ClusteringResult } from './clustering';
export {
  MemoryRuntimeBridge,
  memoryRuntimeBridge,
} from './runtimeBridge';
export type {
  MemoryRuntimeBackendConfig,
  MemoryRuntimeQmdConfig,
  MemoryRuntimeParams,
  MemorySearchManagerHandle,
  MemorySearchManagerResult,
} from './runtimeBridge';
export {
  MemoryStateRegistry,
  memoryStateRegistry,
} from './stateRegistry';
export type {
  MemoryCitationsMode,
  MemoryPromptSectionBuilder,
  MemoryCorpusSearchResult,
  MemoryCorpusGetResult,
  MemoryCorpusSupplement,
  MemoryFlushPlan,
  MemoryFlushPlanResolver,
  MemoryPluginRuntime,
  MemoryPluginCapability,
} from './stateRegistry';
export {
  VectorMemoryBackend,
  createVectorMemoryBackend,
  sanitizeForMemoryCapture,
  shouldCapture,
  detectCategory,
  looksLikePromptInjection,
  looksLikeEnvelopeSludge,
  escapeMemoryForPrompt,
  normalizeRecallQuery,
  formatRelevantMemoriesContext,
  extractLatestUserText,
} from './vectorBackend';
export type {
  MemoryCategory,
  MemoryCaptureOptions,
  MemoryCaptureResult,
  MemoryRecallOptions,
  MemoryMessage,
  AutoCaptureCursor,
  VectorStore,
  VectorStoreRow,
  EmbeddingProvider,
  VectorMemoryBackendConfig,
} from './vectorBackend';
