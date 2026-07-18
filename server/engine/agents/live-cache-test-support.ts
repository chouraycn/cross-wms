/**
 * 移植自 openclaw/src/agents/live-cache-test-support.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type LiveResolvedModel = unknown;
export type LiveResolvedModelPool = unknown;
export const LIVE_CACHE_TEST_ENABLED: unknown = undefined;
export class LiveCachePrerequisiteSkip {
  constructor(..._args: unknown[]) {
    throw new Error("LiveCachePrerequisiteSkip not implemented (openclaw stub)");
  }
}
export function isLiveCachePrerequisiteSkip(..._args: unknown[]): unknown {
  throw new Error("isLiveCachePrerequisiteSkip not implemented (openclaw stub)");
}
export function toLiveCachePrerequisiteSkip(..._args: unknown[]): unknown {
  throw new Error("toLiveCachePrerequisiteSkip not implemented (openclaw stub)");
}
export function logLiveCache(..._args: unknown[]): unknown {
  throw new Error("logLiveCache not implemented (openclaw stub)");
}
export async function withLiveCacheHeartbeat(..._args: unknown[]): Promise<unknown> {
  throw new Error("withLiveCacheHeartbeat not implemented (openclaw stub)");
}
export async function completeSimpleWithLiveTimeout(..._args: unknown[]): Promise<unknown> {
  throw new Error("completeSimpleWithLiveTimeout not implemented (openclaw stub)");
}
export function buildStableCachePrefix(..._args: unknown[]): unknown {
  throw new Error("buildStableCachePrefix not implemented (openclaw stub)");
}
export function buildAssistantHistoryTurn(..._args: unknown[]): unknown {
  throw new Error("buildAssistantHistoryTurn not implemented (openclaw stub)");
}
export function computeCacheHitRate(..._args: unknown[]): unknown {
  throw new Error("computeCacheHitRate not implemented (openclaw stub)");
}
export async function resolveLiveDirectModelPool(..._args: unknown[]): Promise<unknown> {
  throw new Error("resolveLiveDirectModelPool not implemented (openclaw stub)");
}
export async function resolveLiveDirectModel(..._args: unknown[]): Promise<unknown> {
  throw new Error("resolveLiveDirectModel not implemented (openclaw stub)");
}
export function withLiveDirectModelApiKey(..._args: unknown[]): unknown {
  throw new Error("withLiveDirectModelApiKey not implemented (openclaw stub)");
}
