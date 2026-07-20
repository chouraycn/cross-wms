/**
 * 模型相关共享工具 — 统一错误分类，消除三套重复实现
 *
 * v2.x 之前：
 * - aiClient.ts classifyError(statusCode, responseBody) — HTTP 状态码 + body 关键词
 * - backoffCoordinator.ts classifyErrorCategory(error) — 鸭子类型读 .category + 正则
 * - reactExecutor.ts reasoningPhase — 内联字符串匹配
 *
 * 三套规则略有不同（如 402 在 aiClient 映射为 model_not_supported，backoffCoordinator 无 402 处理），
 * 导致同一错误在不同路径被分类为不同 category，failover 行为不一致。
 *
 * v2.x: 抽取为统一函数 classifyErrorFromObject(error)，被 aiClient / backoffCoordinator / reactExecutor 共用。
 * aiClient 仍保留 classifyError(statusCode, responseBody) 用于 HTTP 响应分类（在收到 Response 后调用），
 * 但内部错误对象创建时使用统一的 ErrorCategory 类型。
 */

import type { ErrorCategory } from './modelFailover.js';

/**
 * 从错误对象推断错误分类（统一入口）
 *
 * 优先级：
 * 1. AIAPIError.category（显式分类，最准确）
 * 2. error.status / error.statusCode / error.response.status（HTTP 状态码）
 * 3. error.message 关键词匹配
 *
 * @param error 任意错误对象
 * @returns ErrorCategory
 */
export function classifyErrorFromObject(error: unknown): ErrorCategory {
  const e = error as {
    category?: string;
    status?: number;
    statusCode?: number;
    response?: { status?: number };
    message?: string;
  };

  // 1. 显式分类（AIAPIError.category）
  const explicit = e?.category;
  if (explicit && typeof explicit === 'string') {
    return explicit as ErrorCategory;
  }

  // 2. HTTP 状态码
  const status = e?.status ?? e?.statusCode ?? e?.response?.status;
  if (status === 429) return 'rate_limit';
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) {
    // 402 Payment Required — 余额不足，视为 model_not_supported 触发降级
    return 'model_not_supported';
  }
  if (status && status >= 500) return 'server';

  // 3. 消息关键词匹配（与 aiClient.classifyError 的 body 关键词对齐）
  const msg = (e?.message || '').toLowerCase();
  if (/\b(rate[_\s-]?limit|too many requests|429|quota|请求过于频繁|限流|触发风控)\b/.test(msg)) return 'rate_limit';
  if (/\b(auth|unauthorized|forbidden|api key|invalid key|鉴权|密钥)\b/.test(msg)) return 'auth';
  if (/\b(model|模型).{0,6}(not|不支持|unsupported|not found)\b/.test(msg) || /not.{0,4}support/.test(msg)) return 'model_not_supported';
  if (/\b(timeout|timed out|超时|etimedout)\b/.test(msg)) return 'timeout';
  if (/\b(network|econn|enotfound|dns|连接|网络|fetch failed)\b/.test(msg)) return 'network';
  if (/\b(server|500|502|503|504|internal|服务|网关)\b/.test(msg)) return 'server';
  // v2.x: 上下文溢出（与 aiClient.classifyError 的 body 关键词对齐）
  if (/\b(context_length_exceeded|context overflow|maximum context length|prompt is too long|context_window|context window|token limit exceeded|content_length_exceeded|request too large)\b/.test(msg)) {
    return 'context_overflow';
  }

  return 'unknown';
}
