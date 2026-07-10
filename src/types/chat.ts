import type { QueryResult } from './inventory-query';
import type { ContentBlock } from './content-blocks';

export interface ReferencedSession {
  id: string;
  title: string;
}

/** 工具调用信息（AI 通过 Tool Calling 执行的操作） */
export interface ToolCallInfo {
  /** 工具调用 ID（对应 OpenAI tool_call.id） */
  id?: string;
  /** 工具名称（如 file:readFile、shell:exec） */
  name: string;
  /** 工具参数（JSON 字符串） */
  arguments: string;
  /** 工具执行结果 */
  result: string;
}

/** v3.0: 插件自动调用结果 */
export interface PluginResultInfo {
  /** 触发的插件工具名 */
  tool: string;
  /** 插件输出内容 */
  output: string;
  /** 执行耗时(ms) */
  durationMs?: number;
}

/** v4.0: Observer 反思信息 */
export interface ObserverReflectionInfo {
  toolName: string;
  level: 'success' | 'warning' | 'error' | 'retry_suggested';
  hint: string;
  willRetry: boolean;
  retryIndex: number;
  maxRetries: number;
}

/** v4.0: 执行计划步骤 */
export interface PlanStepInfo {
  step: number;
  description: string;
  toolName?: string;
  dependsOn: number[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
}

/** v4.0: 执行计划 */
export interface ExecutionPlanInfo {
  id: string;
  intent: string;
  steps: PlanStepInfo[];
  isDynamic: boolean;
  createdAt: string;
}

/** v7.0: 队列状态信息 */
export interface QueueStateInfo {
  /** 队列模式 */
  mode?: 'collect' | 'steer' | 'followup';
  /** 会话队列状态 */
  state?: 'idle' | 'executing' | 'executing_with_queue' | 'steering' | 'collecting';
  /** 排队消息数 */
  queueLength?: number;
  /** 事件类型 */
  type?: string;
}

/** v8.0: 多 Agent 编排状态 */
export interface OrchestrationState {
  /** 状态 */
  status: 'decomposing' | 'executing' | 'completed' | 'failed';
  /** 原始任务 */
  originalTask?: string;
  /** 子任务列表 */
  subTasks: Array<{
    id: string;
    description: string;
    assignedAgentId: string | null;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: string | null;
  }>;
  /** 执行统计（完成时填充） */
  stats?: {
    total: number;
    completed: number;
    failed: number;
    parallelGroups: number;
  };
}

/** v4.0: ReAct 阶段信息 */
export interface ReactPhaseInfo {
  phase: 'reasoning' | 'acting' | 'observing' | 'reflecting' | 'done';
  step?: number;
  totalSteps?: number;
  description?: string;
}

/** 消息元数据（可扩展） */
export interface MessageMetadata {
  /** 自然语言查询结果（仅 builtin-inventory-query 技能产生） */
  queryResult?: QueryResult;
  /** 是否正在加载查询结果 */
  loading?: boolean;
  /** 查询错误信息 */
  error?: string;
  /** v1.7.0: 查询错误码（如 SQL_EXEC_FAILED 用于前端 auto-retry 判断） */
  errorCode?: string;
  /** v1.7.0: 是否已自动重试（每会话仅重试一次） */
  autoRetried?: boolean;
  /** v9.0: thinking 签名（加密思考块的签名，用于校验/还原） */
  thinkingSignature?: string;
  /** v9.0: thinking 内容是否被加密/编辑（redacted），渲染时显示 [encrypted] 标记 */
  thinkingRedacted?: boolean;
}

export interface Attachment {
  id: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  type: 'image' | 'file';
}

/** v10.0: AI 生成的文件（可在对话中展示和下载） */
export interface GeneratedFile {
  /** 文件名 */
  fileName: string;
  /** 文件大小（字节） */
  fileSize: number;
  /** MIME 类型（可选，自动推断） */
  mimeType?: string;
  /** 文件描述（可选，AI 提供） */
  description?: string;
  /** 下载 URL */
  downloadUrl: string;
  /** 预览 URL（可选，支持预览的格式） */
  previewUrl?: string;
  /** 会话 ID */
  sessionId?: string;
  /** 创建时间（ISO 字符串） */
  createdAt?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: Date;
  isStreaming?: boolean;
  /** v8.2-fix: thinking 阶段是否已完成（text 内容已开始生成），用于区分"正在思考"和"正在生成内容" */
  thinkingDone?: boolean;
  /** 用户发送此消息时引用的历史会话（仅 user 消息携带） */
  referencedSessions?: ReferencedSession[];
  /** 引用的消息 ID（回复/引用功能） */
  replyToMessageId?: string;
  /** Auto 模式选型原因（如 "Claude Sonnet 4 · 检测到代码内容"） */
  autoReason?: string;
  /** Auto 选型原因类型 */
  autoReasonType?: 'code' | 'complex' | 'simple' | 'default';
  /** 消息元数据（v1.9.2: 存储 token 用量等扩展信息） */
  metadata?: MessageMetadata;
  /** v1.8.6: AI 思考过程内容（如 DeepSeek-R1 reasoning_content / Claude thinking） */
  thinking?: string;
  /** v1.8.6: 思考耗时（毫秒） */
  thinkingDuration?: number;
  /** v1.8.7: 思考类型 — deep 深度思考（远程大模型）/ local 本地思考（本地模型/缓存/规则） */
  thinkingType?: 'deep' | 'local';
  /** v1.9.0: AI 工具调用记录（Tool Calling） */
  toolCalls?: ToolCallInfo[];
  /** 附件列表（图片、文件等） */
  attachments?: Attachment[];
  /** v10.0: AI 生成的文件列表（可在对话中展示和下载） */
  generatedFiles?: GeneratedFile[];
  /** v2.2.0: 思考已等待时间（毫秒，心跳更新） */
  thinkingElapsed?: number;
  /** v2.2.0: 是否命中 thinking 缓存 */
  cacheHit?: boolean;
  /** v2.2.0: token 使用统计 */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    thinkingTokens?: number;
    totalTokens?: number;
  };
  /** v3.0: 插件自动调用结果（reasoning 流中触发） */
  pluginResults?: PluginResultInfo[];
  /** v4.0: Observer 反思记录 */
  observerReflections?: ObserverReflectionInfo[];
  /** v4.0: 执行计划 */
  executionPlan?: ExecutionPlanInfo;
  /** v4.0: ReAct 阶段信息 */
  reactPhase?: ReactPhaseInfo;
  /** v5.0: 反思置信度信息 */
  reflectionConfidence?: {
    confidenceScore: number;
    selfScore: number;
    shouldEarlyStop: boolean;
    reason: string;
  };
  /** v5.0: 预算超出信息 */
  budgetExceeded?: {
    reason: string;
    consumedTurns: number;
    consumedTokens: number;
    maxTurns: number;
    maxTokens: number;
  };
  /** v5.0: 复杂度评估结果 */
  complexityAssessment?: {
    level: 'simple' | 'moderate' | 'complex';
    estimatedSteps: number;
    reason: string;
    recommendedMode: string;
  };
  /** v6.0: 上下文语义压缩信息 */
  contextCompressed?: ContextCompressedData;
  /** v5.0: 重规划触发信息 */
  replanTriggered?: {
    reason: string;
    oldPlanId: string;
    newPlanId: string;
  };
  /** v6.0: 计划步骤完成记录 */
  planStepCompleted?: {
    planId: string;
    step: number;
    description: string;
    toolName?: string;
  };
  /** v6.0: 熔断器触发记录 */
  circuitBreakerTriggered?: {
    toolName: string;
    failureCount: number;
    state: 'half_open' | 'open';
    alternativeTool?: string;
  };
  /** v6.0: 复杂度升级记录 */
  complexityUpgraded?: {
    oldLevel: string;
    newLevel: string;
    reason: string;
  };
  /** v6.0: LLM 反思记录 */
  llmReflection?: {
    insight: string;
    confidenceScore: number;
  };
  /** v6.0: 长期记忆检索记录 */
  memoryRetrieved?: {
    count: number;
    summaries: string[];
  };
  /** v6.0: 输出修复记录 */
  outputRepaired?: {
    toolName: string;
    repairDetails: string;
  };
  /** v6.0: 预算调整记录 */
  budgetAdjusted?: {
    oldMaxTurns: number;
    newMaxTurns: number;
    oldMaxTokens?: number;
    newMaxTokens?: number;
    reason: string;
  };
  /** v7.0: 队列状态（Collect/Steer/Followup 模式下的实时状态反馈） */
  queueState?: QueueStateInfo;
  /** v8.0: 多 Agent 编排状态 */
  orchestrationState?: OrchestrationState;
  /** v8.1: Agent 状态列表（用于 AgentStatusIndicator 展示） */
  agentStatuses?: AgentStatusInfo[];
  /** v8.2: Agent 编排事件流（agent_start / agent_end / subtask_create / subtask_assign / subtask_complete / reflect / plan） */
  agentEvents?: AgentEvent[];
  /** v10.0: 关键词触发信息（用户消息中的关键词触发的 Skill） */
  keywordTrigger?: KeywordTriggerInfo[];
  /** v1.5.116: 模型降级信息 */
  fallbackModel?: string;
  fallbackReason?: 'model_not_supported' | 'request_failed';
  /** 错误信息（AI 回复失败时携带，用于 UI 标记错误状态） */
  error?: string;
  /** v9.0: Content Block 数组（双轨并行，优先渲染此字段，回退到扁平字段） */
  contentBlocks?: ContentBlock[];
}

/** 会话状态 */
export type SessionStatus = 'active' | 'archived' | 'daily_reset';

export interface Session {
  id: string;
  title: string;
  model: string;
  messages: Message[];
  /** 消息数量（列表接口返回，避免加载完整消息） */
  messageCount?: number;
  folderId?: string | null;
  isPinned?: boolean;
  createdAt?: string;
  updatedAt?: string;
  /** v6.0: 会话状态 */
  status?: SessionStatus;
  /** v6.0: 最后活跃时间 */
  lastActiveAt?: string;
  /** v6.0: 归档时间 */
  archivedAt?: string | null;
  /** v6.0: 父会话 ID（子任务创建子会话） */
  parentSessionId?: string | null;
  /** v6.0: 会话日期键（YYYY-MM-DD） */
  sessionDate?: string;
  /** v6.0: 标签（JSON 数组） */
  tags?: string | null;
  /** v6.0: 摘要（归档时自动生成） */
  summary?: string | null;
  /** v8.0: 关联的 Agent ID */
  agentId?: string | null;
  /** 是否还有更早的消息可加载（分页） */
  hasMoreMessages?: boolean;
  /** 消息总数（分页加载时用于计算偏移量） */
  totalMessageCount?: number;
  /** v10.0: 思考级别 */
  thinkingLevel?: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

// ===================== v5.0: ReAct 优化新增类型 =====================

/** 预算配置 */
export interface BudgetConfig {
  /** 最大循环轮数（默认 10） */
  maxTurns: number;
  /** 最大 Token 预算（默认 50000） */
  maxTokens: number;
  /** Working Memory 滑窗大小（默认 5） */
  windowSize: number;
}

/** Token 使用量 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** 预算检查结果 */
export interface BudgetCheckResult {
  exceeded: boolean;
  reason: string;
  consumedTokens: number;
  consumedTurns: number;
}

/** 预算剩余量 */
export interface BudgetRemaining {
  remainingTurns: number;
  remainingTokens: number;
}

/** 观察历史记录（死循环检测用） */
export interface ObservationHistory {
  turnIndex: number;
  errorType: string;
  resultDigest: string;
}

/** 死循环检测结果 */
export interface LoopDetectionResult {
  isLoop: boolean;
  similarity: number;
  consecutiveCount: number;
  errorType: string;
}

/** 升级行动类型 */
export type EscalationAction = 'switch_tool' | 'replan' | 'ask_user';

/** 升级策略 */
export interface EscalationStrategy {
  action: EscalationAction;
  reason: string;
  alternativeToolName?: string;
}

/** Working Memory 轮次记录 */
export interface WorkingMemoryTurn {
  turnIndex: number;
  observations: ObserverReflectionInfo[];
  reflectionDecision: {
    shouldContinue: boolean;
    reason: string;
    reflectionMessage?: string;
  };
  timestamp: number;
}

/** 偏离检测结果 */
export interface DriftDetectionResult {
  hasDrifted: boolean;
  reason: string;
  originalIntent: string;
  currentDirection: string;
}

/** 反思置信度 */
export interface ReflectionConfidence {
  confidenceScore: number;
  selfScore: number;
  shouldEarlyStop: boolean;
  reason: string;
}

/** 压缩后的观察结果 */
export interface CompressedObservation {
  compressed: string;
  original: string;
  wasCompressed: boolean;
  compressionRatio: number;
}

/** Few-shot 模板 */
export interface FewShotTemplate {
  id: string;
  name: string;
  triggerPatterns: RegExp[];
  systemPrompt: string;
  examples: Array<{ role: string; content: string }>;
}

/** 复杂度等级 */
export type ComplexityLevel = 'simple' | 'moderate' | 'complex';

/** 复杂度评估结果 */
export interface ComplexityAssessment {
  level: ComplexityLevel;
  estimatedSteps: number;
  reason: string;
  recommendedMode: string;
}

// ===== v5.0: SSE 新增事件类型 =====

/** 反思置信度事件 */
export interface ReflectionConfidenceEvent {
  type: 'reflection_confidence';
  confidenceScore: number;
  selfScore: number;
  shouldEarlyStop: boolean;
  reason: string;
}

/** 预算超出事件 */
export interface BudgetExceededEvent {
  type: 'budget_exceeded';
  reason: string;
  consumedTurns: number;
  consumedTokens: number;
  maxTurns: number;
  maxTokens: number;
}

/** 复杂度评估事件 */
export interface ComplexityAssessmentEvent {
  type: 'complexity_assessment';
  level: ComplexityLevel;
  estimatedSteps: number;
  reason: string;
  recommendedMode: string;
}

/** 重规划触发事件 */
export interface ReplanTriggeredEvent {
  type: 'replan_triggered';
  reason: string;
  oldPlanId: string;
  newPlanId: string;
}

/** v6.0: 语义压缩数据（context_compressed SSE 事件负载） */
export interface ContextCompressedData {
  strategy: 'semantic' | 'extractive' | 'truncation';
  originalTokens: number;
  compressedTokens: number;
  ratio: number;
  keyInfoPreserved?: string[];
}

/** 上下文压缩事件 */
export interface ContextCompressedEvent {
  type: 'context_compressed';
  strategy: 'semantic' | 'extractive' | 'truncation';
  originalTokens: number;
  compressedTokens: number;
  ratio: number;
  keyInfoPreserved?: string[];
}

// ===== v6.0: SSE 新增事件类型 =====

/** v6.0: 计划步骤完成事件 */
export interface PlanStepCompletedEvent {
  type: 'plan_step_completed';
  planId: string;
  step: number;
  description: string;
  toolName?: string;
}

/** v6.0: 熔断器触发事件 */
export interface CircuitBreakerTriggeredEvent {
  type: 'circuit_breaker_triggered';
  toolName: string;
  failureCount: number;
  state: 'half_open' | 'open';
  alternativeTool?: string;
}

/** v6.0: 复杂度升级事件 */
export interface ComplexityUpgradedEvent {
  type: 'complexity_upgraded';
  oldLevel: ComplexityLevel;
  newLevel: ComplexityLevel;
  reason: string;
}

/** v6.0: LLM 反思事件 */
export interface LLMReflectionEvent {
  type: 'llm_reflection';
  insight: string;
  confidenceScore: number;
}

/** v6.0: 长期记忆检索事件 */
export interface MemoryRetrievedEvent {
  type: 'memory_retrieved';
  count: number;
  summaries: string[];
}

/** v6.0: 输出修复事件 */
export interface OutputRepairedEvent {
  type: 'output_repaired';
  toolName: string;
  repairDetails: string;
}

/** v6.0: 预算调整事件 */
export interface BudgetAdjustedEvent {
  type: 'budget_adjusted';
  oldMaxTurns: number;
  newMaxTurns: number;
  oldMaxTokens?: number;
  newMaxTokens?: number;
  reason: string;
}

// ===== v8.1: Agent 编排 + 子任务 + 反思 + 计划 SSE 事件类型 =====

/** Agent 任务开始事件 */
export interface AgentStartEvent {
  type: 'agent_start';
  /** Agent ID */
  agentId: string;
  /** Agent 角色名 */
  agentRole: string;
  /** 任务描述 */
  taskDescription: string;
  /** 子任务 ID（如果是子任务执行） */
  subTaskId?: string;
}

/** Agent 任务结束事件 */
export interface AgentEndEvent {
  type: 'agent_end';
  /** Agent ID */
  agentId: string;
  /** Agent 角色名 */
  agentRole: string;
  /** 执行状态 */
  status: 'success' | 'failed' | 'timeout';
  /** 执行耗时（毫秒） */
  duration?: number;
  /** 错误信息（失败时） */
  error?: string;
}

/** 子任务创建事件 */
export interface SubtaskCreateEvent {
  type: 'subtask_create';
  /** 子任务 ID */
  subTaskId: string;
  /** 子任务描述 */
  description: string;
  /** 依赖的子任务 ID 列表 */
  dependsOn: string[];
  /** 优先级 */
  priority: number;
}

/** 子任务分配事件 */
export interface SubtaskAssignEvent {
  type: 'subtask_assign';
  /** 子任务 ID */
  subTaskId: string;
  /** 分配的 Agent ID */
  agentId: string;
  /** Agent 角色名 */
  agentRole: string;
}

/** 子任务完成事件 */
export interface SubtaskCompleteEvent {
  type: 'subtask_complete';
  /** 子任务 ID */
  subTaskId: string;
  /** 子任务描述 */
  description: string;
  /** 执行状态 */
  status: 'completed' | 'failed';
  /** Agent ID */
  agentId: string;
  /** 执行耗时（毫秒） */
  duration?: number;
  /** 结果摘要 */
  resultSummary?: string;
}

/** 反思评估结果事件（增强版 observer_reflection） */
export interface ReflectEvent {
  type: 'reflect';
  /** 反思来源（observer / llm / self_evaluation） */
  source: 'observer' | 'llm' | 'self_evaluation';
  /** 工具名称 */
  toolName?: string;
  /** 评估等级 */
  level: 'success' | 'warning' | 'error' | 'retry_suggested';
  /** 反思洞察 */
  insight: string;
  /** 置信度评分 (1-10) */
  confidenceScore?: number;
  /** 自评分等级 */
  selfGrade?: 'A' | 'B' | 'C' | 'D';
}

/** 执行计划生成事件（增强版 execution_plan） */
export interface PlanEvent {
  type: 'plan';
  /** 计划 ID */
  planId: string;
  /** 计划意图 */
  intent: string;
  /** 步骤列表 */
  steps: Array<{
    step: number;
    description: string;
    toolName?: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  }>;
  /** 是否动态计划 */
  isDynamic: boolean;
}

/** v8.2: Agent 编排事件联合类型 */
export type AgentEvent =
  | AgentStartEvent
  | AgentEndEvent
  | SubtaskCreateEvent
  | SubtaskAssignEvent
  | SubtaskCompleteEvent
  | ReflectEvent
  | PlanEvent;

/** Agent 状态信息（用于前端 AgentStatusIndicator 展示） */
export interface AgentStatusInfo {
  /** Agent ID */
  agentId: string;
  /** Agent 角色名 */
  agentRole: string;
  /** Agent 显示名 */
  agentName: string;
  /** 状态 */
  status: 'idle' | 'busy' | 'error' | 'terminated';
  /** 当前执行的任务描述（busy 时） */
  currentTask?: string;
}

/** v10.0: 关键词触发信息（用于前端展示关键词自动触发的 Skill） */
export interface KeywordTriggerInfo {
  /** Skill ID */
  skillId: string;
  /** Skill 名称 */
  skillName: string;
  /** 匹配的关键词列表 */
  matchedKeywords: string[];
  /** 匹配分数（0-1） */
  matchScore: number;
  /** 触发原因（详细说明） */
  reason: string;
  /** 是否已执行 */
  executed?: boolean;
  /** 执行状态 */
  status?: 'pending' | 'running' | 'completed' | 'failed';
}
