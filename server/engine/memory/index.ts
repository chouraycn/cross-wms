export type {
  MemoryCategory,
  ClassificationResult,
} from './classifier.js';

export {
  classifyMemory,
  filterByCategory,
} from './classifier.js';

export type {
  MemoryEntry,
} from './mmr.js';

export {
  mmrSelect,
} from './mmr.js';

export type {
  SearchResult,
  HybridSearchOptions,
} from './hybridSearch.js';

export {
  quickHybridSearch,
  HYBRID_SEARCH_PRESETS,
} from './hybridSearch.js';

export type {
  TimeDecayConfig,
  DEFAULT_TIME_DECAY_CONFIG,
} from './timeDecay.js';

export {
  computeTimeWeights,
  applyTimeDecay,
  TIME_DECAY_PRESETS,
} from './timeDecay.js';

export type {
  MemoryMultimodalSettings,
} from './multimodal.js';

export {
  normalizeMemoryMultimodalSettings,
} from './multimodal.js';

export {
  expandQuery,
} from './queryExpansion.js';

export type {
  MemoryFacadeContext,
  MemoryFacadeOptions,
  MemoryBootstrapResult,
  MemoryIngestResult,
  MemorySearchResult,
  MemoryCompactResult,
} from './facade.js';

export { MemoryFacade, createMemoryFacade } from './facade.js';