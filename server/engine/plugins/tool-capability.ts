/**
 * Tool 能力提供者 — 工具注册与调用能力
 *
 * 插件可注册自定义工具供 agent 调用。
 * 与 server/engine/agents/tools.ts 集成。
 */

import type { CapabilityProvider } from './capability-provider.js';
import { capabilityProviderRegistry } from './capability-provider.js';
import { PluginCapabilityError } from './plugin-errors.js';
import type { PluginToolDefinition } from './types.js';

/** 工具调用选项 */
export interface ToolInvokeOptions {
  /** 工具名 */
  name: string;
  /** 调用参数 */
  args: Record<string, unknown>;
  /** 调用上下文 */
  context?: {
    sessionId?: string;
    pluginId?: string;
    abortSignal?: { aborted: boolean };
  };
}

/** 工具调用结果 */
export interface ToolInvokeResult {
  /** 是否成功 */
  ok: boolean;
  /** 结果数据 */
  data?: unknown;
  /** 错误信息 */
  error?: string;
  /** 执行时长（毫秒） */
  durationMs?: number;
}

/** 工具能力提供者接口 */
export type ToolCapabilityProvider = CapabilityProvider<ToolInvokeOptions, ToolInvokeResult> & {
  /** 列出工具定义 */
  listTools?(): PluginToolDefinition[];
};

// ===================== 注册与调用 =====================

/** 注册 Tool 能力提供者 */
export function registerToolProvider(
  pluginId: string,
  provider: ToolCapabilityProvider,
  metadata?: Record<string, unknown>,
): void {
  capabilityProviderRegistry.register(pluginId, provider, metadata);
}

/** 注销 Tool 能力提供者 */
export function unregisterToolProvider(providerId: string): boolean {
  return capabilityProviderRegistry.unregister('tool', providerId);
}

/** 调用工具 */
export async function invokeTool(
  providerId: string,
  options: ToolInvokeOptions,
): Promise<ToolInvokeResult> {
  const entry = capabilityProviderRegistry.find<ToolInvokeOptions, ToolInvokeResult>('tool', providerId);
  if (!entry) {
    throw new PluginCapabilityError(`未找到工具提供者: ${providerId}`, `tool:${providerId}`);
  }

  const startTime = Date.now();
  try {
    const result = await entry.provider.invoke(options);
    return {
      ...result,
      durationMs: result.durationMs ?? Date.now() - startTime,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startTime,
    };
  }
}

/** 列出所有工具定义 */
export function listAllToolDefinitions(): Array<{ providerId: string; pluginId: string; tools: PluginToolDefinition[] }> {
  const entries = capabilityProviderRegistry.list('tool');
  const result: Array<{ providerId: string; pluginId: string; tools: PluginToolDefinition[] }> = [];

  for (const entry of entries) {
    const provider = entry.provider as ToolCapabilityProvider;
    if (provider.listTools) {
      result.push({
        providerId: provider.id,
        pluginId: entry.pluginId,
        tools: provider.listTools(),
      });
    }
  }

  return result;
}

/** 列出所有 Tool 提供者 */
export function listToolProviders() {
  return capabilityProviderRegistry.list('tool');
}

/** 创建 Tool 能力提供者 */
export function createToolProvider(
  id: string,
  invokeFn: (options: ToolInvokeOptions) => Promise<ToolInvokeResult>,
  options: {
    displayName?: string;
    description?: string;
    listTools?: () => PluginToolDefinition[];
    healthCheck?: () => Promise<{ ok: boolean; error?: string }>;
  } = {},
): ToolCapabilityProvider {
  const provider: ToolCapabilityProvider = {
    kind: 'tool',
    id,
    ...(options.displayName !== undefined ? { displayName: options.displayName } : {}),
    ...(options.description !== undefined ? { description: options.description } : {}),
    invoke: invokeFn,
    ...(options.listTools ? { listTools: options.listTools } : {}),
    ...(options.healthCheck ? { healthCheck: options.healthCheck } : {}),
  };
  return provider;
}
