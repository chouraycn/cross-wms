/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
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

export function resolveCliBackendLiveModelSelection(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveCliBackendLiveModelSelection not implemented");
}

export function parseJsonStringArray(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] parseJsonStringArray not implemented");
}

export function parseImageMode(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] parseImageMode not implemented");
}

export function shouldRunCliImageProbe(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] shouldRunCliImageProbe not implemented");
}

export function shouldRunCliMcpProbe(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] shouldRunCliMcpProbe not implemented");
}

export function resolveCliBackendLiveArgs(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveCliBackendLiveArgs not implemented");
}

export function resolveCliModelSwitchProbeTarget(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveCliModelSwitchProbeTarget not implemented");
}

export function shouldRunCliModelSwitchProbe(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] shouldRunCliModelSwitchProbe not implemented");
}

export function shouldAllowCliBackendLiveProviderSkip(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] shouldAllowCliBackendLiveProviderSkip not implemented");
}

export function resolveCliBackendLiveProviderSkipDecision(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveCliBackendLiveProviderSkipDecision not implemented");
}

export function isCliBackendLiveTimeoutPayload(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] isCliBackendLiveTimeoutPayload not implemented");
}

export function shouldRetryCliBackendLiveTimeout(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] shouldRetryCliBackendLiveTimeout not implemented");
}

export function matchesCliBackendReply(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] matchesCliBackendReply not implemented");
}

export function withClaudeMcpConfigOverrides(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] withClaudeMcpConfigOverrides not implemented");
}

export async function getFreeGatewayPort(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] getFreeGatewayPort not implemented");
}

export async function createBootstrapWorkspace(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] createBootstrapWorkspace not implemented");
}

export function shouldRetryCliCronMcpProbeReply(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] shouldRetryCliCronMcpProbeReply not implemented");
}

export async function connectTestGatewayClient(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] connectTestGatewayClient not implemented");
}

export function snapshotCliBackendLiveEnv(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] snapshotCliBackendLiveEnv not implemented");
}

export function applyCliBackendLiveEnv(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] applyCliBackendLiveEnv not implemented");
}

export function restoreCliBackendLiveEnv(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] restoreCliBackendLiveEnv not implemented");
}

export async function ensurePairedTestGatewayClientIdentity(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] ensurePairedTestGatewayClientIdentity not implemented");
}

export const CLI_BACKEND_LIVE_PROVIDER_SKIP_ENV: any = undefined;

export const CLI_BACKEND_LIVE_ADVISORY_ENV: any = undefined;
