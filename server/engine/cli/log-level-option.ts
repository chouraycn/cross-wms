// 共享 CLI --log-level 选项的 Commander 解析器。
// 移植自 openclaw/src/cli/log-level-option.ts。
//
// 降级策略：
//  - 原模块依赖 `../logging/levels.js` 中的 `ALLOWED_LOG_LEVELS`/`LogLevel`/`tryParseLogLevel`，
//    其中 LogLevel 为字符串联合类型（"silent" | "fatal" | ... | "trace"）。
//    cross-wms 的 `../logging/levels.ts` 使用 enum 形式的 LogLevel，API 不兼容。
//    为保持 CLI --log-level 选项的行为与 openclaw 一致（接受字符串值并验证），
//    这里内联 openclaw 风格的字符串联合类型与解析函数，而不依赖 cross-wms 的 enum 版本。
//    未来若 cross-wms 统一 LogLevel 实现，可替换回正式依赖。
//  - commander 依赖 cross-wms 已安装。
//  - 此处直接迁移实现。

import { InvalidArgumentError } from "commander";

// ===== 内联 log-level 定义（替代 cross-wms 的 enum 版 logging/levels.ts）=====
const ALLOWED_LOG_LEVELS = [
  "silent",
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
] as const;

export type LogLevel = (typeof ALLOWED_LOG_LEVELS)[number];

export function tryParseLogLevel(level?: string): LogLevel | undefined {
  if (typeof level !== "string") {
    return undefined;
  }
  const candidate = level.trim();
  return ALLOWED_LOG_LEVELS.includes(candidate as LogLevel) ? (candidate as LogLevel) : undefined;
}
// ===== 内联 log-level 定义结束 =====

export const CLI_LOG_LEVEL_VALUES = ALLOWED_LOG_LEVELS.join("|");

export function parseCliLogLevelOption(value: string): LogLevel {
  const parsed = tryParseLogLevel(value);
  if (!parsed) {
    throw new InvalidArgumentError(`Invalid --log-level (use ${CLI_LOG_LEVEL_VALUES})`);
  }
  return parsed;
}
