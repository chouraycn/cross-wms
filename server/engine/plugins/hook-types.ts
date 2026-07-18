/**
 * 插件 hook 名称、弃用策略与核心 hook 类型定义。
 *
 * 降级说明：原实现聚合了 ../agents/runtime、../auto-reply、../config、
 * ../infra/diagnostic-trace-context 等大量外部模块的类型，并 re-export
 * 多个兄弟文件的 hook 类型。cross-wms 暂未移植这些模块，这里保留无外部
 * 依赖的常量（PLUGIN_HOOK_NAMES、弃用策略、分类集合）与仅依赖本目录已
 * 移植文件的类型，其余外部类型以 unknown 占位或省略 re-export。
 */

export type PluginHookName =
  | "before_model_resolve"
  | "agent_turn_prepare"
  | "before_prompt_build"
  | "before_agent_start"
  | "before_agent_reply"
  | "model_call_started"
  | "model_call_ended"
  | "llm_input"
  | "llm_output"
  | "before_agent_finalize"
  | "agent_end"
  | "before_compaction"
  | "after_compaction"
  | "before_reset"
  | "inbound_claim"
  | "message_received"
  | "message_sending"
  | "reply_payload_sending"
  | "message_sent"
  | "before_tool_call"
  | "after_tool_call"
  | "tool_result_persist"
  | "before_message_write"
  | "session_start"
  | "session_end"
  /**
   * @deprecated 核心通过 channel session-binding adapter 在 `subagent_spawned`
   * 触发前准备线程绑定的 subagent 绑定。新插件请用 `subagent_spawned` 做启动后观察。
   */
  | "subagent_spawning"
  | "subagent_delivery_target"
  | "subagent_spawned"
  | "subagent_ended"
  /** @deprecated Use gateway_stop. */
  | "deactivate"
  | "gateway_start"
  | "gateway_stop"
  | "heartbeat_prompt_contribution"
  | "cron_changed"
  | "before_dispatch"
  | "reply_dispatch"
  | "before_install"
  | "before_agent_run"
  | "resolve_exec_env";

export const PLUGIN_HOOK_NAMES = [
  "before_model_resolve",
  "agent_turn_prepare",
  "before_prompt_build",
  "before_agent_start",
  "before_agent_reply",
  "model_call_started",
  "model_call_ended",
  "llm_input",
  "llm_output",
  "before_agent_finalize",
  "agent_end",
  "before_compaction",
  "after_compaction",
  "before_reset",
  "inbound_claim",
  "message_received",
  "message_sending",
  "reply_payload_sending",
  "message_sent",
  "before_tool_call",
  "after_tool_call",
  "tool_result_persist",
  "before_message_write",
  "session_start",
  "session_end",
  "subagent_spawning",
  "subagent_delivery_target",
  "subagent_spawned",
  "subagent_ended",
  "deactivate",
  "gateway_start",
  "gateway_stop",
  "heartbeat_prompt_contribution",
  "cron_changed",
  "before_dispatch",
  "reply_dispatch",
  "before_install",
  "before_agent_run",
  "resolve_exec_env",
] as const satisfies readonly PluginHookName[];

type MissingPluginHookNames = Exclude<PluginHookName, (typeof PLUGIN_HOOK_NAMES)[number]>;
type AssertAllPluginHookNamesListed = MissingPluginHookNames extends never ? true : never;
const assertAllPluginHookNamesListed: AssertAllPluginHookNamesListed = true;
void assertAllPluginHookNamesListed;

export type DeprecatedPluginHookName = "subagent_spawning" | "deactivate";

export type PluginHookDeprecation = {
  replacement: string;
  reason: string;
  removeAfter?: string;
};

export const DEPRECATED_PLUGIN_HOOKS = {
  subagent_spawning: {
    replacement: "`subagent_spawned` for observation; core session bindings for routing",
    reason:
      "Core prepares thread-bound subagent bindings through channel session-binding adapters before `subagent_spawned` fires.",
    removeAfter: "2026-08-30",
  },
  deactivate: {
    replacement: "`gateway_stop`",
    reason: "`deactivate` is a legacy cleanup hook alias for `gateway_stop`.",
    removeAfter: "2026-08-16",
  },
} as const satisfies Record<DeprecatedPluginHookName, PluginHookDeprecation>;

export const DEPRECATED_PLUGIN_HOOK_NAMES = Object.keys(
  DEPRECATED_PLUGIN_HOOKS,
) as DeprecatedPluginHookName[];

const deprecatedPluginHookNameSet = new Set<PluginHookName>(DEPRECATED_PLUGIN_HOOK_NAMES);

export const isDeprecatedPluginHookName = (
  hookName: PluginHookName,
): hookName is DeprecatedPluginHookName => deprecatedPluginHookNameSet.has(hookName);

const pluginHookNameSet = new Set<PluginHookName>(PLUGIN_HOOK_NAMES);

export const isPluginHookName = (hookName: unknown): hookName is PluginHookName =>
  typeof hookName === "string" && pluginHookNameSet.has(hookName as PluginHookName);

export const PROMPT_INJECTION_HOOK_NAMES = [
  "agent_turn_prepare",
  "before_prompt_build",
  "before_agent_start",
  "heartbeat_prompt_contribution",
] as const satisfies readonly PluginHookName[];

export type PromptInjectionHookName = (typeof PROMPT_INJECTION_HOOK_NAMES)[number];

const promptInjectionHookNameSet = new Set<PluginHookName>(PROMPT_INJECTION_HOOK_NAMES);

export const isPromptInjectionHookName = (hookName: PluginHookName): boolean =>
  promptInjectionHookNameSet.has(hookName);

export const CONVERSATION_HOOK_NAMES = [
  "before_model_resolve",
  "before_agent_reply",
  "llm_input",
  "llm_output",
  "before_agent_finalize",
  "agent_end",
  "before_agent_run",
] as const satisfies readonly PluginHookName[];

export type ConversationHookName = (typeof CONVERSATION_HOOK_NAMES)[number];

const conversationHookNameSet = new Set<PluginHookName>(CONVERSATION_HOOK_NAMES);

export const isConversationHookName = (hookName: PluginHookName): boolean =>
  conversationHookNameSet.has(hookName);

/**
 * 插件 hook 注册项。原实现引用 PluginHookHandlerMap 的具体 handler 签名，
 * 此处降级为 unknown handler 以避免拉入大量外部事件类型。
 */
export type PluginHookRegistration<K extends PluginHookName = PluginHookName> = {
  pluginId: string;
  hookName: K;
  handler: (...args: unknown[]) => unknown;
  priority?: number;
  timeoutMs?: number;
  source: string;
};
