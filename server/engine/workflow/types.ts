/**
 * 工作流类型定义
 * 定义可视化编排系统的核心数据结构
 */

// ===================== 节点类型 =====================

/** 节点类型枚举 */
export type NodeType = 'trigger' | 'condition' | 'action' | 'parallel' | 'loop' | 'wait';

/** 触发器类型 */
export type TriggerType = 'manual' | 'schedule' | 'event' | 'webhook';

/** 条件操作符 */
export type ConditionOperator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'exists' | 'not_exists';

/** 动作类型 */
export type ActionType = 'ai_call' | 'tool_execution' | 'notification' | 'data_transform' | 'api_call' | 'script';

/** 执行状态 */
export type ExecutionStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | 'timeout';

// ===================== 节点配置 =====================

/** 触发器配置 */
export interface TriggerConfig {
  type: TriggerType;
  schedule?: {
    cron: string;
    timezone?: string;
  };
  event?: {
    eventName: string;
    filters?: Record<string, unknown>;
  };
  webhook?: {
    path: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    authRequired?: boolean;
  };
}

/** 条件配置 */
export interface ConditionConfig {
  conditions: Array<{
    variable: string;
    operator: ConditionOperator;
    value: unknown;
  }>;
  logic: 'and' | 'or';
  branches?: {
    true: string; // true 分支的目标节点 ID
    false: string; // false 分支的目标节点 ID
  };
}

/** 动作配置 */
export interface ActionConfig {
  type: ActionType;
  params: Record<string, unknown>;
  retryPolicy?: {
    maxRetries: number;
    retryDelay: number;
    exponentialBackoff?: boolean;
  };
  timeout?: number;
}

/** 并行配置 */
export interface ParallelConfig {
  branches: string[]; // 并行分支的节点 ID 数组
  mode: 'all' | 'any' | 'race'; // all: 全部完成, any: 任意完成, race: 竞争
}

/** 循环配置 */
export interface LoopConfig {
  iteratorSource: string; // 循环数据源
  iteratorVariable: string; // 循环变量名
  maxIterations?: number;
  bodyNodeId: string; // 循环体节点 ID
}

/** 等待配置 */
export interface WaitConfig {
  type: 'duration' | 'event' | 'condition';
  duration?: number; // 毫秒
  event?: string;
  condition?: string;
}

// ===================== 节点定义 =====================

/** 节点连接 */
export interface NodeConnection {
  source: string;
  target: string;
  label?: string;
  condition?: string;
}

/** 工作流节点 */
export interface WorkflowNode {
  id: string;
  type: NodeType;
  name: string;
  description?: string;
  config: Record<string, unknown>;
  position: {
    x: number;
    y: number;
  };
  connections: NodeConnection[];
  enabled?: boolean;
  retryPolicy?: {
    maxRetries: number;
    retryDelay: number;
    exponentialBackoff?: boolean;
  };
  timeout?: number;
}

// ===================== 变量定义 =====================

/** 变量类型 */
export type VariableType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';

/** 工作流变量 */
export interface WorkflowVariable {
  id: string;
  name: string;
  type: VariableType;
  defaultValue?: unknown;
  description?: string;
  required?: boolean;
  scope: 'global' | 'local';
}

// ===================== 触发器定义 =====================

/** 工作流触发器 */
export interface WorkflowTrigger {
  id: string;
  type: TriggerType;
  name: string;
  config: TriggerConfig;
  enabled: boolean;
}

// ===================== 执行记录 =====================

/** 节点执行记录 */
export interface NodeExecutionRecord {
  nodeId: string;
  nodeName: string;
  status: ExecutionStatus;
  startTime: number;
  endTime?: number;
  duration?: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  retryCount?: number;
}

/** 工作流执行记录 */
export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowName: string;
  status: ExecutionStatus;
  startTime: number;
  endTime?: number;
  duration?: number;
  triggerType: TriggerType;
  triggeredBy?: string;
  nodeExecutions: NodeExecutionRecord[];
  variables: Record<string, unknown>;
  error?: string;
  logs: Array<{
    timestamp: number;
    level: 'info' | 'warn' | 'error';
    message: string;
    nodeId?: string;
  }>;
}

// ===================== 工作流定义 =====================

/** 工作流元数据 */
export interface WorkflowMetadata {
  author?: string;
  tags?: string[];
  category?: string;
  icon?: string;
  color?: string;
}

/** 工作流版本 */
export interface WorkflowVersion {
  version: number;
  createdAt: number;
  createdBy?: string;
  changes?: string;
  snapshot: Workflow;
}

/** 工作流主定义 */
export interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  triggers: WorkflowTrigger[];
  variables: WorkflowVariable[];
  metadata?: WorkflowMetadata;
  version: number;
  status: 'draft' | 'published' | 'archived';
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  updatedBy?: string;
}

// ===================== 模板定义 =====================

/** 工作流模板 */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  tags: string[];
  workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>;
  usageCount?: number;
  rating?: number;
  author?: string;
  downloads?: number;
}

// ===================== 运行时上下文 =====================

/** 执行上下文 */
export interface ExecutionContext {
  workflowId: string;
  executionId: string;
  variables: Record<string, unknown>;
  triggerType: TriggerType;
  triggeredBy?: string;
  startTime: number;
  nodeOutputs: Map<string, Record<string, unknown>>;
  nodeExecutions: NodeExecutionRecord[];
  logs: Array<{
    timestamp: number;
    level: 'info' | 'warn' | 'error';
    message: string;
    nodeId?: string;
  }>;
  /** v11.0 工具调用审计关联会话 ID（可选，未传时审计回退为 'workflow'） */
  sessionId?: string;
}

/** 执行结果 */
export interface ExecutionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  nodeResults?: Map<string, Record<string, unknown>>;
}

// ===================== API 响应类型 =====================

/** 工作流列表响应 */
export interface WorkflowListResponse {
  data: Workflow[];
  total: number;
  page?: number;
  pageSize?: number;
}

/** 执行历史响应 */
export interface ExecutionHistoryResponse {
  data: WorkflowExecution[];
  total: number;
  page?: number;
  pageSize?: number;
}

// ===================== 工具类型 =====================

/** 节点位置 */
export interface NodePosition {
  x: number;
  y: number;
}

/** 画布状态 */
export interface CanvasState {
  zoom: number;
  panX: number;
  panY: number;
  selectedNodeId?: string;
  hoveredNodeId?: string;
}

/** 编辑器状态 */
export interface EditorState {
  workflow: Workflow | null;
  isDirty: boolean;
  isExecuting: boolean;
  canvas: CanvasState;
  undoStack: Workflow[];
  redoStack: Workflow[];
  clipboard: WorkflowNode | null;
}