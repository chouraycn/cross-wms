// Agent 核心契约：定义插件可用的最小 agent 请求与响应形状。
// openclaw 原始实现从 ../../packages/agent-core/src/agent.js、runtime-deps.js、
// ../../packages/llm-core/src/index.js、./llm.js 导入，并 barrel 重导出
// ../../packages/agent-core/src/index.js 与 ../agents/runtime/proxy.js。
// 此处提供最小可用类型与桩函数，待依赖子系统移植后接入。

/** agent 选项。 */
export type AgentOptions = {
  /** 模型 ID。 */
  model?: string;
  /** 系统提示词。 */
  systemPrompt?: string;
  /** 工具定义列表。 */
  tools?: unknown[];
  /** 最大轮次。 */
  maxTurns?: number;
  /** 温度参数。 */
  temperature?: number;
  /** 运行时依赖。 */
  runtime?: AgentCoreRuntimeDeps;
};

/** agent 核心运行时依赖。 */
export type AgentCoreRuntimeDeps = {
  completeSimple: CompleteSimpleFn;
  streamSimple: StreamFn;
};

/** 简单补全函数类型。 */
export type CompleteSimpleFn = (
  params: unknown,
) => Promise<unknown>;

/** 流式函数类型。 */
export type StreamFn = (
  params: unknown,
  options?: unknown,
) => AsyncIterable<unknown>;

/** agent 请求。 */
export type AgentRequest = {
  /** 输入文本。 */
  input: string;
  /** 会话 ID。 */
  sessionId?: string;
  /** 关联的 agent ID。 */
  agentId?: string;
  /** 额外上下文。 */
  context?: Record<string, unknown>;
};

/** agent 响应。 */
export type AgentResponse = {
  /** 输出文本。 */
  output: string;
  /** 会话 ID。 */
  sessionId?: string;
  /** 是否完成。 */
  done: boolean;
  /** 工具调用结果。 */
  toolCalls?: unknown[];
};

/** agent 事件种类。 */
export type AgentEventKind =
  | "text"
  | "tool-call"
  | "tool-result"
  | "thinking"
  | "error"
  | "done";

/** agent 事件。 */
export type AgentEvent = {
  kind: AgentEventKind;
  text?: string;
  toolCall?: unknown;
  toolResult?: unknown;
  error?: string;
};

/** agent 运行参数。 */
export type AgentRunParams = AgentRequest & {
  onEvent?: (event: AgentEvent) => void;
  signal?: AbortSignal;
};

/** agent 运行结果。 */
export type AgentRunResult = AgentResponse & {
  events: AgentEvent[];
};

/** 运行时适配器，使 agent-core 包能使用 OpenClaw LLM 辅助。 */
export const openClawAgentCoreRuntime: AgentCoreRuntimeDeps = {
  // Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
  completeSimple: async () => ({}),
  streamSimple: async function* () {
    // 待 llm.js 移植后接入
  },
};

/** 预配置 OpenClaw 运行时依赖的 agent 核心类。 */
export class Agent {
  private options: AgentOptions;

  constructor(options: AgentOptions = {}) {
    this.options = { runtime: openClawAgentCoreRuntime, ...options };
  }

  /** 运行 agent。 */
  // Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
  async run(_params: AgentRunParams): Promise<AgentRunResult> {
    return {
      output: "",
      done: true,
      events: [],
    };
  }

  /** 流式运行 agent。 */
  // Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
  async *stream(_params: AgentRunParams): AsyncIterable<AgentEvent> {
    // 待 agent-core 包移植后接入
  }

  /** 中止当前运行。 */
  abort(): void {
    // 待 agent-core 包移植后接入
  }
}

/** agent 代理解析参数。 */
export type AgentProxyResolveParams = {
  agentId?: string;
  cfg?: unknown;
};

/** agent 代理解析结果。 */
export type AgentProxyResolveResult = {
  agentId: string;
  model?: string;
  systemPrompt?: string;
};

/** 解析 agent 代理。 */
// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function resolveAgentProxy(
  _params: AgentProxyResolveParams,
): AgentProxyResolveResult | undefined {
  return undefined;
}

/** agent 代理注册参数。 */
export type AgentProxyRegisterParams = {
  agentId: string;
  model?: string;
  systemPrompt?: string;
};

/** 注册 agent 代理。 */
// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function registerAgentProxy(_params: AgentProxyRegisterParams): void {
  // 待 agents/runtime/proxy.js 移植后接入
}
