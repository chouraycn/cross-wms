/**
 * Commitments Store - 持久化存储
 *
 * 基于 JSON 文件的承诺记录存储实现，支持原子写入、记录校验、到期认领、
 * 状态更新、过期清理、过滤查询、分页、统计和心跳记录。
 *
 * 对齐 openclaw/src/commitments/store.ts 的职责划分，文件操作参考
 * server/engine/cron/store.ts 的 atomicWrite 模式：
 *   - 写入临时文件后 rename，保证原子性
 *   - 目录权限 0o700，文件权限 0o600
 *   - ENOENT 视为空存储而非错误
 */

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { EXPIRE_AFTER_HOURS, priorityToNumber } from "./config.js";
import type {
  CommitmentCandidate,
  CommitmentExtractionItem,
  CommitmentRecord,
  CommitmentScope,
  CommitmentSource,
  CommitmentStatus,
  CommitmentStoreFile,
  CommitmentFilter,
  PaginationParams,
  SortParams,
  PaginatedResult,
  CommitmentStats,
  CommitmentHeartbeat,
  CommitmentPriority,
  CommitmentKind,
  CommitmentSensitivity,
} from "./types.js";

// ===================== 常量 =====================

const STORE_VERSION = 1 as const;
/** 滚动 24 小时窗口，用于每日投递上限统计 */
const ROLLING_DAY_MS = 24 * 60 * 60 * 1000;
/** 默认存储目录名 */
const DEFAULT_COMMITMENTS_DIR = "commitments";
/** 默认存储文件名 */
const DEFAULT_STORE_FILENAME = "commitments.json";
/** 默认最大心跳记录数 */
const DEFAULT_MAX_HEARTBEAT_RECORDS = 1000;

const COMMITMENT_KINDS = new Set<string>([
  "event_check_in",
  "deadline_check",
  "care_check_in",
  "open_loop",
  "follow_up",
  "reminder",
  "urgent",
  "care",
]);
const COMMITMENT_SENSITIVITIES = new Set<string>([
  "routine",
  "personal",
  "care",
  "normal",
]);
const COMMITMENT_SOURCES = new Set<string>([
  "inferred_user_context",
  "agent_promise",
  "manual",
  "system",
  "rule",
]);
const COMMITMENT_STATUSES = new Set<CommitmentStatus>([
  "pending",
  "sent",
  "dismissed",
  "snoozed",
  "expired",
  "completed",
  "failed",
]);
const COMMITMENT_PRIORITIES = new Set<CommitmentPriority>([
  "low",
  "medium",
  "high",
  "urgent",
]);

// ===================== 路径解析 =====================

/** 解析默认的承诺存储目录 */
function resolveDefaultCommitmentsDir(): string {
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return path.join(homeDir, ".config", "cdfknow", DEFAULT_COMMITMENTS_DIR);
}

/** 展开 home 目录前缀 */
function expandHomePrefix(rawPath: string): string {
  if (rawPath === "~") {
    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";
    return homeDir;
  }
  if (rawPath.startsWith("~/")) {
    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";
    return path.join(homeDir, rawPath.slice(2));
  }
  return rawPath;
}

/** listCommitments 参数类型 */
export type ListCommitmentsParams = {
  storePath?: string;
  filter?: CommitmentFilter;
  sort?: SortParams;
  pagination?: PaginationParams;
  nowMs?: number;
};

/** updateCommitment 参数类型 */
export type CommitmentUpdateParams = {
  id: string;
  storePath?: string;
  updates: Partial<CommitmentRecord>;
  nowMs?: number;
};

/** 解析承诺存储文件路径，缺省时回退到默认路径 */
export function resolveCommitmentStorePath(storePath?: string): string {
  const trimmed = storePath?.trim();
  if (!trimmed) {
    return path.join(resolveDefaultCommitmentsDir(), DEFAULT_STORE_FILENAME);
  }
  if (trimmed.startsWith("~")) {
    return path.resolve(expandHomePrefix(trimmed));
  }
  return path.resolve(trimmed);
}

// ===================== 原子写入 =====================

/** 原子写入文件：先写临时文件再 rename，保证写入原子性 */
async function atomicWrite(
  filePath: string,
  content: string,
  dirMode = 0o700,
  fileMode = 0o600,
): Promise<void> {
  const dir = path.dirname(filePath);
  const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;

  await fs.promises.mkdir(dir, { recursive: true, mode: dirMode });

  await fs.promises.writeFile(tempPath, content, { mode: fileMode });

  try {
    await fs.promises.rename(tempPath, filePath);
  } catch (err) {
    try {
      await fs.promises.unlink(tempPath);
    } catch {
    }
    throw err;
  }
}

// ===================== 校验工具 =====================

/** 判断值是否为普通记录对象 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 规范化可选字符串：非字符串或空串返回 undefined */
function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** 规范化非负有限数：非法返回 undefined */
function normalizeNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/** 规范化非负整数：非法返回 undefined */
function normalizeNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

/** 规范化字符串数组 */
function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.filter((v) => typeof v === "string" && v.trim().length > 0);
  return result.length > 0 ? result : undefined;
}

// ===================== 记录校验 =====================

/** 空存储 */
function emptyStore(): CommitmentStoreFile {
  return { version: STORE_VERSION, commitments: [], heartbeats: [] };
}

/**
 * 校验并规范化一条承诺记录。
 *
 * 必填字段缺失或枚举值非法时返回 null；可选字段被裁剪为干净形态。
 */
export function coerceCommitment(raw: unknown): CommitmentRecord | null {
  if (!isRecord(raw)) {
    return null;
  }
  const dueWindow = isRecord(raw.dueWindow) ? raw.dueWindow : undefined;
  if (!dueWindow) {
    return null;
  }

  const id = normalizeOptionalString(raw.id);
  const agentId = normalizeOptionalString(raw.agentId);
  const sessionKey = normalizeOptionalString(raw.sessionKey);
  const channel = normalizeOptionalString(raw.channel);
  const reason = normalizeOptionalString(raw.reason);
  const suggestedText = normalizeOptionalString(raw.suggestedText);
  const dedupeKey = normalizeOptionalString(raw.dedupeKey);
  const kind = normalizeOptionalString(raw.kind);
  const sensitivity = normalizeOptionalString(raw.sensitivity);
  const source = normalizeOptionalString(raw.source);
  const status = normalizeOptionalString(raw.status);
  const priority = normalizeOptionalString(raw.priority) || "medium";
  const confidence = normalizeNonNegativeNumber(raw.confidence);
  const createdAtMs = normalizeNonNegativeNumber(raw.createdAtMs);
  const updatedAtMs = normalizeNonNegativeNumber(raw.updatedAtMs);
  const attempts = normalizeNonNegativeInteger(raw.attempts);
  const earliestMs = normalizeNonNegativeNumber(dueWindow.earliestMs);
  const latestMs = normalizeNonNegativeNumber(dueWindow.latestMs);
  const timezone = normalizeOptionalString(dueWindow.timezone);
  const accountId = normalizeOptionalString(raw.accountId);
  const to = normalizeOptionalString(raw.to);
  const threadId = normalizeOptionalString(raw.threadId);
  const senderId = normalizeOptionalString(raw.senderId);
  const sourceMessageId = normalizeOptionalString(raw.sourceMessageId);
  const sourceRunId = normalizeOptionalString(raw.sourceRunId);
  const lastAttemptAtMs = normalizeNonNegativeNumber(raw.lastAttemptAtMs);
  const sentAtMs = normalizeNonNegativeNumber(raw.sentAtMs);
  const dismissedAtMs = normalizeNonNegativeNumber(raw.dismissedAtMs);
  const snoozedUntilMs = normalizeNonNegativeNumber(raw.snoozedUntilMs);
  const expiredAtMs = normalizeNonNegativeNumber(raw.expiredAtMs);
  const completedAtMs = normalizeNonNegativeNumber(raw.completedAtMs);
  const failedAtMs = normalizeNonNegativeNumber(raw.failedAtMs);
  const failureReason = normalizeOptionalString(raw.failureReason);
  const tags = normalizeStringArray(raw.tags);
  const completionVerified = typeof raw.completionVerified === "boolean" ? raw.completionVerified : undefined;
  const completionVerifiedAtMs = normalizeNonNegativeNumber(raw.completionVerifiedAtMs);

  if (
    !id ||
    !agentId ||
    !sessionKey ||
    !channel ||
    !reason ||
    !suggestedText ||
    !dedupeKey ||
    !kind ||
    !sensitivity ||
    !source ||
    !status ||
    !COMMITMENT_KINDS.has(kind) ||
    !COMMITMENT_SENSITIVITIES.has(sensitivity) ||
    !COMMITMENT_SOURCES.has(source) ||
    !COMMITMENT_STATUSES.has(status as CommitmentStatus) ||
    !COMMITMENT_PRIORITIES.has(priority as CommitmentPriority) ||
    confidence === undefined ||
    createdAtMs === undefined ||
    updatedAtMs === undefined ||
    attempts === undefined ||
    earliestMs === undefined ||
    latestMs === undefined ||
    !timezone ||
    latestMs < earliestMs
  ) {
    return null;
  }

  const metadata = isRecord(raw.metadata) ? raw.metadata : undefined;

  return {
    id,
    agentId,
    sessionKey,
    channel,
    ...(accountId ? { accountId } : {}),
    ...(to ? { to } : {}),
    ...(threadId ? { threadId } : {}),
    ...(senderId ? { senderId } : {}),
    kind: kind as CommitmentKind,
    sensitivity: sensitivity as CommitmentSensitivity,
    source: source as CommitmentSource,
    status: status as CommitmentStatus,
    priority: priority as CommitmentPriority,
    reason,
    suggestedText,
    dedupeKey,
    confidence,
    dueWindow: { earliestMs, latestMs, timezone },
    ...(sourceMessageId ? { sourceMessageId } : {}),
    ...(sourceRunId ? { sourceRunId } : {}),
    ...(tags ? { tags } : {}),
    ...(metadata ? { metadata } : {}),
    createdAtMs,
    updatedAtMs,
    attempts,
    ...(lastAttemptAtMs !== undefined ? { lastAttemptAtMs } : {}),
    ...(sentAtMs !== undefined ? { sentAtMs } : {}),
    ...(dismissedAtMs !== undefined ? { dismissedAtMs } : {}),
    ...(snoozedUntilMs !== undefined ? { snoozedUntilMs } : {}),
    ...(expiredAtMs !== undefined ? { expiredAtMs } : {}),
    ...(completedAtMs !== undefined ? { completedAtMs } : {}),
    ...(failedAtMs !== undefined ? { failedAtMs } : {}),
    ...(failureReason ? { failureReason } : {}),
    ...(completionVerified !== undefined ? { completionVerified } : {}),
    ...(completionVerifiedAtMs !== undefined ? { completionVerifiedAtMs } : {}),
  };
}

/** 校验并规范化心跳记录 */
function coerceHeartbeat(raw: unknown): CommitmentHeartbeat | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  const id = normalizeOptionalString(raw.id);
  const commitmentId = normalizeOptionalString(raw.commitmentId);
  const heartbeatAtMs = normalizeNonNegativeNumber(raw.heartbeatAtMs);
  const status = normalizeOptionalString(raw.status);
  const deliveryChannel = normalizeOptionalString(raw.deliveryChannel);
  const deliveryMessageId = normalizeOptionalString(raw.deliveryMessageId);
  const skipReason = normalizeOptionalString(raw.skipReason);
  const errorMessage = normalizeOptionalString(raw.errorMessage);

  if (
    !id ||
    !commitmentId ||
    heartbeatAtMs === undefined ||
    !status ||
    !["triggered", "skipped", "delivered", "failed"].includes(status)
  ) {
    return undefined;
  }

  return {
    id,
    commitmentId,
    heartbeatAtMs,
    status: status as CommitmentHeartbeat["status"],
    ...(deliveryChannel ? { deliveryChannel } : {}),
    ...(deliveryMessageId ? { deliveryMessageId } : {}),
    ...(skipReason ? { skipReason } : {}),
    ...(errorMessage ? { errorMessage } : {}),
  };
}

/** 判断记录是否含有遗留的 source 文本字段 */
function hasLegacySourceText(raw: unknown): boolean {
  return isRecord(raw) && ("sourceUserText" in raw || "sourceAssistantText" in raw);
}

/** 裁剪遗留的 source 文本字段，避免回放到投递 prompt */
function stripLegacySourceText(commitment: CommitmentRecord): CommitmentRecord {
  const stripped = { ...commitment };
  delete stripped.sourceUserText;
  delete stripped.sourceAssistantText;
  return stripped;
}

/** 写入前统一裁剪遗留字段 */
function sanitizeStoreForWrite(store: CommitmentStoreFile): CommitmentStoreFile {
  return {
    ...store,
    commitments: store.commitments.map(stripLegacySourceText),
    heartbeats: store.heartbeats || [],
  };
}

// ===================== 加载 / 保存 =====================

/** 加载结果：附带是否检测到遗留字段的标志 */
type LoadedCommitmentStore = {
  store: CommitmentStoreFile;
  hadLegacySourceText: boolean;
};

/** 加载并校验存储文件，内部实现 */
async function loadCommitmentStoreInternal(
  storePath?: string,
): Promise<LoadedCommitmentStore> {
  const resolved = resolveCommitmentStorePath(storePath);
  try {
    const raw = await fs.promises.readFile(resolved, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.version !== STORE_VERSION ||
      !Array.isArray(parsed.commitments)
    ) {
      return { store: emptyStore(), hadLegacySourceText: false };
    }
    let hadLegacySourceText = false;

    const heartbeats = Array.isArray(parsed.heartbeats)
      ? parsed.heartbeats.flatMap((entry) => {
          const coerced = coerceHeartbeat(entry);
          return coerced ? [coerced] : [];
        })
      : [];

    return {
      store: {
        version: STORE_VERSION,
        commitments: parsed.commitments.flatMap((entry) => {
          hadLegacySourceText ||= hasLegacySourceText(entry);
          const coerced = coerceCommitment(entry);
          return coerced ? [coerced] : [];
        }),
        heartbeats,
      },
      hadLegacySourceText,
    };
  } catch (err) {
    if ((err as { code?: unknown })?.code === "ENOENT") {
      return { store: emptyStore(), hadLegacySourceText: false };
    }
    throw err;
  }
}

/** 加载承诺存储文件 */
export async function loadCommitmentStore(
  storePath?: string,
): Promise<CommitmentStoreFile> {
  return (await loadCommitmentStoreInternal(storePath)).store;
}

/** 原子写入承诺存储文件 */
export async function saveCommitmentStore(
  storePath: string | undefined,
  store: CommitmentStoreFile,
): Promise<void> {
  const resolved = resolveCommitmentStorePath(storePath);
  const payload = JSON.stringify(sanitizeStoreForWrite(store), null, 2);
  await atomicWrite(resolved, payload);
}

// ===================== ID / 作用域 =====================

/** 生成承诺 ID：cm_<时间36进制>_<随机hex> */
function generateCommitmentId(nowMs: number): string {
  return `cm_${nowMs.toString(36)}_${randomBytes(5).toString("hex")}`;
}

/** 生成心跳 ID */
function generateHeartbeatId(nowMs: number): string {
  return `hb_${nowMs.toString(36)}_${randomBytes(4).toString("hex")}`;
}

/** 取作用域字段的规范值 */
function scopeValue(value: string | undefined): string {
  return value?.trim() ?? "";
}

/** 构建作用域唯一键，用于同作用域去重 */
function buildCommitmentScopeKey(scope: CommitmentScope): string {
  return [
    scopeValue(scope.agentId),
    scopeValue(scope.sessionKey),
    scopeValue(scope.channel),
    scopeValue(scope.accountId),
    scopeValue(scope.to),
    scopeValue(scope.threadId),
    scopeValue(scope.senderId),
  ].join("\u001f");
}

/** 判断状态是否为活跃（待处理或已延后） */
function isActiveStatus(status: CommitmentStatus): boolean {
  return status === "pending" || status === "snoozed";
}

/** 把候选项转换为持久化记录 */
function candidateToRecord(params: {
  item: CommitmentExtractionItem;
  candidate: CommitmentCandidate;
  nowMs: number;
  earliestMs: number;
  latestMs: number;
  timezone: string;
}): CommitmentRecord {
  const reason = (params.candidate.reason ?? '').trim() || '未命名承诺';
  const suggestedText = (params.candidate.suggestedText ?? '').trim() || reason;
  const source = params.candidate.source || 'rule';
  const dedupeKey = (params.candidate.dedupeKey ?? '').trim() || `${params.candidate.kind}:${reason}`;

  return {
    id: generateCommitmentId(params.nowMs),
    agentId: params.item.agentId,
    sessionKey: params.item.sessionKey,
    channel: params.item.channel,
    ...(params.item.accountId ? { accountId: params.item.accountId } : {}),
    ...(params.item.to ? { to: params.item.to } : {}),
    ...(params.item.threadId ? { threadId: params.item.threadId } : {}),
    ...(params.item.senderId ? { senderId: params.item.senderId } : {}),
    kind: params.candidate.kind,
    sensitivity: params.candidate.sensitivity,
    source,
    status: "pending",
    priority: params.candidate.priority || "medium",
    reason,
    suggestedText,
    dedupeKey,
    confidence: params.candidate.confidence ?? 0.5,
    dueWindow: {
      earliestMs: params.earliestMs,
      latestMs: params.latestMs,
      timezone: params.timezone,
    },
    ...(params.item.sourceMessageId
      ? { sourceMessageId: params.item.sourceMessageId }
      : {}),
    ...(params.item.sourceRunId ? { sourceRunId: params.item.sourceRunId } : {}),
    ...(params.candidate.tags && params.candidate.tags.length > 0 ? { tags: params.candidate.tags } : {}),
    ...(params.candidate.metadata ? { metadata: params.candidate.metadata } : {}),
    createdAtMs: params.nowMs,
    updatedAtMs: params.nowMs,
    attempts: 0,
  };
}

// ===================== 过期清理 =====================

/** 计算过期清理阈值（毫秒） */
function expireAfterMs(): number {
  return EXPIRE_AFTER_HOURS * 60 * 60 * 1000;
}

/** 在内存中对到期未投递的承诺标记为过期，返回是否有变更 */
function expireStaleCommitmentsInStore(
  store: CommitmentStoreFile,
  nowMs: number,
): boolean {
  const staleAfterMs = expireAfterMs();
  let changed = false;
  store.commitments = store.commitments.map((commitment) => {
    if (
      !isActiveStatus(commitment.status) ||
      commitment.dueWindow.latestMs + staleAfterMs >= nowMs
    ) {
      return commitment;
    }
    changed = true;
    return {
      ...commitment,
      status: "expired" as const,
      expiredAtMs: nowMs,
      updatedAtMs: nowMs,
    };
  });
  return changed;
}

/**
 * 过期清理：将到期未投递的活跃承诺标记为过期，并持久化变更。
 *
 * @param storePath 存储路径；缺省走默认路径
 * @param nowMs 当前时间；缺省取 Date.now()
 * @returns 是否发生了变更
 */
export async function expireStaleCommitments(
  storePath?: string,
  nowMs?: number,
): Promise<boolean> {
  const at = nowMs ?? Date.now();
  const { store, hadLegacySourceText } = await loadCommitmentStoreInternal(storePath);
  const expireChanged = expireStaleCommitmentsInStore(store, at);
  if (expireChanged || hadLegacySourceText) {
    await saveCommitmentStore(storePath, store);
    return true;
  }
  return false;
}

// ===================== 添加 / 去重 =====================

/**
 * 添加新承诺，同作用域同 dedupeKey 的活跃承诺会被合并更新。
 *
 * 支持两种调用方式：
 * 1. addCommitment({ storePath, item, candidates, nowMs }) - 从提取结果添加
 * 2. addCommitment({ id, scope, kind, sensitivity, source, priority, reason, suggestedText, dedupeKey, confidence, dueWindow, status, createdAtMs, updatedAtMs, storePath }) - 直接创建单个承诺
 *
 * @returns { added: number; duplicates: number }
 */
export async function addCommitment(params: any): Promise<{ added: number; duplicates: number }> {
  if (params && 'candidates' in params) {
    return addCommitmentFromCandidates(params);
  }
  return addCommitmentDirect(params);
}

async function addCommitmentDirect(params: {
  id?: string;
  scope: CommitmentScope;
  kind: CommitmentKind;
  sensitivity: CommitmentSensitivity;
  source: string;
  priority?: CommitmentPriority;
  reason: string;
  suggestedText: string;
  dedupeKey: string;
  confidence: number;
  dueWindow: { earliestMs: number; latestMs: number; timezone: string };
  status?: CommitmentStatus;
  createdAtMs?: number;
  updatedAtMs?: number;
  attempts?: number;
  storePath?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}): Promise<{ added: number; duplicates: number }> {
  const nowMs = params.createdAtMs ?? Date.now();
  const storePath = params.storePath;
  const scopeKey = buildCommitmentScopeKey(params.scope);
  const { store } = await loadCommitmentStoreInternal(storePath);
  expireStaleCommitmentsInStore(store, nowMs);

  const dedupeKey = params.dedupeKey.trim();
  const existingIndex = store.commitments.findIndex(
    (commitment) =>
      buildCommitmentScopeKey(commitment) === scopeKey &&
      commitment.dedupeKey === dedupeKey &&
      isActiveStatus(commitment.status),
  );

  if (existingIndex >= 0) {
    return { added: 0, duplicates: 1 };
  }

  const record: CommitmentRecord = {
    id: params.id || generateCommitmentId(nowMs),
    agentId: params.scope.agentId,
    sessionKey: params.scope.sessionKey,
    channel: params.scope.channel,
    ...(params.scope.accountId ? { accountId: params.scope.accountId } : {}),
    ...(params.scope.to ? { to: params.scope.to } : {}),
    ...(params.scope.threadId ? { threadId: params.scope.threadId } : {}),
    ...(params.scope.senderId ? { senderId: params.scope.senderId } : {}),
    kind: params.kind,
    sensitivity: params.sensitivity,
    source: params.source as CommitmentSource,
    status: params.status || "pending",
    priority: params.priority || "medium",
    reason: params.reason,
    suggestedText: params.suggestedText,
    dedupeKey: params.dedupeKey,
    confidence: params.confidence,
    dueWindow: params.dueWindow,
    ...(params.tags && params.tags.length > 0 ? { tags: params.tags } : {}),
    ...(params.metadata ? { metadata: params.metadata } : {}),
    createdAtMs: nowMs,
    updatedAtMs: params.updatedAtMs ?? nowMs,
    attempts: params.attempts ?? 0,
  };

  store.commitments.push(record);
  await saveCommitmentStore(storePath, store);
  return { added: 1, duplicates: 0 };
}

async function addCommitmentFromCandidates(params: {
  storePath?: string;
  item: CommitmentExtractionItem;
  candidates: Array<{
    candidate: CommitmentCandidate;
    earliestMs: number;
    latestMs: number;
    timezone: string;
  }>;
  nowMs?: number;
}): Promise<{ added: number; duplicates: number }> {
  if (params.candidates.length === 0) {
    return { added: 0, duplicates: 0 };
  }
  const nowMs = params.nowMs ?? Date.now();
  const storePath = params.storePath;
  const scopeKey = buildCommitmentScopeKey(params.item);
  const { store } = await loadCommitmentStoreInternal(storePath);
  expireStaleCommitmentsInStore(store, nowMs);

  let added = 0;
  let duplicates = 0;
  for (const entry of params.candidates) {
    const dedupeKey = (entry.candidate.dedupeKey ?? '').trim();
    const existingIndex = store.commitments.findIndex(
      (commitment) =>
        buildCommitmentScopeKey(commitment) === scopeKey &&
        commitment.dedupeKey === dedupeKey &&
        isActiveStatus(commitment.status),
    );
    if (existingIndex >= 0) {
      duplicates++;
      const existing = store.commitments[existingIndex];
      store.commitments[existingIndex] = {
        ...existing,
        reason: (entry.candidate.reason ?? '').trim() || existing.reason,
        suggestedText: (entry.candidate.suggestedText ?? '').trim() || existing.suggestedText,
        confidence: Math.max(existing.confidence, entry.candidate.confidence ?? 0),
        priority: priorityToNumber(existing.priority) >= priorityToNumber(entry.candidate.priority || "medium")
          ? existing.priority
          : entry.candidate.priority || "medium",
        dueWindow: {
          earliestMs: Math.min(existing.dueWindow.earliestMs, entry.earliestMs),
          latestMs: Math.max(existing.dueWindow.latestMs, entry.latestMs),
          timezone: entry.timezone,
        },
        updatedAtMs: nowMs,
      };
      continue;
    }
    const record = candidateToRecord({
      item: params.item,
      candidate: entry.candidate,
      nowMs,
      earliestMs: entry.earliestMs,
      latestMs: entry.latestMs,
      timezone: entry.timezone,
    });
    store.commitments.push(record);
    added++;
  }

  await saveCommitmentStore(storePath, store);
  return { added, duplicates };
}

// ===================== 状态更新 =====================

/**
 * 更新承诺状态。
 *
 * 仅活跃状态的承诺可被更新；终态会附带对应时间戳。
 *
 * @param id 承诺 ID
 * @param status 目标状态
 * @param params 存储路径等参数
 */
export async function updateCommitmentStatus(
  id: string,
  status: Extract<CommitmentStatus, "sent" | "dismissed" | "expired" | "completed" | "failed">,
  params: { storePath?: string; nowMs?: number; failureReason?: string },
): Promise<boolean> {
  const nowMs = params.nowMs ?? Date.now();
  const { store } = await loadCommitmentStoreInternal(params.storePath);
  let changed = false;
  store.commitments = store.commitments.map((commitment) => {
    if (commitment.id !== id || !isActiveStatus(commitment.status)) {
      return commitment;
    }
    changed = true;
    return {
      ...commitment,
      status,
      updatedAtMs: nowMs,
      ...(status === "sent" ? { sentAtMs: nowMs } : {}),
      ...(status === "dismissed" ? { dismissedAtMs: nowMs } : {}),
      ...(status === "expired" ? { expiredAtMs: nowMs } : {}),
      ...(status === "completed" ? { completedAtMs: nowMs } : {}),
      ...(status === "failed"
        ? { failedAtMs: nowMs, failureReason: params.failureReason }
        : {}),
    };
  });
  if (changed) {
    await saveCommitmentStore(params.storePath, store);
  }
  return changed;
}

/**
 * 标记承诺已尝试投递：自增 attempts 并记录时间戳。
 *
 * @param storePath 存储路径
 * @param ids 要标记的承诺 ID 列表
 * @param nowMs 当前时间；缺省取 Date.now()
 */
export async function markCommitmentsAttempted(params: {
  storePath?: string;
  ids: string[];
  nowMs?: number;
}): Promise<void> {
  if (params.ids.length === 0) {
    return;
  }
  const idSet = new Set(params.ids);
  const nowMs = params.nowMs ?? Date.now();
  const { store } = await loadCommitmentStoreInternal(params.storePath);
  let changed = false;
  store.commitments = store.commitments.map((commitment) => {
    if (!idSet.has(commitment.id)) {
      return commitment;
    }
    changed = true;
    return {
      ...commitment,
      attempts: commitment.attempts + 1,
      lastAttemptAtMs: nowMs,
      updatedAtMs: nowMs,
    };
  });
  if (changed) {
    await saveCommitmentStore(params.storePath, store);
  }
}

/**
 * 延后承诺：将承诺设置为 snoozed 状态
 *
 * @param storePath 存储路径
 * @param id 承诺 ID
 * @param untilMs 延后到的时间
 * @param nowMs 当前时间；缺省取 Date.now()
 */
export async function snoozeCommitment(params: {
  storePath?: string;
  id: string;
  untilMs: number;
  nowMs?: number;
}): Promise<boolean> {
  const nowMs = params.nowMs ?? Date.now();
  const { store } = await loadCommitmentStoreInternal(params.storePath);
  const index = store.commitments.findIndex(
    (c) => c.id === params.id && isActiveStatus(c.status),
  );
  if (index < 0) {
    return false;
  }
  store.commitments[index] = {
    ...store.commitments[index],
    status: "snoozed",
    snoozedUntilMs: params.untilMs,
    updatedAtMs: nowMs,
  };
  await saveCommitmentStore(params.storePath, store);
  return true;
}

/**
 * 手动创建承诺
 *
 * @param storePath 存储路径
 * @param commitment 承诺数据（不含 id、createdAtMs、updatedAtMs、attempts 会被自动设置）
 * @param nowMs 当前时间；缺省取 Date.now()
 */
export async function createCommitment(params: {
  storePath?: string;
  commitment: Omit<CommitmentRecord, "id" | "createdAtMs" | "updatedAtMs" | "attempts">;
  nowMs?: number;
}): Promise<CommitmentRecord> {
  const nowMs = params.nowMs ?? Date.now();
  const { store } = await loadCommitmentStoreInternal(params.storePath);

  const record: CommitmentRecord = {
    ...params.commitment,
    id: generateCommitmentId(nowMs),
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    attempts: 0,
  };

  store.commitments.push(record);
  await saveCommitmentStore(params.storePath, store);
  return record;
}

/**
 * 更新承诺字段
 *
 * @param params 包含 id、storePath、updates 的对象
 */
export async function updateCommitment(params: CommitmentUpdateParams): Promise<boolean> {
  const nowMs = params.nowMs ?? Date.now();
  const { store } = await loadCommitmentStoreInternal(params.storePath);
  const index = store.commitments.findIndex((c) => c.id === params.id);
  if (index < 0) {
    return false;
  }

  const existing = store.commitments[index];
  const updated = {
    ...existing,
    ...params.updates,
    id: existing.id,
    updatedAtMs: nowMs,
  };

  const coerced = coerceCommitment(updated);
  if (!coerced) {
    return false;
  }

  store.commitments[index] = coerced;
  await saveCommitmentStore(params.storePath, store);
  return true;
}

/**
 * 获取单条承诺记录
 *
 * 支持两种调用方式：
 * 1. getCommitment(id, storePath) - 位置参数
 * 2. getCommitment({ id, storePath }) - 对象参数
 */
export async function getCommitment(
  idOrParams: string | { id: string; storePath?: string },
  storePath?: string,
): Promise<CommitmentRecord | null> {
  let id: string;
  let path: string | undefined;

  if (typeof idOrParams === 'string') {
    id = idOrParams;
    path = storePath;
  } else {
    id = idOrParams.id;
    path = idOrParams.storePath;
  }

  const { store } = await loadCommitmentStoreInternal(path);
  return store.commitments.find((c) => c.id === id) || null;
}

/**
 * 删除承诺
 *
 * @param id 承诺 ID
 * @param storePath 存储路径
 */
export async function deleteCommitment(
  id: string,
  storePath?: string,
): Promise<boolean> {
  const { store } = await loadCommitmentStoreInternal(storePath);
  const initialLength = store.commitments.length;
  store.commitments = store.commitments.filter((c) => c.id !== id);
  if (store.commitments.length === initialLength) {
    return false;
  }
  await saveCommitmentStore(storePath, store);
  return true;
}

/**
 * 验证承诺完成
 *
 * @param storePath 存储路径
 * @param id 承诺 ID
 * @param verified 是否已验证完成
 * @param nowMs 当前时间；缺省取 Date.now()
 */
export async function verifyCompletion(params: {
  storePath?: string;
  id: string;
  verified: boolean;
  nowMs?: number;
}): Promise<boolean> {
  const nowMs = params.nowMs ?? Date.now();
  const { store } = await loadCommitmentStoreInternal(params.storePath);
  const index = store.commitments.findIndex((c) => c.id === params.id);
  if (index < 0) {
    return false;
  }
  store.commitments[index] = {
    ...store.commitments[index],
    completionVerified: params.verified,
    completionVerifiedAtMs: nowMs,
    updatedAtMs: nowMs,
    ...(params.verified ? { status: "completed" as const, completedAtMs: nowMs } : {}),
  };
  await saveCommitmentStore(params.storePath, store);
  return true;
}

// ===================== 到期认领 =====================

/** 统计某个会话在滚动 24 小时窗口内已发送的承诺数 */
function countSentCommitmentsForSession(params: {
  store: CommitmentStoreFile;
  agentId: string;
  sessionKey: string;
  nowMs: number;
}): number {
  const sinceMs = params.nowMs - ROLLING_DAY_MS;
  return params.store.commitments.filter(
    (commitment) =>
      commitment.agentId === params.agentId &&
      commitment.sessionKey === params.sessionKey &&
      commitment.status === "sent" &&
      (commitment.sentAtMs ?? 0) >= sinceMs,
  ).length;
}

/**
 * 认领到期承诺：返回当前应投递的承诺，并标记为 sent 状态。
 *
 * 过滤条件：
 *   - agentId/sessionKey 匹配
 *   - 状态为活跃（pending 或已到延后时间的 snoozed）
 *   - earliestMs <= now <= latestMs + 过期阈值
 *   - 当日已发送数 < maxPerDay
 *
 * 排序：按优先级降序，再按 earliestMs 升序，平局按 createdAtMs。
 *
 * @param storePath 存储路径
 * @param agentId Agent ID
 * @param sessionKey 会话键
 * @param maxPerDay 每日投递上限
 * @param limit 返回条数上限；缺省取 3
 * @param nowMs 当前时间；缺省取 Date.now()
 */
export async function claimDueCommitments(params: {
  storePath?: string;
  agentId: string;
  sessionKey: string;
  maxPerDay?: number;
  limit?: number;
  nowMs?: number;
}): Promise<CommitmentRecord[]> {
  const nowMs = params.nowMs ?? Date.now();
  const { store, hadLegacySourceText } = await loadCommitmentStoreInternal(
    params.storePath,
  );
  const expireChanged = expireStaleCommitmentsInStore(store, nowMs);
  if (expireChanged || hadLegacySourceText) {
    await saveCommitmentStore(params.storePath, store);
  }

  const maxPerDay = params.maxPerDay ?? 3;
  const remainingToday =
    maxPerDay -
    countSentCommitmentsForSession({
      store,
      agentId: params.agentId,
      sessionKey: params.sessionKey,
      nowMs,
    });
  if (remainingToday <= 0) {
    return [];
  }

  const limit = Math.min(params.limit ?? 3, remainingToday);
  const staleAfterMs = expireAfterMs();
  const due = store.commitments
    .filter(
      (commitment) =>
        commitment.agentId === params.agentId &&
        commitment.sessionKey === params.sessionKey &&
        isActiveStatus(commitment.status) &&
        commitment.dueWindow.earliestMs <= nowMs &&
        commitment.dueWindow.latestMs + staleAfterMs >= nowMs &&
        (commitment.status !== "snoozed" || (commitment.snoozedUntilMs ?? 0) <= nowMs),
    )
    .toSorted(
      (a, b) =>
        priorityToNumber(b.priority) - priorityToNumber(a.priority) ||
        a.dueWindow.earliestMs - b.dueWindow.earliestMs ||
        a.createdAtMs - b.createdAtMs,
    )
    .slice(0, limit);

  if (due.length > 0) {
    const ids = due.map((c) => c.id);
    for (const id of ids) {
      await updateCommitmentStatus(id, "sent", { storePath: params.storePath, nowMs });
    }
    const { store: updatedStore } = await loadCommitmentStoreInternal(params.storePath);
    const idSet = new Set(ids);
    return updatedStore.commitments.filter((c) => idSet.has(c.id));
  }

  return due;
}

/**
 * 列出某个作用域下所有待处理的承诺（不认领、不修改 attempts）。
 *
 * @param storePath 存储路径
 * @param scope 作用域
 * @param limit 返回条数上限；缺省取 20
 * @param nowMs 当前时间；缺省取 Date.now()
 */
export async function listPendingCommitmentsForScope(params: {
  storePath?: string;
  scope: CommitmentScope;
  nowMs?: number;
  limit?: number;
}): Promise<CommitmentRecord[]> {
  const nowMs = params.nowMs ?? Date.now();
  const { store, hadLegacySourceText } = await loadCommitmentStoreInternal(
    params.storePath,
  );
  const expireChanged = expireStaleCommitmentsInStore(store, nowMs);
  if (expireChanged || hadLegacySourceText) {
    await saveCommitmentStore(params.storePath, store);
  }
  const scopeKey = buildCommitmentScopeKey(params.scope);
  const limit = params.limit ?? 20;
  return store.commitments
    .filter(
      (commitment) =>
        buildCommitmentScopeKey(commitment) === scopeKey &&
        isActiveStatus(commitment.status) &&
        (commitment.status !== "snoozed" || (commitment.snoozedUntilMs ?? 0) <= nowMs),
    )
    .toSorted(
      (a, b) =>
        priorityToNumber(b.priority) - priorityToNumber(a.priority) ||
        a.dueWindow.earliestMs - b.dueWindow.earliestMs ||
        a.createdAtMs - b.createdAtMs,
    )
    .slice(0, limit);
}

// ===================== 过滤与查询 =====================

/**
 * 应用过滤器到承诺列表
 */
export function applyFilter(
  commitments: CommitmentRecord[],
  filter: CommitmentFilter,
): CommitmentRecord[] {
  return commitments.filter((c) => {
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      if (!statuses.includes(c.status)) return false;
    }
    if (filter.kind) {
      const kinds = Array.isArray(filter.kind) ? filter.kind : [filter.kind];
      if (!kinds.includes(c.kind)) return false;
    }
    if (filter.sensitivity) {
      const sensitivities = Array.isArray(filter.sensitivity) ? filter.sensitivity : [filter.sensitivity];
      if (!sensitivities.includes(c.sensitivity)) return false;
    }
    if (filter.source) {
      const sources = Array.isArray(filter.source) ? filter.source : [filter.source];
      if (!sources.includes(c.source)) return false;
    }
    if (filter.priority) {
      const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
      if (!priorities.includes(c.priority)) return false;
    }
    if (filter.agentId && c.agentId !== filter.agentId) return false;
    if (filter.sessionKey && c.sessionKey !== filter.sessionKey) return false;
    if (filter.channel && c.channel !== filter.channel) return false;
    if (filter.accountId && c.accountId !== filter.accountId) return false;
    if (filter.to && c.to !== filter.to) return false;
    if (filter.threadId && c.threadId !== filter.threadId) return false;
    if (filter.senderId && c.senderId !== filter.senderId) return false;
    if (filter.dedupeKey && c.dedupeKey !== filter.dedupeKey) return false;
    if (filter.createdAfterMs && c.createdAtMs < filter.createdAfterMs) return false;
    if (filter.createdBeforeMs && c.createdAtMs > filter.createdBeforeMs) return false;
    if (filter.updatedAfterMs && c.updatedAtMs < filter.updatedAfterMs) return false;
    if (filter.updatedBeforeMs && c.updatedAtMs > filter.updatedBeforeMs) return false;
    if (filter.dueAfterMs && c.dueWindow.earliestMs < filter.dueAfterMs) return false;
    if (filter.dueBeforeMs && c.dueWindow.latestMs > filter.dueBeforeMs) return false;
    if (filter.minConfidence && c.confidence < filter.minConfidence) return false;
    if (filter.maxConfidence && c.confidence > filter.maxConfidence) return false;
    if (filter.minAttempts && c.attempts < filter.minAttempts) return false;
    if (filter.maxAttempts && c.attempts > filter.maxAttempts) return false;
    if (filter.hasSourceMessageId !== undefined) {
      if (filter.hasSourceMessageId && !c.sourceMessageId) return false;
      if (!filter.hasSourceMessageId && c.sourceMessageId) return false;
    }
    if (filter.searchQuery) {
      const query = filter.searchQuery.toLowerCase();
      const searchIn = `${c.reason} ${c.suggestedText} ${c.dedupeKey} ${c.tags?.join(" ") || ""}`.toLowerCase();
      if (!searchIn.includes(query)) return false;
    }
    return true;
  });
}

/**
 * 应用排序到承诺列表
 */
export function applySort(
  commitments: CommitmentRecord[],
  sort?: SortParams,
): CommitmentRecord[] {
  if (!sort) {
    return commitments;
  }
  const order = sort.order || "asc";
  const multiplier = order === "asc" ? 1 : -1;
  return [...commitments].sort((a, b) => {
    let aVal: number | string;
    let bVal: number | string;
    switch (sort.field) {
      case "createdAtMs":
        aVal = a.createdAtMs;
        bVal = b.createdAtMs;
        break;
      case "updatedAtMs":
        aVal = a.updatedAtMs;
        bVal = b.updatedAtMs;
        break;
      case "earliestMs":
        aVal = a.dueWindow.earliestMs;
        bVal = b.dueWindow.earliestMs;
        break;
      case "latestMs":
        aVal = a.dueWindow.latestMs;
        bVal = b.dueWindow.latestMs;
        break;
      case "confidence":
        aVal = a.confidence;
        bVal = b.confidence;
        break;
      case "attempts":
        aVal = a.attempts;
        bVal = b.attempts;
        break;
      case "priority":
        aVal = priorityToNumber(a.priority);
        bVal = priorityToNumber(b.priority);
        break;
      case "status":
        aVal = a.status;
        bVal = b.status;
        break;
      default:
        return 0;
    }
    if (typeof aVal === "number" && typeof bVal === "number") {
      return (aVal - bVal) * multiplier;
    }
    return String(aVal).localeCompare(String(bVal)) * multiplier;
  });
}

/**
 * 应用分页
 */
export function applyPagination<T>(
  items: T[],
  pagination?: PaginationParams,
): PaginatedResult<T> {
  const total = items.length;
  const pageSize = pagination?.pageSize || 20;
  const page = pagination?.page || 1;
  const offset = pagination?.offset ?? (page - 1) * pageSize;
  const limit = pagination?.limit ?? pageSize;
  const paginatedItems = items.slice(offset, offset + limit);
  const totalPages = Math.ceil(total / pageSize);
  return {
    items: paginatedItems,
    total,
    page,
    pageSize,
    totalPages,
    hasNext: offset + limit < total,
    hasPrev: offset > 0,
  };
}

/**
 * 列出承诺记录（支持过滤、排序、分页）。
 *
 * @param storePath 存储路径
 * @param filter 过滤器
 * @param sort 排序参数
 * @param pagination 分页参数
 * @param nowMs 当前时间
 */
export async function listCommitments(params?: ListCommitmentsParams): Promise<PaginatedResult<CommitmentRecord>> {
  const nowMs = params?.nowMs ?? Date.now();
  const { store, hadLegacySourceText } = await loadCommitmentStoreInternal(
    params?.storePath,
  );
  const expireChanged = expireStaleCommitmentsInStore(store, nowMs);
  if (expireChanged || hadLegacySourceText) {
    await saveCommitmentStore(params?.storePath, store);
  }

  let filtered = store.commitments;
  if (params?.filter) {
    filtered = applyFilter(filtered, params.filter);
  }

  const sorted = applySort(filtered, params?.sort);
  return applyPagination(sorted, params?.pagination);
}

/**
 * 计算承诺统计信息
 *
 * @param storePath 存储路径
 * @param nowMs 当前时间
 */
export async function getCommitmentStats(params?: {
  storePath?: string;
  nowMs?: number;
}): Promise<CommitmentStats> {
  const nowMs = params?.nowMs ?? Date.now();
  const { store } = await loadCommitmentStoreInternal(params?.storePath);
  expireStaleCommitmentsInStore(store, nowMs);

  const dayStart = nowMs - ROLLING_DAY_MS;

  const byStatus: Record<string, number> = {
    pending: 0,
    sent: 0,
    dismissed: 0,
    snoozed: 0,
    expired: 0,
    completed: 0,
    failed: 0,
  };

  const byKind: Record<string, number> = {
    event_check_in: 0,
    deadline_check: 0,
    care_check_in: 0,
    open_loop: 0,
    follow_up: 0,
    reminder: 0,
    urgent: 0,
    care: 0,
  };

  const bySensitivity: Record<string, number> = {
    routine: 0,
    personal: 0,
    care: 0,
    normal: 0,
  };

  const byPriority: Record<CommitmentPriority, number> = {
    low: 0,
    medium: 0,
    high: 0,
    urgent: 0,
  };

  let completedToday = 0;
  let expiredToday = 0;
  let sentToday = 0;
  let failedToday = 0;
  let totalConfidence = 0;
  let totalAttempts = 0;
  let active = 0;
  let pending = 0;

  for (const c of store.commitments) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    byKind[c.kind] = (byKind[c.kind] || 0) + 1;
    bySensitivity[c.sensitivity] = (bySensitivity[c.sensitivity] || 0) + 1;
    byPriority[c.priority]++;
    totalConfidence += c.confidence;
    totalAttempts += c.attempts;

    if (isActiveStatus(c.status)) {
      active++;
      if (c.status === "pending") {
        pending++;
      }
    }

    if (c.completedAtMs && c.completedAtMs >= dayStart) {
      completedToday++;
    }
    if (c.expiredAtMs && c.expiredAtMs >= dayStart) {
      expiredToday++;
    }
    if (c.sentAtMs && c.sentAtMs >= dayStart) {
      sentToday++;
    }
    if (c.failedAtMs && c.failedAtMs >= dayStart) {
      failedToday++;
    }
  }

  const total = store.commitments.length;

  return {
    total,
    byStatus: byStatus as CommitmentStats["byStatus"],
    byKind: byKind as CommitmentStats["byKind"],
    bySensitivity: bySensitivity as CommitmentStats["bySensitivity"],
    byPriority,
    pending,
    active,
    completedToday,
    expiredToday,
    sentToday,
    failedToday,
    averageConfidence: total > 0 ? totalConfidence / total : 0,
    averageAttempts: total > 0 ? totalAttempts / total : 0,
  };
}

// ===================== 心跳记录 =====================

/**
 * 添加心跳记录
 */
export async function addHeartbeatRecord(
  heartbeat: Omit<CommitmentHeartbeat, "id">,
  storePath?: string,
): Promise<CommitmentHeartbeat> {
  const nowMs = Date.now();
  const { store } = await loadCommitmentStoreInternal(storePath);

  const record: CommitmentHeartbeat = {
    ...heartbeat,
    id: generateHeartbeatId(nowMs),
  };

  if (!store.heartbeats) {
    store.heartbeats = [];
  }

  store.heartbeats.push(record);

  const maxRecords = DEFAULT_MAX_HEARTBEAT_RECORDS;
  if (store.heartbeats.length > maxRecords) {
    store.heartbeats = store.heartbeats.slice(-maxRecords);
  }

  await saveCommitmentStore(storePath, store);
  return record;
}

/**
 * 获取承诺的心跳记录
 */
export async function getHeartbeatsForCommitment(
  commitmentId: string,
  storePath?: string,
): Promise<CommitmentHeartbeat[]> {
  const { store } = await loadCommitmentStoreInternal(storePath);
  const heartbeats = store.heartbeats || [];
  const filtered = heartbeats
    .filter((h) => h.commitmentId === commitmentId)
    .sort((a, b) => b.heartbeatAtMs - a.heartbeatAtMs);

  return filtered;
}

/**
 * 获取所有心跳记录
 */
export async function listHeartbeats(params?: {
  storePath?: string;
  commitmentId?: string;
  status?: CommitmentHeartbeat["status"];
  limit?: number;
}): Promise<CommitmentHeartbeat[]> {
  const { store } = await loadCommitmentStoreInternal(params?.storePath);
  let heartbeats = store.heartbeats || [];

  if (params?.commitmentId) {
    heartbeats = heartbeats.filter((h) => h.commitmentId === params!.commitmentId);
  }
  if (params?.status) {
    heartbeats = heartbeats.filter((h) => h.status === params!.status);
  }

  if (params?.limit) {
    heartbeats = heartbeats.slice(0, params.limit);
  }

  return heartbeats;
}
