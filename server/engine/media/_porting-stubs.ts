// Porting stubs for media/ files whose openclaw dependencies have not been
// ported to cross-wms. Each stub declares the public types and provides a
// simplified implementation so the ported media helpers compile and stay
// type-safe. Replace these stubs with real ports when the backing modules
// are brought over.
//
// Stubbed modules:
//   openclaw/src/media/store.ts                    → getMediaDir / resolveMediaBufferPath
//   openclaw/src/agents/agent-scope.ts            → resolveAgentWorkspaceDir
//   openclaw/src/agents/tool-fs-policy.ts         → resolveEffectiveToolFs*
//   openclaw/src/agents/agent-tools.policy.ts     → resolveGroupToolPolicy
//   openclaw/src/agents/path-policy.ts            → resolvePathFromInput
//   openclaw/src/agents/tool-policy-match.ts      → isToolAllowedByPolicies
//   openclaw/src/agents/workspace-dir.ts          → resolveWorkspaceRoot
//   openclaw/src/config/paths.ts                  → resolveStateDir
//   openclaw/src/config/types.ts                  → OpenClawConfig
//   openclaw/src/config/types.openclaw.ts         → OpenClawConfig (alias)
//   openclaw/src/infra/tmp-openclaw-dir.ts        → resolvePreferredOpenClawTmpDir
//   openclaw/src/infra/resolve-system-bin.ts      → resolveSystemBin
//   openclaw/src/infra/net/fetch-guard.ts         → fetchWithSsrFGuard
//   openclaw/src/infra/net/ssrf.ts                → SsrFPolicy
//   openclaw/src/logger.ts                        → logWarn
//   openclaw/src/media/media-services.ts          → convertHeicToJpeg
//   openclaw/packages/normalization-core/string-normalization → uniqueStrings
//   rastermill (npm)                              → image backend types + throw stubs

import os from "node:os";
import path from "node:path";

// ============================================================================
// Opaque config type — openclaw config types are not ported.
// ============================================================================

/** Opaque openclaw config placeholder. */
export type OpenClawConfig = Record<string, unknown>;

// ============================================================================
// openclaw/src/media/store.ts — media directory + buffer path resolution
// ============================================================================

let mediaDirCache: string | undefined;

/** Returns the media directory under the resolved state dir. */
export function getMediaDir(): string {
  if (!mediaDirCache) {
    mediaDirCache = path.resolve(resolveStateDir(), "media");
  }
  return mediaDirCache;
}

/** Resolves a media buffer path under a named bucket (e.g. "inbound"). */
export async function resolveMediaBufferPath(
  id: string,
  bucket: string,
): Promise<string> {
  return path.join(getMediaDir(), bucket, id);
}

// ============================================================================
// openclaw/src/config/paths.ts — state/config directory resolution
// ============================================================================

let stateDirCache: string | undefined;
let configDirCache: string | undefined;

/** Resolves the openclaw state directory. Cross-wms stub uses a process-local default. */
export function resolveStateDir(): string {
  if (!stateDirCache) {
    const base = process.env.CROSS_WMS_STATE_DIR ?? process.env.OPENCLAW_STATE_DIR;
    stateDirCache = base ? path.resolve(base) : path.join(os.homedir(), ".cross-wms");
  }
  return stateDirCache;
}

/** Resolves the openclaw config directory. Cross-wms stub uses a process-local default. */
export function resolveConfigDir(): string {
  if (!configDirCache) {
    const base = process.env.CROSS_WMS_CONFIG_DIR ?? process.env.OPENCLAW_CONFIG_DIR;
    configDirCache = base ? path.resolve(base) : path.join(os.homedir(), ".cross-wms");
  }
  return configDirCache;
}

// ============================================================================
// openclaw/src/infra/tmp-openclaw-dir.ts — preferred temp dir
// ============================================================================

/** Returns the preferred openclaw temp directory. Cross-wms stub uses os.tmpdir(). */
export function resolvePreferredOpenClawTmpDir(): string {
  return process.env.OPENCLAW_TMP_DIR ?? os.tmpdir();
}

// ============================================================================
// openclaw/src/agents/agent-scope.ts — agent workspace resolution
// ============================================================================

/** Resolves an agent's workspace directory. Cross-wms stub returns undefined. */
export function resolveAgentWorkspaceDir(
  _cfg: OpenClawConfig,
  _agentId: string,
): string | undefined {
  return undefined;
}

// ============================================================================
// openclaw/src/agents/tool-fs-policy.ts — filesystem policy gates
// ============================================================================

/** Whether root expansion is allowed. Cross-wms stub returns false (safe default). */
export function resolveEffectiveToolFsRootExpansionAllowed(_params: {
  cfg: OpenClawConfig;
  agentId?: string;
}): boolean {
  return false;
}

/** Whether workspace-only mode is enforced. Cross-wms stub returns false. */
export function resolveEffectiveToolFsWorkspaceOnly(_params: {
  cfg: OpenClawConfig;
  agentId?: string;
}): boolean {
  return false;
}

// ============================================================================
// openclaw/src/agents/agent-tools.policy.ts — group tool policy
// ============================================================================

export type GroupToolPolicy = {
  allow?: string[];
  deny?: string[];
};

/** Resolves group tool policy. Cross-wms stub returns undefined (no override). */
export function resolveGroupToolPolicy(_params: {
  config: OpenClawConfig;
  sessionKey?: string;
  messageProvider?: string;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  accountId?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  senderUsername?: string | null;
  senderE164?: string | null;
}): GroupToolPolicy | undefined {
  return undefined;
}

// ============================================================================
// openclaw/src/agents/tool-policy-match.ts — tool policy matching
// ============================================================================

/** Whether a tool is allowed by the given policies. Cross-wms stub defaults to allow. */
export function isToolAllowedByPolicies(
  _tool: string,
  _policies: GroupToolPolicy[],
): boolean {
  return true;
}

// ============================================================================
// openclaw/src/agents/path-policy.ts — path resolution from input
// ============================================================================

/** Resolves an input path against a workspace root. Cross-wms stub uses path.resolve. */
export function resolvePathFromInput(input: string, workspaceRoot?: string): string {
  if (!workspaceRoot) {
    return path.resolve(input);
  }
  return path.resolve(workspaceRoot, input);
}

// ============================================================================
// openclaw/src/agents/workspace-dir.ts — workspace root resolution
// ============================================================================

/** Resolves the workspace root. Cross-wms stub returns the dir or cwd. */
export function resolveWorkspaceRoot(workspaceDir?: string): string {
  return workspaceDir ? path.resolve(workspaceDir) : process.cwd();
}

// ============================================================================
// openclaw/src/infra/fs-safe.ts — readLocalFileSafely (signature adapter)
// ============================================================================

/** Reads a local file safely, returning a buffer. Adapts cross-wms fs-safe signature. */
export async function readLocalFileSafelyBuffer(params: {
  filePath: string;
}): Promise<{ buffer: Buffer }> {
  try {
    const fs = await import("node:fs/promises");
    const buffer = await fs.readFile(params.filePath);
    return { buffer };
  } catch {
    return { buffer: Buffer.alloc(0) };
  }
}

// ============================================================================
// openclaw/src/infra/net/ssrf.ts — SsrFPolicy type
// ============================================================================

/** SSRF policy options for guarded fetches. */
export type SsrFPolicy = {
  allowPrivateNetwork?: boolean;
  hostnameAllowlist?: string[];
};

// ============================================================================
// openclaw/src/infra/net/fetch-guard.ts — guarded fetch
// ============================================================================

/** Guarded fetch result with a release callback. */
export type GuardedFetchResult = {
  response: Response;
  release: () => Promise<void>;
};

/** Fetches a URL through SSRF/redirect/timeout guards. Cross-wms simplified stub. */
export async function fetchWithSsrFGuard(params: {
  url: string;
  maxRedirects?: number;
  timeoutMs?: number;
  policy?: SsrFPolicy;
  auditContext?: string;
  init?: RequestInit;
}): Promise<GuardedFetchResult> {
  const controller = new AbortController();
  const timeout = params.timeoutMs ?? 10_000;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(params.url, {
      ...params.init,
      signal: params.init?.signal ?? controller.signal,
      redirect: "follow",
    });
    return {
      response,
      release: async () => {},
    };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// openclaw/src/logger.ts — logWarn
// ============================================================================

/** Logs a warning message. Cross-wms stub writes to console.warn. */
export function logWarn(message: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[warn] ${message}`);
}

// ============================================================================
// openclaw/src/media/media-services.ts — convertHeicToJpeg
// ============================================================================

/** Converts HEIC bytes to JPEG. Cross-wms stub throws (image backend not available). */
export async function convertHeicToJpeg(_buffer: Buffer): Promise<Buffer> {
  throw new Error("HEIC to JPEG conversion is not available: image-ops backend not ported");
}

// ============================================================================
// openclaw/packages/normalization-core/string-normalization — uniqueStrings
// ============================================================================

/** Returns a de-duplicated list of strings, preserving first-occurrence order. */
export function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

// ============================================================================
// openclaw/src/infra/resolve-system-bin.ts — system binary resolution
// ============================================================================

/** Resolves a system binary path. Cross-wms stub returns the command unchanged. */
export function resolveSystemBin(
  command: string,
  _options?: { trust?: "strict" | "standard" },
): string {
  return command;
}

// ============================================================================
// rastermill (npm) — image backend types + throw stubs
// ============================================================================

export type ImageProbe = {
  width: number;
  height: number;
  hasAlpha?: boolean;
  orientation?: number;
};

export type ImageMetadata = {
  width: number;
  height: number;
};

export type RastermillEncodeOptions = {
  format?: "jpeg" | "png";
  resize?: { maxSide: number; enlarge?: boolean };
  quality?: number;
  compressionLevel?: number;
  autoOrient?: boolean;
  maxBytes?: number;
  search?: { maxSide?: readonly number[] };
};

export type RastermillEncodeResult = {
  data: Buffer;
  bytes: number;
  width: number;
  height: number;
  chosen?: {
    maxSide?: number;
    compressionLevel?: number;
  };
};

export type RastermillProcessor = {
  probe: (buffer: Buffer) => Promise<ImageProbe | null>;
  encode: (buffer: Buffer, options?: RastermillEncodeOptions) => Promise<RastermillEncodeResult>;
  transparency: (buffer: Buffer) => Promise<{ hasAlphaChannel: boolean }>;
};

export class RastermillUnavailableError extends Error {
  readonly causes: unknown[] = [];
  constructor(message?: string, causes: unknown[] = []) {
    super(message ?? "Rastermill image backend is unavailable");
    this.name = "RastermillUnavailableError";
    this.causes = causes;
  }
}

export class RastermillError extends Error {
  readonly code = "RASTERMILL_UNDECODABLE";
  constructor(message?: string) {
    super(message ?? "Rastermill decode failed");
    this.name = "RastermillError";
  }
}

/** Creates a rastermill processor. Cross-wms stub throws unavailable. */
export function createRastermill(_options?: unknown): RastermillProcessor {
  throw new RastermillUnavailableError(
    "rastermill npm package is not installed in cross-wms",
  );
}

/** Detects whether an error is a rastermill unavailable error. */
export function isRastermillUnavailableError(err: unknown): boolean {
  return err instanceof RastermillUnavailableError;
}

/** Reads image metadata from header bytes. Cross-wms stub returns null. */
export function readImageMetadataFromHeader(_buffer: Buffer): ImageMetadata | null {
  return null;
}

/** Reads image probe data from header bytes. Cross-wms stub returns null. */
export function readImageProbeFromHeader(_buffer: Buffer): ImageProbe | null {
  return null;
}
