/**
 * Commitments Runtime - 运行时管理
 *
 * 负责承诺提取的排队、批处理，以及到期承诺的解析。对齐
 * openclaw/src/commitments/runtime.ts 的职责，但在 cross-wms 中保持自包含：
 *   - 提取的实际模型调用通过可注入的 extractBatch 钩子完成
 *   - 到期承诺的持久化查询复用 store.ts 的能力
 *
 * 关键行为：
 *   - 防抖：第一条入队后等待 debounceMs 触发批次处理
 *   - 批大小：单次最多处理 batchMaxItems 条
 *   - 队列上限：超过 queueMaxItems 时丢弃并告警一次
 *   - 终端错误冷却：认证/模型类错误后对该 agent 冷却一段时间
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
} from "./store.js";
import type {
  CommitmentCandidate,
  CommitmentExtractionBatchResult,
  CommitmentExtractionItem,
  CommitmentRecord,
  CommitmentScope,
} from "./types.js";

// ===================== 类型定义 =====================

type TimerHandle = ReturnType<typeof setTimeout>;

/** 提取钩子：由调用方注入实际的模型调用实现 */
export type CommitmentExtractBatchFn = (params: {
  cfg?: CommitmentsConfigInput;
  items: CommitmentExtractionItem[];
}) => Promise<CommitmentExtractionBatchResult>;

/** 候选项到解析后到期窗口的映射，由调用方解析候选的 earliest/latest 字符串 */
export type CommitmentCandidateResolver = (
  candidate: CommitmentCandidate,
  item: CommitmentExtractionItem,
) => { earliestMs: number; latestMs: number; timezone: string } | undefined;

/** 运行时可注入的钩子集合 */
export type CommitmentRuntimeHooks = {
  /** 自定义批次提取；缺省时返回空结果 */
  extractBatch?: CommitmentExtractBatchFn;
  /** 自定义候选到期窗口解析；缺省时跳过候选项 */
  resolveCandidateWindow?: CommitmentCandidateResolver;
  /** 自定义定时器，便于测试 */
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  /** 自定义清除定时器，便于测试 */
  clearTimer?: (timer: TimerHandle) => void;
  /** 测试中强制启用，忽略 VITEST/NODE_ENV=test 的禁用判断 */
  forceInTests?: boolean;
};

/** 排队中的提取条目（不含 existingPending，处理时再注入） */
type QueuedExtractionItem = Omit<CommitmentExtractionItem, "existingPending"> & {
  cfg?: CommitmentsConfigInput;
};

/** 承诺运行时实例 */
export type CommitmentRuntime = {
  /** 当前配置（解析后） */
  config: ResolvedCommitmentsConfig;
  /** 当前队列长度 */
  queueLength: number;
  /** 是否正在处理批次 */
  draining: boolean;
  /** 排队一条提取任务 */
  queueExtraction: (input: CommitmentExtractionEnqueueInput) => boolean;
  /** 立即处理当前队列中的所有条目，返回处理的条目数 */
  processExtractionBatch: () => Promise<number>;
  /** 查询某会话的到期承诺（已认领，attempts 已自增） */
  resolveDueCommitments: (params: {
    agentId: string;
    sessionKey: string;
    storePath?: string;
    limit?: number;
    nowMs?: number;
  }) => Promise<CommitmentRecord[]>;
  /** 列出某作用域的待处理承诺（不认领） */
  listPending: (params: {
    scope: CommitmentScope;
    storePath?: string;
    nowMs?: number;
    limit?: number;
  }) => Promise<CommitmentRecord[]>;
  /** 重置运行时状态（测试用） */
  resetForTests: () => void;
};

/** 排队输入：作用域 + 回合文本 + 可选配置 */
export type CommitmentExtractionEnqueueInput = CommitmentScope & {
  cfg?: CommitmentsConfigInput;
  nowMs?: number;
  userText: string;
  assistantText?: string;
  sourceMessageId?: string;
  sourceRunId?: string;
};

// ===================== 常量 =====================

/** 终端提取错误后的冷却时间（毫秒） */
const TERMINAL_EXTRACTION_FAILURE_COOLDOWN_MS = 15 * 60_000;

// ===================== 工具函数 =====================

/** 判断是否应因测试环境禁用后台提取 */
function shouldDisableBackgroundExtractionForTests(
  hooks: CommitmentRuntimeHooks,
): boolean {
  if (hooks.forceInTests) {
    return false;
  }
  return process.env.VITEST === "true" || process.env.NODE_ENV === "test";
}

/** 规范化可选字符串 */
function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** 判断文本是否有意义 */
function isUsefulText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

/** 判断错误是否为终端错误（认证/模型类，不会自愈） */
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

/** 构建 itemId */
function buildItemId(nowMs: number): string {
  return `turn:${nowMs.toString(36)}:${randomUUID()}`;
}

// ===================== 运行时创建 =====================

/**
 * 创建承诺运行时实例。
 *
 * @param cfg 配置输入；缺省时承诺功能默认禁用
 * @param hooks 可注入的钩子集合
 * @param storePath 存储路径；缺省走默认路径
 */
export function createCommitmentRuntime(
  cfg?: CommitmentsConfigInput,
  hooks: CommitmentRuntimeHooks = {},
  storePath?: string,
): CommitmentRuntime {
  const config = resolveCommitmentsConfig(cfg);
  let queue: QueuedExtractionItem[] = [];
  let timer: TimerHandle | null = null;
  let draining = false;
  let queueOverflowWarned = false;
  let terminalFailureCooldownUntilByAgent = new Map<string, number>();

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

  /** 打开终端错误冷却：丢弃该 agent 的排队任务并记录冷却时间 */
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

  /** 排队一条提取任务 */
  function queueExtraction(input: CommitmentExtractionEnqueueInput): boolean {
    const nowMs = input.nowMs ?? Date.now();
    const agentId = normalizeOptionalString(input.agentId) ?? "";
    const sessionKey = normalizeOptionalString(input.sessionKey) ?? "";
    const channel = normalizeOptionalString(input.channel) ?? "";

    if (
      !config.enabled ||
      shouldDisableBackgroundExtractionForTests(hooks) ||
      (agentId ? nowMs < (terminalFailureCooldownUntilByAgent.get(agentId) ?? 0) : false) ||
      !isUsefulText(input.userText) ||
      !isUsefulText(input.assistantText) ||
      !agentId ||
      !sessionKey ||
      !channel
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

    queue.push({
      itemId: buildItemId(nowMs),
      nowMs,
      timezone: resolveCommitmentTimezone(input.cfg),
      agentId,
      sessionKey,
      channel,
      ...(input.accountId?.trim() ? { accountId: input.accountId.trim() } : {}),
      ...(input.to?.trim() ? { to: input.to.trim() } : {}),
      ...(input.threadId?.trim() ? { threadId: input.threadId.trim() } : {}),
      ...(input.senderId?.trim() ? { senderId: input.senderId.trim() } : {}),
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

  /** 为队列条目填充 existingPending */
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

  /** 处理当前队列中的所有条目，返回处理的条目数 */
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

        // 持久化候选：解析到期窗口后调用 addCommitment
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

  /** 查询某会话的到期承诺（已认领） */
  async function resolveDueCommitments(params: {
    agentId: string;
    sessionKey: string;
    limit?: number;
    nowMs?: number;
  }): Promise<CommitmentRecord[]> {
    if (!config.enabled) {
      return [];
    }
    return claimDueCommitments({
      storePath,
      agentId: params.agentId,
      sessionKey: params.sessionKey,
      maxPerDay: config.maxPerDay,
      limit: params.limit ?? MAX_PER_HEARTBEAT,
      nowMs: params.nowMs,
    });
  }

  /** 列出某作用域的待处理承诺（不认领） */
  async function listPending(params: {
    scope: CommitmentScope;
    nowMs?: number;
    limit?: number;
  }): Promise<CommitmentRecord[]> {
    return listPendingCommitmentsForScope({
      storePath,
      scope: params.scope,
      nowMs: params.nowMs,
      limit: params.limit,
    });
  }

  /** 重置运行时状态（测试用） */
  function resetForTests(): void {
    if (timer) {
      clearTimer(timer);
    }
    queue = [];
    timer = null;
    draining = false;
    queueOverflowWarned = false;
    terminalFailureCooldownUntilByAgent = new Map();
  }

  return {
    config,
    get queueLength() {
      return queue.length;
    },
    get draining() {
      return draining;
    },
    queueExtraction,
    processExtractionBatch,
    resolveDueCommitments,
    listPending,
    resetForTests,
  };
}
