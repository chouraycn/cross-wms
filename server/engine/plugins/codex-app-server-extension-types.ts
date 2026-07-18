/**
 * 定义 Codex app-server 通过插件暴露的扩展契约。
 *
 * 降级说明：原实现依赖 ../agents/runtime/index.js 的 AgentToolResult，
 * cross-wms 暂未移植该模块，这里以本地 unknown 占位类型替代。
 */

/** Agent 工具结果（降级为 unknown 占位）。 */
export type AgentToolResult<T = unknown> = { result?: T };

/** 发送给 Codex app-server 插件扩展的工具结果事件。 */
export type CodexAppServerToolResultEvent = {
  threadId: string;
  turnId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: AgentToolResult<unknown>;
};

/** Codex app-server 扩展事件附带的会话上下文。 */
export type CodexAppServerExtensionContext = {
  agentId?: string;
  sessionId?: string;
  sessionKey?: string;
  runId?: string;
};

/** Codex app-server 扩展处理器返回的可选替换结果。 */
export type CodexAppServerToolResultHandlerResult = {
  result: AgentToolResult<unknown>;
};

/** 暴露给 Codex app-server 扩展工厂的运行时事件面。 */
export type CodexAppServerExtensionRuntime = {
  on: (
    event: "tool_result",
    handler: (
      event: CodexAppServerToolResultEvent,
      ctx: CodexAppServerExtensionContext,
    ) =>
      | Promise<CodexAppServerToolResultHandlerResult | void>
      | CodexAppServerToolResultHandlerResult
      | void,
  ) => void;
};

/** Codex app-server 插件扩展的工厂签名。 */
export type CodexAppServerExtensionFactory = (
  runtime: CodexAppServerExtensionRuntime,
) => Promise<void> | void;
