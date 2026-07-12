export * from './classifier.js';
export * from './hybridSearch.js';
export { MMROptions, mmrSelect, mmrReRankSimple } from './mmr.js';
export * from './multiBackend.js';
export * from './multimodal.js';
export * from './queryExpansion.js';
export * from './rootMemoryFiles.js';
export * from './timeDecay.js';
export * from './memorySchema.js';
// v1.7.85: sqlite-vec backend implementation
export { SQLiteVecBackend, getSQLiteVecBackend } from './sqliteVecBackend.js';
export type { SQLiteVecBackendConfig } from './sqliteVecBackend.js';
