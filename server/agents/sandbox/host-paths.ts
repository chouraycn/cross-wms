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
