/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/cli-session-history.claude.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export type ClaudeCliFallbackSeed = unknown;

export function resolveClaudeCliBindingSessionId(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveClaudeCliBindingSessionId not implemented");
}

export function resolveClaudeCliSessionFilePath(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveClaudeCliSessionFilePath not implemented");
}

export function readClaudeCliSessionMessages(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] readClaudeCliSessionMessages not implemented");
}

export function readClaudeCliFallbackSeed(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] readClaudeCliFallbackSeed not implemented");
}

export const CLAUDE_CLI_PROVIDER: any = undefined;
