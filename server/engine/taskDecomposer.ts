/**
 * TaskDecomposer — 任务拆分器
 *
 * v8.0: 多 Agent 架构组件
 * - 评估任务复杂度，决定是否需要拆分
 * - 调用 LLM 将复杂任务拆分为子任务 DAG
 * - 识别可并行执行的子任务（无依赖关系）
 * - 输出 TaskDecomposition 结构供 Orchestrator 调度
 */

import { callAIModel } from '../aiClient.js';
import type { ModelCallConfig, MessageContent } from '../aiClient.js';
import type { TaskDecomposition, SubTask, SubTaskPriority } from '../../shared/types/agent.js';

// ===================== 常量 =====================

/** 拆分触发关键词模式 */
const DECOMPOSE_TRIGGER_PATTERNS: RegExp[] = [
  /同时.*并/,
  /先.*再.*然后/,
  /分别.*各/,
  /对比.*和/,
  /分析.*并.*总结/,
  /查询.*和.*分析/,
];

/** 最大子任务数 */
const MAX_SUBTASKS = 6;

/** 最小子任务数（低于此数不拆分） */
const MIN_SUBTASKS = 2;

// ===================== 类型定义 =====================

/** 拆分评估结果 */
export interface DecomposeAssessment {
  /** 是否应拆分 */
  shouldDecompose: boolean;
  /** 评估原因 */
  reason: string;
  /** 估计子任务数 */
  estimatedSubTasks: number;
}

/** LLM 返回的原始子任务结构 */
interface RawSubTask {
  description: string;
  prompt: string;
  dependsOn: number[];
  priority: SubTaskPriority;
  requiredRole: string;
}

// ===================== TaskDecomposer =====================

/**
 * 任务拆分器
 *
 * 核心流程：
 * 1. assessComplexity: 纯规则评估是否需要拆分
 * 2. decompose: 调用 LLM 生成子任务 DAG
 * 3. validateDAG: 验证无循环依赖
 * 4. detectParallelism: 检测可并行执行的子任务组
 */
export class TaskDecomposer {
  private maxSubTasks: number;

  constructor(maxSubTasks?: number) {
    this.maxSubTasks = maxSubTasks ?? MAX_SUBTASKS;
  }

  // ===================== 复杂度评估 =====================

  /**
   * 评估任务是否需要拆分
   * 纯规则引擎，不调用 LLM
   */
  assessComplexity(userMessage: string): DecomposeAssessment {
    // 规则 1：多步骤意图关键词
    for (const pattern of DECOMPOSE_TRIGGER_PATTERNS) {
      if (pattern.test(userMessage)) {
        const separators = userMessage.match(/并|同时|然后|接着|分别/g);
        const estimated = Math.min((separators?.length ?? 0) + 1, this.maxSubTasks);
        return {
          shouldDecompose: estimated >= MIN_SUBTASKS,
          reason: `检测到多步骤/并行意图，匹配模式: ${pattern.source}`,
          estimatedSubTasks: estimated,
        };
      }
    }

    // 规则 2：消息长度（>200 字符的中文消息可能包含复杂任务）
    if (userMessage.length > 200) {
      return {
        shouldDecompose: true,
        reason: '任务描述较长（>200字符），可能包含多个子任务',
        estimatedSubTasks: 3,
      };
    }

    // 规则 3：包含多个独立任务编号（1. 2. 3.）
    const numberedTasks = userMessage.match(/\d+[.)、]\s/g);
    if (numberedTasks && numberedTasks.length >= MIN_SUBTASKS) {
      return {
        shouldDecompose: true,
        reason: `检测到 ${numberedTasks.length} 个编号子任务`,
        estimatedSubTasks: Math.min(numberedTasks.length, this.maxSubTasks),
      };
    }

    // 不拆分
    return {
      shouldDecompose: false,
      reason: '任务复杂度不足，无需拆分',
      estimatedSubTasks: 1,
    };
  }

  // ===================== 任务拆分 =====================

  /**
   * 调用 LLM 拆分任务为子任务 DAG
   *
   * @param modelConfig - 模型配置
   * @param userMessage - 用户原始消息
   * @param sessionId - 会话 ID
   * @param signal - 取消信号
   * @returns 拆分结果，失败返回 null
   */
  async decompose(
    modelConfig: ModelCallConfig,
    userMessage: string,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<TaskDecomposition | null> {
    const decompositionId = `decomp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    // 构造 LLM prompt
    const systemPrompt = `你是一个任务拆分专家。将用户的复杂任务拆分为独立的子任务。

规则：
1. 每个子任务必须是可以独立执行的
2. 标注子任务之间的依赖关系（dependsOn 使用 0-based 索引）
3. 无依赖的子任务将并行执行
4. 最多 ${this.maxSubTasks} 个子任务
5. 为每个子任务指定优先级：critical / high / medium / low
6. 为每个子任务指定适合的 Agent 角色：researcher / coder / analyst

输出 JSON 数组，格式如下：
[
  {
    "description": "子任务简述",
    "prompt": "传给子 Agent 的完整执行指令",
    "dependsOn": [0],
    "priority": "high",
    "requiredRole": "researcher"
  }
]

只输出 JSON，不要其他文字。`;

    const messages: Array<{ role: string; content: MessageContent }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    let rawResponse: string;
    try {
      rawResponse = await callAIModel(
        { ...modelConfig, temperature: 0.3 },
        messages,
        signal,
      );
    } catch (err) {
      console.error('[TaskDecomposer] LLM 调用失败:', err instanceof Error ? err.message : String(err));
      return null;
    }

    // 解析 JSON
    let rawSubTasks: RawSubTask[];
    try {
      // 提取 JSON 数组（兼容 markdown 包裹）
      const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error('[TaskDecomposer] 响应中未找到 JSON 数组');
        return null;
      }
      rawSubTasks = JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.error('[TaskDecomposer] JSON 解析失败:', err);
      return null;
    }

    // 验证和构建子任务
    if (!Array.isArray(rawSubTasks) || rawSubTasks.length < MIN_SUBTASKS) {
      console.log(`[TaskDecomposer] 子任务数 ${rawSubTasks?.length ?? 0} < ${MIN_SUBTASKS}，不拆分`);
      return null;
    }

    if (rawSubTasks.length > this.maxSubTasks) {
      rawSubTasks = rawSubTasks.slice(0, this.maxSubTasks);
    }

    // 构建 SubTask 对象
    const subTasks: SubTask[] = rawSubTasks.map((raw, idx) => ({
      id: `${decompositionId}_task_${idx}`,
      decompositionId,
      description: raw.description || `子任务 ${idx + 1}`,
      prompt: raw.prompt || raw.description || `执行子任务 ${idx + 1}`,
      assignedAgentId: null,
      dependsOn: (raw.dependsOn || []).map(d => `${decompositionId}_task_${d}`),
      priority: (['critical', 'high', 'medium', 'low'].includes(raw.priority) ? raw.priority : 'medium') as SubTaskPriority,
      status: 'pending',
      result: null,
      error: null,
      createdAt: now,
      startedAt: null,
      completedAt: null,
    }));

    // 验证 DAG 无循环
    if (this.hasCycle(subTasks)) {
      console.error('[TaskDecomposer] 检测到循环依赖，拆分失败');
      return null;
    }

    // 检测并行性
    const hasParallelism = this.detectParallelism(subTasks);

    return {
      id: decompositionId,
      originalTask: userMessage,
      sessionId,
      subTasks,
      hasParallelism,
      estimatedSteps: subTasks.length,
      createdAt: now,
      completedAt: null,
      status: 'planning',
    };
  }

  // ===================== DAG 工具 =====================

  /**
   * 检测子任务图中是否有循环依赖
   */
  private hasCycle(subTasks: SubTask[]): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (taskId: string): boolean => {
      visited.add(taskId);
      recursionStack.add(taskId);

      const task = subTasks.find(t => t.id === taskId);
      if (!task) return false;

      for (const depId of task.dependsOn) {
        if (!visited.has(depId)) {
          if (dfs(depId)) return true;
        } else if (recursionStack.has(depId)) {
          return true; // 发现环
        }
      }

      recursionStack.delete(taskId);
      return false;
    };

    for (const task of subTasks) {
      if (!visited.has(task.id)) {
        if (dfs(task.id)) return true;
      }
    }
    return false;
  }

  /**
   * 检测是否存在可并行执行的子任务
   */
  private detectParallelism(subTasks: SubTask[]): boolean {
    // 存在任意两个子任务互不依赖 → 可并行
    for (let i = 0; i < subTasks.length; i++) {
      for (let j = i + 1; j < subTasks.length; j++) {
        const a = subTasks[i];
        const b = subTasks[j];
        // a 不依赖 b 且 b 不依赖 a → 可并行
        if (!a.dependsOn.includes(b.id) && !b.dependsOn.includes(a.id)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 拓扑排序：返回可并行执行的层级
   * 每层内的子任务无互相依赖，可并行执行
   */
  getParallelLayers(subTasks: SubTask[]): SubTask[][] {
    const layers: SubTask[][] = [];
    const completed = new Set<string>();
    const remaining = [...subTasks];

    while (remaining.length > 0) {
      // 找出所有依赖已完成的子任务
      const currentLayer = remaining.filter(task =>
        task.dependsOn.every(depId => completed.has(depId)),
      );

      if (currentLayer.length === 0) {
        // 死锁：所有剩余任务都有未满足的依赖（不应该发生，已通过 hasCycle 检查）
        console.error('[TaskDecomposer] 拓扑排序死锁，剩余:', remaining.map(t => t.id));
        break;
      }

      layers.push(currentLayer);

      // 标记当前层为已完成
      for (const task of currentLayer) {
        completed.add(task.id);
        const idx = remaining.indexOf(task);
        if (idx >= 0) remaining.splice(idx, 1);
      }
    }

    return layers;
  }
}
