 
/**
 * 降级 stub — 移植自 openclaw/src/gateway/gateway-cli-backend.live-helpers.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export type BootstrapWorkspaceContext = unknown;

export type SystemPromptReport = unknown;

export type CliBackendLiveModelSelection = unknown;

export type CliBackendLiveEnvSnapshot = unknown;

export type CliBackendLiveProviderSkipDecision = unknown;

export function resolveCliBackendLiveModelSelection(..._args: any[]): any {
  return undefined;
}

export function parseJsonStringArray(..._args: any[]): any {
  return undefined;
}

export function parseImageMode(..._args: any[]): any {
  return undefined;
}

export function shouldRunCliImageProbe(..._args: any[]): any {
  return false;
}

export function shouldRunCliMcpProbe(..._args: any[]): any {
  return false;
}

export function resolveCliBackendLiveArgs(..._args: any[]): any {
  return undefined;
}

export function resolveCliModelSwitchProbeTarget(..._args: any[]): any {
  return undefined;
}

export function shouldRunCliModelSwitchProbe(..._args: any[]): any {
  return false;
}

export function shouldAllowCliBackendLiveProviderSkip(..._args: any[]): any {
  return false;
}

export function resolveCliBackendLiveProviderSkipDecision(..._args: any[]): any {
  return undefined;
}

export function isCliBackendLiveTimeoutPayload(..._args: any[]): any {
  return false;
}

export function shouldRetryCliBackendLiveTimeout(..._args: any[]): any {
  return false;
}

export function matchesCliBackendReply(..._args: any[]): any {
  return undefined;
}

export function withClaudeMcpConfigOverrides(..._args: any[]): any {
  return undefined;
}

export async function getFreeGatewayPort(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export async function createBootstrapWorkspace(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export function shouldRetryCliCronMcpProbeReply(..._args: any[]): any {
  return false;
}

export async function connectTestGatewayClient(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export function snapshotCliBackendLiveEnv(..._args: any[]): any {
  return undefined;
}

export function applyCliBackendLiveEnv(..._args: any[]): any {
  return undefined;
}

export function restoreCliBackendLiveEnv(..._args: any[]): any {
  return undefined;
}

export async function ensurePairedTestGatewayClientIdentity(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export const CLI_BACKEND_LIVE_PROVIDER_SKIP_ENV: any = undefined;

export const CLI_BACKEND_LIVE_ADVISORY_ENV: any = undefined;
