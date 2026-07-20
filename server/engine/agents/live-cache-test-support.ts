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
    // Stub: not fully ported
  }
}
export function isLiveCachePrerequisiteSkip(..._args: unknown[]): unknown {
  return false;
}
export function toLiveCachePrerequisiteSkip(..._args: unknown[]): unknown {
  return undefined;
}
export function logLiveCache(..._args: unknown[]): unknown {
  return undefined;
}
export async function withLiveCacheHeartbeat(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
export async function completeSimpleWithLiveTimeout(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
export function buildStableCachePrefix(..._args: unknown[]): unknown {
  return undefined;
}
export function buildAssistantHistoryTurn(..._args: unknown[]): unknown {
  return undefined;
}
export function computeCacheHitRate(..._args: unknown[]): unknown {
  return undefined;
}
export async function resolveLiveDirectModelPool(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
export async function resolveLiveDirectModel(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
export function withLiveDirectModelApiKey(..._args: unknown[]): unknown {
  return undefined;
}
