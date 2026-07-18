/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/hooks.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export const HookMessageChannel: any = undefined;

export type HooksConfigResolved = unknown;

export type HookAgentDispatchPayload = unknown;

export function resolveHooksConfig(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveHooksConfig not implemented");
}

export function isSessionKeyAllowedByPrefix(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] isSessionKeyAllowedByPrefix not implemented");
}

export function extractHookToken(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] extractHookToken not implemented");
}

export async function readJsonBody(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] readJsonBody not implemented");
}

export function normalizeHookHeaders(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] normalizeHookHeaders not implemented");
}

export function normalizeWakePayload(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] normalizeWakePayload not implemented");
}

export function resolveHookChannel(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveHookChannel not implemented");
}

export function resolveHookDeliver(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveHookDeliver not implemented");
}

export function resolveHookIdempotencyKey(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveHookIdempotencyKey not implemented");
}

export function resolveHookTargetAgentId(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveHookTargetAgentId not implemented");
}

export function resolveEffectiveHookTargetAgentId(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveEffectiveHookTargetAgentId not implemented");
}

export function isHookAgentAllowed(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] isHookAgentAllowed not implemented");
}

export function resolveHookSessionKey(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveHookSessionKey not implemented");
}

export function normalizeHookDispatchSessionKey(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] normalizeHookDispatchSessionKey not implemented");
}

export function normalizeAgentPayload(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] normalizeAgentPayload not implemented");
}

export const getHookChannelError: any = undefined;

export const getHookAgentPolicyError: any = undefined;

export const getHookSessionKeyPrefixError: any = undefined;
