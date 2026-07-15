/**
 * 工具描述符注册表 — 参考 OpenClaw tools/registry.ts
 *
 * 管理工具描述符的注册、查找和生命周期。
 * 支持从不同来源（core/plugin/channel/mcp）注册工具描述符。
 * 提供描述符的版本管理和冲突检测。
 */

import { logger } from '../../logger.js';
import type {
  ToolDescriptor,
  ToolOwnerRef,
} from './types.js';

/** 注册表符号键 */
const REGISTRY_KEY = Symbol.for('cross-wms.toolDescriptorRegistry');

/** 注册表状态 */
interface DescriptorRegistryState {
  /** 按名称索引的描述符 */
  descriptors: Map<string, ToolDescriptor>;
  /** 按所有者索引的描述符名称集合 */
  byOwner: Map<string, Set<string>>;
}

/** 获取全局注册表状态 */
function getRegistryState(): DescriptorRegistryState {
  const globalScope = globalThis as Record<symbol, DescriptorRegistryState>;
  if (!globalScope[REGISTRY_KEY]) {
    globalScope[REGISTRY_KEY] = {
      descriptors: new Map<string, ToolDescriptor>(),
      byOwner: new Map<string, Set<string>>(),
    };
  }
  return globalScope[REGISTRY_KEY];
}

/** 生成所有者键 */
function ownerKey(owner: ToolOwnerRef): string {
  switch (owner.kind) {
    case 'core':
      return 'core';
    case 'plugin':
      return `plugin:${owner.pluginId}`;
    case 'channel':
      return `channel:${owner.channelId}`;
    case 'mcp':
      return `mcp:${owner.serverId}`;
  }
}

/** 注册工具描述符 */
export function registerToolDescriptor(descriptor: ToolDescriptor): void {
  const state = getRegistryState();
  const name = descriptor.name;

  // 检查冲突
  const existing = state.descriptors.get(name);
  if (existing) {
    const existingOwnerKey = ownerKey(existing.owner);
    const newOwnerKey = ownerKey(descriptor.owner);
    if (existingOwnerKey !== newOwnerKey) {
      logger.warn(
        `[ToolDescriptorRegistry] 工具名称冲突: ${name} 已被 ${existingOwnerKey} 注册, ` +
        `尝试被 ${newOwnerKey} 覆盖`,
      );
    }
  }

  // 注册描述符
  state.descriptors.set(name, descriptor);

  // 按所有者索引
  const ownerK = ownerKey(descriptor.owner);
  let ownerSet = state.byOwner.get(ownerK);
  if (!ownerSet) {
    ownerSet = new Set<string>();
    state.byOwner.set(ownerK, ownerSet);
  }
  ownerSet.add(name);

  logger.debug(`[ToolDescriptorRegistry] 已注册工具描述符: ${name} (${ownerK})`);
}

/** 批量注册工具描述符 */
export function registerToolDescriptors(descriptors: readonly ToolDescriptor[]): void {
  for (const descriptor of descriptors) {
    registerToolDescriptor(descriptor);
  }
}

/** 获取工具描述符 */
export function getToolDescriptor(name: string): ToolDescriptor | undefined {
  return getRegistryState().descriptors.get(name);
}

/** 列出所有工具描述符 */
export function listToolDescriptors(): ToolDescriptor[] {
  return Array.from(getRegistryState().descriptors.values());
}

/** 列出指定所有者的工具描述符 */
export function listToolDescriptorsByOwner(owner: ToolOwnerRef): ToolDescriptor[] {
  const state = getRegistryState();
  const ownerK = ownerKey(owner);
  const names = state.byOwner.get(ownerK);
  if (!names) return [];

  const result: ToolDescriptor[] = [];
  for (const name of names) {
    const descriptor = state.descriptors.get(name);
    if (descriptor) result.push(descriptor);
  }
  return result;
}

/** 注销工具描述符 */
export function unregisterToolDescriptor(name: string): boolean {
  const state = getRegistryState();
  const descriptor = state.descriptors.get(name);
  if (!descriptor) return false;

  state.descriptors.delete(name);
  const ownerK = ownerKey(descriptor.owner);
  state.byOwner.get(ownerK)?.delete(name);

  logger.debug(`[ToolDescriptorRegistry] 已注销工具描述符: ${name}`);
  return true;
}

/** 注销指定所有者的所有工具描述符 */
export function unregisterToolDescriptorsByOwner(owner: ToolOwnerRef): number {
  const state = getRegistryState();
  const ownerK = ownerKey(owner);
  const names = state.byOwner.get(ownerK);
  if (!names) return 0;

  let count = 0;
  for (const name of names) {
    state.descriptors.delete(name);
    count++;
  }
  state.byOwner.delete(ownerK);

  if (count > 0) {
    logger.debug(`[ToolDescriptorRegistry] 已注销所有者 ${ownerK} 的 ${count} 个工具描述符`);
  }
  return count;
}

/** 清除所有工具描述符（用于测试） */
export function clearToolDescriptors(): void {
  const state = getRegistryState();
  state.descriptors.clear();
  state.byOwner.clear();
}

/** 获取注册表诊断信息 */
export function getDescriptorRegistryDiagnostics(): {
  totalCount: number;
  byOwner: Record<string, number>;
} {
  const state = getRegistryState();
  const byOwner: Record<string, number> = {};
  for (const [key, names] of state.byOwner) {
    byOwner[key] = names.size;
  }
  return {
    totalCount: state.descriptors.size,
    byOwner,
  };
}
