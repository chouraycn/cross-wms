/**
 * Filesystem bridge path safety validation.
 * Ported from openclaw/src/agents/sandbox/fs-bridge-path-safety.ts
 */

import path from "node:path";

/** Check whether a resolved path stays within an allowed root. */
export function isPathWithinRoot(resolvedPath: string, rootDir: string): boolean {
  const normalizedResolved = path.normalize(resolvedPath);
  const normalizedRoot = path.normalize(rootDir);
  if (normalizedRoot === normalizedResolved) {
    return true;
  }
  return normalizedResolved.startsWith(normalizedRoot + path.sep);
}

/** Resolve and validate a target path against a sandbox root. */
export function validateSandboxPath(params: {
  targetPath: string;
  sandboxRoot: string;
  allowMissing?: boolean;
}): { valid: boolean; resolvedPath: string; error?: string } {
  if (!params.targetPath || typeof params.targetPath !== "string") {
    return { valid: false, resolvedPath: "", error: "Target path is empty or invalid" };
  }
  if (!params.sandboxRoot || typeof params.sandboxRoot !== "string") {
    return { valid: false, resolvedPath: "", error: "Sandbox root is empty or invalid" };
  }
  const resolved = path.resolve(params.sandboxRoot, params.targetPath);
  if (!isPathWithinRoot(resolved, params.sandboxRoot)) {
    return {
      valid: false,
      resolvedPath: resolved,
      error: `Path "${params.targetPath}" resolves outside sandbox root "${params.sandboxRoot}"`,
    };
  }
  return { valid: true, resolvedPath: resolved };
}
