import { resolve, isAbsolute, normalize, relative, sep } from "path";
import { homedir } from "os";
import type { PathResolutionResult } from "./types.js";

const DANGEROUS_PATHS = [
  "/etc/",
  "/bin/",
  "/sbin/",
  "/usr/bin/",
  "/usr/sbin/",
  "/usr/local/bin/",
  "/usr/local/sbin/",
  "/var/",
  "/tmp/",
  "/dev/",
  "/proc/",
  "/sys/",
  "/root/",
  "/home/",
];

const SENSITIVE_PATHS = [
  "~/.ssh/",
  "~/.aws/",
  "~/.gcp/",
  "~/.kube/",
  "~/.docker/",
  "~/.git-credentials",
  "~/.npmrc",
  "~/.netrc",
];

export function resolveCommandPath(command: string, cwd?: string): PathResolutionResult {
  const warnings: string[] = [];

  let resolvedPath = command;
  let isAbs = isAbsolute(command);
  let isRel = !isAbs;

  if (command.startsWith("~")) {
    resolvedPath = resolve(homedir(), command.slice(1));
    isAbs = true;
    isRel = false;
  } else if (!isAbs) {
    resolvedPath = resolve(cwd || process.cwd(), command);
    isAbs = true;
  }

  resolvedPath = normalize(resolvedPath);

  const normalizedPath = resolvedPath.toLowerCase();
  let isSafe = true;

  for (const dangerous of DANGEROUS_PATHS) {
    if (normalizedPath.startsWith(dangerous)) {
      isSafe = false;
      warnings.push(`Path resolves to dangerous location: ${dangerous}`);
    }
  }

  for (const sensitive of SENSITIVE_PATHS) {
    const expandedSensitive = sensitive.startsWith("~")
      ? resolve(homedir(), sensitive.slice(1))
      : sensitive;
    if (normalizedPath.startsWith(expandedSensitive.toLowerCase())) {
      isSafe = false;
      warnings.push(`Path resolves to sensitive location: ${sensitive}`);
    }
  }

  if (resolvedPath.includes(`..${sep}`)) {
    isSafe = false;
    warnings.push("Path contains parent directory traversal (..)");
  }

  return {
    resolvedPath,
    isAbsolute: isAbs,
    isRelative: isRel,
    isSafe,
    warnings,
  };
}

export function isPathSafe(path: string): boolean {
  return resolveCommandPath(path).isSafe;
}

export function assertPathSafe(path: string): void {
  const result = resolveCommandPath(path);
  if (!result.isSafe) {
    throw new Error(`Path rejected: ${result.warnings.join("; ") || "unsafe path"}`);
  }
}

export function resolveRelativePath(basePath: string, relativePath: string): string {
  return normalize(resolve(basePath, relativePath));
}

export function getPathComponents(path: string): string[] {
  return normalize(path).split(sep).filter((p) => p && p !== ".");
}

export function isPathWithinBoundary(path: string, boundary: string): boolean {
  const normalizedPath = normalize(path);
  const normalizedBoundary = normalize(boundary);

  if (!normalizedBoundary.endsWith(sep)) {
    return normalizedPath === normalizedBoundary || normalizedPath.startsWith(normalizedBoundary + sep);
  }

  return normalizedPath.startsWith(normalizedBoundary);
}

export function getRelativePathWithinBoundary(path: string, boundary: string): string | null {
  if (!isPathWithinBoundary(path, boundary)) {
    return null;
  }

  const normalizedPath = normalize(path);
  const normalizedBoundary = normalize(boundary);

  if (normalizedPath === normalizedBoundary) {
    return ".";
  }

  if (!normalizedBoundary.endsWith(sep)) {
    return relative(normalizedBoundary, normalizedPath);
  }

  const relativePart = normalizedPath.slice(normalizedBoundary.length);
  return relativePart || ".";
}

export function resolveHomePath(path: string): string {
  if (path.startsWith("~")) {
    return resolve(homedir(), path.slice(1));
  }
  return path;
}

export function pathInHome(path: string): boolean {
  const home = homedir();
  const normalizedPath = normalize(path);
  const normalizedHome = normalize(home);
  return normalizedPath.startsWith(normalizedHome + sep) || normalizedPath === normalizedHome;
}