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

/** 承诺配置输入：调用方可传入带有 commitments 段的任意配置对象 */
export type CommitmentsConfigInput = {
  commitments?: {
    enabled?: boolean;
    maxPerDay?: number;
    extraction?: {
      debounceMs?: number;
      batchMaxItems?: number;
      queueMaxItems?: number;
      confidenceThreshold?: number;
      careConfidenceThreshold?: number;
      timeoutSeconds?: number;
    };
    /** 显式时区覆盖，缺省时由 resolveCommitmentTimezone 推断 */
    timezone?: string;
  };
};

/** 解析后的承诺配置 */
export type ResolvedCommitmentsConfig = {
  enabled: boolean;
  maxPerDay: number;
  extraction: {
    debounceMs: number;
    batchMaxItems: number;
    queueMaxItems: number;
    confidenceThreshold: number;
    careConfidenceThreshold: number;
    timeoutSeconds: number;
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
    extraction: {
      debounceMs: positiveInt(raw?.extraction?.debounceMs, DEBOUNCE_MS),
      batchMaxItems: positiveInt(raw?.extraction?.batchMaxItems, BATCH_MAX_ITEMS),
      queueMaxItems: positiveInt(raw?.extraction?.queueMaxItems, QUEUE_MAX_ITEMS),
      confidenceThreshold: positiveNumber(
        raw?.extraction?.confidenceThreshold,
        CONFIDENCE_THRESHOLD,
      ),
      careConfidenceThreshold: positiveNumber(
        raw?.extraction?.careConfidenceThreshold,
        CARE_CONFIDENCE_THRESHOLD,
      ),
      timeoutSeconds: positiveInt(
        raw?.extraction?.timeoutSeconds,
        EXTRACTION_TIMEOUT_SECONDS,
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
