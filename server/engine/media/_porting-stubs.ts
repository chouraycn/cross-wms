/**
 * @deprecated This file uses legacy stub naming.
 * Future refactoring should rename to *.stub.ts convention.
 * See P3-23 in optimization plan.
 */

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
import { assertSafeUrl } from "../infra/ssrf.js";
import {
  isToolAllowedByPolicies as isToolAllowedByPoliciesFromMatch,
} from "../agents/tool-policy-match.js";
import {
  createRastermill,
  isRastermillUnavailableError,
  RastermillError,
  RastermillUnavailableError,
  readImageMetadataFromHeader,
  readImageProbeFromHeader,
} from "rastermill";

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

/** Resolves an agent's workspace directory.
 * 基础实现：从 cfg.agents.list 按 agentId 查找 workspace，回退到 defaults.workspace。
 * 参考 openclaw/src/agents/agent-scope-config.ts resolveAgentWorkspaceDir。 */
export function resolveAgentWorkspaceDir(
  cfg: OpenClawConfig,
  agentId: string,
): string | undefined {
  if (!cfg || !agentId) {
    return undefined;
  }
  const agents = (cfg as Record<string, unknown>).agents as
    | Record<string, unknown>
    | undefined;
  if (!agents) {
    return undefined;
  }
  // 查找指定 agent 的 workspace 配置
  const list = agents.list as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(list)) {
    for (const entry of list) {
      const id = entry?.id;
      if (typeof id === "string" && id === agentId) {
        const workspace = entry.workspace;
        if (typeof workspace === "string" && workspace.trim()) {
          return workspace.trim();
        }
        break;
      }
    }
  }
  // 回退到 defaults.workspace
  const defaults = agents.defaults as Record<string, unknown> | undefined;
  const defaultWorkspace = defaults?.workspace;
  if (typeof defaultWorkspace === "string" && defaultWorkspace.trim()) {
    return defaultWorkspace.trim();
  }
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

/** Resolves group tool policy.
 * 基础实现：从 config.tools.groups 按 groupId 查找工具策略（allow/deny）。
 * 参考 openclaw/src/agents/agent-tools.policy.ts resolveGroupToolPolicy。 */
export function resolveGroupToolPolicy(params: {
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
  if (!params.config || !params.groupId) {
    return undefined;
  }
  // 基础实现：从 config.tools.groups 按 groupId 查找工具策略
  const tools = (params.config as Record<string, unknown>).tools as
    | Record<string, unknown>
    | undefined;
  if (!tools) {
    return undefined;
  }
  const groups = tools.groups as Record<string, unknown> | undefined;
  if (!groups) {
    return undefined;
  }
  const groupPolicy = groups[params.groupId] as
    | { allow?: unknown; deny?: unknown }
    | undefined;
  if (!groupPolicy) {
    return undefined;
  }
  const allow = Array.isArray(groupPolicy.allow)
    ? (groupPolicy.allow as string[])
    : undefined;
  const deny = Array.isArray(groupPolicy.deny)
    ? (groupPolicy.deny as string[])
    : undefined;
  if (!allow && !deny) {
    return undefined;
  }
  return {
    ...(allow ? { allow } : {}),
    ...(deny ? { deny } : {}),
  };
}

// ============================================================================
// openclaw/src/agents/tool-policy-match.ts — tool policy matching
// ============================================================================

/** Whether a tool is allowed by the given policies.
 * 委托给 ../agents/tool-policy-match.ts（deny 优先，空 allow 列表表示放行）。
 * 参考 openclaw/src/agents/tool-policy-match.ts isToolAllowedByPolicies。 */
export function isToolAllowedByPolicies(
  tool: string,
  policies: GroupToolPolicy[],
): boolean {
  return isToolAllowedByPoliciesFromMatch(
    tool,
    policies as Array<{ allow?: string[]; deny?: string[] } | undefined>,
  );
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

/** Fetches a URL through SSRF/redirect/timeout guards.
 * 集成 ../infra/ssrf.ts 的 assertSafeUrl，在每次请求（含重定向）前校验 URL 安全性。
 * 手动跟随重定向，对每个 Location 重新做 SSRF 校验，防止重定向到内网。
 * 参考 openclaw/src/infra/net/fetch-guard.ts fetchWithSsrFGuard。 */
export async function fetchWithSsrFGuard(params: {
  url: string;
  maxRedirects?: number;
  timeoutMs?: number;
  policy?: SsrFPolicy;
  auditContext?: string;
  init?: RequestInit;
}): Promise<GuardedFetchResult> {
  const maxRedirects =
    typeof params.maxRedirects === "number" && Number.isFinite(params.maxRedirects)
      ? Math.max(0, Math.floor(params.maxRedirects))
      : 10;
  const timeoutMs = params.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // 如果调用方提供了 signal，转发 abort 到 controller
  if (params.init?.signal) {
    const callerSignal = params.init.signal;
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  let currentUrl = params.url;
  let currentInit = params.init ? { ...params.init } : undefined;
  const visited = new Set<string>();

  try {
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
      // 请求前用 assertSafeUrl 校验 URL（含 DNS 解析，防止 DNS rebinding）
      await assertSafeUrl(currentUrl, params.auditContext, params.policy);

      // 重定向循环检测
      const visitKey = `${currentInit?.method?.toUpperCase() ?? "GET"} ${currentUrl}`;
      if (visited.has(visitKey)) {
        throw new Error("Redirect loop detected");
      }
      visited.add(visitKey);

      const response = await fetch(currentUrl, {
        ...currentInit,
        signal: controller.signal,
        redirect: "manual",
      });

      // 检查是否为重定向（301/302/303/307/308）
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error(`Redirect missing location header (${response.status})`);
        }
        if (redirectCount >= maxRedirects) {
          throw new Error(`Too many redirects (limit: ${maxRedirects})`);
        }
        // 解析相对重定向 URL
        currentUrl = new URL(location, currentUrl).toString();
        // 303 → GET；301/302 POST → GET（与 openclaw fetch-guard 一致）
        const method = currentInit?.method?.toUpperCase() ?? "GET";
        if (
          response.status === 303 ||
          ((response.status === 301 || response.status === 302) && method === "POST")
        ) {
          currentInit = currentInit
            ? { ...currentInit, method: "GET", body: undefined }
            : { method: "GET" };
        }
        void response.body?.cancel();
        continue;
      }

      return {
        response,
        release: async () => {},
      };
    }
    throw new Error(`Too many redirects (limit: ${maxRedirects})`);
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

/** Converts HEIC/HEIF-like image bytes into JPEG through the rastermill image backend. */
export async function convertHeicToJpeg(buffer: Buffer): Promise<Buffer> {
  const processor = createRastermill();
  const result = await processor.encode(buffer, { format: "jpeg" });
  return result.data;
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
// rastermill (npm) — image backend types + real implementation
// ============================================================================

export type { ImageMetadata, ImageProbe } from "rastermill";

export {
  RastermillError,
  RastermillUnavailableError,
  createRastermill,
  isRastermillUnavailableError,
  readImageMetadataFromHeader,
  readImageProbeFromHeader,
};
