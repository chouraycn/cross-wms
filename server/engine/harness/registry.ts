/**
 * 线束注册表 — 参考 OpenClaw harness/registry.ts
 * 
 * 进程级单例注册表，管理所有 Agent 线束的注册、查找和生命周期清理。
 * 使用 Symbol.for 确保全局唯一性。
 */

import { logger } from '../../logger.js';
import type { AgentHarness, RegisteredHarness, HarnessResetParams } from './types.js';

const REGISTRY_KEY = Symbol.for('cross-wms.agentHarnessRegistry');

interface RegistryState {
  harnesses: Map<string, RegisteredHarness>;
}

function getRegistryState(): RegistryState {
  const globalScope = globalThis as Record<symbol, RegistryState>;
  if (!globalScope[REGISTRY_KEY]) {
    globalScope[REGISTRY_KEY] = {
      harnesses: new Map<string, RegisteredHarness>(),
    };
  }
  return globalScope[REGISTRY_KEY];
}

/** 注册或替换线束 */
export function registerAgentHarness(
  harness: AgentHarness,
  options?: { ownerPluginId?: string },
): void {
  const id = harness.id.trim();
  getRegistryState().harnesses.set(id, {
    harness: { ...harness, id, pluginId: harness.pluginId ?? options?.ownerPluginId },
    ownerPluginId: options?.ownerPluginId,
  });
  logger.info(`[HarnessRegistry] 已注册线束: ${id}`);
}

/** 获取已注册的线束 */
export function getRegisteredAgentHarness(id: string): RegisteredHarness | undefined {
  return getRegistryState().harnesses.get(id.trim());
}

/** 列出所有已注册线束 */
export function listRegisteredAgentHarnesses(): RegisteredHarness[] {
  return Array.from(getRegistryState().harnesses.values());
}

/** 清除所有线束（用于测试） */
export function clearAgentHarnesses(): void {
  getRegistryState().harnesses.clear();
}

/** 恢复线束快照（用于测试） */
export function restoreRegisteredHarnesses(entries: RegisteredHarness[]): void {
  const map = getRegistryState().harnesses;
  map.clear();
  for (const entry of entries) {
    map.set(entry.harness.id, entry);
  }
}

/** 调用所有线束的会话重置钩子 */
export async function resetRegisteredHarnessSessions(
  params: HarnessResetParams,
): Promise<void> {
  await Promise.all(
    listRegisteredAgentHarnesses().map(async (entry) => {
      if (!entry.harness.reset) return;
      try {
        await entry.harness.reset(params);
      } catch (err) {
        logger.error(`[HarnessRegistry] 线束 ${entry.harness.id} 重置失败:`, err);
      }
    }),
  );
}

/** 调用所有线束的资源释放钩子 */
export async function disposeRegisteredHarnesses(): Promise<void> {
  await Promise.all(
    listRegisteredAgentHarnesses().map(async (entry) => {
      if (!entry.harness.dispose) return;
      try {
        await entry.harness.dispose();
      } catch (err) {
        logger.error(`[HarnessRegistry] 线束 ${entry.harness.id} 释放失败:`, err);
      }
    }),
  );
}
