/**
 * 插件激活状态管理 — 参考 OpenClaw plugins/activation-planner.ts
 *
 * 管理插件的激活和禁用状态。
 */

import { logger } from '../logger.js';
import { publishEvent } from './events.js';

export type PluginActivationState = 'enabled' | 'disabled' | 'pending' | 'error';

export interface PluginActivationRecord {
  pluginId: string;
  state: PluginActivationState;
  enabledAt?: number;
  disabledAt?: number;
  reason?: string;
}

export interface PluginActivationOptions {
  reason?: string;
  force?: boolean;
}

const activationRecords = new Map<string, PluginActivationRecord>();

export function getPluginActivationState(pluginId: string): PluginActivationState {
  const record = activationRecords.get(pluginId);
  return record?.state ?? 'disabled';
}

export function setPluginActivationState(
  pluginId: string,
  state: PluginActivationState,
  options?: PluginActivationOptions,
): void {
  const now = Date.now();

  const record: PluginActivationRecord = {
    pluginId,
    state,
    enabledAt: state === 'enabled' ? now : activationRecords.get(pluginId)?.enabledAt,
    disabledAt: state === 'disabled' ? now : activationRecords.get(pluginId)?.disabledAt,
    reason: options?.reason,
  };

  activationRecords.set(pluginId, record);

  logger.info(`[PluginActivation] ${pluginId} → ${state}${options?.reason ? ` (${options.reason})` : ''}`);

  publishEvent('system:info', {
    pluginId,
    action: state,
    reason: options?.reason,
  });
}

export function enablePlugin(pluginId: string, options?: PluginActivationOptions): void {
  setPluginActivationState(pluginId, 'enabled', options);
}

export function disablePlugin(pluginId: string, options?: PluginActivationOptions): void {
  setPluginActivationState(pluginId, 'disabled', options);
}

export function setPluginPending(pluginId: string, reason?: string): void {
  setPluginActivationState(pluginId, 'pending', { reason });
}

export function setPluginError(pluginId: string, reason?: string): void {
  setPluginActivationState(pluginId, 'error', { reason });
}

export function isPluginEnabled(pluginId: string): boolean {
  return getPluginActivationState(pluginId) === 'enabled';
}

export function listActivationRecords(): PluginActivationRecord[] {
  return Array.from(activationRecords.values());
}

export function getActivationRecord(pluginId: string): PluginActivationRecord | undefined {
  return activationRecords.get(pluginId);
}

export function clearActivationRecords(): void {
  activationRecords.clear();
  logger.info('[PluginActivation] 清空所有激活记录');
}

export function batchSetActivationState(
  pluginIds: string[],
  state: PluginActivationState,
  options?: PluginActivationOptions,
): void {
  for (const pluginId of pluginIds) {
    setPluginActivationState(pluginId, state, options);
  }
}

export function enableAllPlugins(options?: PluginActivationOptions): void {
  for (const pluginId of activationRecords.keys()) {
    enablePlugin(pluginId, options);
  }
}

export function disableAllPlugins(options?: PluginActivationOptions): void {
  for (const pluginId of activationRecords.keys()) {
    disablePlugin(pluginId, options);
  }
}