/**
 * Planner — 任务规划模块
 *
 * 评估复杂任务并生成结构化执行计划。
 * 核心方法：
 * - assessTrigger: 纯规则引擎，判断是否需要规划
 * - generatePlan: 调用 LLM 生成执行计划
 * - adjustPlan: 基于规则动态调整计划（不调用 LLM）
 * - detectDrift: 检测执行偏离（v5.0 新增）
 * - replan: 重规划（v5.0 新增）
 * - topologicalSort: DAG 拓扑排序（v5.0 新增）
 *
 * v5.0.0: ReAct 循环优化
 */

import { callAIModelStream } from '../aiClient.js';
import type { ModelCallConfig, ToolCall, MessageContent } from '../aiClient.js';
import { getToolDefinitions } from './toolRegistry.js';

// ===================== 类型定义 =====================

/** 计划步骤状态 */
export type PlanStepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

/** 计划步骤 */
export interface PlanStep {
  /** 步骤序号（1-based） */
  step: number;
  /** 步骤描述 */
  description: string;
  /** 推荐使用的工具名（可选） */
  toolName?: string;
  /** 依赖的步骤序号列表 */
  dependsOn: number[];
  /** 步骤状态 */
  status: PlanStepStatus;
}

/** 执行计划 */
export interface ExecutionPlan {
  /** 计划唯一 ID */
  id: string;
  /** 用户意图一句话摘要 */
  intent: string;
  /** 执行步骤列表 */
  steps: PlanStep[];
  /** 是否允许动态重规划 */
  isDynamic: boolean;
  /** 创建时间戳 */
  createdAt: number;
}

/** Planner 触发评估结果 */
export interface PlannerTriggerAssessment {
  /** 是否应触发 Planner */
  shouldTrigger: boolean;
  /** 触发/不触发的原因 */
  reason: string;
  /** 估计步骤数 */
  estimatedSteps: number;
}

/** Planner 配置选项 */
export interface PlannerOptions {
  /** 最大计划步骤数（默认 8） */
  maxPlanSteps?: number;
  /** 最大重试次数（默认 2） */
  maxRetries?: number;
}

/** 偏离检测结果（v5.0 新增） */
export interface DriftDetectionResult {
  /** 是否偏离 */
  hasDrifted: boolean;
  /** 检测原因 */
  reason: string;
  /** 原始意图 */
  originalIntent: string;
  /** 当前执行方向 */
  currentDirection: string;
}

// ===================== 规则引擎关键词 =====================

/** 多步骤意图关键词 */
const MULTI_STEP_PATTERNS: RegExp[] = [
  /先.{1,30}再.{1,30}然后/,
  /之后/,
  /接着/,
  /同时/,
  /第一步/,
  /第二步/,
  /第三步/,
  /第\d+步/,
  /然后.{1,10}再/,
  /先.{1,20}再/,
];

/** 显式规划请求关键词 */
const EXPLICIT_PLAN_PATTERNS: RegExp[] = [
  /帮我规划/,
  /制定计划/,
  /列出步骤/,
  /规划一下/,
  /做个计划/,
  /安排一下/,
  /帮我安排/,
  /分步执行/,
  /按步骤/,
];

/** WMS 业务流程关键词组合 */
const WMS_KEYWORD_GROUPS: string[][] = [
  ['入库', '出库'],
  ['盘点', '调拨'],
  ['入库', '盘点'],
  ['出库', '调拨'],
  ['入库', '调拨'],
  ['出库', '盘点'],
  ['收货', '发货'],
  ['上架', '拣货'],
  ['移库', '盘点'],
  ['补货', '出库'],
];

// ===================== Planner 类 =====================

/**
 * 任务规划器 — 评估复杂任务并生成结构化执行计划。
 *
 * assessTrigger 和 adjustPlan 为纯规则引擎，不消耗 LLM token。
 * generatePlan 调用 LLM，使用 reasoningEffort='low' 节省 token。
 */
export class Planner {
  private maxPlanSteps: number;
  private maxRetries: number;

  constructor(options?: PlannerOptions) {
    this.maxPlanSteps = options?.maxPlanSteps ?? 8;
    this.maxRetries = options?.maxRetries ?? 2;
  }

  /**
   * 评估是否应触发 Planner。
   * 纯规则引擎，不调用 LLM。
   *
   * @param messages - 当前消息上下文
   * @param userMessage - 用户最新消息
   * @returns 触发评估结果
   */
  assessTrigger(
    messages: Array<{ role: string; content: MessageContent }>,
    userMessage: string,
  ): PlannerTriggerAssessment {
    const messageText = typeof userMessage === 'string' ? userMessage : JSON.stringify(userMessage);

    // 规则 1：多步骤意图关键词
    for (const pattern of MULTI_STEP_PATTERNS) {
      if (pattern.test(messageText)) {
        // 粗略估计步骤数：按"再"/"然后"/"接着"等分隔词计数
        const separators = messageText.match(/再|然后|接着|之后|同时/g);
        const estimatedSteps = (separators?.length ?? 0) + 1;
        return {
          shouldTrigger: true,
          reason: `检测到多步骤意图关键词，匹配模式: ${pattern.source}`,
          estimatedSteps: Math.min(estimatedSteps, this.maxPlanSteps),
        };
      }
    }

    // 规则 2：历史 tool_calls 数量 ≥ 3
    const toolCallCount = messages.filter(m => m.role === 'tool').length;
    if (toolCallCount >= 3) {
      return {
        shouldTrigger: true,
        reason: `历史工具调用次数 ${toolCallCount} ≥ 3，任务复杂度较高`,
        estimatedSteps: Math.min(Math.ceil(toolCallCount / 2), this.maxPlanSteps),
      };
    }

    // 规则 3：显式规划请求
    for (const pattern of EXPLICIT_PLAN_PATTERNS) {
      if (pattern.test(messageText)) {
        return {
          shouldTrigger: true,
          reason: `用户显式请求规划，匹配模式: ${pattern.source}`,
          estimatedSteps: 4,
        };
      }
    }

    // 规则 4：WMS 业务流程关键词组合
    for (const group of WMS_KEYWORD_GROUPS) {
      const allPresent = group.every(keyword => messageText.includes(keyword));
      if (allPresent) {
        return {
          shouldTrigger: true,
          reason: `检测到 WMS 业务流程关键词组合: ${group.join(' + ')}`,
          estimatedSteps: group.length + 1,
        };
      }
    }

    // 不触发
    return {
      shouldTrigger: false,
      reason: '未检测到规划触发条件',
      estimatedSteps: 0,
    };
  }

  /**
   * 调用 LLM 生成执行计划。
   * 使用 reasoningEffort='low' 节省 token。
   *
   * @param modelConfig - 模型调用配置
   * @param messages - 当前消息上下文
   * @param signal - 取消信号
   * @param onChunk - 流式文本回调（可选）
   * @returns 执行计划对象，解析失败返回 null
   */
  async generatePlan(
    modelConfig: ModelCallConfig,
    messages: Array<{ role: string; content: MessageContent }>,
    signal?: AbortSignal,
    onChunk?: (text: string) => void,
  ): Promise<ExecutionPlan | null> {
    // 提取用户消息
    const userMessage = this.extractUserMessage(messages);
    if (!userMessage) {
      console.warn('[Planner] 无法提取用户消息，跳过规划');
      return null;
    }

    // 获取可用工具列表，构造工具描述
    const tools = getToolDefinitions();
    const toolDescriptions = tools
      .map(t => `- ${t.function.name}: ${t.function.description}`)
      .join('\n');

    // 构造 Planner system prompt
    const systemPrompt = this.buildSystemPrompt(toolDescriptions, userMessage);

    // 构造 Planner 请求消息
    const plannerMessages: Array<{ role: string; content: MessageContent }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    // 调用 LLM（使用 reasoningEffort='low' 节省 token）
    let rawContent = '';
    try {
      const response = await callAIModelStream(
        modelConfig,
        plannerMessages,
        (text: string) => {
          rawContent += text;
          if (onChunk) onChunk(text);
        },
        signal,
        undefined,          // onThinking
        undefined,          // tools（Planner 不使用工具）
        undefined,          // onToolCall
        'low',              // reasoningEffort: low 节省 token
        modelConfig.capabilities,
      );

      // 使用完整响应内容
      rawContent = response.content || rawContent;
    } catch (error) {
      console.error('[Planner] LLM 调用失败:', error instanceof Error ? error.message : String(error));
      return null;
    }

    // 解析 AI 响应为 ExecutionPlan
    return this.parsePlanResponse(rawContent);
  }

  /**
   * 基于规则动态调整计划（不调用 LLM）。
   * 当步骤失败且 isDynamic == true 时调用。
   *
   * @param plan - 当前执行计划
   * @param observation - 观察结果（失败信息等）
   * @returns 调整后的执行计划
   */
  adjustPlan(
    plan: ExecutionPlan,
    observation: { failedStepIndex: number; error: string; toolName?: string },
  ): ExecutionPlan {
    const { failedStepIndex, error, toolName } = observation;
    const adjustedPlan = this.clonePlan(plan);

    // 找到失败的步骤
    const failedStep = adjustedPlan.steps.find(s => s.step === failedStepIndex + 1);
    if (!failedStep) {
      console.warn(`[Planner] adjustPlan: 找不到步骤 ${failedStepIndex + 1}`);
      return adjustedPlan;
    }

    // 标记失败步骤
    failedStep.status = 'failed';

    // 规则 1：SQL 失败 → 插入"查询 schema"步骤
    if (this.isSqlError(error)) {
      const insertStep: PlanStep = {
        step: 0, // 临时值，后续重新编号
        description: `查询数据库 schema 以了解表结构，然后重试: ${failedStep.description}`,
        toolName: 'db_query',
        dependsOn: failedStep.dependsOn,
        status: 'pending',
      };
      this.insertStepAfter(adjustedPlan, failedStepIndex, insertStep);
      console.log(`[Planner] adjustPlan: SQL 失败，插入 schema 查询步骤`);
    }

    // 规则 2：文件不存在 → 插入"列出目录"步骤
    if (this.isFileNotFoundError(error)) {
      const insertStep: PlanStep = {
        step: 0,
        description: `列出目录内容以确认文件路径，然后重试: ${failedStep.description}`,
        toolName: 'file_listDir',
        dependsOn: failedStep.dependsOn,
        status: 'pending',
      };
      this.insertStepAfter(adjustedPlan, failedStepIndex, insertStep);
      console.log(`[Planner] adjustPlan: 文件不存在，插入目录列表步骤`);
    }

    // 规则 3：网络超时 → 标记当前步骤为可重试
    if (this.isNetworkTimeoutError(error)) {
      // 添加一个重试步骤
      const retryStep: PlanStep = {
        step: 0,
        description: `重试: ${failedStep.description}`,
        toolName: toolName || failedStep.toolName,
        dependsOn: failedStep.dependsOn,
        status: 'pending',
      };
      this.insertStepAfter(adjustedPlan, failedStepIndex, retryStep);
      console.log(`[Planner] adjustPlan: 网络超时，插入重试步骤`);
    }

    return adjustedPlan;
  }

  /**
   * 检测执行偏离（v5.0 新增）。
   * 比较当前执行方向与原始意图的相似度。
   *
   * @param messages - 当前消息上下文
   * @param plan - 当前执行计划（可选）
   * @returns 偏离检测结果
   */
  detectDrift(
    messages: Array<{ role: string; content: MessageContent }>,
    plan?: ExecutionPlan,
  ): DriftDetectionResult {
    if (!plan) {
      return {
        hasDrifted: false,
        reason: '无执行计划',
        originalIntent: '',
        currentDirection: '',
      };
    }

    // 提取最近 3 轮工具调用方向
    const recentTools = messages.filter(m => m.role === 'tool').slice(-3);
    const currentDirection = recentTools
      .map(m => (typeof m.content === 'string' ? m.content.slice(0, 100) : ''))
      .join(' ');

    // 与 plan.intent 比较（简单字符串匹配）
    const intentKeywords = plan.intent.split(/\s+/).filter(w => w.length > 1);
    const matchCount = intentKeywords.filter(w => currentDirection.includes(w)).length;
    const similarity = intentKeywords.length > 0 ? matchCount / intentKeywords.length : 0;

    if (similarity < 0.3) {
      return {
        hasDrifted: true,
        reason: `执行方向偏离原意图（相似度: ${similarity.toFixed(2)}）`,
        originalIntent: plan.intent,
        currentDirection: currentDirection.slice(0, 200),
      };
    }

    return {
      hasDrifted: false,
      reason: '执行方向与意图一致',
      originalIntent: plan.intent,
      currentDirection: currentDirection.slice(0, 200),
    };
  }

  /**
   * 重规划（v5.0 新增）。
   * 当死循环检测或偏离检测触发时，调用 LLM 重新生成执行计划。
   *
   * @param modelConfig - 模型调用配置
   * @param messages - 当前消息上下文
   * @param oldPlan - 旧执行计划
   * @param reason - 重规划原因
   * @param signal - 取消信号
   * @returns 新执行计划，失败返回 null
   */
  async replan(
    modelConfig: ModelCallConfig,
    messages: Array<{ role: string; content: MessageContent }>,
    oldPlan: ExecutionPlan,
    reason: string,
    signal?: AbortSignal,
  ): Promise<ExecutionPlan | null> {
    // 构造重规划 system prompt（含旧计划和失败原因）
    const systemPrompt = `任务需要重新规划。原计划意图: ${oldPlan.intent}\n重规划原因: ${reason}\n请生成新的执行计划。`;

    const userMessage = this.extractUserMessage(messages);
    if (!userMessage) {
      return null;
    }

    const tools = getToolDefinitions();
    const toolDescriptions = tools
      .map(t => `- ${t.function.name}: ${t.function.description}`)
      .join('\n');

    const replanMessages: Array<{ role: string; content: MessageContent }> = [
      { role: 'system', content: systemPrompt + '\n\n可用工具:\n' + toolDescriptions },
      { role: 'user', content: userMessage },
    ];

    // 调用 LLM
    let rawContent = '';
    try {
      const response = await callAIModelStream(
        modelConfig,
        replanMessages,
        (text: string) => {
          rawContent += text;
        },
        signal,
        undefined,
        undefined,
        undefined,
        'low',
        modelConfig.capabilities,
      );
      rawContent = response.content || rawContent;
      return this.parsePlanResponse(rawContent);
    } catch (err) {
      console.error('[Planner] replan 失败:', err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  /**
   * DAG 拓扑排序（v5.0 新增）。
   * 使用 Kahn 算法对计划步骤按依赖关系排序。
   *
   * @param steps - 计划步骤列表
   * @returns 拓扑排序后的步骤列表，有环时返回原顺序
   */
  topologicalSort(steps: PlanStep[]): PlanStep[] {
    if (steps.length === 0) {
      return [];
    }

    const sorted: PlanStep[] = [];
    const inDegree = new Map<number, number>();
    const adj = new Map<number, number[]>();

    for (const step of steps) {
      inDegree.set(step.step, 0);
      adj.set(step.step, []);
    }

    for (const step of steps) {
      for (const dep of step.dependsOn) {
        adj.get(dep)?.push(step.step);
        inDegree.set(step.step, (inDegree.get(step.step) || 0) + 1);
      }
    }

    const queue: number[] = [];
    for (const [step, degree] of inDegree) {
      if (degree === 0) queue.push(step);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      const step = steps.find(s => s.step === current);
      if (step) sorted.push(step);

      for (const neighbor of adj.get(current) || []) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    // 有环时返回原顺序
    return sorted.length === steps.length ? sorted : steps;
  }

  // ===================== 私有方法 =====================

  /**
   * 从消息列表中提取最后一条用户消息。
   */
  private extractUserMessage(
    messages: Array<{ role: string; content: MessageContent }>,
  ): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        const content = messages[i].content;
        return typeof content === 'string' ? content : JSON.stringify(content);
      }
    }
    return null;
  }

  /**
   * 构建 Planner system prompt。
   */
  private buildSystemPrompt(toolDescriptions: string, userMessage: string): string {
    return `你是一个任务规划助手。根据用户请求，生成结构化执行计划。

输出严格的 JSON 格式（不要 markdown 代码块）：
{
  "intent": "用户意图一句话摘要",
  "steps": [
    {
      "step": 1,
      "description": "步骤描述",
      "toolName": "推荐使用的工具名（可选）",
      "dependsOn": []
    }
  ],
  "isDynamic": true
}

可用工具列表：
${toolDescriptions}

用户请求：${userMessage}`;
  }

  /**
   * 解析 AI 响应为 ExecutionPlan 对象。
   * 解析失败返回 null。
   */
  private parsePlanResponse(rawContent: string): ExecutionPlan | null {
    try {
      // 尝试提取 JSON（可能包裹在 markdown 代码块中）
      let jsonStr = rawContent.trim();

      // 去除可能的 markdown 代码块包裹
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }

      // 尝试找到 JSON 对象的起止位置
      const jsonStart = jsonStr.indexOf('{');
      const jsonEnd = jsonStr.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
        console.warn('[Planner] 响应中未找到有效 JSON');
        return null;
      }

      jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1);

      const parsed = JSON.parse(jsonStr);

      // 验证必要字段
      if (!parsed.intent || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
        console.warn('[Planner] 解析结果缺少必要字段 (intent/steps)');
        return null;
      }

      // 验证步骤字段
      for (const step of parsed.steps) {
        if (typeof step.step !== 'number' || !step.description) {
          console.warn('[Planner] 步骤缺少必要字段 (step/description)');
          return null;
        }
      }

      // 限制步骤数
      const limitedSteps = parsed.steps.slice(0, this.maxPlanSteps);

      // 构造 ExecutionPlan
      const plan: ExecutionPlan = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        intent: String(parsed.intent),
        steps: limitedSteps.map((s: Record<string, unknown>, index: number) => ({
          step: index + 1,
          description: String(s.description),
          toolName: s.toolName ? String(s.toolName) : undefined,
          dependsOn: Array.isArray(s.dependsOn) ? (s.dependsOn as number[]) : [],
          status: 'pending' as PlanStepStatus,
        })),
        isDynamic: parsed.isDynamic !== false,
        createdAt: Date.now(),
      };

      return plan;
    } catch (parseErr) {
      console.error('[Planner] JSON 解析失败:', parseErr instanceof Error ? parseErr.message : String(parseErr));
      console.error('[Planner] 原始响应:', rawContent.slice(0, 500));
      return null;
    }
  }

  /**
   * 深拷贝执行计划。
   */
  private clonePlan(plan: ExecutionPlan): ExecutionPlan {
    return {
      id: plan.id,
      intent: plan.intent,
      steps: plan.steps.map(s => ({ ...s })),
      isDynamic: plan.isDynamic,
      createdAt: plan.createdAt,
    };
  }

  /**
   * 在指定步骤之后插入新步骤，并重新编号。
   */
  private insertStepAfter(plan: ExecutionPlan, afterStepIndex: number, newStep: PlanStep): void {
    const insertPosition = afterStepIndex + 1;
    plan.steps.splice(insertPosition, 0, newStep);

    // 重新编号所有步骤
    for (let i = 0; i < plan.steps.length; i++) {
      plan.steps[i].step = i + 1;
    }

    // 更新 dependsOn 引用（由于插入导致步骤号偏移）
    for (const step of plan.steps) {
      step.dependsOn = step.dependsOn
        .map((dep: number) => dep > afterStepIndex + 1 ? dep + 1 : dep)
        .filter((dep: number, idx: number, arr: number[]) => arr.indexOf(dep) === idx);
    }
  }

  /**
   * 判断是否为 SQL 错误。
   */
  private isSqlError(error: string): boolean {
    const sqlErrorPatterns = [
      /syntax error/i,
      /no such table/i,
      /no such column/i,
      /SQLITE_ERROR/i,
      /sql error/i,
      /invalid sql/i,
      /column not found/i,
      /table not found/i,
      /unknown column/i,
    ];
    return sqlErrorPatterns.some(p => p.test(error));
  }

  /**
   * 判断是否为文件不存在错误。
   */
  private isFileNotFoundError(error: string): boolean {
    const fileNotFoundPatterns = [
      /ENOENT/i,
      /no such file/i,
      /file not found/i,
      /不存在/i,
      /not found/i,
      /无法找到/i,
    ];
    return fileNotFoundPatterns.some(p => p.test(error));
  }

  /**
   * 判断是否为网络超时错误。
   */
  private isNetworkTimeoutError(error: string): boolean {
    const timeoutPatterns = [
      /timeout/i,
      /ETIMEDOUT/i,
      /ECONNRESET/i,
      /超时/i,
      /连接超时/i,
      /请求超时/i,
    ];
    return timeoutPatterns.some(p => p.test(error));
  }
}

// ===================== P2 接口预留 =====================
// - 动态计划调整：adjustPlanRuntime(step, result) → 实时修改步骤
// - 多计划合并：mergePlans(plans) → 跨任务协同
