import { normalize, resolve, sep } from "path";
import { homedir } from "os";

export type SecurityPathCheckResult = {
  safe: boolean;
  warnings: string[];
  resolvedPath: string;
};

export function checkPathSecurity(path: string, allowList?: string[], blockList?: string[]): SecurityPathCheckResult {
  const warnings: string[] = [];
  const resolvedPath = normalize(path);

  if (resolvedPath.includes(`..${sep}`)) {
    warnings.push("Path contains parent directory traversal");
  }

  if (resolvedPath.startsWith("/") && !resolvedPath.startsWith("/home/") && !resolvedPath.startsWith("/tmp/")) {
    warnings.push("Path is outside home or temporary directories");
  }

  if (resolvedPath.startsWith("/home/") && !resolvedPath.startsWith(`${homedir()}${sep}`)) {
    warnings.push("Path is outside current user's home directory");
  }

  if (allowList && allowList.length > 0) {
    const allowed = allowList.some((allowedPath) => {
      const normalizedAllowed = normalize(allowedPath);
      return resolvedPath.startsWith(normalizedAllowed) || resolvedPath === normalizedAllowed;
    });

    if (!allowed) {
      warnings.push("Path is not in the allow list");
    }
  }

  if (blockList && blockList.length > 0) {
    const blocked = blockList.some((blockedPath) => {
      const normalizedBlocked = normalize(blockedPath);
      return resolvedPath.startsWith(normalizedBlocked) || resolvedPath === normalizedBlocked;
    });

    if (blocked) {
      warnings.push("Path is in the block list");
    }
  }

  return {
    safe: warnings.length === 0,
    warnings,
    resolvedPath,
  };
}

export function isPathSecure(path: string): boolean {
  return checkPathSecurity(path).safe;
}

export function assertPathSecure(path: string): void {
  const result = checkPathSecurity(path);
  if (!result.safe) {
    throw new Error(`Path is not secure: ${result.warnings.join("; ")}`);
  }
}

export function sanitizePath(path: string): string {
  let sanitized = normalize(path);

  if (sanitized.includes(`..${sep}`)) {
    const parts = sanitized.split(sep);
    const result: string[] = [];
    for (const part of parts) {
      if (part === "..") {
        result.pop();
      } else if (part !== ".") {
        result.push(part);
      }
    }
    sanitized = result.join(sep);
  }

  return sanitized;
}

export function resolveSafePath(base: string, relative: string): string {
  const resolved = resolve(base, relative);
  const baseNormalized = normalize(base);

  if (!resolved.startsWith(baseNormalized)) {
    throw new Error("Path traversal detected");
  }

  return resolved;
}

export function isPathInAllowedDirectory(path: string, allowedDirs: string[]): boolean {
  const normalizedPath = normalize(path);

  return allowedDirs.some((dir) => {
    const normalizedDir = normalize(dir);
    return normalizedPath.startsWith(normalizedDir + sep) || normalizedPath === normalizedDir;
  });
}