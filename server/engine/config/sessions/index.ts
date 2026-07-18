export { SessionStore, getSessionStore } from './store.js';
export { SessionStoreWriter } from './store-writer.js';
export { SessionStoreCache } from './store-cache.js';
export { SessionStoreMaintenance } from './store-maintenance.js';
export { runMigrations, needsMigration, getCurrentSchemaVersion, getAvailableMigrations } from './store-migrations.js';
export type { MigrationResult, Migration } from './store-migrations.js';

export { generateSessionId, generateSessionKey, createSessionHash, validateSessionKey, formatSessionKey, parseSessionKey, deriveChildSessionId, isSessionIdValid, normalizeSessionId, getShortSessionId, getSessionKeyAge, isSessionKeyExpired } from './session-key.js';
export type { SessionKey } from './types.js';

export { resolveSessionPaths, getSessionFilePath, getArchivedSessionFilePath, getSessionMetadataPath, getTempFilePath, ensureSessionDirs, isValidSessionId, sanitizeSessionId, getSessionIdFromFilePath } from './paths.js';
export type { SessionPaths } from './paths.js';

export { sessionFileExists, archivedSessionFileExists, readSessionFile, readArchivedSessionFile, writeSessionFileAtomic, appendToSessionFile, deleteSessionFile, deleteArchivedSessionFile, moveSessionToArchive, moveSessionFromArchive, getSessionFileInfo, listSessionFiles, listArchivedSessionFiles, getSessionFileSize, readSessionFirstLine, rewriteSessionFirstLine } from './session-file.js';
export type { SessionFileInfo } from './types.js';

export { rotateSessionFile, needsRotation, cleanupOldRotations, getRotatedFiles, mergeRotatedFiles } from './session-file-rotation.js';
export type { RotationConfig, RotationResult } from './session-file-rotation.js';

export { loadRegistry, saveRegistry, createEmptyRegistry, rebuildRegistry, updateRegistryEntry, removeRegistryEntry, findRegistryEntries, getRegistryStats } from './session-registry-maintenance.js';
export type { SessionRegistry, RegistryEntry } from './session-registry-maintenance.js';

export { SessionAccessor } from './session-accessor.js';

export { Transcript, getTranscript } from './transcript.js';
export { TranscriptStream, createTranscriptStream } from './transcript-stream.js';
export { readTranscriptJSONL, readTranscriptJSONLPaged, writeTranscriptJSONL, appendToTranscriptJSONL, appendManyToTranscriptJSONL, getMessageCountJSONL, searchTranscriptJSONL } from './transcript-jsonl.js';
export type { TranscriptReadResult } from './transcript-jsonl.js';
export { appendMessage, appendMessages, createAppendBuffer, AppendBuffer } from './transcript-append.js';
export type { AppendResult } from './transcript-append.js';
export { createTranscriptHeader, validateTranscriptHeader, parseTranscriptHeader, serializeTranscriptHeader, updateTranscriptHeader } from './transcript-header.js';
export type { TranscriptHeader } from './transcript-header.js';
export { createWriteContext, shouldFlush, addToBuffer, clearBuffer, closeContext, formatMessageLine } from './transcript-write-context.js';
export type { TranscriptWriteContext, TranscriptWriteOptions } from './transcript-write-context.js';

export { SessionLifecycle } from './lifecycle.js';
export type { LifecycleConfig, LifecycleStats } from './lifecycle.js';

export { CleanupService } from './cleanup-service.js';
export type { CleanupConfig, CleanupResult } from './cleanup-service.js';

export { resetAllSessions, resetSession, createNewSessionAsReset, softResetSession } from './reset.js';
export type { ResetOptions, ResetResult } from './reset.js';

export { DiskBudgetManager } from './disk-budget.js';
export type { DiskBudgetStatus, BudgetCleanupResult } from './disk-budget.js';

export { SessionMetadataManager } from './metadata.js';
export { SessionTargetsManager } from './targets.js';
export { SessionGoalsManager } from './goals.js';
export { SessionArtifactsManager } from './artifacts.js';
export { ThreadInfoManager } from './thread-info.js';

export {
  generatePrefixedSessionId,
  generateChildSessionId,
  generateSessionGroupId,
  isPrefixedSessionId,
  getSessionIdPrefix,
  getSessionIdVersion,
  parsePrefixedSessionId,
  compareSessionIds,
  sortSessionIds,
} from './session-id-utils.js';

export { SessionStateMachine, isValidTransition, getValidTransitions } from './session-state-machine.js';

export { SessionDeduplication } from './session-deduplication.js';
export type { DeduplicationOptions, DeduplicationResult } from './session-deduplication.js';

export { SessionLinking } from './session-linking.js';
export type { LinkOptions, LinkResult, SessionLink } from './session-linking.js';

export { SessionMultiWorkspace } from './session-multi-workspace.js';
export type { WorkspaceConfig, Workspace } from './session-multi-workspace.js';

export * as transcript from './transcript/index.js';
export * as maintenance from './maintenance/index.js';
export * as migration from './migration/index.js';
export * as reconciliation from './reconciliation/index.js';
export * as backfill from './backfill/index.js';

export * from './types.js';
export type {
  SessionStatus,
  SessionTag,
  SessionMetadata,
  TranscriptMessageRole,
  TranscriptMessage,
  SessionGoal,
  SessionArtifact,
  SessionTarget,
  ThreadInfo,
  SessionData,
  SessionStoreStats,
  DiskBudgetConfig,
  SessionStoreConfig,
  TranscriptFormat,
  TranscriptWriteMode,
  StoreWriteResult,
  SessionListOptions,
  SessionListResult,
} from './types.js';
