// @ts-nocheck
/**
 * @deprecated Broad public SDK barrel. Prefer focused security/SSRF/secret
 * subpaths and avoid adding new imports here.
 */

// import { root as fsRoot, type OpenResult } from "../infra/fs-safe.js"; // TODO: 依赖模块未移植

// export * from "../secrets/channel-secret-collector-runtime.js"; // TODO: 依赖模块未移植
// export * from "../secrets/runtime-shared.js"; // TODO: 依赖模块未移植
// export * from "../secrets/shared.js"; // TODO: 依赖模块未移植
// export type * from "../secrets/target-registry-types.js"; // TODO: 依赖模块未移植
// export * from "../security/channel-metadata.js"; // TODO: 依赖模块未移植
// export * from "../security/context-visibility.js"; // TODO: 依赖模块未移植
// export * from "./channel-access-compat.js"; // TODO: 依赖模块未移植
// export {
//   ACCESS_GROUP_ALLOW_FROM_PREFIX,
//   expandAllowFromWithAccessGroups,
//   parseAccessGroupAllowFromEntry,
//   resolveAccessGroupAllowFromMatches,
//   resolveAccessGroupAllowFromState,
//   type AccessGroupMembershipResolver,
//   type AccessGroupMembershipLookup,
//   type ResolvedAccessGroupAllowFromState,
// } from "./access-groups.js"; // TODO: 依赖模块未移植
// export * from "../security/external-content.js"; // TODO: 依赖模块未移植
// export * from "../security/safe-regex.js"; // TODO: 依赖模块未移植
// export {
//   appendRegularFile,
//   appendRegularFileSync,
//   FsSafeError,
//   FsSafeError as SafeOpenError,
//   openLocalFileSafely,
//   pathExists,
//   pathExistsSync,
//   readRegularFile,
//   resolveLocalPathFromRootsSync,
//   readRegularFileSync,
//   resolveRegularFileAppendFlags,
//   root,
//   statRegularFile,
//   statRegularFileSync,
//   writeExternalFileWithinRoot,
//   withTimeout,
//   type ExternalFileWriteOptions,
//   type ExternalFileWriteResult,
//   type FsSafeErrorCode as SafeOpenErrorCode,
// } from "../infra/fs-safe.js"; // TODO: 依赖模块未移植

/** Safely open a path beneath a trusted root while rejecting hardlinks and unsafe symlinks by default. */
export async function openFileWithinRoot(params: {
  rootDir: string;
  relativePath: string;
  rejectHardlinks?: boolean;
  nonBlockingRead?: boolean;
  allowSymlinkTargetWithinRoot?: boolean;
}): Promise<OpenResult> {
  const root = await fsRoot(params.rootDir);
  return await root.open(params.relativePath, {
    hardlinks: params.rejectHardlinks === false ? "allow" : "reject",
    nonBlockingRead: params.nonBlockingRead,
    symlinks: params.allowSymlinkTargetWithinRoot === true ? "follow-within-root" : "reject",
  });
}

/** Copy a source file into a path beneath a trusted root using fs-safe root policy. */
export async function writeFileFromPathWithinRoot(params: {
  rootDir: string;
  relativePath: string;
  sourcePath: string;
  mkdir?: boolean;
}): Promise<void> {
  const root = await fsRoot(params.rootDir);
  await root.copyIn(params.relativePath, params.sourcePath, {
    mkdir: params.mkdir,
    sourceHardlinks: "reject",
  });
}

// export { extractErrorCode, formatErrorMessage } from "../infra/errors.js"; // TODO: 依赖模块未移植
// export { hasProxyEnvConfigured } from "../infra/net/proxy-env.js"; // TODO: 依赖模块未移植
// export { normalizeHostname } from "../infra/net/hostname.js"; // TODO: 依赖模块未移植
// export {
//   SsrFBlockedError,
//   isBlockedHostnameOrIp,
//   isPrivateNetworkAllowedByPolicy,
//   matchesHostnameAllowlist,
//   resolvePinnedHostnameWithPolicy,
//   type LookupFn,
//   type SsrFPolicy,
// } from "../infra/net/ssrf.js"; // TODO: 依赖模块未移植
// export { isNotFoundPathError, isPathInside } from "../infra/path-guards.js"; // TODO: 依赖模块未移植
// export {
//   assertAbsolutePathInput,
//   canonicalPathFromExistingAncestor,
//   ensureAbsoluteDirectory,
//   findExistingAncestor,
//   resolveAbsolutePathForRead,
//   resolveAbsolutePathForWrite,
//   type AbsolutePathSymlinkPolicy,
//   type EnsureAbsoluteDirectoryOptions,
//   type EnsureAbsoluteDirectoryResult,
//   type ResolvedAbsolutePath,
//   type ResolvedWritableAbsolutePath,
// } from "../infra/fs-safe.js"; // TODO: 依赖模块未移植
// export { sanitizeUntrustedFileName } from "../infra/fs-safe-advanced.js"; // TODO: 依赖模块未移植
// export {
//   privateFileStore,
//   privateFileStoreSync,
//   type PrivateFileStore,
// } from "../infra/private-file-store.js"; // TODO: 依赖模块未移植
// export {
//   movePathWithCopyFallback,
//   replaceFileAtomic,
//   replaceFileAtomicSync,
//   type MovePathWithCopyFallbackOptions,
//   type ReplaceFileAtomicFileSystem,
//   type ReplaceFileAtomicOptions,
//   type ReplaceFileAtomicResult,
//   type ReplaceFileAtomicSyncFileSystem,
//   type ReplaceFileAtomicSyncOptions,
// } from "../infra/replace-file.js"; // TODO: 依赖模块未移植
// export {
//   writeSiblingTempFile,
//   type WriteSiblingTempFileOptions,
//   type WriteSiblingTempFileResult,
// } from "../infra/sibling-temp-file.js"; // TODO: 依赖模块未移植
// export {
//   assertNoSymlinkParents,
//   assertNoSymlinkParentsSync,
//   type AssertNoSymlinkParentsOptions,
// } from "../infra/fs-safe-advanced.js"; // TODO: 依赖模块未移植
// export { ensurePortAvailable } from "../infra/ports.js"; // TODO: 依赖模块未移植
// export { generateSecureToken } from "../infra/secure-random.js"; // TODO: 依赖模块未移植
// export {
//   resolveExistingPathsWithinRoot,
//   pathScope,
//   resolvePathsWithinRoot,
//   resolvePathWithinRoot,
//   resolveStrictExistingPathsWithinRoot,
//   resolveWritablePathWithinRoot,
// } from "../infra/root-paths.js"; // TODO: 依赖模块未移植
// export { writeViaSiblingTempPath } from "../infra/fs-safe-advanced.js"; // TODO: 依赖模块未移植
// export { resolvePreferredOpenClawTmpDir } from "../infra/tmp-openclaw-dir.js"; // TODO: 依赖模块未移植
// export { redactSensitiveText } from "../logging/redact.js"; // TODO: 依赖模块未移植
// export { safeEqualSecret } from "../security/secret-equal.js"; // TODO: 依赖模块未移植
