/**
 * Commitments Store - 持久化存储
 *
 * 基于 JSON 文件的承诺记录存储实现，支持原子写入、记录校验、到期认领、
 * 状态更新和过期清理。
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

import { EXPIRE_AFTER_HOURS } from "./config.js";
import type {
  CommitmentCandidate,
  CommitmentExtractionItem,
  CommitmentRecord,
  CommitmentScope,
  CommitmentStatus,
  CommitmentStoreFile,
} from "./types.js";

// ===================== 常量 =====================

const STORE_VERSION = 1 as const;
/** 滚动 24 小时窗口，用于每日投递上限统计 */
const ROLLING_DAY_MS = 24 * 60 * 60 * 1000;
/** 默认存储目录名 */
const DEFAULT_COMMITMENTS_DIR = "commitments";
/** 默认存储文件名 */
const DEFAULT_STORE_FILENAME = "commitments.json";

const COMMITMENT_KINDS = new Set<CommitmentRecord["kind"]>([
  "event_check_in",
  "deadline_check",
  "care_check_in",
  "open_loop",
]);
const COMMITMENT_SENSITIVITIES = new Set<CommitmentRecord["sensitivity"]>([
  "routine",
  "personal",
  "care",
]);
const COMMITMENT_SOURCES = new Set<CommitmentRecord["source"]>([
  "inferred_user_context",
  "agent_promise",
]);
const COMMITMENT_STATUSES = new Set<CommitmentRecord["status"]>([
  "pending",
  "sent",
  "dismissed",
  "snoozed",
  "expired",
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

  // 确保目录存在
  await fs.promises.mkdir(dir, { recursive: true, mode: dirMode });

  // 写入临时文件
  await fs.promises.writeFile(tempPath, content, { mode: fileMode });

  // 重命名到目标文件（原子操作）
  try {
    await fs.promises.rename(tempPath, filePath);
  } catch (err) {
    // 重命名失败时尝试清理临时文件
    try {
      await fs.promises.unlink(tempPath);
    } catch {
      // 忽略清理错误
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

// ===================== 记录校验 =====================

/** 空存储 */
function emptyStore(): CommitmentStoreFile {
  return { version: STORE_VERSION, commitments: [] };
}

/**
 * 校验并规范化一条承诺记录。
 *
 * 必填字段缺失或枚举值非法时返回 undefined；可选字段被裁剪为干净形态。
 */
export function coerceCommitment(raw: unknown): CommitmentRecord | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const dueWindow = isRecord(raw.dueWindow) ? raw.dueWindow : undefined;
  if (!dueWindow) {
    return undefined;
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
    !COMMITMENT_KINDS.has(kind as CommitmentRecord["kind"]) ||
    !COMMITMENT_SENSITIVITIES.has(sensitivity as CommitmentRecord["sensitivity"]) ||
    !COMMITMENT_SOURCES.has(source as CommitmentRecord["source"]) ||
    !COMMITMENT_STATUSES.has(status as CommitmentRecord["status"]) ||
    confidence === undefined ||
    createdAtMs === undefined ||
    updatedAtMs === undefined ||
    attempts === undefined ||
    earliestMs === undefined ||
    latestMs === undefined ||
    !timezone ||
    latestMs < earliestMs
  ) {
    return undefined;
  }

  return {
    id,
    agentId,
    sessionKey,
    channel,
    ...(accountId ? { accountId } : {}),
    ...(to ? { to } : {}),
    ...(threadId ? { threadId } : {}),
    ...(senderId ? { senderId } : {}),
    kind: kind as CommitmentRecord["kind"],
    sensitivity: sensitivity as CommitmentRecord["sensitivity"],
    source: source as CommitmentRecord["source"],
    status: status as CommitmentRecord["status"],
    reason,
    suggestedText,
    dedupeKey,
    confidence,
    dueWindow: { earliestMs, latestMs, timezone },
    ...(sourceMessageId ? { sourceMessageId } : {}),
    ...(sourceRunId ? { sourceRunId } : {}),
    createdAtMs,
    updatedAtMs,
    attempts,
    ...(lastAttemptAtMs !== undefined ? { lastAttemptAtMs } : {}),
    ...(sentAtMs !== undefined ? { sentAtMs } : {}),
    ...(dismissedAtMs !== undefined ? { dismissedAtMs } : {}),
    ...(snoozedUntilMs !== undefined ? { snoozedUntilMs } : {}),
    ...(expiredAtMs !== undefined ? { expiredAtMs } : {}),
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
    return {
      store: {
        version: STORE_VERSION,
        commitments: parsed.commitments.flatMap((entry) => {
          hadLegacySourceText ||= hasLegacySourceText(entry);
          const coerced = coerceCommitment(entry);
          return coerced ? [coerced] : [];
        }),
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
    source: params.candidate.source,
    status: "pending",
    reason: params.candidate.reason.trim(),
    suggestedText: params.candidate.suggestedText.trim(),
    dedupeKey: params.candidate.dedupeKey.trim(),
    confidence: params.candidate.confidence,
    dueWindow: {
      earliestMs: params.earliestMs,
      latestMs: params.latestMs,
      timezone: params.timezone,
    },
    ...(params.item.sourceMessageId
      ? { sourceMessageId: params.item.sourceMessageId }
      : {}),
    ...(params.item.sourceRunId ? { sourceRunId: params.item.sourceRunId } : {}),
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
 * @param storePath 存储路径
 * @param item 提取输入项
 * @param candidates 候选项与解析后的到期窗口
 * @param nowMs 当前时间；缺省取 Date.now()
 * @returns 新创建的承诺记录
 */
export async function addCommitment(params: {
  storePath?: string;
  item: CommitmentExtractionItem;
  candidates: Array<{
    candidate: CommitmentCandidate;
    earliestMs: number;
    latestMs: number;
    timezone: string;
  }>;
  nowMs?: number;
}): Promise<CommitmentRecord[]> {
  if (params.candidates.length === 0) {
    return [];
  }
  const nowMs = params.nowMs ?? Date.now();
  const storePath = params.storePath;
  const scopeKey = buildCommitmentScopeKey(params.item);
  const { store } = await loadCommitmentStoreInternal(storePath);
  // 加载后顺手清理过期项，避免合并时命中已陈旧的记录
  expireStaleCommitmentsInStore(store, nowMs);

  const created: CommitmentRecord[] = [];
  for (const entry of params.candidates) {
    const dedupeKey = entry.candidate.dedupeKey.trim();
    const existingIndex = store.commitments.findIndex(
      (commitment) =>
        buildCommitmentScopeKey(commitment) === scopeKey &&
        commitment.dedupeKey === dedupeKey &&
        isActiveStatus(commitment.status),
    );
    if (existingIndex >= 0) {
      const existing = store.commitments[existingIndex];
      store.commitments[existingIndex] = {
        ...existing,
        reason: entry.candidate.reason.trim() || existing.reason,
        suggestedText: entry.candidate.suggestedText.trim() || existing.suggestedText,
        confidence: Math.max(existing.confidence, entry.candidate.confidence),
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
    created.push(record);
  }

  await saveCommitmentStore(storePath, store);
  return created;
}

// ===================== 状态更新 =====================

/**
 * 更新承诺状态。
 *
 * 仅活跃状态的承诺可被更新；终态（sent/dismissed/expired）会附带对应时间戳。
 * 不支持更新为 pending/snoozed（这两个状态由专门路径管理）。
 *
 * @param storePath 存储路径
 * @param ids 要更新的承诺 ID 列表
 * @param status 目标状态
 * @param nowMs 当前时间；缺省取 Date.now()
 */
export async function updateCommitmentStatus(params: {
  storePath?: string;
  ids: string[];
  status: Extract<CommitmentStatus, "sent" | "dismissed" | "expired">;
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
    if (!idSet.has(commitment.id) || !isActiveStatus(commitment.status)) {
      return commitment;
    }
    changed = true;
    return {
      ...commitment,
      status: params.status,
      updatedAtMs: nowMs,
      ...(params.status === "sent" ? { sentAtMs: nowMs } : {}),
      ...(params.status === "dismissed" ? { dismissedAtMs: nowMs } : {}),
      ...(params.status === "expired" ? { expiredAtMs: nowMs } : {}),
    };
  });
  if (changed) {
    await saveCommitmentStore(params.storePath, store);
  }
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
 * 认领到期承诺：返回当前应投递的承诺，并自增尝试次数。
 *
 * 过滤条件：
 *   - agentId/sessionKey 匹配
 *   - 状态为活跃（pending 或已到延后时间的 snoozed）
 *   - earliestMs <= now <= latestMs + 过期阈值
 *   - 当日已发送数 < maxPerDay
 *
 * 排序：按 earliestMs 升序，平局按 createdAtMs。
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
  maxPerDay: number;
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

  const remainingToday =
    params.maxPerDay -
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
        a.dueWindow.earliestMs - b.dueWindow.earliestMs ||
        a.createdAtMs - b.createdAtMs,
    )
    .slice(0, limit);

  if (due.length > 0) {
    await markCommitmentsAttempted({
      storePath: params.storePath,
      ids: due.map((c) => c.id),
      nowMs,
    });
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
        a.dueWindow.earliestMs - b.dueWindow.earliestMs ||
        a.createdAtMs - b.createdAtMs,
    )
    .slice(0, limit);
}

/**
 * 列出承诺记录（支持按状态/agent 过滤）。
 *
 * @param storePath 存储路径
 * @param status 可选状态过滤
 * @param agentId 可选 agent 过滤
 */
export async function listCommitments(params?: {
  storePath?: string;
  status?: CommitmentStatus;
  agentId?: string;
  nowMs?: number;
}): Promise<CommitmentRecord[]> {
  const nowMs = params?.nowMs ?? Date.now();
  const { store, hadLegacySourceText } = await loadCommitmentStoreInternal(
    params?.storePath,
  );
  const expireChanged = expireStaleCommitmentsInStore(store, nowMs);
  if (expireChanged || hadLegacySourceText) {
    await saveCommitmentStore(params?.storePath, store);
  }
  return store.commitments
    .filter(
      (commitment) =>
        (!params?.status || commitment.status === params.status) &&
        (!params?.agentId || commitment.agentId === params.agentId),
    )
    .toSorted(
      (a, b) =>
        a.dueWindow.earliestMs - b.dueWindow.earliestMs ||
        a.createdAtMs - b.createdAtMs,
    );
}
