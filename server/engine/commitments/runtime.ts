/**
 * Commitments Runtime - 运行时管理
 *
 * 负责承诺提取的排队、批处理，承诺跟踪、更新、完成验证，
 * 以及到期承诺的解析。
 *
 * 关键行为：
 *   - 防抖：第一条入队后等待 debounceMs 触发批次处理
 *   - 批大小：单次最多处理 batchMaxItems 条
 *   - 队列上限：超过 queueMaxItems 时丢弃并告警一次
 *   - 终端错误冷却：认证/模型类错误后对该 agent 冷却一段时间
 *   - 承诺跟踪：支持承诺状态更新、完成验证、失败重试
 */

import { randomUUID } from "node:crypto";

import { logger } from "../../logger.js";
import {
  MAX_PER_HEARTBEAT,
  resolveCommitmentTimezone,
  resolveCommitmentsConfig,
  type CommitmentsConfigInput,
  type ResolvedCommitmentsConfig,
} from "./config.js";
import {
  addCommitment,
  claimDueCommitments,
  listPendingCommitmentsForScope,
  getCommitment,
  updateCommitmentStatus,
  updateCommitment,
  deleteCommitment,
  getCommitmentStats,
  addHeartbeatRecord,
  type CommitmentUpdateParams,
} from "./store.js";
import type {
  CommitmentCandidate,
  CommitmentExtractionBatchResult,
  CommitmentExtractionItem,
  CommitmentRecord,
  CommitmentScope,
  CommitmentStatus,
  CommitmentHeartbeat,
  CommitmentFilter,
  CommitmentStats,
} from "./types.js";
import {
  CommitmentStoreWriter,
  type StoreWriterOptions,
} from "./store-writer.js";

// ===================== 类型定义 =====================

type TimerHandle = ReturnType<typeof setTimeout>;

export type CommitmentExtractBatchFn = (params: {
  cfg?: CommitmentsConfigInput;
  items: CommitmentExtractionItem[];
}) => Promise<CommitmentExtractionBatchResult>;

export type CommitmentCandidateResolver = (
  candidate: CommitmentCandidate,
  item: CommitmentExtractionItem,
) => { earliestMs: number; latestMs: number; timezone: string } | undefined;

export type CompletionVerifier = (params: {
  commitment: CommitmentRecord;
  context?: Record<string, unknown>;
}) => Promise<boolean | { completed: boolean; reason?: string }> | boolean | { completed: boolean; reason?: string };

export type CommitmentRuntimeHooks = {
  extractBatch?: CommitmentExtractBatchFn;
  resolveCandidateWindow?: CommitmentCandidateResolver;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
  forceInTests?: boolean;
  completionVerifier?: CompletionVerifier;
};

type QueuedExtractionItem = Omit<CommitmentExtractionItem, "existingPending"> & {
  cfg?: CommitmentsConfigInput;
};

export type CommitmentRuntime = {
  config: ResolvedCommitmentsConfig;
  queueLength: number;
  draining: boolean;
  enqueueExtraction: (input: CommitmentExtractionEnqueueInput) => boolean;
  queueExtraction: (input: CommitmentExtractionEnqueueInput) => boolean;
  processExtractionBatch: () => Promise<number>;
  resolveDueCommitments: (params: {
    agentId: string;
    sessionKey: string;
    storePath?: string;
    limit?: number;
    nowMs?: number;
  }) => Promise<CommitmentRecord[]>;
  listPending: (params: {
    scope: CommitmentScope;
    storePath?: string;
    nowMs?: number;
    limit?: number;
  }) => Promise<CommitmentRecord[]>;
  getCommitment: (id: string, storePath?: string) => Promise<CommitmentRecord | null>;
  updateCommitmentStatus: (
    id: string,
    status: CommitmentStatus,
    options?: { storePath?: string; failureReason?: string; nowMs?: number },
  ) => Promise<boolean>;
  updateCommitment: (params: CommitmentUpdateParams) => Promise<boolean>;
  deleteCommitment: (id: string, storePath?: string) => Promise<boolean>;
  verifyAndComplete: (params: {
    id: string;
    context?: Record<string, unknown>;
    storePath?: string;
    nowMs?: number;
  }) => Promise<{ completed: boolean; reason?: string }>;
  markSent: (id: string, options?: { storePath?: string; nowMs?: number }) => Promise<boolean>;
  markDismissed: (id: string, options?: { storePath?: string; nowMs?: number }) => Promise<boolean>;
  markExpired: (id: string, options?: { storePath?: string; nowMs?: number }) => Promise<boolean>;
  markFailed: (id: string, reason: string, options?: { storePath?: string; nowMs?: number }) => Promise<boolean>;
  incrementAttempts: (id: string, options?: { storePath?: string; nowMs?: number }) => Promise<boolean>;
  addHeartbeat: (
    heartbeat: Omit<CommitmentHeartbeat, "id">,
    storePath?: string,
  ) => Promise<CommitmentHeartbeat>;
  getConfig: () => ResolvedCommitmentsConfig;
  getStats: () => { queueSize: number; draining: boolean };
  useStoreWriter: (options?: StoreWriterOptions) => void;
  getStoreWriter: () => CommitmentStoreWriter | null;
  resetForTests: () => void;
};

export type CommitmentExtractionEnqueueInput = {
  scope: CommitmentScope;
  cfg?: CommitmentsConfigInput;
  itemId?: string;
  nowMs?: number;
  timezone?: string;
  userText: string;
  assistantText?: string;
  sourceMessageId?: string;
  sourceRunId?: string;
};

// ===================== 常量 =====================

const TERMINAL_EXTRACTION_FAILURE_COOLDOWN_MS = 15 * 60_000;

// ===================== 工具函数 =====================

function shouldDisableBackgroundExtractionForTests(
  hooks: CommitmentRuntimeHooks,
): boolean {
  if (hooks.forceInTests) {
    return false;
  }
  return process.env.VITEST === "true" || process.env.NODE_ENV === "test";
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function isUsefulText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function isTerminalExtractionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /\bNo API key found\b/i.test(message) ||
    /\bUnknown model\b/i.test(message) ||
    /\bAuth profile credentials are missing or expired\b/i.test(message) ||
    /\bOAuth token refresh failed\b/i.test(message) ||
    /\bmissing credential\b/i.test(message) ||
    /\bmissing credentials\b/i.test(message) ||
    /\bmissing_api_key\b/i.test(message) ||
    /\binvalid_grant\b/i.test(message)
  );
}

function buildItemId(nowMs: number): string {
  return `turn:${nowMs.toString(36)}:${randomUUID()}`;
}

function isFinalStatus(status: CommitmentStatus): boolean {
  return status === "completed" || status === "dismissed" || status === "expired" || status === "failed";
}

// ===================== 运行时创建 =====================

export function createCommitmentRuntime(
  params?: {
    config?: CommitmentsConfigInput;
    hooks?: CommitmentRuntimeHooks;
    storePath?: string;
    completionVerifier?: CompletionVerifier;
  },
): CommitmentRuntime {
  const cfg = params?.config;
  const hooks = params?.hooks || {};
  const storePath = params?.storePath;

  if (params?.completionVerifier) {
    hooks.completionVerifier = params.completionVerifier;
  }

  const config = resolveCommitmentsConfig(cfg);
  let queue: QueuedExtractionItem[] = [];
  let timer: TimerHandle | null = null;
  let draining = false;
  let queueOverflowWarned = false;
  let terminalFailureCooldownUntilByAgent = new Map<string, number>();
  let storeWriter: CommitmentStoreWriter | null = null;

  function setTimer(callback: () => void, delayMs: number): TimerHandle {
    const handle = hooks.setTimer
      ? hooks.setTimer(callback, delayMs)
      : setTimeout(callback, delayMs);
    if (typeof handle === "object" && "unref" in handle && typeof handle.unref === "function") {
      handle.unref();
    }
    return handle;
  }

  function clearTimer(handle: TimerHandle): void {
    (hooks.clearTimer ?? clearTimeout)(handle);
  }

  function openTerminalFailureCooldown(agentId: string, error: unknown, nowMs: number): void {
    const cooldownUntil = nowMs + TERMINAL_EXTRACTION_FAILURE_COOLDOWN_MS;
    terminalFailureCooldownUntilByAgent.set(agentId, cooldownUntil);
    queue = queue.filter((item) => item.agentId !== agentId);
    logger.warn(
      "[commitments] 终端模型/认证错误后临时禁用提取",
      {
        agentId,
        cooldownMs: TERMINAL_EXTRACTION_FAILURE_COOLDOWN_MS,
        error: String(error),
      },
    );
  }

  function queueExtraction(input: CommitmentExtractionEnqueueInput): boolean {
    const nowMs = input.nowMs ?? Date.now();
    const scope = input.scope;
    const agentId = normalizeOptionalString(scope?.agentId) ?? "";
    const sessionKey = normalizeOptionalString(scope?.sessionKey) ?? "";
    const channel = normalizeOptionalString(scope?.channel) ?? "";
    const itemId = input.itemId?.trim() ?? "";

    if (
      !config.enabled ||
      !isUsefulText(input.userText) ||
      !agentId ||
      !sessionKey ||
      !channel ||
      !itemId
    ) {
      return false;
    }

    if (queue.length >= config.extraction.queueMaxItems) {
      if (!queueOverflowWarned) {
        logger.warn(
          "[commitments] 提取队列已满，丢弃新请求",
          { queued: queue.length, max: config.extraction.queueMaxItems },
        );
        queueOverflowWarned = true;
      }
      return false;
    }

    const timezone = input.timezone || resolveCommitmentTimezone(input.cfg);

    queue.push({
      itemId,
      nowMs,
      timezone,
      agentId,
      sessionKey,
      channel,
      ...(scope.accountId?.trim() ? { accountId: scope.accountId.trim() } : {}),
      ...(scope.to?.trim() ? { to: scope.to.trim() } : {}),
      ...(scope.threadId?.trim() ? { threadId: scope.threadId.trim() } : {}),
      ...(scope.senderId?.trim() ? { senderId: scope.senderId.trim() } : {}),
      userText: input.userText.trim(),
      ...(input.assistantText?.trim() ? { assistantText: input.assistantText.trim() } : {}),
      ...(input.sourceMessageId?.trim()
        ? { sourceMessageId: input.sourceMessageId.trim() }
        : {}),
      ...(input.sourceRunId?.trim() ? { sourceRunId: input.sourceRunId.trim() } : {}),
      cfg: input.cfg,
    });

    if (!timer) {
      timer = setTimer(() => {
        timer = null;
        void processExtractionBatch().catch((err: unknown) => {
          logger.warn("[commitments] 提取批次处理失败", { error: String(err) });
        });
      }, config.extraction.debounceMs);
    }
    return true;
  }

  async function hydrateItem(
    item: QueuedExtractionItem,
  ): Promise<CommitmentExtractionItem> {
    const scope: CommitmentScope = {
      agentId: item.agentId,
      sessionKey: item.sessionKey,
      channel: item.channel,
      ...(item.accountId ? { accountId: item.accountId } : {}),
      ...(item.to ? { to: item.to } : {}),
      ...(item.threadId ? { threadId: item.threadId } : {}),
      ...(item.senderId ? { senderId: item.senderId } : {}),
    };
    const pending = await listPendingCommitmentsForScope({
      storePath,
      scope,
      nowMs: item.nowMs,
      limit: 50,
    });
    return {
      ...item,
      existingPending: pending.map((c) => ({
        kind: c.kind,
        reason: c.reason,
        dedupeKey: c.dedupeKey,
        earliestMs: c.dueWindow.earliestMs,
        latestMs: c.dueWindow.latestMs,
      })),
    };
  }

  async function processExtractionBatch(): Promise<number> {
    if (draining) {
      return 0;
    }
    draining = true;
    try {
      let processed = 0;
      while (queue.length > 0) {
        const batch = queue.splice(0, config.extraction.batchMaxItems);
        const items: CommitmentExtractionItem[] = [];
        for (const queued of batch) {
          try {
            items.push(await hydrateItem(queued));
          } catch (err) {
            logger.warn("[commitments] 填充提取项失败，跳过", {
              error: String(err),
              itemId: queued.itemId,
            });
          }
        }
        if (items.length === 0) {
          continue;
        }

        const extract = hooks.extractBatch ?? (async () => ({ candidates: [] }));
        let result: CommitmentExtractionBatchResult;
        try {
          result = await extract({ cfg: batch[0]?.cfg, items });
        } catch (error) {
          if (isTerminalExtractionError(error)) {
            openTerminalFailureCooldown(items[0]?.agentId ?? "", error, Date.now());
          }
          throw error;
        }

        for (const item of items) {
          const candidatesForItem = result.candidates.filter(
            (c) => c.itemId === item.itemId,
          );
          if (candidatesForItem.length === 0) {
            continue;
          }
          const resolved = candidatesForItem
            .map((candidate) => {
              const window = hooks.resolveCandidateWindow
                ? hooks.resolveCandidateWindow(candidate, item)
                : undefined;
              if (!window) {
                return undefined;
              }
              return { candidate, ...window };
            })
            .filter(
              (
                v,
              ): v is {
                candidate: CommitmentCandidate;
                earliestMs: number;
                latestMs: number;
                timezone: string;
              } => v !== undefined,
            );
          if (resolved.length === 0) {
            continue;
          }
          try {
            await addCommitment({
              storePath,
              item,
              candidates: resolved,
              nowMs: Date.now(),
            });
          } catch (err) {
            logger.warn("[commitments] 持久化候选失败", {
              error: String(err),
              itemId: item.itemId,
            });
          }
        }
        processed += items.length;
      }
      return processed;
    } finally {
      draining = false;
    }
  }

  async function resolveDueCommitments(params: {
    agentId: string;
    sessionKey: string;
    storePath?: string;
    limit?: number;
    nowMs?: number;
  }): Promise<CommitmentRecord[]> {
    if (!config.enabled) {
      return [];
    }
    return claimDueCommitments({
      storePath: params.storePath ?? storePath,
      agentId: params.agentId,
      sessionKey: params.sessionKey,
      maxPerDay: config.maxPerDay,
      limit: params.limit ?? MAX_PER_HEARTBEAT,
      nowMs: params.nowMs,
    });
  }

  async function listPending(params: {
    scope: CommitmentScope;
    storePath?: string;
    nowMs?: number;
    limit?: number;
  }): Promise<CommitmentRecord[]> {
    return listPendingCommitmentsForScope({
      storePath: params.storePath ?? storePath,
      scope: params.scope,
      nowMs: params.nowMs,
      limit: params.limit,
    });
  }

  async function getCommitmentById(id: string, path?: string): Promise<CommitmentRecord | null> {
    return getCommitment(id, path ?? storePath);
  }

  async function updateStatus(
    id: string,
    status: CommitmentStatus,
    options?: { storePath?: string; failureReason?: string; nowMs?: number },
  ): Promise<boolean> {
    return updateCommitmentStatus(id, status as any, {
      storePath: options?.storePath ?? storePath,
      failureReason: options?.failureReason,
      nowMs: options?.nowMs,
    });
  }

  async function updateCommitmentRecord(params: CommitmentUpdateParams): Promise<boolean> {
    return updateCommitment({
      ...params,
      storePath: params.storePath ?? storePath,
    });
  }

  async function deleteCommitmentById(id: string, path?: string): Promise<boolean> {
    return deleteCommitment(id, path ?? storePath);
  }

  async function verifyAndComplete(params: {
    id: string;
    context?: Record<string, unknown>;
    storePath?: string;
    nowMs?: number;
  }): Promise<{ completed: boolean; reason?: string }> {
    const path = params.storePath ?? storePath;
    const commitment = await getCommitment(params.id, path);
    if (!commitment) {
      return { completed: false, reason: "commitment_not_found" };
    }

    if (isFinalStatus(commitment.status) && commitment.status !== "completed") {
      return { completed: false, reason: `already_${commitment.status}` };
    }

    const verifier = hooks.completionVerifier;
    if (!verifier) {
      await updateCommitmentStatus(params.id, "completed", {
        storePath: path,
        nowMs: params.nowMs,
      });
      return { completed: true };
    }

    const verifyResult = await verifier({
      commitment,
      context: params.context,
    });

    if (typeof verifyResult === 'boolean') {
      if (verifyResult) {
        await updateCommitmentStatus(params.id, "completed", {
          storePath: path,
          nowMs: params.nowMs,
        });
        return { completed: true };
      }
      return { completed: false, reason: "verification_failed" };
    }

    if (verifyResult.completed) {
      await updateCommitmentStatus(params.id, "completed", {
        storePath: path,
        nowMs: params.nowMs,
      });
      return { completed: true, reason: verifyResult.reason };
    }

    return { completed: false, reason: verifyResult.reason || "verification_failed" };
  }

  async function markSent(id: string, options?: { storePath?: string; nowMs?: number }): Promise<boolean> {
    return updateCommitmentStatus(id, "sent", {
      storePath: options?.storePath ?? storePath,
      nowMs: options?.nowMs,
    });
  }

  async function markDismissed(id: string, options?: { storePath?: string; nowMs?: number }): Promise<boolean> {
    return updateCommitmentStatus(id, "dismissed", {
      storePath: options?.storePath ?? storePath,
      nowMs: options?.nowMs,
    });
  }

  async function markExpired(id: string, options?: { storePath?: string; nowMs?: number }): Promise<boolean> {
    return updateCommitmentStatus(id, "expired", {
      storePath: options?.storePath ?? storePath,
      nowMs: options?.nowMs,
    });
  }

  async function markFailed(id: string, reason: string, options?: { storePath?: string; nowMs?: number }): Promise<boolean> {
    return updateCommitmentStatus(id, "failed", {
      storePath: options?.storePath ?? storePath,
      failureReason: reason,
      nowMs: options?.nowMs,
    });
  }

  async function incrementAttempts(id: string, options?: { storePath?: string; nowMs?: number }): Promise<boolean> {
    const commitment = await getCommitment(id, options?.storePath ?? storePath);
    if (!commitment) return false;
    return updateCommitment({
      id,
      storePath: options?.storePath ?? storePath,
      updates: {
        attempts: commitment.attempts + 1,
        lastAttemptAtMs: options?.nowMs ?? Date.now(),
        updatedAtMs: options?.nowMs ?? Date.now(),
      },
    });
  }

  async function addHeartbeat(
    heartbeat: Omit<CommitmentHeartbeat, "id">,
    path?: string,
  ): Promise<CommitmentHeartbeat> {
    return addHeartbeatRecord(heartbeat, path ?? storePath);
  }

  function getConfig(): ResolvedCommitmentsConfig {
    return config;
  }

  function getStats(): { queueSize: number; draining: boolean } {
    return {
      queueSize: queue.length,
      draining,
    };
  }

  function useStoreWriter(options?: StoreWriterOptions): void {
    if (storeWriter) {
      void storeWriter.shutdown();
    }
    storeWriter = new CommitmentStoreWriter({
      ...options,
      storePath: options?.storePath ?? storePath,
    });
  }

  function getStoreWriter(): CommitmentStoreWriter | null {
    return storeWriter;
  }

  function resetForTests(): void {
    if (timer) {
      clearTimer(timer);
    }
    queue = [];
    timer = null;
    draining = false;
    queueOverflowWarned = false;
    terminalFailureCooldownUntilByAgent = new Map();
    if (storeWriter) {
      void storeWriter.shutdown();
      storeWriter = null;
    }
  }

  return {
    config,
    get queueLength() {
      return queue.length;
    },
    get draining() {
      return draining;
    },
    enqueueExtraction: queueExtraction,
    queueExtraction,
    processExtractionBatch,
    resolveDueCommitments,
    listPending,
    getCommitment: getCommitmentById,
    updateCommitmentStatus: updateStatus,
    updateCommitment: updateCommitmentRecord,
    deleteCommitment: deleteCommitmentById,
    verifyAndComplete,
    markSent,
    markDismissed,
    markExpired,
    markFailed,
    incrementAttempts,
    addHeartbeat,
    getConfig,
    getStats,
    useStoreWriter,
    getStoreWriter,
    resetForTests,
  };
}
