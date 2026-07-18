/**
 * Commitments 配置解析
 *
 * 解析承诺跟踪模块的运行时配置，使用保守默认值。对齐
 * openclaw/src/commitments/config.ts，在 cross-wms 中以自包含的配置输入
 * 类型驱动解析，避免与全局 CDFKnowConfig schema 强耦合。
 *
 * 默认值：
 * - DEBOUNCE_MS=15000：提取防抖间隔
 * - BATCH_MAX_ITEMS=8：单次提取批次最大条目
 * - QUEUE_MAX_ITEMS=64：提取队列上限
 * - CONFIDENCE_THRESHOLD=0.72：常规承诺置信度阈值
 * - CARE_CONFIDENCE_THRESHOLD=0.86：关怀承诺置信度阈值
 * - EXTRACTION_TIMEOUT_SECONDS=45：提取超时
 * - MAX_PER_HEARTBEAT=3：单次心跳最多投递条数
 * - EXPIRE_AFTER_HOURS=72：承诺过期清理时长
 * - MAX_PER_DAY=3：每个会话每日最多投递条数
 */

import type { HeartbeatPolicyConfig, CommitmentPriority } from "./types.js";

/** 承诺配置输入：调用方可传入带有 commitments 段的任意配置对象 */
export type CommitmentsConfigInput = {
  commitments?: {
    enabled?: boolean;
    maxPerDay?: number;
    /** 默认优先级 */
    defaultPriority?: CommitmentPriority;
    extraction?: {
      debounceMs?: number;
      batchMaxItems?: number;
      queueMaxItems?: number;
      confidenceThreshold?: number;
      careConfidenceThreshold?: number;
      timeoutSeconds?: number;
      /** 是否启用规则提取 */
      enableRuleBasedExtraction?: boolean;
      /** 是否启用模型提取 */
      enableModelBasedExtraction?: boolean;
    };
    heartbeat?: {
      enabled?: boolean;
      intervalMs?: number;
      maxPerHeartbeat?: number;
      target?: "none" | "last" | "all";
      disableTools?: boolean;
      maxRetries?: number;
      retryIntervalMs?: number;
      backoffFactor?: number;
    };
    store?: {
      /** 存储目录 */
      directory?: string;
      /** 文件名 */
      filename?: string;
      /** 是否启用原子写入 */
      atomicWrites?: boolean;
      /** 自动保存间隔（毫秒） */
      autoSaveIntervalMs?: number;
      /** 最大心跳记录数 */
      maxHeartbeatRecords?: number;
    };
    completion?: {
      /** 是否启用完成验证 */
      enabled?: boolean;
      /** 完成验证置信度阈值 */
      verificationThreshold?: number;
      /** 自动验证窗口（毫秒） */
      autoVerificationWindowMs?: number;
    };
    /** 显式时区覆盖，缺省时由 resolveCommitmentTimezone 推断 */
    timezone?: string;
  };
};

/** 解析后的承诺配置 */
export type ResolvedCommitmentsConfig = {
  enabled: boolean;
  maxPerDay: number;
  defaultPriority: CommitmentPriority;
  extraction: {
    debounceMs: number;
    batchMaxItems: number;
    queueMaxItems: number;
    confidenceThreshold: number;
    careConfidenceThreshold: number;
    timeoutSeconds: number;
    enableRuleBasedExtraction: boolean;
    enableModelBasedExtraction: boolean;
  };
  heartbeat: HeartbeatPolicyConfig;
  store: {
    directory?: string;
    filename: string;
    atomicWrites: boolean;
    autoSaveIntervalMs: number;
    maxHeartbeatRecords: number;
  };
  completion: {
    enabled: boolean;
    verificationThreshold: number;
    autoVerificationWindowMs: number;
  };
};

// ===================== 默认常量 =====================

/** 提取防抖间隔（毫秒） */
export const DEBOUNCE_MS = 15_000;
/** 单次提取批次最大条目 */
export const BATCH_MAX_ITEMS = 8;
/** 提取队列上限 */
export const QUEUE_MAX_ITEMS = 64;
/** 常规承诺置信度阈值 */
export const CONFIDENCE_THRESHOLD = 0.72;
/** 关怀承诺置信度阈值 */
export const CARE_CONFIDENCE_THRESHOLD = 0.86;
/** 提取超时（秒） */
export const EXTRACTION_TIMEOUT_SECONDS = 45;
/** 单次心跳最多投递条数 */
export const MAX_PER_HEARTBEAT = 3;
/** 承诺过期清理时长（小时） */
export const EXPIRE_AFTER_HOURS = 72;
/** 每个会话每日最多投递条数 */
export const MAX_PER_DAY = 3;

/** 心跳默认间隔（毫秒） */
export const HEARTBEAT_INTERVAL_MS = 5 * 60_000;
/** 心跳最大重试次数 */
export const HEARTBEAT_MAX_RETRIES = 3;
/** 心跳重试间隔（毫秒） */
export const HEARTBEAT_RETRY_INTERVAL_MS = 30_000;
/** 心跳退避因子 */
export const HEARTBEAT_BACKOFF_FACTOR = 2;

/** 默认存储文件名 */
export const DEFAULT_STORE_FILENAME = "commitments.json";
/** 默认自动保存间隔（毫秒） */
export const DEFAULT_AUTO_SAVE_INTERVAL_MS = 30_000;
/** 默认最大心跳记录数 */
export const DEFAULT_MAX_HEARTBEAT_RECORDS = 1000;

/** 默认完成验证阈值 */
export const DEFAULT_VERIFICATION_THRESHOLD = 0.8;
/** 默认自动验证窗口（毫秒） - 48小时 */
export const DEFAULT_AUTO_VERIFICATION_WINDOW_MS = 48 * 60 * 60_000;

// ===================== 解析工具 =====================

/** 取正整数，非法时回退到 fallback */
function positiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

/** 取正有限数，非法时回退到 fallback */
function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

/** 取 0-1 之间的数，非法时回退到 fallback */
function zeroToOneNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : fallback;
}

/** 取布尔值，非法时回退到 fallback */
function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** 取字符串，非法时回退到 fallback */
function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

/**
 * 解析承诺配置，使用保守默认值填充缺失字段。
 *
 * @param cfg 任意带有 commitments 段的配置对象；缺省时返回禁用状态
 */
export function resolveCommitmentsConfig(
  cfg?: CommitmentsConfigInput,
): ResolvedCommitmentsConfig {
  const raw = cfg?.commitments;
  return {
    enabled: raw?.enabled === true,
    maxPerDay: positiveInt(raw?.maxPerDay, MAX_PER_DAY),
    defaultPriority: (raw?.defaultPriority as CommitmentPriority) || "medium",
    extraction: {
      debounceMs: positiveInt(raw?.extraction?.debounceMs, DEBOUNCE_MS),
      batchMaxItems: positiveInt(raw?.extraction?.batchMaxItems, BATCH_MAX_ITEMS),
      queueMaxItems: positiveInt(raw?.extraction?.queueMaxItems, QUEUE_MAX_ITEMS),
      confidenceThreshold: zeroToOneNumber(
        raw?.extraction?.confidenceThreshold,
        CONFIDENCE_THRESHOLD,
      ),
      careConfidenceThreshold: zeroToOneNumber(
        raw?.extraction?.careConfidenceThreshold,
        CARE_CONFIDENCE_THRESHOLD,
      ),
      timeoutSeconds: positiveInt(
        raw?.extraction?.timeoutSeconds,
        EXTRACTION_TIMEOUT_SECONDS,
      ),
      enableRuleBasedExtraction: booleanValue(
        raw?.extraction?.enableRuleBasedExtraction,
        true,
      ),
      enableModelBasedExtraction: booleanValue(
        raw?.extraction?.enableModelBasedExtraction,
        true,
      ),
    },
    heartbeat: {
      enabled: booleanValue(raw?.heartbeat?.enabled, true),
      intervalMs: positiveInt(raw?.heartbeat?.intervalMs, HEARTBEAT_INTERVAL_MS),
      maxPerHeartbeat: positiveInt(raw?.heartbeat?.maxPerHeartbeat, MAX_PER_HEARTBEAT),
      target: (raw?.heartbeat?.target as "none" | "last" | "all") || "last",
      disableTools: booleanValue(raw?.heartbeat?.disableTools, true),
      maxRetries: positiveInt(raw?.heartbeat?.maxRetries, HEARTBEAT_MAX_RETRIES),
      retryIntervalMs: positiveInt(
        raw?.heartbeat?.retryIntervalMs,
        HEARTBEAT_RETRY_INTERVAL_MS,
      ),
      backoffFactor: positiveNumber(
        raw?.heartbeat?.backoffFactor,
        HEARTBEAT_BACKOFF_FACTOR,
      ),
    },
    store: {
      directory: raw?.store?.directory?.trim() || undefined,
      filename: stringValue(raw?.store?.filename, DEFAULT_STORE_FILENAME),
      atomicWrites: booleanValue(raw?.store?.atomicWrites, true),
      autoSaveIntervalMs: positiveInt(
        raw?.store?.autoSaveIntervalMs,
        DEFAULT_AUTO_SAVE_INTERVAL_MS,
      ),
      maxHeartbeatRecords: positiveInt(
        raw?.store?.maxHeartbeatRecords,
        DEFAULT_MAX_HEARTBEAT_RECORDS,
      ),
    },
    completion: {
      enabled: booleanValue(raw?.completion?.enabled, false),
      verificationThreshold: zeroToOneNumber(
        raw?.completion?.verificationThreshold,
        DEFAULT_VERIFICATION_THRESHOLD,
      ),
      autoVerificationWindowMs: positiveInt(
        raw?.completion?.autoVerificationWindowMs,
        DEFAULT_AUTO_VERIFICATION_WINDOW_MS,
      ),
    },
  };
}

/**
 * 解析承诺时区，用于解释推断出的承诺到期时间。
 *
 * 解析顺序：
 *   1. cfg.commitments.timezone 显式覆盖
 *   2. TZ 环境变量
 *   3. 运行平台默认时区（Intl）
 */
export function resolveCommitmentTimezone(cfg?: CommitmentsConfigInput): string {
  const explicit = cfg?.commitments?.timezone?.trim();
  if (explicit) {
    return explicit;
  }
  const envTz = process.env.TZ?.trim();
  if (envTz) {
    return envTz;
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * 获取优先级对应的数值，用于排序。
 * 数值越高优先级越高。
 */
export function priorityToNumber(priority: CommitmentPriority): number {
  switch (priority) {
    case "urgent":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

/**
 * 从数值解析优先级。
 */
export function numberToPriority(value: number): CommitmentPriority {
  if (value >= 4) return "urgent";
  if (value >= 3) return "high";
  if (value >= 2) return "medium";
  return "low";
}
