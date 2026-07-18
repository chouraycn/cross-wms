/**
 * 轨迹模块统一导出
 * 汇总路径管理、类型定义、记录器、回放、导出、清理、元数据、运行时管理等功能。
 */

// paths
export {
  resolveTrajectoryPath,
  ensureTrajectoryDir,
  resolveTrajectoryFilePath,
  resolveTrajectoryPointerFilePath,
  safeTrajectorySessionFileName,
  resolveTrajectoryRootDir,
  resolveMetadataFilePath,
  isPathInsideTrajectoryDir,
  generateArchiveFileName,
  TRAJECTORY_RUNTIME_CAPTURE_MAX_BYTES,
  TRAJECTORY_RUNTIME_FILE_MAX_BYTES,
  TRAJECTORY_RUNTIME_EVENT_MAX_BYTES,
  TRAJECTORY_METADATA_FILE,
  TRAJECTORY_ARCHIVE_DIR,
} from './paths.js';
export type { TrajectoryPaths } from './paths.js';

// types
export { TrajectoryEntry, TrajectoryRecorder } from './types.js';
export type {
  TrajectoryStatus,
  TrajectoryEntryData,
  TrajectoryStep,
  TrajectoryEvent,
  TrajectoryToolDefinition,
  TrajectoryBundleManifest,
  TrajectoryBundleWarning,
  TrajectoryRecorderConfig,
  TrajectoryRecorderDiagnostics,
  TrajectoryRecord,
  TrajectoryMetadata,
  TrajectoryExportOptions,
  TrajectoryExportResult,
  TrajectoryExportFormat,
  CleanupPolicy,
  CleanupResult,
  CleanupSessionInfo,
  TrajectoryReplayOptions,
  TrajectoryReplayResult,
  TrajectoryReplayController,
  EventFilter,
  EventSamplingConfig,
  MetadataSearchCriteria,
  RetentionRule,
} from './types.js';

// recorder
export { createTrajectoryRecorder, toTrajectoryToolDefinitions } from './recorder.js';
export type { CreateTrajectoryRecorderParams, TrajectoryRecorderInstance } from './recorder.js';

// replay
export { replayTrajectory, replayTrajectorySummary, listTrajectorySessions, createReplayController } from './replay.js';
export type { TrajectoryReplaySummary } from './replay.js';

// 元数据管理
export {
  TrajectoryMetadataManager,
  createTrajectoryMetadataManager,
} from './metadata.js';
export type {
  TrajectoryMetadataSummary,
} from './metadata.js';

// 清理
export {
  TrajectoryCleanupManager,
  createTrajectoryCleanupManager,
} from './cleanup.js';
export type {
  TrajectoryCleanupOptions,
  TrajectoryCleanupResult,
  TrajectorySessionInfo,
} from './cleanup.js';

// 通用导出
export {
  TrajectoryExporter,
  createTrajectoryExporter,
} from './export.js';

// 命令导出
export {
  TrajectoryCommandExporter,
  trajectoryCommandExporter,
  runTrajectoryCommand,
} from './command-export.js';
export type {
  CommandExportOptions,
  CommandExportResult,
} from './command-export.js';

// 运行时文件管理
export {
  resolveTrajectoryRuntimeFile,
  validateTrajectoryRuntimeFile,
  readTrajectoryEvents,
  isRegularNonSymlinkFile,
  parseTrajectoryJsonl,
  parseJsonlFile,
  isRuntimeTrajectoryEvent,
} from './runtime-file.js';

// 运行时管理
export {
  createTrajectoryRuntimeRecorder,
  toTrajectoryToolDefinitionsRuntime,
  limitTrajectoryPayloadValue,
} from './runtime.js';
