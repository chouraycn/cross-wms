/**
 * Skill Runtime — 技能运行时（底层运行时封装层）
 *
 * 基于现有 Skill 架构的运行时封装，提供技能的注册、调用和上下文管理。
 *
 * 功能：
 * 1. SkillRuntime 接口 - 技能运行时定义
 * 2. 技能注册和调用
 * 3. 技能上下文管理
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ 在技能系统中的层次定位（避免与两个 bridge 混淆）                           │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ 层次（自底向上）：                                                         │
 * │   skillRegistry（注册表/数据）                                             │
 * │     └─ skillRuntime（本文件：register / invoke / context 的运行时封装）    │
 * │          ├─ skillRuntimeBridge → 单一 `skill` 元工具（SKILL.md 文档技能）  │
 * │          └─ skillToolBridge    → 逐技能 `skill_<id>` 函数工具（可执行技能）│
 * │                                                                           │
 * │ 说明：本文件是「运行时抽象」，不直接面向 Agent 暴露工具。当前非测试代码未   │
 * │ 直接 import 本模块（Agent 侧统一经两个 bridge 接入），保留作为技能调用的    │
 * │ 底层统一封装点；如需在 bridge 之外程序化调用技能，应经由此层而非绕过。      │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import { skillRegistry } from './skillRegistry.js';
import { createSkillContext, type SkillContextOptions } from './skillContextFactory.js';
import { logger } from '../logger.js';
import type {
  SkillDefinition,
  SkillContext,
  SkillHandler,
  SkillLifecycle,
  SkillResult,
  SkillState,
  RegisteredSkill,
  SkillPermissionConfig,
} from '../types/skill-runtime.js';

// ===================== 类型定义 =====================

/**
 * 技能运行时状态
 */
export interface SkillRuntimeState {
  skillId: string;
  state: SkillState;
  registeredAt: number;
  lastExecutedAt?: number;
  executionCount: number;
}

/**
 * 技能调用选项
 */
export interface SkillInvokeOptions {
  /** 会话 ID */
  sessionId: string;
  /** Agent ID（可选） */
  agentId?: string;
  /** 工作区根目录 */
  workspace: string;
  /** 沙箱范围 */
  sandboxScope?: 'workspace' | 'user' | 'system' | 'none';
  /** 网络白名单 */
  networkWhitelist?: string[];
  /** 命令白名单 */
  commandWhitelist?: string[];
  /** 权限配置 */
  permissionConfig?: SkillPermissionConfig;
}

/**
 * 技能调用结果
 */
export interface SkillInvokeResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata: {
    skillId: string;
    durationMs: number;
    state: SkillState;
  };
}

/**
 * 技能运行时接口
 */
export interface SkillRuntime {
  /**
   * 调用技能
   *
   * @param skillId - 技能 ID
   * @param params - 调用参数
   * @param options - 调用选项
   * @returns 调用结果
   */
  invoke(
    skillId: string,
    params: Record<string, unknown>,
    options: SkillInvokeOptions,
  ): Promise<SkillInvokeResult>;

  /**
   * 批量调用技能
   *
   * @param calls - 技能调用列表
   * @param options - 调用选项
   * @returns 调用结果列表
   */
  invokeBatch(
    calls: Array<{ skillId: string; params: Record<string, unknown> }>,
    options: SkillInvokeOptions,
  ): Promise<SkillInvokeResult[]>;

  /**
   * 获取技能运行时状态
   *
   * @param skillId - 技能 ID
   * @returns 运行时状态
   */
  getState(skillId: string): SkillRuntimeState | undefined;

  /**
   * 列出所有技能状态
   */
  listStates(): SkillRuntimeState[];

  /**
   * 验证技能是否可执行
   *
   * @param skillId - 技能 ID
   * @param options - 调用选项
   * @returns 是否可执行及错误信息
   */
  validateInvocation(
    skillId: string,
    options: SkillInvokeOptions,
  ): { valid: boolean; error?: string };

  /**
   * 获取技能定义
   *
   * @param skillId - 技能 ID
   * @returns 技能定义
   */
  getDefinition(skillId: string): SkillDefinition | undefined;

  /**
   * 列出所有可用技能
   */
  listSkills(): SkillDefinition[];
}

// ===================== 技能调用上下文 =====================

/**
 * 技能调用跟踪
 */
interface SkillInvocation {
  id: string;
  skillId: string;
  sessionId: string;
  startedAt: number;
  params: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: SkillInvokeResult;
}

// ===================== 技能运行时实现 =====================

/**
 * 技能运行时实现类
 */
class SkillRuntimeImpl implements SkillRuntime {
  private readonly activeCalls = new Map<string, SkillInvocation>();
  private readonly callListeners = new Map<string, Set<(invocation: SkillInvocation) => void>>();

  /**
   * 调用技能
   */
  async invoke(
    skillId: string,
    params: Record<string, unknown>,
    options: SkillInvokeOptions,
  ): Promise<SkillInvokeResult> {
    const startTime = Date.now();
    const invocationId = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 创建调用记录
    const invocation: SkillInvocation = {
      id: invocationId,
      skillId,
      sessionId: options.sessionId,
      startedAt: startTime,
      params,
      status: 'pending',
    };
    this.activeCalls.set(invocationId, invocation);
    this.notifyListeners(invocation);

    try {
      // 验证调用
      const validation = this.validateInvocation(skillId, options);
      if (!validation.valid) {
        const result: SkillInvokeResult = {
          success: false,
          error: validation.error,
          metadata: {
            skillId,
            durationMs: Date.now() - startTime,
            state: 'disabled',
          },
        };
        invocation.status = 'failed';
        invocation.result = result;
        this.notifyListeners(invocation);
        return result;
      }

      // 获取技能
      const registeredSkill = skillRegistry.getSkill(skillId);
      if (!registeredSkill) {
        const result: SkillInvokeResult = {
          success: false,
          error: `技能未注册: ${skillId}`,
          metadata: {
            skillId,
            durationMs: Date.now() - startTime,
            state: 'unregistered',
          },
        };
        invocation.status = 'failed';
        invocation.result = result;
        this.notifyListeners(invocation);
        return result;
      }

      // 更新状态
      invocation.status = 'running';
      this.notifyListeners(invocation);

      // 创建技能上下文
      const contextOptions: SkillContextOptions = {
        skillId,
        sessionId: options.sessionId,
        agentId: options.agentId,
        workspace: options.workspace,
        sandboxScope: options.sandboxScope ?? 'workspace',
        networkWhitelist: options.networkWhitelist,
        commandWhitelist: options.commandWhitelist,
      };
      const ctx = createSkillContext(contextOptions);

      // 执行技能
      let skillResult: SkillResult;
      try {
        skillResult = await this.executeSkill(registeredSkill, params, ctx);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        skillResult = {
          success: false,
          error: errorMessage,
          metadata: { durationMs: Date.now() - startTime },
        };
      }

      // 构建结果
      const result: SkillInvokeResult = {
        success: skillResult.success,
        data: skillResult.data,
        error: skillResult.error,
        metadata: {
          skillId,
          durationMs: skillResult.metadata?.durationMs ?? Date.now() - startTime,
          state: 'idle',
        },
      };

      invocation.status = skillResult.success ? 'completed' : 'failed';
      invocation.result = result;
      this.notifyListeners(invocation);

      return result;
    } finally {
      // 延迟清理活动调用记录
      setTimeout(() => {
        this.activeCalls.delete(invocationId);
      }, 60000);
    }
  }

  /**
   * 执行技能（含生命周期钩子）
   */
  private async executeSkill(
    skill: RegisteredSkill,
    params: Record<string, unknown>,
    ctx: SkillContext,
  ): Promise<SkillResult> {
    const startTime = Date.now();
    const lifecycle = skill.lifecycle;

    try {
      // 调用 beforeExecute 钩子
      let processedParams = params;
      if (lifecycle.beforeExecute) {
        const modifiedParams = await lifecycle.beforeExecute(params, ctx);
        if (modifiedParams === null) {
          return {
            success: false,
            error: 'beforeExecute hook returned null, skipping execution',
            metadata: { durationMs: Date.now() - startTime },
          };
        }
        processedParams = modifiedParams;
      }

      // 执行核心逻辑
      let result: SkillResult;
      if (lifecycle.execute) {
        result = await lifecycle.execute(processedParams, ctx);
      } else {
        result = {
          success: false,
          error: 'No execute handler defined',
          metadata: { durationMs: Date.now() - startTime },
        };
      }

      // 调用 afterExecute 钩子
      if (lifecycle.afterExecute) {
        result = await lifecycle.afterExecute(result, processedParams, ctx);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        metadata: { durationMs: Date.now() - startTime },
      };
    }
  }

  /**
   * 批量调用技能
   */
  async invokeBatch(
    calls: Array<{ skillId: string; params: Record<string, unknown> }>,
    options: SkillInvokeOptions,
  ): Promise<SkillInvokeResult[]> {
    // 顺序执行（可优化为并行）
    const results: SkillInvokeResult[] = [];
    for (const call of calls) {
      const result = await this.invoke(call.skillId, call.params, options);
      results.push(result);
    }
    return results;
  }

  /**
   * 获取技能运行时状态
   */
  getState(skillId: string): SkillRuntimeState | undefined {
    const skill = skillRegistry.getSkill(skillId);
    if (!skill) return undefined;

    return {
      skillId,
      state: skill.state,
      registeredAt: skill.registeredAt,
      lastExecutedAt: skill.lastExecutedAt,
      executionCount: skill.executionCount,
    };
  }

  /**
   * 列出所有技能状态
   */
  listStates(): SkillRuntimeState[] {
    const skills = skillRegistry.getAllSkills();
    return skills.map((skill) => ({
      skillId: skill.definition.id,
      state: skill.state,
      registeredAt: skill.registeredAt,
      lastExecutedAt: skill.lastExecutedAt,
      executionCount: skill.executionCount,
    }));
  }

  /**
   * 验证技能调用
   */
  validateInvocation(
    skillId: string,
    options: SkillInvokeOptions,
  ): { valid: boolean; error?: string } {
    // 检查技能是否存在
    const skill = skillRegistry.getSkill(skillId);
    if (!skill) {
      return { valid: false, error: `技能未注册: ${skillId}` };
    }

    // 检查技能状态
    if (skill.state === 'disabled') {
      return { valid: false, error: `技能已禁用: ${skillId}` };
    }

    if (skill.state === 'cleaned') {
      return { valid: false, error: `技能已清理: ${skillId}` };
    }

    // 检查权限配置
    if (options.permissionConfig) {
      const { allow, deny } = options.permissionConfig;

      // 检查是否在拒绝列表中
      if (deny.includes(skillId) || deny.includes('*')) {
        return { valid: false, error: `技能被拒绝: ${skillId}` };
      }

      // 检查是否在允许列表中
      if (allow.length > 0 && !allow.includes(skillId) && !allow.includes('*')) {
        return { valid: false, error: `技能不在允许列表中: ${skillId}` };
      }
    }

    return { valid: true };
  }

  /**
   * 获取技能定义
   */
  getDefinition(skillId: string): SkillDefinition | undefined {
    const skill = skillRegistry.getSkill(skillId);
    return skill?.definition;
  }

  /**
   * 列出所有可用技能
   */
  listSkills(): SkillDefinition[] {
    return skillRegistry.getAllSkills().map((skill) => skill.definition);
  }

  /**
   * 注册调用监听器
   */
  onInvocation(listener: (invocation: SkillInvocation) => void): () => void {
    let listeners = this.callListeners.get('global');
    if (!listeners) {
      listeners = new Set();
      this.callListeners.set('global', listeners);
    }
    listeners.add(listener);
    return () => listeners?.delete(listener);
  }

  /**
   * 通知监听器
   */
  private notifyListeners(invocation: SkillInvocation): void {
    const listeners = this.callListeners.get('global');
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(invocation);
        } catch (e) {
          logger.error('[SkillRuntime] Listener error:', e);
        }
      }
    }
  }

  /**
   * 获取活动调用数
   */
  getActiveCallCount(): number {
    let count = 0;
    for (const call of this.activeCalls.values()) {
      if (call.status === 'pending' || call.status === 'running') {
        count++;
      }
    }
    return count;
  }

  /**
   * 获取调用历史
   */
  getInvocationHistory(limit = 100): SkillInvocation[] {
    return Array.from(this.activeCalls.values())
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  }
}

// ===================== 单例实例 =====================

let skillRuntimeInstance: SkillRuntimeImpl | null = null;

/**
 * 获取 SkillRuntime 单例
 */
export function getSkillRuntime(): SkillRuntime {
  if (!skillRuntimeInstance) {
    skillRuntimeInstance = new SkillRuntimeImpl();
  }
  return skillRuntimeInstance;
}

/**
 * 快速调用技能
 */
export async function invokeSkill(
  skillId: string,
  params: Record<string, unknown>,
  options: SkillInvokeOptions,
): Promise<SkillInvokeResult> {
  const runtime = getSkillRuntime();
  return runtime.invoke(skillId, params, options);
}

/**
 * 快速批量调用技能
 */
export async function invokeSkillBatch(
  calls: Array<{ skillId: string; params: Record<string, unknown> }>,
  options: SkillInvokeOptions,
): Promise<SkillInvokeResult[]> {
  const runtime = getSkillRuntime();
  return runtime.invokeBatch(calls, options);
}
