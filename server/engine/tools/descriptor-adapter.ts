/**
 * 描述符适配器 — 将现有 ToolDefinition 转换为 ToolDescriptor
 *
 * 桥接现有的 toolRegistry.ts 中的 ToolDefinition 格式
 * 与新的 ToolDescriptor 格式。
 */

import type { ToolDefinition } from '../../aiClient.js';
import type { ToolDescriptor, JsonObject, ToolOwnerRef, ToolExecutorRef } from './types.js';
import { registerToolDescriptors } from './descriptor-registry.js';
import { logger } from '../../logger.js';

/** 适配器配置 */
export interface AdapterConfig {
  /** 默认所有者 */
  defaultOwner?: ToolOwnerRef;
  /** 默认执行器 */
  defaultExecutor?: (toolName: string) => ToolExecutorRef;
}

/** 默认适配器配置 */
const DEFAULT_CONFIG: AdapterConfig = {
  defaultOwner: { kind: 'core' },
  defaultExecutor: (toolName: string) => ({
    kind: 'core',
    executorId: toolName,
  }),
};

/**
 * 将 ToolDefinition 转换为 ToolDescriptor
 *
 * @param toolDef - 现有工具定义
 * @param config - 适配器配置
 * @returns 工具描述符
 */
export function adaptToolDefinition(
  toolDef: ToolDefinition,
  config?: AdapterConfig,
): ToolDescriptor {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const fn = toolDef.function;
  const name = fn.name;

  return {
    name,
    title: fn.description?.split('.')[0] || name,
    description: fn.description || `Tool: ${name}`,
    inputSchema: (fn.parameters || { type: 'object', properties: {} }) as JsonObject,
    owner: cfg.defaultOwner ?? { kind: 'core' },
    executor: cfg.defaultExecutor
      ? cfg.defaultExecutor(name)
      : { kind: 'core', executorId: name },
    sortKey: name,
  };
}

/**
 * 批量转换 ToolDefinition 为 ToolDescriptor
 *
 * @param toolDefs - 现有工具定义列表
 * @param config - 适配器配置
 * @returns 工具描述符列表
 */
export function adaptToolDefinitions(
  toolDefs: readonly ToolDefinition[],
  config?: AdapterConfig,
): ToolDescriptor[] {
  return toolDefs.map((def) => adaptToolDefinition(def, config));
}

/**
 * 将现有工具定义注册为工具描述符
 *
 * @param toolDefs - 现有工具定义列表
 * @param config - 适配器配置
 * @returns 已注册的描述符数量
 */
export function registerToolDefinitionsAsDescriptors(
  toolDefs: readonly ToolDefinition[],
  config?: AdapterConfig,
): number {
  const descriptors = adaptToolDefinitions(toolDefs, config);
  registerToolDescriptors(descriptors);
  logger.info(`[DescriptorAdapter] 已注册 ${descriptors.length} 个工具描述符`);
  return descriptors.length;
}

/**
 * 从工具名称推断所有者类型
 *
 * @param toolName - 工具名称
 * @returns 推断的所有者引用
 */
export function inferOwnerFromName(toolName: string): ToolOwnerRef {
  if (toolName.startsWith('mcp__')) {
    const parts = toolName.split('__');
    return { kind: 'mcp', serverId: parts[1] || 'unknown' };
  }
  if (toolName.startsWith('plugin__')) {
    const parts = toolName.split('__');
    return { kind: 'plugin', pluginId: parts[1] || 'unknown' };
  }
  if (toolName.startsWith('channel__')) {
    const parts = toolName.split('__');
    return { kind: 'channel', channelId: parts[1] || 'unknown' };
  }
  return { kind: 'core' };
}

/**
 * 从工具名称推断执行器
 *
 * @param toolName - 工具名称
 * @returns 推断的执行器引用
 */
export function inferExecutorFromName(toolName: string): ToolExecutorRef {
  if (toolName.startsWith('mcp__')) {
    const parts = toolName.split('__');
    return { kind: 'mcp', serverId: parts[1] || 'unknown', toolName: parts[2] || toolName };
  }
  if (toolName.startsWith('plugin__')) {
    const parts = toolName.split('__');
    return { kind: 'plugin', pluginId: parts[1] || 'unknown', toolName: parts[2] || toolName };
  }
  return { kind: 'core', executorId: toolName };
}
