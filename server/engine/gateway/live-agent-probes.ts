/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/live-agent-probes.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export type CronListJob = unknown;

export function isClaudeLikeLiveAgent(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] isClaudeLikeLiveAgent not implemented");
}

export function assertLiveImageProbeReply(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] assertLiveImageProbeReply not implemented");
}

export function shouldRunLiveImageProbe(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] shouldRunLiveImageProbe not implemented");
}

export function createLiveCronProbeSpec(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] createLiveCronProbeSpec not implemented");
}

export function buildLiveCronProbeMessage(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] buildLiveCronProbeMessage not implemented");
}

export async function runOpenClawCliJson(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] runOpenClawCliJson not implemented");
}

export async function assertCronJobVisibleViaCli(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] assertCronJobVisibleViaCli not implemented");
}

export function assertCronJobMatches(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] assertCronJobMatches not implemented");
}
