 
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

export function resolveHooksConfig(..._args: any[]): any {
  return undefined;
}

export function isSessionKeyAllowedByPrefix(..._args: any[]): any {
  return false;
}

export function extractHookToken(..._args: any[]): any {
  return undefined;
}

export async function readJsonBody(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export function normalizeHookHeaders(..._args: any[]): any {
  return undefined;
}

export function normalizeWakePayload(..._args: any[]): any {
  return undefined;
}

export function resolveHookChannel(..._args: any[]): any {
  return undefined;
}

export function resolveHookDeliver(..._args: any[]): any {
  return undefined;
}

export function resolveHookIdempotencyKey(..._args: any[]): any {
  return undefined;
}

export function resolveHookTargetAgentId(..._args: any[]): any {
  return undefined;
}

export function resolveEffectiveHookTargetAgentId(..._args: any[]): any {
  return undefined;
}

export function isHookAgentAllowed(..._args: any[]): any {
  return false;
}

export function resolveHookSessionKey(..._args: any[]): any {
  return undefined;
}

export function normalizeHookDispatchSessionKey(..._args: any[]): any {
  return undefined;
}

export function normalizeAgentPayload(..._args: any[]): any {
  return undefined;
}

export const getHookChannelError: any = undefined;

export const getHookAgentPolicyError: any = undefined;

export const getHookSessionKeyPrefixError: any = undefined;
