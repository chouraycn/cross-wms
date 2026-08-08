/**
 * cross-wms 缺失依赖补齐层
 *
 * 移植自 openclaw 对应模块，针对 cross-wms 未完整移植的子系统提供
 * 「最小可用实现」。所有函数均返回合理默认值或最小可用对象，避免返回 undefined。
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// 默认常量（任务要求：CONTEXT_TOKENS=128000, MODEL='gpt-4', PROVIDER='openai'）
// ---------------------------------------------------------------------------

/** 默认上下文 token 上限，对齐 openclaw 主线模型的保守回退值。 */
export const DEFAULT_CONTEXT_TOKENS = 128_000;
/** 默认模型 id。 */
export const DEFAULT_MODEL = "gpt-4";
/** 默认 provider id。 */
export const DEFAULT_PROVIDER = "openai";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 思考强度等级，对齐 openclaw auto-reply/thinking.ts 的 ThinkLevel。 */
export type ThinkLevel = "none" | "low" | "medium" | "high";

/** 压缩检查点触发原因，对齐 openclaw config/sessions/types.ts。 */
export type SessionCompactionCheckpointReason =
  | "manual"
  | "auto-threshold"
  | "overflow-retry"
  | "timeout-retry";

/** 压缩检查点快照，对齐 openclaw gateway/session-compaction-checkpoints.ts。 */
export type CapturedCompactionCheckpointSnapshot = {
  sessionId: string;
  sessionFile?: string;
  leafId: string;
  entryId?: string;
};

/** 压缩检查点存储接口，对齐 openclaw CompactionCheckpointStore。 */
export type CompactionCheckpointStore = {
  captureSnapshot: (params: {
    sessionManager?: { getLeafId?: () => string | null } | null;
    sessionFile: string;
    maxBytes?: number;
  }) => Promise<CapturedCompactionCheckpointSnapshot | null>;
  persistCheckpoint: (params: {
    cfg?: any;
    sessionKey: string;
    sessionId: string;
    reason: SessionCompactionCheckpointReason;
    snapshot: CapturedCompactionCheckpointSnapshot;
    summary?: string;
    firstKeptEntryId?: string;
    tokensBefore?: number;
    tokensAfter?: number;
    postSessionFile?: string;
    postLeafId?: string;
    postEntryId?: string;
    createdAt?: number;
  }) => Promise<unknown | null>;
  cleanupSnapshot: (
    snapshot: CapturedCompactionCheckpointSnapshot | null | undefined,
  ) => Promise<void>;
  branchCheckpointSession: (params: any) => Promise<any>;
  restoreCheckpointSession: (params: any) => Promise<any>;
};

/** 最小 ContextEngine 接口，对齐 openclaw context-engine/types.ts。 */
export type ContextEngine = {
  info: { id: string; name: string };
  bootstrap: (params: any) => Promise<any>;
  maintain: (params: any) => Promise<any>;
  ingest: (params: any) => Promise<any>;
  ingestBatch: (params: any) => Promise<any>;
  afterTurn: (params: any) => Promise<void>;
  assemble: (params: any) => Promise<any>;
  compact: (params: any) => Promise<any>;
};

// ---------------------------------------------------------------------------
// Provider 缓存与认证（移植自 openclaw/src/plugins/provider-runtime.ts）
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Provider 缓存资格辅助函数（移植自 openclaw anthropic-family-cache-semantics.ts
// 与 prompt-cache-retention.ts，供 resolveProviderCacheTtlEligibility 在无 plugin
// 子系统时回退使用）
// ---------------------------------------------------------------------------

/** 判断 modelId 是否以 anthropic/ 前缀开头，移植自 isAnthropicModelRef。 */
function isAnthropicModelRef(modelId: string): boolean {
  return modelId.toLowerCase().startsWith("anthropic/");
}

/** 判断 modelId 是否为 Bedrock 上的 Anthropic Claude 模型，移植自 isAnthropicBedrockModel。 */
function isAnthropicBedrockModel(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  if (normalized.includes("anthropic.claude") || normalized.includes("anthropic/claude")) {
    return true;
  }
  return false;
}

/** 判断 provider/modelApi/modelId 三元组是否属于 Anthropic 家族 cache-TTL 资格范围。 */
function isAnthropicFamilyCacheTtlEligible(params: {
  provider: string;
  modelApi?: string;
  modelId: string;
}): boolean {
  const normalizedProvider = params.provider.toLowerCase();
  if (normalizedProvider === "anthropic" || normalizedProvider === "anthropic-vertex") {
    return true;
  }
  if (normalizedProvider === "amazon-bedrock") {
    return isAnthropicBedrockModel(params.modelId);
  }
  return params.modelApi === "anthropic-messages";
}

/** 判断 modelApi/modelId 是否符合 Google prompt cache 资格，移植自 isGooglePromptCacheEligible。 */
function isGooglePromptCacheEligible(params: {
  modelApi?: string;
  modelId?: string;
}): boolean {
  if (params.modelApi !== "google-generative-ai") {
    return false;
  }
  const normalizedModelId = (params.modelId ?? "").toLowerCase();
  return normalizedModelId.startsWith("gemini-2.5") || normalizedModelId.startsWith("gemini-3");
}

/**
 * 解析 provider 是否符合 prompt cache TTL 资格。
 *
 * openclaw 实现委托给 provider runtime plugin 的 isCacheTtlEligible 钩子；
 * cross-wms 未移植 plugin 子系统，这里移植 cache-ttl.ts 中 isCacheTtlEligibleProvider
 * 的 family-based 回退逻辑，对 anthropic / google / kilocode 家族进行资格判断。
 */
export function resolveProviderCacheTtlEligibility(params: {
  provider: string;
  config?: any;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  context: any;
}): boolean {
  void params.config;
  void params.workspaceDir;
  void params.env;
  const ctx = (params.context ?? {}) as {
    provider?: string;
    modelId?: string;
    modelApi?: string;
  };
  const provider = (ctx.provider ?? params.provider ?? "").toLowerCase();
  const modelId = (ctx.modelId ?? "").toLowerCase();
  const modelApi = ctx.modelApi;
  return (
    isAnthropicFamilyCacheTtlEligible({ provider, modelId, modelApi }) ||
    (provider === "kilocode" && isAnthropicModelRef(modelId)) ||
    isGooglePromptCacheEligible({ modelApi, modelId })
  );
}

/**
 * 准备 provider 运行时认证。
 *
 * openclaw 实现委托给 provider runtime plugin 的 prepareRuntimeAuth 钩子；
 * cross-wms 未移植 plugin 子系统，返回最小标记对象表示「无需运行时认证准备」，
 * 由调用方走默认认证流程。
 */
export async function prepareProviderRuntimeAuth(params: {
  provider: string;
  config?: any;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  context: any;
}): Promise<{ prepared: false; reason: string }> {
  void params;
  return { prepared: false, reason: "no provider runtime plugin available" };
}

// ---------------------------------------------------------------------------
// Context engine 解析（移植自 openclaw/src/context-engine/registry.ts）
// ---------------------------------------------------------------------------

const LEGACY_CONTEXT_ENGINE_ID = "legacy";

/**
 * 最小 legacy context engine 工厂。
 *
 * openclaw 在 context-engine/legacy.registration.ts 中注册了 legacy 引擎作为
 * 安全回退；cross-wms 未移植完整 context-engine 子系统，这里直接构造一个最小
 * 可用引擎，保证 resolveContextEngine 永远返回有效对象。
 */
function createLegacyContextEngine(): ContextEngine {
  return {
    info: { id: LEGACY_CONTEXT_ENGINE_ID, name: "Legacy Context Engine" },
    async bootstrap(_params: any) {
      return { bootstrapped: false, reason: "context engine downgraded to legacy" };
    },
    async maintain(_params: any) {
      return {
        changed: false,
        bytesFreed: 0,
        rewrittenEntries: 0,
        reason: "context engine downgraded to legacy",
      };
    },
    async ingest(_params: any) {
      return { ingested: false };
    },
    async ingestBatch(_params: any) {
      return { ingestedCount: 0 };
    },
    async afterTurn(_params: any) {
      return undefined;
    },
    async assemble(_params: any) {
      return { messages: [] };
    },
    async compact(_params: any) {
      return { compacted: false };
    },
  };
}

let cachedLegacyContextEngine: ContextEngine | undefined;

/**
 * 解析当前应使用的 ContextEngine。
 *
 * openclaw 实现根据 plugin slot 配置选择引擎，并支持运行时隔离回退；
 * cross-wms 未移植 plugin 子系统，这里始终返回 legacy 引擎，并填充 owner 元数据
 * （owner="core"）以便 resolveContextEngineOwnerPluginId 能正确识别。
 */
export async function resolveContextEngine(
  _config?: any,
  _options?: { agentDir?: string; workspaceDir?: string },
): Promise<ContextEngine> {
  cachedLegacyContextEngine ??= createLegacyContextEngine();
  // 移植自 openclaw registry.ts 的 wrapResolvedContextEngine：解析时填充 owner 元数据。
  if (!RESOLVED_CONTEXT_ENGINE_OWNER_PLUGIN_IDS.has(cachedLegacyContextEngine)) {
    RESOLVED_CONTEXT_ENGINE_OWNER_PLUGIN_IDS.set(cachedLegacyContextEngine, {
      owner: CORE_CONTEXT_ENGINE_OWNER,
    });
  }
  return cachedLegacyContextEngine;
}

const RESOLVED_CONTEXT_ENGINE_OWNER_PLUGIN_IDS = new WeakMap<
  object,
  { owner: string }
>();

/** openclaw 核心 owner 标识，对齐 registry.ts 的 CORE_CONTEXT_ENGINE_OWNER。 */
const CORE_CONTEXT_ENGINE_OWNER = "core";

/**
 * 为已解析的 context engine 注册 owner 元数据。
 *
 * 移植自 openclaw registry.ts 的 wrapResolvedContextEngine 元数据写入。
 * cross-wms 未移植 plugin 注册流程，但保留此入口以便将来为 plugin-owned
 * 引擎填充 `owner: "plugin:<pluginId>"` 形式的元数据。
 */
export function registerContextEngineOwner(
  engine: ContextEngine,
  owner: string,
): void {
  const normalizedOwner = owner.trim();
  if (!normalizedOwner) {
    return;
  }
  RESOLVED_CONTEXT_ENGINE_OWNER_PLUGIN_IDS.set(engine, { owner: normalizedOwner });
}

/**
 * 返回注册了已解析 context engine 的可信 plugin id。
 *
 * 移植自 openclaw registry.ts 的 resolveContextEngineOwnerPluginId：从
 * RESOLVED_CONTEXT_ENGINE_OWNER_PLUGIN_IDS WeakMap 读取 owner，仅当 owner
 * 以 "plugin:" 前缀开头时返回去掉前缀后的 plugin id。
 */
export function resolveContextEngineOwnerPluginId(
  engine: ContextEngine | undefined | null,
): string | undefined {
  if (!engine) {
    return undefined;
  }
  const owner = RESOLVED_CONTEXT_ENGINE_OWNER_PLUGIN_IDS.get(engine)?.owner;
  if (!owner?.startsWith("plugin:")) {
    return undefined;
  }
  const pluginId = owner.slice("plugin:".length).trim();
  return pluginId || undefined;
}

// ---------------------------------------------------------------------------
// 压缩检查点存储（移植自 openclaw/src/gateway/session-compaction-checkpoints.ts）
// ---------------------------------------------------------------------------

const SESSION_HEADER_READ_MAX_BYTES = 64 * 1024;
const SESSION_TAIL_READ_INITIAL_BYTES = 64 * 1024;
export const MAX_COMPACTION_CHECKPOINT_LEAF_SCAN_BYTES = 64 * 1024 * 1024;

function parseTranscriptLine(line: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(line) as any;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, any>;
  } catch {
    return null;
  }
}

async function readFileRangeAsync(
  fileHandle: Awaited<ReturnType<typeof fs.open>>,
  start: number,
  length: number,
): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await fileHandle.read(buffer, 0, length, start);
  return buffer.subarray(0, bytesRead);
}

async function readSessionIdFromTranscriptHeaderAsync(
  sessionFile: string,
): Promise<string | null> {
  let fileHandle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    fileHandle = await fs.open(sessionFile, "r");
    const buffer = await readFileRangeAsync(fileHandle, 0, SESSION_HEADER_READ_MAX_BYTES);
    if (buffer.length <= 0) {
      return null;
    }
    const chunk = buffer.toString("utf-8");
    const firstLine = chunk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    if (!firstLine) {
      return null;
    }
    const parsed = JSON.parse(firstLine) as { type?: any; id?: any };
    if (parsed.type !== "session" || typeof parsed.id !== "string" || !parsed.id.trim()) {
      return null;
    }
    return parsed.id.trim();
  } catch {
    return null;
  } finally {
    if (fileHandle) {
      await fileHandle.close().catch(() => undefined);
    }
  }
}

/**
 * 从 transcript 文件尾读取会话叶子状态（entryId + leafId）。
 *
 * 直接移植 openclaw 的 readSessionLeafStateFromTranscriptAsync，
 * 在 cross-wms 中作为最小可用的 transcript 解析器，不依赖 session-manager 子系统。
 */
export async function readSessionLeafStateFromTranscriptAsync(
  sessionFile: string,
  maxBytes: number = MAX_COMPACTION_CHECKPOINT_LEAF_SCAN_BYTES,
): Promise<{ entryId: string; leafId: string | null } | null> {
  let fileHandle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    fileHandle = await fs.open(sessionFile, "r");
    const stat = await fileHandle.stat();
    if (!stat.isFile() || stat.size <= 0) {
      return null;
    }

    const requestedMaxBytes = Number.isFinite(maxBytes)
      ? Math.max(1024, Math.floor(maxBytes))
      : MAX_COMPACTION_CHECKPOINT_LEAF_SCAN_BYTES;
    const maxReadableBytes = Math.min(stat.size, requestedMaxBytes);
    let readLength = Math.min(maxReadableBytes, SESSION_TAIL_READ_INITIAL_BYTES);
    while (readLength > 0) {
      const readStart = Math.max(0, stat.size - readLength);
      const buffer = await readFileRangeAsync(fileHandle, readStart, readLength);
      const lines = buffer.toString("utf-8").split(/\r?\n/);
      const candidateLines = readStart > 0 ? lines.slice(1) : lines;
      let latestEntryId: string | undefined;
      for (const candidateLine of candidateLines) {
        const line = candidateLine.trim();
        if (!line) {
          continue;
        }
        const parsed = parseTranscriptLine(line);
        if (!parsed) {
          continue;
        }
        if (parsed.type === "session") {
          continue;
        }
        const entryId = typeof parsed.id === "string" ? parsed.id.trim() : "";
        if (entryId) {
          latestEntryId = entryId;
        }
      }
      if (latestEntryId) {
        // cross-wms 最小实现：不区分 leaf 与 entry，统一回退到 entryId 作为 leafId。
        return { entryId: latestEntryId, leafId: latestEntryId };
      }
      if (readStart === 0) {
        return null;
      }
      const nextReadLength = Math.min(maxReadableBytes, readLength * 2);
      if (nextReadLength === readLength) {
        return null;
      }
      readLength = nextReadLength;
    }
  } catch {
    return null;
  } finally {
    if (fileHandle) {
      await fileHandle.close().catch(() => undefined);
    }
  }
  return null;
}

/**
 * 解析压缩检查点的 transcript 定位信息。
 *
 * 移植自 openclaw resolveCompactionCheckpointTranscriptPosition。
 */
export function resolveCompactionCheckpointTranscriptPosition(params: {
  preferredLeafId?: string | null;
  transcriptState?: { leafId: string | null; entryId: string } | null;
}): { leafId?: string; entryId?: string } {
  const leafId = params.preferredLeafId ?? params.transcriptState?.leafId ?? undefined;
  const entryId = params.transcriptState?.entryId ?? leafId;
  return {
    ...(leafId ? { leafId } : {}),
    ...(entryId ? { entryId } : {}),
  };
}

/**
 * 根据压缩触发状态推断检查点 reason。
 *
 * 移植自 openclaw resolveSessionCompactionCheckpointReason。
 */
export function resolveSessionCompactionCheckpointReason(params: {
  trigger?: "budget" | "overflow" | "manual";
  timedOut?: boolean;
}): SessionCompactionCheckpointReason {
  if (params.trigger === "manual") {
    return "manual";
  }
  if (params.timedOut) {
    return "timeout-retry";
  }
  if (params.trigger === "overflow") {
    return "overflow-retry";
  }
  return "auto-threshold";
}

/**
 * 捕获压缩前 transcript 的稳定标识。
 *
 * 移植自 openclaw captureCompactionCheckpointSnapshotAsync。
 * cross-wms 未移植 session manager，仅依赖 transcript 文件头与尾读取。
 */
async function captureCompactionCheckpointSnapshotAsync(params: {
  sessionManager?: { getLeafId?: () => string | null } | null;
  sessionFile: string;
  maxBytes?: number;
}): Promise<CapturedCompactionCheckpointSnapshot | null> {
  const getLeafId =
    params.sessionManager && typeof params.sessionManager.getLeafId === "function"
      ? params.sessionManager.getLeafId.bind(params.sessionManager)
      : null;
  const sessionFile = params.sessionFile.trim();
  if (!sessionFile || (params.sessionManager && !getLeafId)) {
    return null;
  }
  const liveLeafId = getLeafId ? getLeafId() : undefined;
  if (getLeafId && !liveLeafId) {
    return null;
  }
  const maxBytes = params.maxBytes ?? MAX_COMPACTION_CHECKPOINT_LEAF_SCAN_BYTES;
  const sessionId = await readSessionIdFromTranscriptHeaderAsync(sessionFile);
  const transcriptState = await readSessionLeafStateFromTranscriptAsync(sessionFile, maxBytes);
  const position = resolveCompactionCheckpointTranscriptPosition({
    preferredLeafId: liveLeafId,
    transcriptState,
  });
  const leafId = position.leafId;
  if (!sessionId || !leafId) {
    return null;
  }
  return {
    sessionId,
    leafId,
    ...(position.entryId ? { entryId: position.entryId } : {}),
  };
}

async function cleanupCompactionCheckpointSnapshot(
  snapshot: CapturedCompactionCheckpointSnapshot | null | undefined,
): Promise<void> {
  if (!snapshot?.sessionFile) {
    return;
  }
  try {
    await fs.unlink(snapshot.sessionFile);
  } catch {
    // best-effort cleanup
  }
}

/**
 * 解析压缩检查点的文件持久化目录。
 *
 * cross-wms 未移植 session store，将检查点 JSON 写入 state dir 下的
 * compaction-checkpoints/<safeSessionKey>/ 子目录。
 */
function resolveCompactionCheckpointDir(params: {
  sessionKey: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const stateDir = resolveStateDir(params.env);
  const safeKey = params.sessionKey.replace(/[^a-zA-Z0-9_-]+/g, "_");
  return path.join(stateDir, "compaction-checkpoints", safeKey);
}

/** 持久化的压缩检查点记录结构，对齐 openclaw SessionCompactionCheckpoint。 */
type PersistedCompactionCheckpoint = {
  checkpointId: string;
  sessionKey: string;
  sessionId: string;
  createdAt: number;
  reason: SessionCompactionCheckpointReason;
  tokensBefore?: number;
  tokensAfter?: number;
  summary?: string;
  firstKeptEntryId?: string;
  preCompaction: {
    sessionId: string;
    sessionFile?: string;
    leafId: string;
    entryId?: string;
  };
  postCompaction: {
    sessionId: string;
    sessionFile?: string;
    leafId?: string;
    entryId?: string;
  };
};

/**
 * 持久化压缩检查点到 state dir 下的 JSON 文件。
 *
 * 移植自 openclaw persistSessionCompactionCheckpoint。openclaw 写入 session store，
 * cross-wms 未移植 session store，改为写入 `<stateDir>/compaction-checkpoints/<key>/<id>.json`。
 */
async function persistSessionCompactionCheckpoint(
  params: {
    cfg?: any;
    sessionKey: string;
    sessionId: string;
    reason: SessionCompactionCheckpointReason;
    snapshot: CapturedCompactionCheckpointSnapshot;
    summary?: string;
    firstKeptEntryId?: string;
    tokensBefore?: number;
    tokensAfter?: number;
    postSessionFile?: string;
    postLeafId?: string;
    postEntryId?: string;
    createdAt?: number;
  },
): Promise<{ checkpointId: string; checkpointPath: string } | null> {
  void params.cfg;
  const sessionKey = params.sessionKey.trim();
  if (!sessionKey) {
    return null;
  }
  const snapshotSessionFile = params.snapshot.sessionFile?.trim();
  const postSessionFile = params.postSessionFile?.trim();
  // 与 openclaw 一致：当缺少 snapshot 文件且缺少 post 边界时跳过持久化。
  if (!snapshotSessionFile && (!postSessionFile || !params.postEntryId?.trim())) {
    return null;
  }
  const createdAt = params.createdAt ?? Date.now();
  const checkpointId = randomUUID();
  const checkpoint: PersistedCompactionCheckpoint = {
    checkpointId,
    sessionKey,
    sessionId: params.sessionId,
    createdAt,
    reason: params.reason,
    ...(typeof params.tokensBefore === "number" ? { tokensBefore: params.tokensBefore } : {}),
    ...(typeof params.tokensAfter === "number" ? { tokensAfter: params.tokensAfter } : {}),
    ...(params.summary?.trim() ? { summary: params.summary.trim() } : {}),
    ...(params.firstKeptEntryId?.trim()
      ? { firstKeptEntryId: params.firstKeptEntryId.trim() }
      : {}),
    preCompaction: {
      sessionId: params.snapshot.sessionId,
      ...(snapshotSessionFile ? { sessionFile: snapshotSessionFile } : {}),
      leafId: params.snapshot.leafId,
      ...(params.snapshot.entryId?.trim()
        ? { entryId: params.snapshot.entryId.trim() }
        : {}),
    },
    postCompaction: {
      sessionId: params.sessionId,
      ...(postSessionFile ? { sessionFile: postSessionFile } : {}),
      ...(params.postLeafId?.trim() ? { leafId: params.postLeafId.trim() } : {}),
      ...(params.postEntryId?.trim() ? { entryId: params.postEntryId.trim() } : {}),
    },
  };
  const dir = resolveCompactionCheckpointDir({ sessionKey });
  const checkpointPath = path.join(dir, `${checkpointId}.json`);
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2), "utf-8");
    return { checkpointId, checkpointPath };
  } catch {
    return null;
  }
}

/** 读取已持久化的检查点 JSON 文件。 */
async function readPersistedCheckpoint(params: {
  sessionKey: string;
  checkpointId: string;
  env?: NodeJS.ProcessEnv;
}): Promise<PersistedCompactionCheckpoint | null> {
  const dir = resolveCompactionCheckpointDir({
    sessionKey: params.sessionKey,
    env: params.env,
  });
  const checkpointPath = path.join(dir, `${params.checkpointId}.json`);
  try {
    const content = await fs.readFile(checkpointPath, "utf-8");
    const parsed = JSON.parse(content) as PersistedCompactionCheckpoint;
    if (!parsed || typeof parsed !== "object" || parsed.checkpointId !== params.checkpointId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** 复制 transcript 文件到目标路径（branch/restore 共用的文件级 fork）。 */
async function copyTranscriptFile(params: {
  sourceFile: string;
  targetFile: string;
}): Promise<boolean> {
  try {
    const source = params.sourceFile.trim();
    const target = params.targetFile.trim();
    if (!source || !target) {
      return false;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
    return true;
  } catch {
    return false;
  }
}

/**
 * 从已持久化的检查点创建分支会话。
 *
 * 移植自 openclaw branchCheckpointSessionFromStoredBoundary。openclaw 通过
 * updateSessionStore + forkCheckpointTranscriptFromStoredBoundary 完成；
 * cross-wms 改为读取检查点 JSON，复制 preCompaction.sessionFile 到新的分支文件。
 */
async function branchCheckpointSession(params: any): Promise<{
  status: "created" | "missing-session" | "missing-checkpoint" | "missing-boundary" | "failed";
  key?: string;
  checkpointPath?: string;
  branchedFile?: string;
}> {
  const p = (params ?? {}) as {
    sourceKey?: string;
    nextKey?: string;
    checkpointId?: string;
    sessionKey?: string;
    env?: NodeJS.ProcessEnv;
  };
  const sessionKey = (p.sessionKey ?? p.sourceKey ?? "").trim();
  const nextKey = (p.nextKey ?? sessionKey).trim();
  const checkpointId = (p.checkpointId ?? "").trim();
  if (!sessionKey || !checkpointId) {
    return { status: "missing-session" };
  }
  const checkpoint = await readPersistedCheckpoint({
    sessionKey,
    checkpointId,
    env: p.env,
  });
  if (!checkpoint) {
    return { status: "missing-checkpoint" };
  }
  const sourceFile = checkpoint.preCompaction.sessionFile?.trim();
  if (!sourceFile) {
    return { status: "missing-boundary" };
  }
  const dir = resolveCompactionCheckpointDir({ sessionKey, env: p.env });
  const branchedFile = path.join(
    dir,
    `branch_${checkpointId}_${Date.now()}.jsonl`,
  );
  const copied = await copyTranscriptFile({ sourceFile, targetFile: branchedFile });
  if (!copied) {
    return { status: "failed" };
  }
  return {
    status: "created",
    key: nextKey,
    checkpointPath: path.join(dir, `${checkpointId}.json`),
    branchedFile,
  };
}

/**
 * 从已持久化的检查点恢复会话。
 *
 * 移植自 openclaw restoreCheckpointSessionFromStoredBoundary。openclaw 通过
 * updateSessionStore + forkCheckpointTranscriptFromStoredBoundary 完成；
 * cross-wms 改为读取检查点 JSON，复制 preCompaction.sessionFile 到恢复文件。
 */
async function restoreCheckpointSession(params: any): Promise<{
  status: "created" | "missing-session" | "missing-checkpoint" | "missing-boundary" | "failed";
  key?: string;
  checkpointPath?: string;
  restoredFile?: string;
}> {
  const p = (params ?? {}) as {
    sessionKey?: string;
    checkpointId?: string;
    env?: NodeJS.ProcessEnv;
  };
  const sessionKey = (p.sessionKey ?? "").trim();
  const checkpointId = (p.checkpointId ?? "").trim();
  if (!sessionKey || !checkpointId) {
    return { status: "missing-session" };
  }
  const checkpoint = await readPersistedCheckpoint({
    sessionKey,
    checkpointId,
    env: p.env,
  });
  if (!checkpoint) {
    return { status: "missing-checkpoint" };
  }
  const sourceFile = checkpoint.preCompaction.sessionFile?.trim();
  if (!sourceFile) {
    return { status: "missing-boundary" };
  }
  const dir = resolveCompactionCheckpointDir({ sessionKey, env: p.env });
  const restoredFile = path.join(
    dir,
    `restore_${checkpointId}_${Date.now()}.jsonl`,
  );
  const copied = await copyTranscriptFile({ sourceFile, targetFile: restoredFile });
  if (!copied) {
    return { status: "failed" };
  }
  return {
    status: "created",
    key: sessionKey,
    checkpointPath: path.join(dir, `${checkpointId}.json`),
    restoredFile,
  };
}

/**
 * 创建文件级压缩检查点存储。
 *
 * 移植自 openclaw createFileBackedCompactionCheckpointStore。
 * cross-wms 未移植 session store 子系统，persist/branch/restore 改为基于
 * state dir 下的 JSON 文件实现文件级持久化。
 */
export function createFileBackedCompactionCheckpointStore(): CompactionCheckpointStore {
  return {
    captureSnapshot: captureCompactionCheckpointSnapshotAsync,
    persistCheckpoint: persistSessionCompactionCheckpoint,
    cleanupSnapshot: cleanupCompactionCheckpointSnapshot,
    branchCheckpointSession,
    restoreCheckpointSession,
  };
}

// ---------------------------------------------------------------------------
// Agent 目录与 session 解析（移植自 openclaw agent-scope-config.ts）
// ---------------------------------------------------------------------------

function resolveStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.OPENCLAW_STATE_DIR ?? env.CROSS_WMS_STATE_DIR;
  if (explicit && typeof explicit === "string" && explicit.trim()) {
    return path.resolve(explicit.trim());
  }
  const home = env.HOME ?? env.USERPROFILE ?? process.cwd();
  return path.join(home, ".cross-wms");
}

function normalizeAgentId(agentId: string): string {
  return agentId.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

/**
 * 解析 agent 数据目录。
 *
 * 移植自 openclaw resolveAgentDir（agent-scope-config.ts）。
 * cross-wms 未移植 agent 配置子系统，跳过 configured agentDir 查找，
 * 直接落回 state dir。
 */
export function resolveAgentDir(
  cfg: any,
  agentId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  void cfg;
  const id = normalizeAgentId(agentId);
  const root = resolveStateDir(env);
  return path.join(root, "agents", id, "agent");
}

/**
 * 解析 session 关联的 agent ids（默认 + 当前 session）。
 *
 * 移植自 openclaw resolveSessionAgentIds（agent-scope.ts）。
 * cross-wms 未移植 OpenClawConfig，默认 agent id 固定为 "default"。
 */
export function resolveSessionAgentIds(params: {
  sessionKey?: string;
  config?: any;
  agentId?: string;
  fallbackAgentId?: string;
}): { defaultAgentId: string; sessionAgentId: string } {
  void params.config;
  const defaultAgentId = "default";
  const explicitAgentIdRaw = (params.agentId ?? "").trim().toLowerCase();
  const explicitAgentId = explicitAgentIdRaw ? normalizeAgentId(explicitAgentIdRaw) : null;
  const fallbackAgentIdRaw = (params.fallbackAgentId ?? "").trim().toLowerCase();
  const fallbackAgentId = fallbackAgentIdRaw ? normalizeAgentId(fallbackAgentIdRaw) : null;

  const sessionKey = params.sessionKey?.trim();
  let parsedAgentId: string | null = null;
  if (sessionKey) {
    const parts = sessionKey.toLowerCase().split(":").filter(Boolean);
    if (parts.length >= 3 && parts[0] === "agent" && parts[1]) {
      parsedAgentId = normalizeAgentId(parts[1]);
    }
  }

  const sessionAgentId =
    explicitAgentId ?? parsedAgentId ?? fallbackAgentId ?? defaultAgentId;
  return { defaultAgentId, sessionAgentId };
}

// ---------------------------------------------------------------------------
// Cron session key 判断（移植自 openclaw sessions/session-key-utils.ts）
// ---------------------------------------------------------------------------

/**
 * 判断 session key 是否属于 cron 调度。
 *
 * 移植自 openclaw isCronSessionKey：解析 "agent:<id>:cron:..." 形式。
 */
export function isCronSessionKey(sessionKey: string | undefined | null): boolean {
  if (!sessionKey) {
    return false;
  }
  const raw = sessionKey.trim();
  if (!raw) {
    return false;
  }
  const parts = raw.toLowerCase().split(":").filter(Boolean);
  if (parts.length < 3) {
    return false;
  }
  if (parts[0] !== "agent") {
    return false;
  }
  const rest = parts.slice(2).join(":");
  return rest.startsWith("cron:");
}

// ---------------------------------------------------------------------------
// 模型回退 / 超时归因 / 接受会话（移植自 openclaw 对应模块）
// ---------------------------------------------------------------------------

/** 模型回退观察记录，移植自 openclaw failover-observation.ts 的 FailoverDecisionLoggerBase。 */
export type ModelFallbackObservation = {
  stage: "prompt" | "assistant";
  decision: "rotate_profile" | "fallback_model" | "surface_error";
  failoverReason: string | null;
  profileFailureReason: string | null;
  provider: string;
  model: string;
  fallbackConfigured: boolean;
  timedOut: boolean;
};

/**
 * 解析模型回退观察记录。
 *
 * 移植自 openclaw failover-observation.ts 的 normalizeFailoverDecisionObservationBase：
 * 当 timedOut 为 true 且 failoverReason / profileFailureReason 未显式提供时，
 * 回退为 "timeout"。返回结构化观察对象，不返回 null。
 */
export function resolveModelFallbackObservation(...args: any[]): ModelFallbackObservation {
  const input = (args[0] ?? {}) as {
    stage?: string;
    decision?: string;
    failoverReason?: string | null;
    profileFailureReason?: string | null;
    provider?: string;
    model?: string;
    fallbackConfigured?: boolean;
    timedOut?: boolean;
  };
  const timedOut = Boolean(input.timedOut);
  const stage: ModelFallbackObservation["stage"] =
    input.stage === "assistant" ? "assistant" : "prompt";
  const decision: ModelFallbackObservation["decision"] =
    input.decision === "rotate_profile" || input.decision === "surface_error"
      ? input.decision
      : "fallback_model";
  return {
    stage,
    decision,
    failoverReason: input.failoverReason ?? (timedOut ? "timeout" : null),
    profileFailureReason: input.profileFailureReason ?? (timedOut ? "timeout" : null),
    provider: (input.provider ?? "").trim(),
    model: (input.model ?? "").trim(),
    fallbackConfigured: Boolean(input.fallbackConfigured),
    timedOut,
  };
}

/** 运行超时归因结果，移植自 openclaw timeout.ts 的超时解析逻辑。 */
export type RunTimeoutAttribution = {
  timedOut: boolean;
  reason: string | null;
  elapsedMs?: number;
  deadlineMs?: number;
};

/**
 * 解析运行超时归因。
 *
 * 移植自 openclaw timeout.ts：从运行状态中提取 timedOut 信号、elapsed/deadline
 * 等字段，返回结构化归因对象。当 signal.aborted 为 true 时也视为超时。
 */
export function resolveRunTimeoutAttribution(...args: any[]): RunTimeoutAttribution {
  const input = (args[0] ?? {}) as {
    timedOut?: boolean;
    elapsedMs?: number;
    deadlineMs?: number;
    signal?: { aborted?: boolean; reason?: any };
  };
  const timedOut =
    Boolean(input.timedOut) || Boolean(input.signal?.aborted);
  return {
    timedOut,
    reason: timedOut ? "timeout" : null,
    ...(typeof input.elapsedMs === "number" && Number.isFinite(input.elapsedMs)
      ? { elapsedMs: input.elapsedMs }
      : {}),
    ...(typeof input.deadlineMs === "number" && Number.isFinite(input.deadlineMs)
      ? { deadlineMs: input.deadlineMs }
      : {}),
  };
}

/** 接受的会话句柄，移植自 openclaw accepted-session-spawn.ts 的 AcceptedSessionSpawn。 */
export type AcceptedSession = {
  runId: string;
  childSessionKey: string;
};

/**
 * 解析接受的会话句柄。
 *
 * 移植自 openclaw accepted-session-spawn.ts 的 normalizeAcceptedSessionSpawnResult：
 * 从工具结果中提取 details.status === "accepted" 且包含 runId + childSessionKey 的记录。
 * 无匹配时返回 null（与 openclaw 行为一致）。
 */
export function resolveAcceptedSession(...args: any[]): AcceptedSession | null {
  const result = args[0];
  if (!result || typeof result !== "object") {
    return null;
  }
  const outer = result as Record<string, any>;
  const detailsRaw = outer.details;
  if (!detailsRaw || typeof detailsRaw !== "object") {
    return null;
  }
  const details = detailsRaw as Record<string, any>;
  if (details.status !== "accepted") {
    return null;
  }
  const runId = typeof details.runId === "string" ? details.runId.trim() : "";
  const childSessionKey =
    typeof details.childSessionKey === "string" ? details.childSessionKey.trim() : "";
  if (!runId || !childSessionKey) {
    return null;
  }
  return { runId, childSessionKey };
}

// ---------------------------------------------------------------------------
// 基础设施解析（cross-wms 最小实现）
// ---------------------------------------------------------------------------

/** 最小 infra 对象，提供 paths/db/logger 等基础能力。 */
export type Infra = {
  paths: {
    stateDir: string;
    workspaceDir: string;
    agentDir: string;
  };
  db: {
    /** cross-wms 未移植 sqlite 子系统，这里为占位句柄。 */
    handle: any;
  };
  logger: {
    debug: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
};

/**
 * 解析 cross-wms 基础设施句柄。
 *
 * openclaw 通过 di 容器注入 infra；cross-wms 未移植 di 子系统，
 * 这里返回最小 infra 对象（paths/db/logger），保证调用方拿到非空句柄。
 */
export function resolveInfra(params?: {
  workspaceDir?: string;
  agentId?: string;
  env?: NodeJS.ProcessEnv;
}): Infra {
  const env = params?.env ?? process.env;
  const stateDir = resolveStateDir(env);
  const workspaceDir = params?.workspaceDir ?? process.cwd();
  const agentId = params?.agentId ?? "default";
  return {
    paths: {
      stateDir,
      workspaceDir,
      agentDir: resolveAgentDir(undefined, agentId, env),
    },
    db: { handle: null },
    logger: {
      debug: (message: string) => console.debug(`[cross-wms:infra] ${message}`),
      info: (message: string) => console.info(`[cross-wms:infra] ${message}`),
      warn: (message: string) => console.warn(`[cross-wms:infra] ${message}`),
      error: (message: string) => console.error(`[cross-wms:infra] ${message}`),
    },
  };
}

// ---------------------------------------------------------------------------
// 工作区存储（cross-wms 最小实现）
// ---------------------------------------------------------------------------

/** 最小工作区存储，使用内存 Map 模拟 kv 行为。 */
export type WorkspaceStorage = {
  get: (key: string) => Promise<unknown | undefined>;
  set: (key: string, value: any) => Promise<void>;
  delete: (key: string) => Promise<void>;
  keys: () => Promise<string[]>;
};

const workspaceStorageMap = new Map<string, any>();

/**
 * 解析工作区存储句柄。
 *
 * openclaw 通过 workspace storage plugin 提供；cross-wms 未移植该子系统，
 * 返回内存 Map 包装的最小 storage 对象。
 */
export function resolveWorkspaceStorage(params?: {
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): WorkspaceStorage {
  void params;
  return {
    async get(key: string) {
      return workspaceStorageMap.get(key);
    },
    async set(key: string, value: any) {
      workspaceStorageMap.set(key, value);
    },
    async delete(key: string) {
      workspaceStorageMap.delete(key);
    },
    async keys() {
      return [...workspaceStorageMap.keys()];
    },
  };
}

/**
 * 解析工作区存储中 session 数据的根目录。
 *
 * openclaw 实现根据 config + workspace 拼接 session root；
 * cross-wms 直接落回 state dir 下的 sessions 子目录。
 */
export function resolveWorkspaceStorageSessionRoot(params?: {
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const env = params?.env ?? process.env;
  return path.join(resolveStateDir(env), "sessions");
}

// ---------------------------------------------------------------------------
// 嵌入式代理消息 / ACP 运行时（移植自 openclaw 对应模块）
// ---------------------------------------------------------------------------

/** 最小嵌入式代理消息句柄。 */
export type EmbeddedAgentMessaging = {
  queueMessage: (params: any) => Promise<void>;
  waitForRunEnd: () => Promise<void>;
};

/** 内存队列中的消息条目。 */
type QueuedEmbeddedAgentMessage = {
  enqueuedAt: number;
  payload: any;
};

/** 进程级消息队列，queueMessage 写入、waitForRunEnd 等待 run 结束信号。 */
const embeddedAgentMessageQueue: QueuedEmbeddedAgentMessage[] = [];
let embeddedAgentRunEndResolver: (() => void) | null = null;
let embeddedAgentRunEndPromise: Promise<void> | null = null;

/** 重置 run-end latch，创建新的等待 Promise。 */
function resetEmbeddedAgentRunEndLatch(): void {
  embeddedAgentRunEndPromise = new Promise<void>((resolve) => {
    embeddedAgentRunEndResolver = resolve;
  });
}

/** 标记当前嵌入式代理 run 已结束，唤醒所有 waitForRunEnd 调用方。 */
export function signalEmbeddedAgentRunEnded(): void {
  const resolver = embeddedAgentRunEndResolver;
  embeddedAgentRunEndResolver = null;
  if (resolver) {
    resolver();
  }
}

/** 读取并清空当前内存队列中的消息，供测试或消费方使用。 */
export function drainEmbeddedAgentMessageQueue(): QueuedEmbeddedAgentMessage[] {
  const drained = [...embeddedAgentMessageQueue];
  embeddedAgentMessageQueue.length = 0;
  return drained;
}

/**
 * 解析嵌入式代理消息句柄。
 *
 * openclaw 实现位于 embedded-agent-messaging.ts，依赖完整的事件总线；
 * cross-wms 未移植该子系统，返回基于内存队列的最小实现：
 * queueMessage 将消息存入内存队列，waitForRunEnd 通过 deferred promise
 * 实际等待 signalEmbeddedAgentRunEnded 触发的 run 结束信号。
 */
export function resolveEmbeddedAgentMessaging(..._args: any[]): EmbeddedAgentMessaging {
  // 确保 run-end latch 已初始化，保证 waitForRunEnd 能实际挂起。
  if (!embeddedAgentRunEndPromise) {
    resetEmbeddedAgentRunEndLatch();
  }
  return {
    async queueMessage(params: any) {
      embeddedAgentMessageQueue.push({
        enqueuedAt: Date.now(),
        payload: params,
      });
    },
    async waitForRunEnd() {
      if (embeddedAgentRunEndPromise) {
        await embeddedAgentRunEndPromise;
      }
    },
  };
}

/** ACP 运行时可用性结果。 */
export type AcpRuntimeAvailability = {
  available: boolean;
  reason?: string;
};

/**
 * 解析 ACP 运行时可用性。
 *
 * 移植自 openclaw acp/runtime/availability.ts 的 isAcpRuntimeSpawnAvailable：
 * 依次检查 sandboxed 标志、config policy（config.acp.enabled）、backend 是否已注册。
 * cross-wms 未移植 ACP backend registry，因此最终 available 为 false。
 */
export function resolveAcpRuntimeAvailability(...args: any[]): AcpRuntimeAvailability {
  const params = (args[0] ?? {}) as {
    sandboxed?: boolean;
    config?: { acp?: { enabled?: boolean; backend?: string } };
    backendId?: string;
  };
  if (params.sandboxed === true) {
    return {
      available: false,
      reason: "ACP runtime spawning is disabled in sandboxed mode",
    };
  }
  if (params.config && params.config.acp?.enabled === false) {
    return {
      available: false,
      reason: "ACP runtime is disabled by policy",
    };
  }
  // cross-wms 未移植 ACP backend registry，无可用 backend。
  return {
    available: false,
    reason: "no ACP runtime backend registered in cross-wms",
  };
}
