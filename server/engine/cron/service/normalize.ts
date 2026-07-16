/**
 * Cron Normalize - 规范化工具函数
 *
 * 任务名称、payload、agentId 等的规范化和验证工具。
 */

import type { CronPayload } from "../types.js";

/**
 * 安全截断文本（UTF-16 安全，避免拆分代理对）
 *
 * @param input 输入文本
 * @param maxLen 最大长度（UTF-16 代码单元）
 * @returns 截断后的文本
 */
function truncateUtf16Safe(input: string, maxLen: number): string {
  if (input.length <= maxLen) {
    return input;
  }
  // 从 maxLen 处向前查找安全的截断点
  let end = maxLen;
  // 避免在代理对中间截断
  if (end > 0 && isHighSurrogate(input.charCodeAt(end - 1)) && end < input.length) {
    end -= 1;
  }
  return input.slice(0, Math.max(0, end));
}

/** 判断字符码是否为 UTF-16 高代理项 */
function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/**
 * 截断文本，在末尾添加省略号
 *
 * @param input 输入文本
 * @param maxLen 最大长度（包含省略号）
 * @returns 截断后的文本
 */
function truncateText(input: string, maxLen: number): string {
  if (input.length <= maxLen) {
    return input;
  }
  return `${truncateUtf16Safe(input, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

/**
 * 规范化必需的 cron 任务名称
 * 缺失或无效时抛出验证错误
 *
 * @param raw 原始输入
 * @returns 修剪后的名称
 * @throws 当名称缺失或无效时抛出 Error
 */
export function normalizeRequiredName(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new Error("cron job name is required");
  }
  const name = raw.trim();
  if (!name) {
    throw new Error("cron job name is required");
  }
  return name;
}

/**
 * 规范化可选的 agent id
 *
 * @param raw 原始输入
 * @returns 修剪后的 agent id，或 undefined
 */
export function normalizeOptionalAgentId(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed || undefined;
}

/**
 * 从 payload 文本或调度形状推断紧凑的 cron 任务名称
 *
 * 优先级：
 * 1. systemEvent 的 text
 * 2. agentTurn 的 message
 * 3. command 的 argv
 * 4. 调度类型描述
 *
 * @param job 任务配置对象
 * @returns 推断的任务名称（最多 60 字符）
 */
export function inferCronJobName(job: {
  schedule?: { kind?: unknown; everyMs?: unknown; expr?: unknown };
  payload?: { kind?: unknown; text?: unknown; message?: unknown; argv?: unknown };
}): string {
  const text =
    job?.payload?.kind === "systemEvent" && typeof job.payload.text === "string"
      ? job.payload.text
      : job?.payload?.kind === "agentTurn" && typeof job.payload.message === "string"
        ? job.payload.message
        : job?.payload?.kind === "command" && Array.isArray(job.payload.argv)
          ? job.payload.argv.join(" ")
          : "";

  const firstLine =
    text
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? "";

  if (firstLine) {
    // 名称出现在 CLI 列表和告警中；保持单行且 UTF-16 安全，
    // 这样 emoji/代理对不会被截断拆分。
    return truncateText(firstLine, 60);
  }

  const kind = typeof job?.schedule?.kind === "string" ? job.schedule.kind : "";
  if (kind === "cron" && typeof job?.schedule?.expr === "string") {
    return `Cron: ${truncateText(job.schedule.expr, 52)}`;
  }
  if (kind === "every" && typeof job?.schedule?.everyMs === "number") {
    return `Every: ${job.schedule.everyMs}ms`;
  }
  if (kind === "at") {
    return "One-shot";
  }
  return "Cron job";
}

/**
 * 从 cron payload 变体中提取可执行文本，用于主会话排队
 *
 * @param payload cron 任务 payload
 * @returns 修剪后的文本内容
 */
export function normalizePayloadToSystemText(payload: CronPayload): string {
  if (payload.kind === "systemEvent") {
    return typeof payload.text === "string" ? payload.text.trim() : "";
  }
  return payload.kind === "agentTurn" && typeof payload.message === "string"
    ? payload.message.trim()
    : "";
}
