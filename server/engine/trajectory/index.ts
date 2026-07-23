// Trajectory module public API.
// 移植自 openclaw/src/trajectory/ — 统一导出所有公共接口。
//
// 适配说明：
// - 所有模块均从 cross-wms 本地文件导入（./xxx.js）
// - 不导出 recorder.ts 和 replay.ts（cross-wms 特有文件，不属于 openclaw 移植范围）

// types
export type {
  TrajectoryEvent,
  TrajectoryToolDefinition,
  TrajectoryBundleManifest,
  TrajectoryBundleWarning,
} from "./types.js";

// paths
export {
  TRAJECTORY_RUNTIME_CAPTURE_MAX_BYTES,
  TRAJECTORY_RUNTIME_FILE_MAX_BYTES,
  TRAJECTORY_RUNTIME_EVENT_MAX_BYTES,
  safeTrajectorySessionFileName,
  resolveTrajectoryPointerOpenFlags,
  resolveTrajectoryFilePath,
  resolveTrajectoryPointerFilePath,
} from "./paths.js";

// runtime-file
export {
  isRegularNonSymlinkFile,
  resolveTrajectoryRuntimeFile,
} from "./runtime-file.js";

// runtime
export {
  toTrajectoryToolDefinitions,
  createTrajectoryRuntimeRecorder,
} from "./runtime.js";

// metadata
export {
  buildTrajectoryRunMetadata,
  buildTrajectoryArtifacts,
} from "./metadata.js";

// export
export {
  resolveDefaultTrajectoryExportDir,
  exportTrajectoryBundle,
} from "./export.js";

// command-export
export {
  resolveTrajectoryCommandOutputDir,
  exportTrajectoryForCommand,
  formatTrajectoryCommandExportSummary,
} from "./command-export.js";
export type { TrajectoryCommandExportSummary } from "./command-export.js";

// cleanup
export {
  removeSessionTrajectoryArtifacts,
  removeRemovedSessionTrajectoryArtifacts,
} from "./cleanup.js";
