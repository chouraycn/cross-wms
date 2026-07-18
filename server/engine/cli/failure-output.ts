// 共享的根 CLI 失败格式化器，带 debug stack 网关与恢复提示。
// 移植自 openclaw/src/cli/failure-output.ts。
//
// 降级策略：
//  - 原模块依赖 `../infra/env.js`（cross-wms 已存在 isTruthyEnvValue）。
//  - 原模块依赖 `../infra/errors.js` 中的 `formatErrorMessage` 与 `formatUncaughtError`。
//    cross-wms 的 `infra/errors.js` 仅有 `formatErrorMessage`，缺少 `formatUncaughtError`，
//    此处内联实现 `formatUncaughtError`，使用 cross-wms 已有的 `logging/redact.js`。
//  - `./command-format.js`（cross-wms 已迁移）。

import { isTruthyEnvValue } from "../infra/env.js";
import { extractErrorCode, formatErrorMessage } from "../infra/errors.js";
import { redactSensitiveText } from "../logging/redact.js";
import { formatCliCommand } from "./command-format.js";

/**
 * 渲染未捕获错误的可读文本（含 stack），并对敏感信息进行 redaction。
 *
 * 降级实现：openclaw 的 `infra/errors.js` 中导出此函数；cross-wms 未导出。
 * 这里直接复制原实现，依赖 cross-wms 已有的 `logging/redact.js` 与 `infra/errors.js`。
 */
function formatUncaughtError(err: unknown): string {
  if (extractErrorCode(err) === "INVALID_CONFIG") {
    return formatErrorMessage(err);
  }
  if (err instanceof Error) {
    const stack = err.stack ?? err.message ?? err.name;
    return redactSensitiveText(stack);
  }
  return formatErrorMessage(err);
}

type FormatCliFailureOptions = {
  title: string;
  error: unknown;
  argv?: string[];
  env?: NodeJS.ProcessEnv;
  includeDoctorHint?: boolean;
};

function hasDebugArg(argv: string[] | undefined): boolean {
  return Boolean(argv?.some((arg) => arg === "--debug" || arg === "--verbose"));
}

function shouldShowStack(argv: string[] | undefined, env: NodeJS.ProcessEnv): boolean {
  return hasDebugArg(argv) || isTruthyEnvValue(env.OPENCLAW_DEBUG);
}

function pushPrefixed(out: string[], value: string): void {
  for (const line of value.split("\n")) {
    if (line.trim().length > 0) {
      out.push(`[openclaw] ${line}`);
    }
  }
}

export function formatCliFailureLines(options: FormatCliFailureOptions): string[] {
  // 默认输出保持简洁；显示 stack 需要明确的 debug 意图。
  const env = options.env ?? process.env;
  const lines = [
    `[openclaw] ${options.title}`,
    `[openclaw] Reason: ${formatErrorMessage(options.error)}`,
  ];

  if (shouldShowStack(options.argv, env)) {
    lines.push("[openclaw] Stack:");
    pushPrefixed(lines, formatUncaughtError(options.error));
  } else {
    lines.push("[openclaw] Debug: set OPENCLAW_DEBUG=1 to include the stack trace.");
  }

  if (options.includeDoctorHint !== false) {
    lines.push(`[openclaw] Try: ${formatCliCommand("openclaw doctor", env)}`);
  }
  lines.push(`[openclaw] Help: ${formatCliCommand("openclaw --help", env)}`);
  return lines;
}
