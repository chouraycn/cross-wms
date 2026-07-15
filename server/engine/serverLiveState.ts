/**
 * 服务器实时状态 — 参考 OpenClaw gateway/server-live-state.ts
 *
 * 组合可变运行时句柄与启动时解析的服务，
 * 用于请求上下文共享。
 */

import { logger } from '../logger.js';
import type { NodeCommandPolicy } from './nodeCommandPolicy.js';
import { resolveNodeCommandPolicy, type NodePlatform } from './nodeCommandPolicy.js';
import type { GatewayAuthConfig } from './gatewayAuth.js';

export interface MutableRuntimeState {
  activeConnections: number;
  activeSessions: number;
  activeRuns: number;
  queuedTasks: number;
  startTime: number;
  lastActivityAt: number;
}

export interface CronState {
  enabled: boolean;
  runningJobs: number;
  lastJobAt?: number;
  nextJobAt?: number;
}

export interface HookConfig {
  enabled: boolean;
  hookClientIpConfig: HookClientIpConfig;
}

export interface HookClientIpConfig {
  enabled: boolean;
  trustedProxies: string[];
  headerName: string;
}

export interface PluginServicesState {
  loaded: boolean;
  pluginCount: number;
  activePlugins: string[];
}

export interface GatewayServerLiveState {
  mutable: MutableRuntimeState;
  hooksConfig: HookConfig | null;
  hookClientIpConfig: HookClientIpConfig;
  cronState: CronState;
  pluginServices: PluginServicesState | null;
  gatewayMethods: string[];
  authConfig: GatewayAuthConfig | null;
  nodePolicies: Map<string, NodeCommandPolicy>;
}

function createDefaultMutableState(): MutableRuntimeState {
  return {
    activeConnections: 0,
    activeSessions: 0,
    activeRuns: 0,
    queuedTasks: 0,
    startTime: Date.now(),
    lastActivityAt: Date.now(),
  };
}

function createDefaultCronState(): CronState {
  return {
    enabled: false,
    runningJobs: 0,
  };
}

function createDefaultHookClientIpConfig(): HookClientIpConfig {
  return {
    enabled: false,
    trustedProxies: [],
    headerName: 'x-forwarded-for',
  };
}

export function createGatewayServerLiveState(params?: {
  hooksConfig?: HookConfig | null;
  gatewayMethods?: string[];
  authConfig?: GatewayAuthConfig | null;
}): GatewayServerLiveState {
  const state: GatewayServerLiveState = {
    mutable: createDefaultMutableState(),
    hooksConfig: params?.hooksConfig ?? null,
    hookClientIpConfig: createDefaultHookClientIpConfig(),
    cronState: createDefaultCronState(),
    pluginServices: null,
    gatewayMethods: params?.gatewayMethods ?? [],
    authConfig: params?.authConfig ?? null,
    nodePolicies: new Map<string, NodeCommandPolicy>(),
  };

  logger.info('[ServerLiveState] 创建服务器实时状态');
  return state;
}

export function incrementActiveConnections(state: GatewayServerLiveState): void {
  state.mutable.activeConnections++;
  state.mutable.lastActivityAt = Date.now();
}

export function decrementActiveConnections(state: GatewayServerLiveState): void {
  if (state.mutable.activeConnections > 0) {
    state.mutable.activeConnections--;
  }
  state.mutable.lastActivityAt = Date.now();
}

export function incrementActiveSessions(state: GatewayServerLiveState): void {
  state.mutable.activeSessions++;
  state.mutable.lastActivityAt = Date.now();
}

export function decrementActiveSessions(state: GatewayServerLiveState): void {
  if (state.mutable.activeSessions > 0) {
    state.mutable.activeSessions--;
  }
  state.mutable.lastActivityAt = Date.now();
}

export function incrementActiveRuns(state: GatewayServerLiveState): void {
  state.mutable.activeRuns++;
  state.mutable.lastActivityAt = Date.now();
}

export function decrementActiveRuns(state: GatewayServerLiveState): void {
  if (state.mutable.activeRuns > 0) {
    state.mutable.activeRuns--;
  }
  state.mutable.lastActivityAt = Date.now();
}

export function setQueuedTasks(state: GatewayServerLiveState, count: number): void {
  state.mutable.queuedTasks = Math.max(0, count);
  state.mutable.lastActivityAt = Date.now();
}

export function updateCronState(state: GatewayServerLiveState, updates: Partial<CronState>): void {
  state.cronState = { ...state.cronState, ...updates };
  logger.debug('[ServerLiveState] 更新 Cron 状态', updates);
}

export function updatePluginServices(state: GatewayServerLiveState, updates: Partial<PluginServicesState>): void {
  if (!state.pluginServices) {
    state.pluginServices = {
      loaded: false,
      pluginCount: 0,
      activePlugins: [],
    };
  }
  state.pluginServices = { ...state.pluginServices, ...updates };
}

export function getOrCreateNodePolicy(state: GatewayServerLiveState, platform: NodePlatform): NodeCommandPolicy {
  const existing = state.nodePolicies.get(platform);
  if (existing) return existing;

  const policy = resolveNodeCommandPolicy(platform);
  state.nodePolicies.set(platform, policy);
  logger.debug(`[ServerLiveState] 创建节点策略: ${platform}`);
  return policy;
}

export function getLiveStateSnapshot(state: GatewayServerLiveState): {
  uptime: number;
  activeConnections: number;
  activeSessions: number;
  activeRuns: number;
  queuedTasks: number;
  lastActivityAt: number;
  cronEnabled: boolean;
  cronRunningJobs: number;
  pluginCount: number;
  nodePolicyCount: number;
  gatewayMethodCount: number;
} {
  return {
    uptime: Date.now() - state.mutable.startTime,
    activeConnections: state.mutable.activeConnections,
    activeSessions: state.mutable.activeSessions,
    activeRuns: state.mutable.activeRuns,
    queuedTasks: state.mutable.queuedTasks,
    lastActivityAt: state.mutable.lastActivityAt,
    cronEnabled: state.cronState.enabled,
    cronRunningJobs: state.cronState.runningJobs,
    pluginCount: state.pluginServices?.pluginCount ?? 0,
    nodePolicyCount: state.nodePolicies.size,
    gatewayMethodCount: state.gatewayMethods.length,
  };
}

export function resetLiveState(state: GatewayServerLiveState): void {
  state.mutable = createDefaultMutableState();
  state.cronState = createDefaultCronState();
  state.nodePolicies.clear();
  logger.info('[ServerLiveState] 重置服务器实时状态');
}