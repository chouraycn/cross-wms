/**
 * 移植自 openclaw/src/agents/sandbox-paths.ts
 *
 * Sandbox input path normalization and boundary checks.
 * Cross-wms simplified: inlined path utilities, removed deep infra imports.
 */

import os from "node:os";
import path from "node:path";

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
const SANDBOX_CONTAINER_WORKDIR = "/workspace";
const DATA_URL_RE = /^data:/i;

function normalizeUnicodeSpaces(str: string): string {
  return str.replace(UNICODE_SPACES, " ");
}

function normalizeAtPrefix(filePath: string): string {
  return filePath.startsWith("@") ? filePath.slice(1) : filePath;
}

function expandPath(filePath: string): string {
  const normalized = normalizeUnicodeSpaces(normalizeAtPrefix(filePath));
  if (normalized === "~") return os.homedir();
  if (normalized.startsWith("~/")) return os.homedir() + normalized.slice(1);
  return normalized;
}

function resolveToCwd(filePath: string, cwd: string): string {
  const expanded = expandPath(filePath);
  if (path.isAbsolute(expanded)) return expanded;
  return path.resolve(cwd, expanded);
}

export function resolveSandboxInputPath(filePath: string, cwd: string): string {
  return resolveToCwd(filePath, cwd);
}

export function resolveSandboxPath(params: { filePath: string; cwd: string; root: string }): {
  resolved: string;
  relative: string;
} {
  const resolved = resolveSandboxInputPath(params.filePath, params.cwd);
  const rootResolved = path.resolve(params.root);
  const relative = path.relative(rootResolved, resolved);
  if (!relative || relative === "") {
    return { resolved, relative: "" };
  }
  if (
    relative === ".." ||
    relative.startsWith("../") ||
    relative.startsWith("..\\") ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Path escapes sandbox root: ${params.filePath}`);
  }
  return { resolved, relative };
}

export async function assertSandboxPath(params: {
  filePath: string;
  cwd: string;
  root: string;
  allowFinalSymlinkForUnlink?: boolean;
  allowFinalHardlinkForUnlink?: boolean;
}): Promise<{ resolved: string; relative: string }> {
  return resolveSandboxPath(params);
}

export function assertMediaNotDataUrl(media: string): void {
  const raw = media.trim();
  if (DATA_URL_RE.test(raw)) {
    throw new Error("data: URLs are not supported for media. Use buffer instead.");
  }
}

export async function resolveAllowedManagedMediaPath(
  _candidate: string,
): Promise<string | undefined> {
  // Cross-wms simplified: no managed media root support
  return undefined;
}

function mapContainerWorkspacePath(params: {
  candidate: string;
  sandboxRoot: string;
}): string | undefined {
  const normalized = params.candidate.replace(/\\/g, "/");
  if (normalized === SANDBOX_CONTAINER_WORKDIR) {
    return path.resolve(params.sandboxRoot);
  }
  const prefix = `${SANDBOX_CONTAINER_WORKDIR}/`;
  if (!normalized.startsWith(prefix)) return undefined;
  const rel = normalized.slice(prefix.length);
  if (!rel) return path.resolve(params.sandboxRoot);
  return path.resolve(params.sandboxRoot, ...rel.split("/").filter(Boolean));
}

export async function resolveSandboxedMediaSource(params: {
  media: string;
  sandboxRoot: string;
}): Promise<string> {
  const raw = params.media.trim();
  if (!raw) return raw;

  // Remote URLs pass through
  if (/^https?:\/\//i.test(raw)) return raw;

  let candidate = raw;

  // Handle file:// URLs
  if (/^file:\/\//i.test(candidate)) {
    try {
      const { URL } = await import("node:url");
      const parsed = new URL(candidate);
      if (parsed.protocol === "file:") {
        const host = parsed.hostname.trim().toLowerCase();
        if (!host || host === "localhost") {
          const pathname = decodeURIComponent(parsed.pathname).replace(/\\/g, "/");
          const mapped = mapContainerWorkspacePath({ candidate: pathname, sandboxRoot: params.sandboxRoot });
          if (mapped) {
            candidate = mapped;
          } else {
            candidate = pathname;
          }
        }
      }
    } catch {
      // Invalid file URL - proceed with raw candidate
    }
  }

  // Map container workspace path
  const containerMapped = mapContainerWorkspacePath({ candidate, sandboxRoot: params.sandboxRoot });
  if (containerMapped) {
    candidate = containerMapped;
  }

  // Validate it's within sandbox root
  const result = await assertSandboxPath({
    filePath: candidate,
    cwd: params.sandboxRoot,
    root: params.sandboxRoot,
  });
  return result.resolved;
}
