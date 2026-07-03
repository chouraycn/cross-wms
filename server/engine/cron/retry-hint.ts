/**
 * Retry Hint - 五类瞬态错误分类
 *
 * 对齐 openclaw/src/cron/retry-hint.ts 的分类策略：
 * - 结构化分类（由 provider 给出的 reason）优先于正则匹配
 * - SERVER_ERROR_PATTERN 精确匹配 HTTP 上下文中的 5xx，避免误把消息中
 *   出现的“512”、“503 lines”、“-540.sock”等无关数字判成服务端错误
 */

/** Cron 瞬态错误分类 */
export type CronErrorCategory =
  | "rate_limit"
  | "overloaded"
  | "network"
  | "timeout"
  | "server_error";

/** 分类结果 */
export interface CronErrorClassification {
  /** 命中的分类，未命中返回 null */
  category: CronErrorCategory | null;
  /** 是否可重试 */
  retryable: boolean;
}

/**
 * 服务端错误正则
 *
 * 一个孤立的 5xx 数字嵌在长文本里并不一定是 HTTP 服务端错误：
 * cron 失败信息里常出现 “context limit 512 exceeded”、“exited with 503 lines”、
 * “pid 511 killed”、“...-540.sock” 等，旧版 /\b5\d{2}\b/ 会全部误命中。
 * 这里只在以下场景匹配 5xx：
 *   1) 带 HTTP/status 上下文（http/status_code/response_code + 5xx）
 *   2) 5xx 后紧跟标准 5xx 短语（internal server error / bad gateway / ...）
 *   3) 出现标准 5xx 短语本身
 *   4) 出现 “5xx”
 *   5) 整条消息就是一个 5xx 数字（简短的 “503”）
 */
const SERVER_ERROR_PATTERN =
  /\b(?:https?|status(?:[ _]code)?|response(?:[ _]code)?|http(?:[ _]status)?)\b[\s:=#"']{0,4}5\d{2}\b|\b5\d{2}\b[\s:)\].,-]*(?:internal server error|server error|bad gateway|service unavailable|gateway time-?out)\b|\binternal server error\b|\bbad gateway\b|\bservice unavailable\b|\bgateway time-?out\b|\b5xx\b|^\s*5\d{2}\s*$/i;

/** 各分类对应的正则模式 */
const TRANSIENT_PATTERNS: Record<CronErrorCategory, RegExp> = {
  rate_limit:
    /(rate[_ ]limit|too many requests|429|resource has been exhausted|cloudflare|tokens per day)/i,
  overloaded:
    /\b529\b|\boverloaded(?:_error)?\b|high demand|temporar(?:ily|y) overloaded|capacity exceeded/i,
  network:
    /(network|fetch failed|socket|econnreset|econnrefused|eai_again|enetdown|ehostunreach|ehostdown|enetreset|enetunreach|epipe)/i,
  timeout: /(timeout|timed out|stalled before execution start|etimedout)/i,
  server_error: SERVER_ERROR_PATTERN,
};

/** 默认参与匹配的分类顺序 */
const DEFAULT_CATEGORY_ORDER: CronErrorCategory[] = [
  "rate_limit",
  "overloaded",
  "network",
  "timeout",
  "server_error",
];

function toErrorString(error: unknown): string {
  if (error === null || error === undefined) {
    return "";
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * 分类 cron 执行错误
 * @param error 错误对象或错误信息
 * @param options.retryOn 限定参与的分类列表；为空时使用全部五类
 * @param options.classifiedReason provider 给出的结构化分类（优先于正则）
 */
export function classifyCronError(
  error: unknown,
  options: {
    retryOn?: readonly CronErrorCategory[];
    classifiedReason?: string | null;
  } = {},
): CronErrorClassification {
  const message = toErrorString(error);
  if (!message) {
    return { category: null, retryable: false };
  }

  const keys = options.retryOn && options.retryOn.length > 0
    ? options.retryOn
    : DEFAULT_CATEGORY_ORDER;

  // 结构化分类优先：provider 给出的 reason 比脆弱的消息正则更可信
  const classified = options.classifiedReason ?? undefined;
  if (classified && (keys as readonly string[]).includes(classified)) {
    return { category: classified as CronErrorCategory, retryable: true };
  }

  for (const key of keys) {
    const pattern = TRANSIENT_PATTERNS[key];
    if (pattern && pattern.test(message)) {
      return { category: key, retryable: true };
    }
  }

  return { category: null, retryable: false };
}

/**
 * 判断 cron 错误是否应该重试
 * @param error 错误对象或错误信息
 * @param options.retryOn 允许重试的分类列表
 * @param options.classifiedReason 结构化分类提示
 */
export function shouldRetryCronError(
  error: unknown,
  options: {
    retryOn?: readonly CronErrorCategory[];
    classifiedReason?: string | null;
  } = {},
): boolean {
  return classifyCronError(error, options).retryable;
}
