/**
 * 移植自 openclaw/src/agents/channel-tools.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { copyChannelAgentToolMeta, getChannelAgentToolMeta } from "./channel-tool-metadata.js";
export const testing: unknown = undefined;
export function listChannelSupportedActions(..._args: unknown[]): unknown {
  throw new Error("listChannelSupportedActions not implemented (openclaw stub)");
}
export function listAllChannelSupportedActions(..._args: unknown[]): unknown {
  throw new Error("listAllChannelSupportedActions not implemented (openclaw stub)");
}
export function listChannelAgentTools(..._args: unknown[]): unknown {
  throw new Error("listChannelAgentTools not implemented (openclaw stub)");
}
export function resolveChannelMessageToolHints(..._args: unknown[]): unknown {
  throw new Error("resolveChannelMessageToolHints not implemented (openclaw stub)");
}
export function resolveChannelPromptCapabilities(..._args: unknown[]): unknown {
  throw new Error("resolveChannelPromptCapabilities not implemented (openclaw stub)");
}
export function resolveChannelReactionGuidance(..._args: unknown[]): unknown {
  throw new Error("resolveChannelReactionGuidance not implemented (openclaw stub)");
}
