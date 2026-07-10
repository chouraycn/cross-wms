/**
 * Tool Plan Types — 工具描述符契约类型
 *
 * 参考 OpenClaw src/tools/types.ts 设计。
 * 核心思想：把工具的所有权（owner）、执行器（executor）、可用性（availability）、
 * 协议元数据（protocol）分离，让 core/plugin/channel/MCP 共享同一套规划。
 *
 * 设计原则：
 * - Discriminated Union + Exhaustiveness（closed union，never 检查）
 * - Make impossible states unrepresentable
 */

// ===================== JSON 基础类型 =====================

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

// ===================== 工具所有者引用 =====================

/**
 * 工具所有者引用 — 描述工具归属于哪个子系统
 * Discriminated union，用 kind 字段区分
 */
export type ToolOwnerRef =
  | { kind: 'core' }
  | { kind: 'plugin'; pluginId: string }
  | { kind: 'channel'; channelId: string; pluginId?: string }
  | { kind: 'mcp'; serverId: string };

// ===================== 工具执行器引用 =====================

/**
 * 工具执行器引用 — 描述运行时如何执行该工具
 * Discriminated union，用 kind 字段区分
 */
export type ToolExecutorRef =
  | { kind: 'core'; executorId: string }
  | { kind: 'plugin'; pluginId: string; toolName: string }
  | { kind: 'channel'; channelId: string; actionId: string }
  | { kind: 'mcp'; serverId: string; toolName: string };

// ===================== 工具可用性信号 =====================

/**
 * 工具可用性原子信号 — 单个可用性条件
 * Discriminated union，用 kind 字段区分
 */
export type ToolAvailabilitySignal =
  | { kind: 'always' }
  | { kind: 'auth'; providerId: string }
  | { kind: 'config'; path: string; check?: 'exists' | 'non-empty' | 'available' }
  | { kind: 'env'; name: string }
  | { kind: 'plugin-enabled'; pluginId: string }
  | { kind: 'context'; key: string; equals?: string };

/**
 * 工具可用性布尔表达式 — 支持嵌套 AND/OR
 */
export type ToolAvailabilityExpression =
  | ToolAvailabilitySignal
  | { allOf: ToolAvailabilityExpression[] }
  | { anyOf: ToolAvailabilityExpression[] };

// ===================== 工具描述符 =====================

/**
 * 工具描述符 — 声明式工具描述
 * 包含名称、描述、输入/输出 schema、所有者、执行器、可用性
 */
export interface ToolDescriptor {
  /** 工具名称（唯一标识） */
  name: string;
  /** 人类可读标题 */
  title?: string;
  /** 工具描述 */
  description: string;
  /** 输入 schema（JSON Schema 格式） */
  inputSchema: JsonObject;
  /** 输出 schema（可选，JSON Schema 格式） */
  outputSchema?: JsonObject;
  /** 工具所有者 */
  owner: ToolOwnerRef;
  /** 工具执行器（visible 工具必须提供，hidden 可省略） */
  executor?: ToolExecutorRef;
  /** 可用性表达式（省略 = always） */
  availability?: ToolAvailabilityExpression;
  /** 工具注解（如只读、破坏性等标记） */
  annotations?: {
    /** 是否只读（不修改状态） */
    readOnly?: boolean;
    /** 是否破坏性操作 */
    destructive?: boolean;
    /** 是否需要网络访问 */
    network?: boolean;
    /** 是否需要用户确认 */
    needsConfirmation?: boolean;
    /** 自定义注解 */
    [key: string]: unknown;
  };
  /** 排序键（用于确定性排序，省略时用 name） */
  sortKey?: string;
}

// ===================== 工具规划结果 =====================

/**
 * 可见工具规划条目 — 可执行的可见工具
 */
export interface ToolPlanEntry {
  descriptor: ToolDescriptor;
  executor: ToolExecutorRef;
}

/**
 * 隐藏工具规划条目 — 因不可用被隐藏的工具（带诊断信息）
 */
export interface HiddenToolPlanEntry {
  descriptor: ToolDescriptor;
  diagnostics: ToolUnavailableReason[];
}

/**
 * 工具规划结果 — visible + hidden 双列表
 */
export interface ToolPlan {
  visible: ToolPlanEntry[];
  hidden: HiddenToolPlanEntry[];
}

// ===================== 不可用原因 =====================

/**
 * 工具不可用原因 — closed code，避免 freeform string
 */
export type ToolUnavailableReason =
  | { code: 'auth-missing'; providerId: string }
  | { code: 'config-missing'; path: string }
  | { code: 'context-mismatch'; key: string; expected?: string; actual?: string }
  | { code: 'env-missing'; name: string }
  | { code: 'plugin-disabled'; pluginId: string }
  | { code: 'unsupported-signal'; kind: string };

// ===================== 契约错误 =====================

/**
 * 工具规划契约错误 — 契约违反时抛出
 */
export type ToolPlanContractError =
  | { code: 'duplicate-tool-name'; name: string }
  | { code: 'missing-executor'; name: string };

// ===================== 协议载荷 =====================

/**
 * 工具协议描述符 — 传递给模型的最小描述
 * 仅包含 name/description/inputSchema，schema 规范化由 model adapter 处理
 */
export interface ToolProtocolDescriptor {
  name: string;
  description: string;
  inputSchema: JsonObject;
}

/** 构建工具规划的入参类型（descriptors 列表） */
export type BuildToolPlanOptions = ToolDescriptor[];
