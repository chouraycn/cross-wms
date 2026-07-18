/**
 * Host path normalization for sandbox mount policy.
 *
 * Handles POSIX, Windows drive, and namespace-prefixed paths before policy-key comparison.
 *
 * Downgrade note (cross-wms port): the openclaw source imports
 * `resolvePathViaExistingAncestorSync` from `../../infra/boundary-path.js`,
 * which itself depends on the `@openclaw/fs-safe/advanced` package that is
 * unavailable in cross-wms. That import is therefore dropped, and
 * `resolveSandboxHostPathViaExistingAncestor` is downgraded to skip
 * symlink-ancestor resolution (it only normalizes the path). The other
 * exports (`isSandboxHostPathAbsolute`, `normalizeSandboxHostPath`,
 * `getSandboxHostPathPolicyKey`) are ported verbatim and do not depend on
 * `boundary-path.ts`.
 */
import { posix } from "node:path";

function stripWindowsNamespacePrefix(input: string): string {
  if (input.startsWith("\\\\?\\")) {
    const withoutPrefix = input.slice(4);
    if (withoutPrefix.toUpperCase().startsWith("UNC\\")) {
      return `\\\\${withoutPrefix.slice(4)}`;
    }
    return withoutPrefix;
  }
  if (input.startsWith("//?/")) {
    const withoutPrefix = input.slice(4);
    if (withoutPrefix.toUpperCase().startsWith("UNC/")) {
      return `//${withoutPrefix.slice(4)}`;
    }
    return withoutPrefix;
  }
  return input;
}

function isWindowsDriveAbsolutePath(raw: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(stripWindowsNamespacePrefix(raw.trim()));
}

export function isSandboxHostPathAbsolute(raw: string): boolean {
  const trimmed = stripWindowsNamespacePrefix(raw.trim());
  return trimmed.startsWith("/") || isWindowsDriveAbsolutePath(trimmed);
}

/**
 * Normalize a host path: resolve `.`, `..`, collapse `//`, strip trailing `/`.
 * Windows drive-letter paths preserve the drive root and uppercase the drive letter.
 */
export function normalizeSandboxHostPath(raw: string): string {
  const trimmed = stripWindowsNamespacePrefix(raw.trim());
  if (!trimmed) {
    return "/";
  }
  let normalTrimmed = trimmed.replaceAll("\\", "/");
  if (isWindowsDriveAbsolutePath(normalTrimmed)) {
    normalTrimmed = normalTrimmed.charAt(0).toUpperCase() + normalTrimmed.slice(1);
  }
  const normalized = posix.normalize(normalTrimmed);
  const withoutTrailingSlash = normalized.replace(/\/+$/, "") || "/";
  if (/^[A-Z]:$/.test(withoutTrailingSlash)) {
    return `${withoutTrailingSlash}/`;
  }
  return withoutTrailingSlash;
}

export function getSandboxHostPathPolicyKey(raw: string): string {
  const normalized = normalizeSandboxHostPath(raw);
  if (isWindowsDriveAbsolutePath(normalized)) {
    return normalized.toLowerCase();
  }
  return normalized;
}

/**
 * Resolve a path through the deepest existing ancestor so parent symlinks are honored
 * even when the final source leaf does not exist yet.
 *
 * Downgrade (cross-wms port): the ancestor-based symlink resolution performed by
 * `resolvePathViaExistingAncestorSync` (from `../../infra/boundary-path.js`,
 * which depends on `@openclaw/fs-safe/advanced`) is unavailable here. The
 * function therefore only normalizes the path and does NOT honor symlinks in
 * ancestor directories before policy-key comparison. Re-enable by porting
 * `boundary-path.ts` and its `@openclaw/fs-safe/advanced` dependency if
 * precise symlink-aware policy matching is required.
 */
export function resolveSandboxHostPathViaExistingAncestor(sourcePath: string): string {
  if (!isSandboxHostPathAbsolute(sourcePath)) {
    return sourcePath;
  }
  if (isWindowsDriveAbsolutePath(sourcePath) && process.platform !== "win32") {
    return normalizeSandboxHostPath(sourcePath);
  }
  return normalizeSandboxHostPath(sourcePath);
}
