export type { BackoffPolicy } from './backoff.js';
export { computeBackoff, sleepWithAbort } from './backoff.js';
export type { RetryConfig, RetryInfo, RetryOptions } from './retry.js';
export { retryAsync, resolveRetryConfig } from './retry.js';
export type { PortInUseError } from './ports.js';
export { ensurePortAvailable, handlePortError, describePortOwner } from './ports.js';
export { formatErrorMessage, toErrorObject, detectErrorKind, isErrno } from './errors.js';
export type { ErrorKind } from './errors.js';
export { isTruthyEnvValue, normalizeEnv, resolveEnvNormalizationKeys } from './env.js';
export { isPrivateIpAddress, isBlockedHostname, isBlockedHostnameOrIp } from './ssrf.js';
export { SsrFBlockedError } from './ssrf.js';
export type { SsrFPolicy } from './ssrf.js';
export { acquireFileLock, withFileLock } from './file-lock.js';
export type { FileLockHandle, FileLockOptions } from './file-lock.js';
export { resolveFetch, wrapFetchWithAbortSignal } from './fetch.js';
export { readLocalFileSafely, writeExternalFileWithinRoot } from './fs-safe.js';

export type { ArchiveEntry, ArchiveOptions } from './archive.js';
export { createArchive, readArchive, createArchiveFromFiles } from './archive.js';

export type { DiskSpaceInfo } from './disk-space.js';
export { getDiskSpace, formatBytes, isLowDiskSpace, getDiskSpaceWarning } from './disk-space.js';

export type { DedupeOptions } from './dedupe.js';
export { deduplicate, deduplicateStrings, deduplicateByProperty, createDedupeFilter } from './dedupe.js';

export { copyToClipboard, readFromClipboard } from './clipboard.js';

export type { AbortSignalOptions } from './abort-signal.js';
export { createAbortSignal, createCombinedAbortSignal, isAborted, assertNotAborted } from './abort-signal.js';

export * as net from './net/index.js';

export * as execApprovals from './exec-approvals/index.js';

export * as heartbeat from './heartbeat/index.js';

export type { AgentEventMap } from './agent-events.js';
export { AgentEventBus, agentEventBus } from './agent-events.js';

export type { BinaryInfo } from './binaries.js';
export {
  findBinary,
  getBinaryInfo,
  binaryExists,
  which,
  getSystemBinPaths,
  BinaryManager,
  binaryManager,
} from './binaries.js';

export type { BrewPackageInfo, BrewOptions } from './brew.js';
export {
  brewInstalled,
  brewInstall,
  brewUninstall,
  brewList,
  brewInfo,
  brewIsInstalled,
  brewUpgrade,
  brewSearch,
} from './brew.js';

export type { BrowserOpenOptions } from './browser-open.js';
export { openInBrowser, openUrl, getDefaultBrowser } from './browser-open.js';

export type { BinaryDetectionOptions, DetectedBinary } from './detect-binary.js';
export {
  detectBinary,
  detectBinaries,
  requireBinary,
  isBinaryInPath,
} from './detect-binary.js';

export type { BoundaryValidationResult } from './boundary-path.js';
export {
  isPathWithinBoundary,
  validateBoundaryPath,
  assertPathWithinBoundary,
  safeJoinPath,
  getRelativePathWithinBoundary,
} from './boundary-path.js';

export type { GitCommitOptions, GitCommitResult } from './git-commit.js';
export {
  gitCommit,
  gitIsRepo,
  gitCurrentBranch,
  gitStatus,
  gitHasChanges,
  gitLastCommit,
  gitDiff,
  gitAdd,
} from './git-commit.js';

export type { HomeDirOptions } from './home-dir.js';
export {
  getHomeDir,
  resolveHomePath,
  expandHomeDir,
  pathInHome,
  isPathInHome,
} from './home-dir.js';

export type { JsonFileOptions } from './json-file.js';
export {
  readJsonFile,
  writeJsonFile,
  updateJsonFile,
  readJsonFileSync,
  writeJsonFileSync,
  jsonFileExists,
  deleteJsonFile,
} from './json-file.js';

export type {
  NetworkInterfaceInfo,
  NetworkAddressInfo,
} from './network-interfaces.js';
export {
  getNetworkInterfaces,
  getPublicIpAddresses,
  getPrivateIpAddresses,
  getIpv4Addresses,
  getIpv6Addresses,
  getPrimaryIpAddress,
  hasNetworkInterface,
  getNetworkInterface,
  getHostname,
  getNetworkSummary,
} from './network-interfaces.js';

export * as commandAnalysis from './command-analysis/index.js';

export * as commandExplainer from './command-explainer/index.js';

export * as formatTime from './format-time/index.js';

export type { TimelineEvent, TimelineOptions } from './diagnostics-timeline.js';
export { DiagnosticsTimeline, diagnosticsTimeline } from './diagnostics-timeline.js';

export type { DotenvParseResult, DotenvOptions } from './dotenv.js';
export { parseDotenv, loadDotenv, loadDotenvIntoProcess, stringifyDotenv, interpolateEnv } from './dotenv.js';

export type { GatewayLockOptions } from './gateway-lock.js';
export { GatewayLock, createGatewayLock } from './gateway-lock.js';

export type { ByteSizeOptions } from './byte-size.js';
export { formatByteSize, parseByteSize, getByteSize, bytesToHumanReadable, humanReadableToBytes } from './byte-size.js';

export type { VersionGuardOptions, VersionGuardResult } from './future-version-guard.js';
export { compareVersions, checkVersionGuard, assertVersionGuard, isVersionCompatible, getVersionStatus } from './future-version-guard.js';

export {
  isSensitivePath,
  isSensitiveFile,
  getSensitivePathReason,
  validatePathForSensitivity,
  assertPathNotSensitive,
  getSensitivePathPatterns,
  getSensitiveFilePatterns,
} from './sensitive-paths.js';

export type { SecurityPathCheckResult } from './security-path.js';
export { checkPathSecurity, isPathSecure, assertPathSecure, sanitizePath, resolveSafePath, isPathInAllowedDirectory } from './security-path.js';

export type { ScanResult, ScanOptions } from './includes-scan.js';
export { scanFileForPattern, scanDirectoryForPattern, containsPattern, countPatternOccurrences, scanForIncludes } from './includes-scan.js';

export type { RuntimeOverride, RuntimeOverrideOptions } from './runtime-overrides.js';
export {
  RuntimeOverrides,
  runtimeOverrides,
  getRuntimeOverride,
  setRuntimeOverride,
  hasRuntimeOverride,
  clearRuntimeOverride,
  clearAllRuntimeOverrides,
} from './runtime-overrides.js';

export type { SourceProjection, ProjectionOptions } from './runtime-source-projection.js';
export {
  RuntimeSourceProjection,
  runtimeSourceProjection,
  projectRuntimeSource,
  getProjectedValue,
  hasProjectedValue,
  clearProjectedValue,
  clearAllProjectedValues,
  getProjectedSources,
} from './runtime-source-projection.js';

export type { BackupRotationOptions, BackupFile } from './backup-rotation.js';
export { rotateBackups, getBackupFiles, createBackupFileName, getBackupCount, cleanupOldBackups } from './backup-rotation.js';

export type { IssueSeverity, IssueType, Issue, IssueFormatOptions } from './issue-format.js';
export { formatIssue, createIssue, parseIssue, getSeverityColor, getTypeLabel } from './issue-format.js';

export * from './clawhub.js';
export * from './clawhub-spec.js';

export type { ConcurrencyErrorMode, RunTasksWithConcurrencyOptions, RunTasksWithConcurrencyResult } from './run-with-concurrency.js';
export { runTasksWithConcurrency } from './run-with-concurrency.js';

export { safeJsonStringify } from './safe-json.js';

export { maskApiKey } from './mask-api-key.js';

export { parseJsonWithJson5Fallback } from './parse-json-compat.js';
