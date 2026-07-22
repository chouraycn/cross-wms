/**
 * Coding Agents 模块 — 编码代理适配器 barrel 导出
 *
 * 聚合编码代理适配器的公开 API，提供统一的适配器注册表与
 * 便捷的任务管理函数（启动、状态、输出、取消）。
 *
 * 内置适配器：
 * - GitHub Copilot（copilotAdapter）
 * - OpenCode（opencodeAdapter）
 */

// 类型
export type {
  CodingAgentType,
  CodingTaskStatus,
  StartCodingTaskParams,
  CodingTaskHandle,
  CodingTaskStateSnapshot,
  CodingTaskOutput,
  CodingAgentAdapter,
  CodingAgentAdapterOptions,
} from "./types.js";

// GitHub Copilot 适配器
export { createCopilotAdapter, copilotAdapter } from "./copilotAdapter.js";

// OpenCode 适配器
export { createOpencodeAdapter, opencodeAdapter } from "./opencodeAdapter.js";

import type { CodingAgentAdapter, CodingAgentType } from "./types.js";
import { copilotAdapter } from "./copilotAdapter.js";
import { opencodeAdapter } from "./opencodeAdapter.js";

/** 适配器注册表（按 agentType 索引） */
const adapterRegistry = new Map<CodingAgentType, CodingAgentAdapter>();

/**
 * 注册一个编码代理适配器。
 */
export function registerCodingAgentAdapter(adapter: CodingAgentAdapter): void {
  adapterRegistry.set(adapter.agentType, adapter);
}

/**
 * 注销指定类型的编码代理适配器。
 */
export function unregisterCodingAgentAdapter(agentType: CodingAgentType): boolean {
  return adapterRegistry.delete(agentType);
}

/**
 * 按类型获取编码代理适配器。
 */
export function getCodingAgentAdapter(
  agentType: CodingAgentType,
): CodingAgentAdapter | undefined {
  return adapterRegistry.get(agentType);
}

/**
 * 列出所有已注册的编码代理适配器。
 */
export function listCodingAgentAdapters(): CodingAgentAdapter[] {
  return Array.from(adapterRegistry.values());
}

/**
 * 列出已配置（可用）的编码代理适配器。
 */
export function listConfiguredCodingAgentAdapters(): CodingAgentAdapter[] {
  return listCodingAgentAdapters().filter((adapter) => adapter.isConfigured());
}

// 默认注册内置适配器
registerCodingAgentAdapter(copilotAdapter);
registerCodingAgentAdapter(opencodeAdapter);
