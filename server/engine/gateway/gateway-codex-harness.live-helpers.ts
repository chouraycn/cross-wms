/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/gateway-codex-harness.live-helpers.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export function isExpectedCodexStatusCommandText(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] isExpectedCodexStatusCommandText not implemented");
}

export function isExpectedCodexModelsCommandText(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] isExpectedCodexModelsCommandText not implemented");
}

export function isStrictExpectedCodexModelsCommandText(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] isStrictExpectedCodexModelsCommandText not implemented");
}

export function isRetryableCodexHarnessLiveError(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] isRetryableCodexHarnessLiveError not implemented");
}

export const EXPECTED_CODEX_MODELS_COMMAND_TEXT: any = undefined;

export const EXPECTED_CODEX_STATUS_COMMAND_TEXT: any = undefined;
