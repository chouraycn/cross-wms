/**
 * Subagent Runner — 子代理执行运行时
 *
 * 基于 openclaw 的 subagent-spawn 实现，提供子代理的隔离执行和通信机制。
 *
 * 功能：
 * 1. SubagentConfig 接口 - 子代理配置
 * 2. SubagentRunner 类 - 子代理执行器
 * 3. execute 方法 - 执行子代理任务
 * 4. 子代理隔离和通信机制
 */

import { logger } from '../logger.js';
import { getSubagentRegistry, type SpawnSubagentParams, type SubagentSpawnResult } from './subagentRegistry.js';
import type { ToolDefinition } from '../aiClient.js';

// ===================== 类型定义 =====================

/**
 * 子代理执行模式
 */
export type SubagentMode = 'sequential' | 'parallel' | 'isolated';

/**
 * 子代理沙箱模式
 */
export type SubagentSandboxMode = 'workspace' | 'user' | 'system' | 'none';

/**
 * 子代理上下文模式
 */
export type SubagentContextMode = 'full' | 'light' | 'minimal';

/**
 * 子代理状态
 */
export type SubagentRunStatus = 'pending' | 'spawning' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * 子代理执行结果
 */
export interface SubagentExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  metadata: {
    instanceId: string;
    sessionKey: string;
    status: SubagentRunStatus;
    durationMs: number;
    thinkLevel?: string;
  };
}

/**
 * 子代理执行事件
 */
export type SubagentEvent =
  | { type: 'start'; instanceId: string; sessionKey: string }
  | { type: 'progress'; instanceId: string; progress: number; message?: string }
  | { type: 'complete'; instanceId: string; result: unknown }
  | { type: 'error'; instanceId: string; error: string }
  | { type: 'cancel'; instanceId: string };

/**
 * 子代理事件监听器
 */
export type SubagentEventListener = (event: SubagentEvent) => void;

/**
 * 子代理配置接口
 */
export interface SubagentConfig {
  /** 子代理定义 ID */
  definitionId: string;
  /** 任务描述 */
  taskDescription: string;
  /** 会话 Key */
  sessionKey: string;
  /** 父会话 Key（可选，用于追踪） */
  parentSessionKey?: string;
  /** 输入参数 */
  input?: Record<string, unknown>;
  /** 元数据 */
  metadata?: Record<string, unknown>;
  /** 执行模式 */
  mode?: SubagentMode;
  /** 超时时间（毫秒） */
  timeoutMs?: number;
  /** 思考级别 */
  thinkLevel?: string;
  /** 清理策略 */
  cleanup?: 'delete' | 'keep';
  /** 沙箱模式 */
  sandbox?: SubagentSandboxMode;
  /** 上下文模式 */
  context?: SubagentContextMode;
  /** 是否等待完成 */
  waitForCompletion?: boolean;
  /** 回调函数 */
  onEvent?: SubagentEventListener;
}

// ===================== 子代理隔离机制 =====================

/**
 * 子代理隔离上下文
 *
 * 为每个子代理创建独立的执行环境，包括：
 * - 独立的会话空间
 * - 独立的工具集
 * - 独立的资源限制
 */
export interface SubagentIsolationContext {
  sessionKey: string;
  parentSessionKey?: string;
  isolationId: string;
  createdAt: number;
  metadata: Record<string, unknown>;
}

/**
 * 子代理通信消息
 */
export interface SubagentMessage {
  type: 'task' | 'progress' | 'result' | 'error' | 'cancel' | 'heartbeat';
  sourceSessionKey: string;
  targetSessionKey: string;
  payload: unknown;
  timestamp: number;
  messageId: string;
}

// ===================== 子代理通信通道 =====================

/**
 * 子代理通信通道管理器
 */
class SubagentMessageChannel {
  private readonly channels = new Map<string, SubagentMessage[]>();
  private readonly listeners = new Map<string, Set<SubagentEventListener>>();

  /**
   * 创建通信通道
   */
  createChannel(sessionKey: string): void {
    this.channels.set(sessionKey, []);
  }

  /**
   * 删除通信通道
   */
  deleteChannel(sessionKey: string): void {
    this.channels.delete(sessionKey);
    this.listeners.delete(sessionKey);
  }

  /**
   * 发送消息到通道
   */
  sendMessage(message: SubagentMessage): void {
    const channel = this.channels.get(message.targetSessionKey);
    if (channel) {
      channel.push(message);
      this.notifyListeners(message.targetSessionKey, {
        type: 'progress',
        instanceId: message.targetSessionKey,
        progress: 0,
        message: JSON.stringify(message.payload),
      });
    }
  }

  /**
   * 获取并清除消息
   */
  consumeMessages(sessionKey: string): SubagentMessage[] {
    const channel = this.channels.get(sessionKey);
    if (!channel) return [];
    const messages = [...channel];
    channel.length = 0;
    return messages;
  }

  /**
   * 订阅通道事件
   */
  subscribe(sessionKey: string, listener: SubagentEventListener): () => void {
    let listeners = this.listeners.get(sessionKey);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(sessionKey, listeners);
    }
    listeners.add(listener);
    return () => listeners?.delete(listener);
  }

  private notifyListeners(sessionKey: string, event: SubagentEvent): void {
    const listeners = this.listeners.get(sessionKey);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (e) {
          logger.error('[SubagentMessageChannel] Listener error:', e);
        }
      }
    }
  }
}

// ===================== 子代理执行器 =====================

/**
 * 子代理运行器
 *
 * 负责子代理的创建、执行、监控和清理
 */
export class SubagentRunner {
  private readonly registry = getSubagentRegistry();
  private readonly messageChannel = new SubagentMessageChannel();
  private readonly activeInstances = new Map<string, NodeJS.Timeout>();
  private readonly isolationContexts = new Map<string, SubagentIsolationContext>();
  /** 实例 → 绑定的 MCP 工具列表 */
  private readonly instanceMcpTools = new Map<string, ToolDefinition[]>();

  /**
   * 执行子代理任务
   *
   * @param config - 子代理配置
   * @returns 执行结果
   */
  async execute(config: SubagentConfig): Promise<SubagentExecutionResult> {
    const startTime = Date.now();
    const {
      definitionId,
      taskDescription,
      sessionKey,
      parentSessionKey,
      input,
      metadata,
      timeoutMs = 5 * 60 * 1000,
      waitForCompletion = true,
      onEvent,
    } = config;

    // 生成实例 ID
    const instanceId = `subagent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 创建隔离上下文
    const isolationContext: SubagentIsolationContext = {
      sessionKey,
      parentSessionKey,
      isolationId: instanceId,
      createdAt: startTime,
      metadata: metadata ?? {},
    };
    this.isolationContexts.set(instanceId, isolationContext);

    // 创建通信通道
    this.messageChannel.createChannel(sessionKey);

    // 注册事件监听器
    let unsubscribe: (() => void) | undefined;
    if (onEvent) {
      unsubscribe = this.messageChannel.subscribe(sessionKey, onEvent);
    }

    try {
      // 发送启动事件
      onEvent?.({
        type: 'start',
        instanceId,
        sessionKey,
      });

      // 调用注册表的 spawn 方法
      const spawnParams: SpawnSubagentParams = {
        definitionId,
        taskDescription,
        sessionKey,
        parentSessionKey,
        input,
        metadata: {
          ...metadata,
          isolationId: instanceId,
          thinkLevel: config.thinkLevel,
          sandbox: config.sandbox,
          context: config.context,
        },
        timeoutMs,
      };

      let spawnResult: SubagentSpawnResult;
      try {
        spawnResult = await this.registry.spawn(spawnParams);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        onEvent?.({
          type: 'error',
          instanceId,
          error: errorMessage,
        });

        return {
          success: false,
          error: errorMessage,
          metadata: {
            instanceId,
            sessionKey,
            status: 'failed',
            durationMs: Date.now() - startTime,
            thinkLevel: config.thinkLevel,
          },
        };
      }

      // 设置超时监控
      const timeoutHandle = setTimeout(() => {
        this.handleTimeout(instanceId, sessionKey, onEvent);
      }, timeoutMs);
      this.activeInstances.set(instanceId, timeoutHandle);

      // 根据定义的 mcpServers 配置过滤可用的 MCP 工具并绑定到实例
      const availableTools = this.registry.getAvailableTools(definitionId);
      if (availableTools && availableTools.mcp.length > 0) {
        this.bindMcpTools(instanceId, availableTools.mcp);
        logger.debug(
          `[SubagentRunner] 已为实例 ${instanceId} 绑定 ${availableTools.mcp.length} 个 MCP 工具`,
        );
      }

      // 如果需要等待完成
      if (waitForCompletion) {
        const completionResult = await this.waitForCompletion(
          instanceId,
          sessionKey,
          timeoutMs,
          onEvent,
        );

        // 清理超时监控
        clearTimeout(timeoutHandle);
        this.activeInstances.delete(instanceId);

        if (completionResult.success) {
          onEvent?.({
            type: 'complete',
            instanceId,
            result: completionResult.result,
          });
        } else {
          onEvent?.({
            type: 'error',
            instanceId,
            error: completionResult.error ?? 'Unknown error',
          });
        }

        return {
          success: completionResult.success,
          result: completionResult.result,
          error: completionResult.error,
          metadata: {
            instanceId,
            sessionKey,
            status: completionResult.success ? 'completed' : 'failed',
            durationMs: Date.now() - startTime,
            thinkLevel: config.thinkLevel,
          },
        };
      }

      // 非等待模式，立即返回
      return {
        success: true,
        result: { instanceId, sessionKey },
        metadata: {
          instanceId,
          sessionKey,
          status: 'running',
          durationMs: Date.now() - startTime,
          thinkLevel: config.thinkLevel,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      onEvent?.({
        type: 'error',
        instanceId,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        metadata: {
          instanceId,
          sessionKey,
          status: 'failed',
          durationMs: Date.now() - startTime,
          thinkLevel: config.thinkLevel,
        },
      };
    } finally {
      // 清理资源
      unsubscribe?.();
      this.messageChannel.deleteChannel(sessionKey);
      this.isolationContexts.delete(instanceId);
      this.instanceMcpTools.delete(instanceId);
    }
  }

  /**
   * 等待子代理完成
   */
  private async waitForCompletion(
    instanceId: string,
    sessionKey: string,
    timeoutMs: number,
    onEvent?: SubagentEventListener,
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Timeout waiting for completion' });
      }, timeoutMs);

      // 轮询检查完成状态
      const pollInterval = setInterval(() => {
        const instance = this.registry.getInstance(instanceId);
        if (!instance) {
          clearInterval(pollInterval);
          clearTimeout(timeout);
          resolve({ success: false, error: 'Instance not found' });
          return;
        }

        if (instance.status === 'completed') {
          clearInterval(pollInterval);
          clearTimeout(timeout);
          resolve({ success: true, result: instance.result });
          return;
        }

        if (instance.status === 'failed' || instance.status === 'cancelled') {
          clearInterval(pollInterval);
          clearTimeout(timeout);
          resolve({ success: false, error: instance.error ?? 'Execution failed' });
          return;
        }

        // 发送进度事件
        onEvent?.({
          type: 'progress',
          instanceId,
          progress: 0.5,
          message: `Running: ${instance.status}`,
        });
      }, 1000);

      // 监听完成事件
      const unsubscribe = this.messageChannel.subscribe(sessionKey, (event) => {
        if (event.type === 'complete' && event.instanceId === instanceId) {
          clearInterval(pollInterval);
          clearTimeout(timeout);
          unsubscribe();
          resolve({ success: true, result: event.result });
        }
        if (event.type === 'error' && event.instanceId === instanceId) {
          clearInterval(pollInterval);
          clearTimeout(timeout);
          unsubscribe();
          resolve({ success: false, error: event.error });
        }
      });
    });
  }

  /**
   * 处理超时
   */
  private handleTimeout(
    instanceId: string,
    sessionKey: string,
    onEvent?: SubagentEventListener,
  ): void {
    logger.warn(`[SubagentRunner] Instance ${instanceId} timed out`);
    this.cancel(instanceId);
    onEvent?.({
      type: 'error',
      instanceId,
      error: 'Execution timeout',
    });
    this.activeInstances.delete(instanceId);
  }

  /**
   * 取消子代理执行
   */
  cancel(instanceId: string): boolean {
    const handle = this.activeInstances.get(instanceId);
    if (handle) {
      clearTimeout(handle);
      this.activeInstances.delete(instanceId);
    }
    return this.registry.cancel(instanceId);
  }

  /**
   * 获取子代理隔离上下文
   */
  getIsolationContext(instanceId: string): SubagentIsolationContext | undefined {
    return this.isolationContexts.get(instanceId);
  }

  /**
   * 绑定 MCP 工具到子代理实例。
   *
   * 调用后，这些 MCP 工具将对该实例可见（可合并到 LLM 的 tools 列表）。
   * 通常在 execute 内根据定义的 mcpServers 自动调用，也可外部手动绑定。
   *
   * @param instanceId - 子代理实例 ID
   * @param mcpTools - 要绑定的 MCP 工具列表
   */
  bindMcpTools(instanceId: string, mcpTools: ToolDefinition[]): void {
    if (mcpTools.length === 0) {
      this.instanceMcpTools.delete(instanceId);
      return;
    }
    this.instanceMcpTools.set(instanceId, [...mcpTools]);
  }

  /**
   * 获取实例已绑定的 MCP 工具列表。
   *
   * @param instanceId - 子代理实例 ID
   * @returns 绑定的 MCP 工具列表（未绑定时返回空数组）
   */
  getInstanceMcpTools(instanceId: string): ToolDefinition[] {
    return this.instanceMcpTools.get(instanceId) ?? [];
  }

  /**
   * 发送消息到子代理
   */
  sendMessage(message: Omit<SubagentMessage, 'timestamp' | 'messageId'>): void {
    const fullMessage: SubagentMessage = {
      ...message,
      timestamp: Date.now(),
      messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };
    this.messageChannel.sendMessage(fullMessage);
  }

  /**
   * 获取待处理消息
   */
  consumeMessages(sessionKey: string): SubagentMessage[] {
    return this.messageChannel.consumeMessages(sessionKey);
  }

  /**
   * 获取运行中的实例数
   */
  getActiveCount(): number {
    return this.activeInstances.size;
  }

  /**
   * 清理所有资源
   */
  shutdown(): void {
    for (const [instanceId, handle] of this.activeInstances) {
      clearTimeout(handle);
      this.cancel(instanceId);
    }
    this.activeInstances.clear();
    this.isolationContexts.clear();
    this.instanceMcpTools.clear();
  }
}

// ===================== 单例实例 =====================

let subagentRunnerInstance: SubagentRunner | null = null;

/**
 * 获取 SubagentRunner 单例
 */
export function getSubagentRunner(): SubagentRunner {
  if (!subagentRunnerInstance) {
    subagentRunnerInstance = new SubagentRunner();
  }
  return subagentRunnerInstance;
}

/**
 * 快速执行子代理任务
 */
export async function executeSubagent(
  config: Omit<SubagentConfig, 'waitForCompletion' | 'onEvent'>,
): Promise<SubagentExecutionResult> {
  const runner = getSubagentRunner();
  return runner.execute({
    ...config,
    waitForCompletion: true,
  });
}
