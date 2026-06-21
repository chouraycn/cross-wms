/**
 * Multi-Agent 核心类型定义 — 前后端共享
 *
 * v8.0: 多 Agent 架构
 * - 主 Agent（Orchestrator）统筹调度
 * - 子 Agent 独立 SOUL.md + MEMORY.md
 * - Agent 间通过 EventBus 通信
 * - 复杂任务自动拆分为并行子任务
 */

// ===================== Agent Profile =====================

/** Agent 角色类型 */
export type AgentRole = 'orchestrator' | 'researcher' | 'coder' | 'analyst' | 'planner' | 'reviewer' | 'custom';

/** Agent 状态 */
export type AgentStatus = 'idle' | 'busy' | 'waiting' | 'error' | 'terminated';

/** Agent 能力声明 */
export interface AgentCapability {
  /** 能力名称 */
  name: string;
  /** 能力描述 */
  description: string;
  /** 可用工具列表（tool name pattern，支持通配符） */
  toolPatterns: string[];
  /** 适用的任务关键词 */
  taskKeywords: string[];
}

/** Agent 执行历史记录 */
export interface AgentExecutionRecord {
  /** 记录 ID */
  id: string;
  /** Agent ID */
  agentId: string;
  /** 子任务 ID */
  subTaskId: string;
  /** 任务描述 */
  taskDescription: string;
  /** 执行结果 */
  status: 'success' | 'failure' | 'timeout';
  /** 执行时长 ms */
  duration: number;
  /** 时间戳 */
  timestamp: string;
}

/** Agent 配置 */
export interface AgentProfile {
  /** 唯一 ID */
  id: string;
  /** 显示名称 */
  name: string;
  /** 角色类型 */
  role: AgentRole;
  /** 状态 */
  status: AgentStatus;
  /** SOUL.md 内容（Agent 人格定义） */
  soul: string;
  /** MEMORY.md 内容（Agent 记忆） */
  memory: string;
  /** 能力声明列表 */
  capabilities: AgentCapability[];
  /** 允许使用的工具白名单（空=全部允许） */
  allowedTools: string[];
  /** 禁止使用的工具黑名单 */
  deniedTools: string[];
  /** 最大并发子任务数 */
  maxConcurrency: number;
  /** 使用的模型 ID（空=跟随主会话模型） */
  modelId: string;
  /** 创建时间 */
  createdAt: string;
  /** 最后活跃时间 */
  lastActiveAt: string;
  /** 最近执行记录（内存中保留最近 50 条） */
  recentExecutions: AgentExecutionRecord[];
  /** 成功次数（累计） */
  successCount: number;
  /** 失败次数（累计） */
  failureCount: number;
}

// ===================== Task Decomposition =====================

/** 子任务状态 */
export type SubTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** 子任务优先级 */
export type SubTaskPriority = 'critical' | 'high' | 'medium' | 'low';

/** 子任务定义 */
export interface SubTask {
  /** 唯一 ID */
  id: string;
  /** 所属分解 ID */
  decompositionId: string;
  /** 任务描述 */
  description: string;
  /** 执行提示词（传给子 Agent 的完整 prompt） */
  prompt: string;
  /** 分配的 Agent ID（空=待分配） */
  assignedAgentId: string | null;
  /** 依赖的子任务 ID 列表（DAG 边） */
  dependsOn: string[];
  /** 优先级 */
  priority: SubTaskPriority;
  /** 状态 */
  status: SubTaskStatus;
  /** 执行结果 */
  result: string | null;
  /** 错误信息 */
  error: string | null;
  /** 创建时间 */
  createdAt: string;
  /** 开始执行时间 */
  startedAt: string | null;
  /** 完成时间 */
  completedAt: string | null;
}

/** 任务分解结果 */
export interface TaskDecomposition {
  /** 唯一 ID */
  id: string;
  /** 原始任务描述 */
  originalTask: string;
  /** 会话 ID */
  sessionId: string;
  /** 子任务列表 */
  subTasks: SubTask[];
  /** 是否可并行执行（存在无依赖的子任务） */
  hasParallelism: boolean;
  /** 预估总步骤数 */
  estimatedSteps: number;
  /** 创建时间 */
  createdAt: string;
  /** 完成时间 */
  completedAt: string | null;
  /** 状态 */
  status: 'planning' | 'executing' | 'completed' | 'failed' | 'cancelled';
}

// ===================== Agent Events =====================

/** Agent 事件类型 */
export const AgentEventType = {
  /** 创建子 Agent */
  AGENT_SPAWN: 'agent:spawn',
  /** 分配子任务 */
  AGENT_TASK_ASSIGN: 'agent:task:assign',
  /** 子任务进度更新 */
  AGENT_TASK_PROGRESS: 'agent:task:progress',
  /** 子任务完成 */
  AGENT_TASK_COMPLETE: 'agent:task:complete',
  /** 子任务失败 */
  AGENT_TASK_FAILED: 'agent:task:failed',
  /** Agent 间消息 */
  AGENT_MESSAGE: 'agent:message',
  /** Agent 状态变更 */
  AGENT_STATUS_CHANGE: 'agent:status',
  /** 编排完成 */
  AGENT_ORCHESTRATION_COMPLETE: 'agent:orchestration:complete',
  /** 编排失败 */
  AGENT_ORCHESTRATION_FAILED: 'agent:orchestration:failed',
} as const;

export type AgentEventType = (typeof AgentEventType)[keyof typeof AgentEventType];

/** Agent 事件载荷 */
export interface AgentEventPayload {
  /** 事件类型 */
  type: AgentEventType;
  /** 触发 Agent ID */
  sourceAgentId: string;
  /** 目标 Agent ID（广播为空） */
  targetAgentId?: string;
  /** 会话 ID */
  sessionId: string;
  /** 分解 ID */
  decompositionId?: string;
  /** 子任务 ID */
  subTaskId?: string;
  /** 时间戳 */
  timestamp: string;
  /** 事件数据 */
  data?: unknown;
}

/** 子任务进度更新数据 */
export interface SubTaskProgressData {
  /** 子任务 ID */
  subTaskId: string;
  /** 进度百分比 0-100 */
  progressPercent: number;
  /** 当前执行阶段描述 */
  phase: string;
  /** 已执行的工具调用数 */
  toolCallCount: number;
  /** 已用轮数 */
  turnsUsed: number;
}

/** Agent 间消息数据 */
export interface AgentMessageData {
  /** 消息内容 */
  content: string;
  /** 消息类型：请求/响应/通知 */
  messageType: 'request' | 'response' | 'notification';
  /** 关联消息 ID（用于请求-响应配对） */
  correlationId?: string;
}

// ===================== Orchestrator Result =====================

/** 编排执行结果 */
export interface OrchestratorResult {
  /** 最终汇总内容 */
  content: string;
  /** 所有子任务结果摘要 */
  subTaskResults: Array<{
    subTaskId: string;
    description: string;
    status: SubTaskStatus;
    result: string | null;
    agentId: string;
    duration: number;
  }>;
  /** 总执行时间 ms */
  totalDuration: number;
  /** 子任务执行统计 */
  stats: {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    parallelGroups: number;
  };
  /** 工具调用记录（汇总所有子 Agent） */
  toolCalls: Array<{ name: string; arguments: string; result: string }>;
}

// ===================== Built-in Agent Templates =====================

/** 内置 Agent 模板 */
export const BUILTIN_AGENT_TEMPLATES: Array<Omit<AgentProfile, 'status' | 'createdAt' | 'lastActiveAt' | 'recentExecutions' | 'successCount' | 'failureCount'>> = [
  {
    id: 'orchestrator',
    name: '统筹 Agent',
    role: 'orchestrator',
    soul: `你是 CrossWMS 多 Agent 系统的统筹者。你的职责是：
1. 评估用户任务的复杂度
2. 将复杂任务拆分为可并行执行的子任务
3. 为子任务分配合适的专业 Agent
4. 收集和汇总所有子任务结果
5. 返回完整的最终回复

你必须确保：
- 子任务之间无循环依赖
- 优先并行执行无依赖的子任务
- 单个子任务失败不阻塞其他子任务
- 最终回复融合所有子任务结果，不遗漏关键信息`,
    memory: '',
    capabilities: [
      {
        name: 'task_decomposition',
        description: '将复杂任务拆分为子任务 DAG',
        toolPatterns: ['*'],
        taskKeywords: ['同时', '并行', '先...再', '分析并', '查询和', '对比'],
      },
    ],
    allowedTools: [],
    deniedTools: [],
    maxConcurrency: 4,
    modelId: '',
  },
  {
    id: 'researcher',
    name: '研究 Agent',
    role: 'researcher',
    soul: `你是一个专业的研究分析 Agent。你的职责是：
1. 深入搜索和分析指定主题
2. 从多渠道获取信息
3. 整理研究结果，给出结构化摘要
4. 标注信息来源和置信度

你需要高效利用搜索和查询工具，确保结果全面准确。`,
    memory: '',
    capabilities: [
      {
        name: 'research',
        description: '搜索、查询、分析信息',
        toolPatterns: ['web_*', 'db_*', 'system_*', 'file_readFile', 'file_searchContent'],
        taskKeywords: ['搜索', '查询', '分析', '研究', '调研', '查找', '对比'],
      },
    ],
    allowedTools: [],
    deniedTools: ['file_writeFile', 'file_deleteFile'],
    maxConcurrency: 2,
    modelId: '',
  },
  {
    id: 'coder',
    name: '编码 Agent',
    role: 'coder',
    soul: `你是一个专业的编码执行 Agent。你的职责是：
1. 根据需求编写或修改代码
2. 读写文件系统
3. 执行命令行操作
4. 验证执行结果

你需要精准执行编码任务，确保代码质量和操作安全。`,
    memory: '',
    capabilities: [
      {
        name: 'coding',
        description: '编写代码、操作文件、执行命令',
        toolPatterns: ['file_*', 'system_*', 'desktop_*', 'browser_*'],
        taskKeywords: ['编写', '修改', '创建', '实现', '开发', '代码', '脚本'],
      },
    ],
    allowedTools: [],
    deniedTools: [],
    maxConcurrency: 2,
    modelId: '',
  },
  {
    id: 'analyst',
    name: '分析 Agent',
    role: 'analyst',
    soul: `你是一个专业的数据分析 Agent。你的职责是：
1. 查询数据库获取数据
2. 执行统计分析和计算
3. 生成数据可视化
4. 输出分析报告和建议

你需要用数据说话，确保分析结论有依据。`,
    memory: '',
    capabilities: [
      {
        name: 'analysis',
        description: '数据分析、统计、报表生成',
        toolPatterns: ['db_*', 'wms_*', 'system_*', 'file_*'],
        taskKeywords: ['统计', '分析', '报表', '汇总', '趋势', '对比'],
      },
    ],
    allowedTools: [],
    deniedTools: [],
    maxConcurrency: 2,
    modelId: '',
  },
];
