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

export function resolveCliBackendLiveModelSelection(..._args: unknown[]): unknown {
  return undefined;
}

export function parseJsonStringArray(..._args: unknown[]): unknown {
  return undefined;
}

export function parseImageMode(..._args: unknown[]): unknown {
  return undefined;
}

export function shouldRunCliImageProbe(..._args: unknown[]): unknown {
  return false;
}

export function shouldRunCliMcpProbe(..._args: unknown[]): unknown {
  return false;
}

export function resolveCliBackendLiveArgs(..._args: unknown[]): unknown {
  return undefined;
}

export function resolveCliModelSwitchProbeTarget(..._args: unknown[]): unknown {
  return undefined;
}

export function shouldRunCliModelSwitchProbe(..._args: unknown[]): unknown {
  return false;
}

export function shouldAllowCliBackendLiveProviderSkip(..._args: unknown[]): unknown {
  return false;
}

export function resolveCliBackendLiveProviderSkipDecision(..._args: unknown[]): unknown {
  return undefined;
}

export function isCliBackendLiveTimeoutPayload(..._args: unknown[]): unknown {
  return false;
}

export function shouldRetryCliBackendLiveTimeout(..._args: unknown[]): unknown {
  return false;
}

export function matchesCliBackendReply(..._args: unknown[]): unknown {
  return undefined;
}

export function withClaudeMcpConfigOverrides(..._args: unknown[]): unknown {
  return undefined;
}

export async function getFreeGatewayPort(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function createBootstrapWorkspace(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export function shouldRetryCliCronMcpProbeReply(..._args: unknown[]): unknown {
  return false;
}

export async function connectTestGatewayClient(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export function snapshotCliBackendLiveEnv(..._args: unknown[]): unknown {
  return undefined;
}

export function applyCliBackendLiveEnv(..._args: unknown[]): unknown {
  return undefined;
}

export function restoreCliBackendLiveEnv(..._args: unknown[]): unknown {
  return undefined;
}

export async function ensurePairedTestGatewayClientIdentity(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export const CLI_BACKEND_LIVE_PROVIDER_SKIP_ENV: unknown = undefined;

export const CLI_BACKEND_LIVE_ADVISORY_ENV: unknown = undefined;
