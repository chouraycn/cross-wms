/**
 * @deprecated v9.1 — 休眠原型：`spawn()` 仅用 `setTimeout(100ms)` 模拟启动，无真实执行后端，
 * 且全仓无外部调用者。子代理能力已统一收敛到 `agentOrchestrator.ts` 的 `spawnSubAgent()`，
 * 运行时实例表见 `agentRegistry.ts`。保留本模块仅为避免破坏既有测试，请勿在新代码中引用。
 *
 * Subagent Registry
 * 子代理注册和管理系统
 */

import type { ToolDefinition } from '../aiClient.js';
import { mcpClientManager } from './mcpClientManager.js';
import { parseMcpToolName, sanitizeServerName } from './mcpTypes.js';
import { logger } from '../logger.js';

// v9.1: 废弃警告（仅打印一次）
logger.warn('[deprecated] subagentRegistry 已废弃，请改用 AgentOrchestrator.spawnSubAgent + AgentRegistry');


export type SubagentStatus = "idle" | "spawning" | "running" | "paused" | "completed" | "failed" | "cancelled";

export interface SubagentDefinition {
  id: string;
  name: string;
  description: string;
  agentType: string;
  tools: string[];
  /** 可用的 MCP 服务器名称列表（指定后仅绑定这些服务器的工具；未指定则不绑定 MCP 工具） */
  mcpServers?: string[];
  systemPrompt?: string;
  capabilities: string[];
  maxConcurrent?: number;
  timeoutMs?: number;
  autoRestart?: boolean;
  tags: string[];
  icon?: string;
  enabled: boolean;
}

export interface SubagentInstance {
  id: string;
  definitionId: string;
  name: string;
  status: SubagentStatus;
  sessionKey: string;
  parentSessionKey?: string;
  spawnedAt: number;
  startedAt?: number;
  completedAt?: number;
  lastActivityAt?: number;
  taskDescription?: string;
  result?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface SpawnSubagentParams {
  definitionId: string;
  taskDescription: string;
  sessionKey: string;
  parentSessionKey?: string;
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface SubagentSpawnResult {
  instanceId: string;
  status: SubagentStatus;
  sessionKey: string;
}

/** 子代理可用工具集（内置 + MCP） */
export interface SubagentAvailableTools {
  /** 内置工具名列表 */
  builtin: string[];
  /** 绑定的 MCP 工具（ToolDefinition 格式，可合并到 LLM tools 列表） */
  mcp: ToolDefinition[];
}

class SubagentRegistry {
  private readonly definitions = new Map<string, SubagentDefinition>();
  private readonly instances = new Map<string, SubagentInstance>();
  private readonly instanceListeners = new Map<string, Array<(instance: SubagentInstance) => void>>();

  constructor() {
    this.initializeDefaultDefinitions();
  }

  private initializeDefaultDefinitions(): void {
    const defaults: SubagentDefinition[] = [
      {
        id: "research-agent",
        name: "研究助手",
        description: "负责信息收集和研究任务",
        agentType: "research",
        tools: ["web_search", "memory_search", "tool_search"],
        capabilities: ["research", "information_gathering", "analysis"],
        maxConcurrent: 3,
        timeoutMs: 5 * 60 * 1000,
        tags: ["research", "analysis"],
        enabled: true,
      },
      {
        id: "coding-agent",
        name: "编码助手",
        description: "负责代码编写和调试任务",
        agentType: "coding",
        tools: ["web_search", "memory_search"],
        capabilities: ["coding", "debugging", "refactoring"],
        maxConcurrent: 2,
        timeoutMs: 10 * 60 * 1000,
        tags: ["coding", "development"],
        enabled: true,
      },
      {
        id: "analysis-agent",
        name: "分析助手",
        description: "负责数据分析和报告生成",
        agentType: "analysis",
        tools: ["memory_search", "wms_inventory_query"],
        capabilities: ["data_analysis", "reporting", "visualization"],
        maxConcurrent: 2,
        timeoutMs: 10 * 60 * 1000,
        tags: ["analysis", "reporting"],
        enabled: true,
      },
      {
        id: "wms-operator-agent",
        name: "WMS 操作员",
        description: "执行 WMS 系统操作任务",
        agentType: "wms-operator",
        tools: ["wms_inventory_query", "memory_search"],
        capabilities: ["wms_operations", "inventory_management"],
        maxConcurrent: 5,
        timeoutMs: 5 * 60 * 1000,
        tags: ["wms", "operations"],
        enabled: true,
      },
    ];

    for (const def of defaults) {
      this.definitions.set(def.id, def);
    }
  }

  // ========== Definition Management ==========

  registerDefinition(definition: Omit<SubagentDefinition, "enabled"> & Partial<Pick<SubagentDefinition, "enabled">>): void {
    const fullDef: SubagentDefinition = {
      ...definition,
      enabled: definition.enabled ?? true,
    };
    this.definitions.set(definition.id, fullDef);
  }

  unregisterDefinition(definitionId: string): boolean {
    return this.definitions.delete(definitionId);
  }

  getDefinition(definitionId: string): SubagentDefinition | undefined {
    return this.definitions.get(definitionId);
  }

  listDefinitions(options?: {
    tag?: string;
    capability?: string;
    enabled?: boolean;
  }): SubagentDefinition[] {
    let defs = Array.from(this.definitions.values());

    if (options?.tag) {
      defs = defs.filter((d) => d.tags.includes(options.tag!));
    }
    if (options?.capability) {
      defs = defs.filter((d) => d.capabilities.includes(options.capability!));
    }
    if (options?.enabled !== undefined) {
      defs = defs.filter((d) => d.enabled === options.enabled);
    }

    return defs;
  }

  /**
   * 获取子代理可用的工具列表（内置 + MCP）。
   *
   * - 内置工具来自定义的 tools 字段
   * - MCP 工具来自 mcpClientManager，按定义的 mcpServers 过滤
   *   （mcpServers 未指定或为空时返回空 MCP 工具集，保持原有行为）
   */
  getAvailableTools(definitionId: string): SubagentAvailableTools | undefined {
    const def = this.definitions.get(definitionId);
    if (!def) return undefined;

    return {
      builtin: [...def.tools],
      mcp: this.resolveMcpTools(def.mcpServers),
    };
  }

  /** 根据 mcpServers 配置过滤可用的 MCP 工具 */
  private resolveMcpTools(mcpServers?: string[]): ToolDefinition[] {
    if (!mcpServers || mcpServers.length === 0) {
      return [];
    }

    const allowedPrefixes = new Set(
      mcpServers.map((s) => sanitizeServerName(s)),
    );
    const allMcpTools = mcpClientManager.getMcpTools();

    return allMcpTools.filter((tool) => {
      const parsed = parseMcpToolName(tool.function.name);
      return parsed !== null && allowedPrefixes.has(parsed.serverPrefix);
    });
  }

  // ========== Instance Management ==========

  async spawn(params: SpawnSubagentParams): Promise<SubagentSpawnResult> {
    const definition = this.definitions.get(params.definitionId);
    if (!definition) {
      throw new Error(`Subagent definition not found: ${params.definitionId}`);
    }

    if (!definition.enabled) {
      throw new Error(`Subagent definition is disabled: ${params.definitionId}`);
    }

    // 检查并发限制
    if (definition.maxConcurrent) {
      const runningCount = this.countRunningByDefinition(params.definitionId);
      if (runningCount >= definition.maxConcurrent) {
        throw new Error(
          `Max concurrent instances (${definition.maxConcurrent}) reached for ${definition.name}`,
        );
      }
    }

    const instanceId = `subagent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const instance: SubagentInstance = {
      id: instanceId,
      definitionId: params.definitionId,
      name: definition.name,
      status: "spawning",
      sessionKey: params.sessionKey,
      parentSessionKey: params.parentSessionKey,
      spawnedAt: Date.now(),
      taskDescription: params.taskDescription,
      metadata: params.metadata,
    };

    this.instances.set(instanceId, instance);
    this.notifyListeners(instanceId, instance);

    // 模拟启动过程
    setTimeout(() => {
      const inst = this.instances.get(instanceId);
      if (inst && inst.status === "spawning") {
        inst.status = "running";
        inst.startedAt = Date.now();
        inst.lastActivityAt = Date.now();
        this.instances.set(instanceId, inst);
        this.notifyListeners(instanceId, inst);
      }
    }, 100);

    return {
      instanceId,
      status: "spawning",
      sessionKey: params.sessionKey,
    };
  }

  cancel(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    if (instance.status === "completed" || instance.status === "failed" || instance.status === "cancelled") {
      return false;
    }

    instance.status = "cancelled";
    instance.completedAt = Date.now();
    this.instances.set(instanceId, instance);
    this.notifyListeners(instanceId, instance);
    return true;
  }

  complete(instanceId: string, result: unknown): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    instance.status = "completed";
    instance.result = result;
    instance.completedAt = Date.now();
    instance.lastActivityAt = Date.now();
    this.instances.set(instanceId, instance);
    this.notifyListeners(instanceId, instance);
    return true;
  }

  fail(instanceId: string, error: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    instance.status = "failed";
    instance.error = error;
    instance.completedAt = Date.now();
    instance.lastActivityAt = Date.now();
    this.instances.set(instanceId, instance);
    this.notifyListeners(instanceId, instance);
    return true;
  }

  getInstance(instanceId: string): SubagentInstance | undefined {
    return this.instances.get(instanceId);
  }

  listInstances(options?: {
    status?: SubagentStatus | SubagentStatus[];
    definitionId?: string;
    parentSessionKey?: string;
  }): SubagentInstance[] {
    let instances = Array.from(this.instances.values());

    if (options?.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      instances = instances.filter((i) => statuses.includes(i.status));
    }
    if (options?.definitionId) {
      instances = instances.filter((i) => i.definitionId === options.definitionId);
    }
    if (options?.parentSessionKey) {
      instances = instances.filter((i) => i.parentSessionKey === options.parentSessionKey);
    }

    return instances.sort((a, b) => b.spawnedAt - a.spawnedAt);
  }

  countRunningByDefinition(definitionId: string): number {
    return Array.from(this.instances.values()).filter(
      (i) => i.definitionId === definitionId && (i.status === "running" || i.status === "spawning"),
    ).length;
  }

  // ========== Listeners ==========

  onInstanceUpdate(instanceId: string, listener: (instance: SubagentInstance) => void): () => void {
    let listeners = this.instanceListeners.get(instanceId);
    if (!listeners) {
      listeners = [];
      this.instanceListeners.set(instanceId, listeners);
    }
    listeners.push(listener);
    return () => {
      const ls = this.instanceListeners.get(instanceId);
      if (ls) {
        const idx = ls.indexOf(listener);
        if (idx >= 0) ls.splice(idx, 1);
      }
    };
  }

  private notifyListeners(instanceId: string, instance: SubagentInstance): void {
    const listeners = this.instanceListeners.get(instanceId);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(instance);
        } catch (e) {
          console.error("[subagent] Listener error:", e);
        }
      }
    }
  }

  // ========== Cleanup ==========

  cleanupCompleted(olderThanMs = 60 * 60 * 1000): number {
    const now = Date.now();
    let removed = 0;
    for (const [id, instance] of this.instances) {
      if (
        (instance.status === "completed" ||
          instance.status === "failed" ||
          instance.status === "cancelled") &&
        instance.completedAt &&
        now - instance.completedAt > olderThanMs
      ) {
        this.instances.delete(id);
        this.instanceListeners.delete(id);
        removed++;
      }
    }
    return removed;
  }

  clear(): void {
    this.definitions.clear();
    this.instances.clear();
    this.instanceListeners.clear();
  }

  getStats(): {
    definitions: number;
    instances: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  } {
    const instances = Array.from(this.instances.values());
    return {
      definitions: this.definitions.size,
      instances: instances.length,
      running: instances.filter((i) => i.status === "running" || i.status === "spawning").length,
      completed: instances.filter((i) => i.status === "completed").length,
      failed: instances.filter((i) => i.status === "failed").length,
      cancelled: instances.filter((i) => i.status === "cancelled").length,
    };
  }
}

const SUBAGENT_INSTANCE = new SubagentRegistry();

export function getSubagentRegistry(): SubagentRegistry {
  return SUBAGENT_INSTANCE;
}

export function registerSubagentDefinition(definition: Parameters<SubagentRegistry["registerDefinition"]>[0]): void {
  SUBAGENT_INSTANCE.registerDefinition(definition);
}

export async function spawnSubagent(params: SpawnSubagentParams): Promise<SubagentSpawnResult> {
  return SUBAGENT_INSTANCE.spawn(params);
}

export function cancelSubagent(instanceId: string): boolean {
  return SUBAGENT_INSTANCE.cancel(instanceId);
}

export function resetSubagentRegistryForTests(): void {
  SUBAGENT_INSTANCE.clear();
}

export type { SubagentRegistry };
