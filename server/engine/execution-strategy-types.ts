/**
 * Execution strategy shared types — extracted to a leaf module to break the
 * circular dependency between executionStrategy.ts ↔ agentOrchestrator.ts ↔
 * reactExecutor.ts.
 *
 * ExecutionMode is a runtime enum consumed by value across the strategy
 * cluster, and ExecutionStrategyOptions is an interface. Their dependencies
 * (toolExecutor, budgetManager, toolProfiles, mcpClientManager, skill-runtime,
 * aiClient) do not import back into executionStrategy, so relocating these
 * declarations here introduces no new cycle. executionStrategy.ts re-exports
 * both symbols to preserve the public import surface.
 */
import type { ToolExecutorOptions } from './toolExecutor.js';
import type { BudgetConfig } from './budgetManager.js';
import type { ToolProfileId } from './toolProfiles.js';
import type { McpClientManager } from './mcpClientManager.js';
import type { SkillDefinition, SkillContext, SkillResult } from '../types/skill-runtime.js';
import type { ToolDefinition } from '../aiClient.js';

/** 执行模式 */
export enum ExecutionMode {
  /** 轻量模式：直接调用 executeToolLoop，无反思/规划 */
  LEGACY = 'legacy',
  /** 完整模式：推理-行动-观察-反思循环（含 Planner + Observer） */
  REACT = 'react',
  /** 多 Agent 编排模式：任务拆分 + Agent 分配 + 并行执行 + 结果合成 */
  AGENT = 'agent',
  /** 自动模式：由复杂度评估（assessComplexity）在运行时推导实际策略 */
  AUTO = 'auto',
}

/** 执行策略选项，扩展 ToolExecutorOptions */
export interface ExecutionStrategyOptions extends ToolExecutorOptions {
  /** 执行模式 */
  executionMode: ExecutionMode;
  /** SSE 事件回调（用于推送 observer_reflection 等事件） */
  onSSEEvent?: (event: Record<string, unknown>) => void;
  /** v5.0: 预算配置（传递给 ReActExecutor） */
  budgetConfig?: Partial<BudgetConfig>;
  /** v8.2: 权限请求回调 */
  onPermissionRequest?: (toolName: string, toolArgs: Record<string, unknown>) => Promise<boolean> | boolean;
  /** v9.0: 已授权工具缓存 */
  approvedToolsCache?: Set<string>;
  /** 工具 Profile */
  toolProfile?: ToolProfileId;
  /** 上下文压缩配置 */
  compaction?: {
    enabled?: boolean;
    strategy?: string;
    thresholdRatio?: number;
    preserveRecent?: number;
  };
  /** v9.1 [五]: 规划模式 — off=不规划；static=生成计划作导航但不重规划；dynamic=循环失败时反思式重规划 */
  planningMode?: 'off' | 'static' | 'dynamic';
  /**
   * 数字员工（per-call）MCP 客户端管理器。
   * 注入后，MCP 工具列表会合并该 manager 的工具，分发时优先用它执行属于它的 server。
   * 用于隔离数字员工的 MCP server，不污染全局单例。
   */
  staffMcpManager?: McpClientManager;
  /**
   * 数字员工（per-call）物化技能定义列表。
   * 注入后，这些技能会以 `skill_<id>` 形式出现在工具列表中，供模型主动调用。
   */
  extraSkills?: SkillDefinition[];
  /**
   * 数字员工（per-call）物化技能执行器。
   * 当工具名为 `skill_<id>` 且全局 skillRegistry 未命中时，回退到该函数执行。
   */
  extraSkillExecutor?: (id: string, params: Record<string, unknown>, ctx?: SkillContext) => Promise<SkillResult>;
  /**
   * 数字员工（per-call）HTTP API 工具定义列表。
   * 从 sd_tools 表 tool_type='http' 读取，以 http_tool_ 前缀注入工具列表，
   * 供模型在对话中主动调用用户配置的外部 API。
   */
  staffHttpTools?: ToolDefinition[];
  /**
   * 数字员工技能调用事件回调（写侧统计来源）。仅 staff 注入，引擎层不依赖 staff DAO，
   * tenantId 由调用方（staffChatExecutor）闭包捕获后传入回调。未注入时通用路径安全跳过。
   */
  onSkillExecuted?: (p: { sessionId: string; skillId: string }) => void;
}
