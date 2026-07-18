/**
 * 定义 host hook 调度 turn 负载的类型。
 *
 * 降级说明：原实现依赖 ./host-hook-json.js 的 PluginJsonValue，
 * cross-wms 暂未移植该模块，这里以本地 JSON 值类型替代。
 */

/** 插件可读写的 JSON 值（降级实现）。 */
export type PluginJsonValue = string | number | boolean | null | PluginJsonValue[] | { [key: string]: PluginJsonValue };

/** 注入到下一个 agent turn 的上下文放置位置。 */
export type PluginNextTurnInjectionPlacement = "prepend_context" | "append_context";

/** 插件请求为某会话注入文本到下一个 turn。 */
export type PluginNextTurnInjection = {
  sessionKey: string;
  text: string;
  idempotencyKey?: string;
  placement?: PluginNextTurnInjectionPlacement;
  ttlMs?: number;
  metadata?: PluginJsonValue;
};

/** 附加会话/插件元数据后存储的 next-turn 注入记录。 */
export type PluginNextTurnInjectionRecord = Omit<PluginNextTurnInjection, "sessionKey"> & {
  id: string;
  pluginId: string;
  pluginName?: string;
  createdAt: number;
  placement: PluginNextTurnInjectionPlacement;
};

/** 入队 next-turn 注入后返回的结果。 */
export type PluginNextTurnInjectionEnqueueResult = {
  enqueued: boolean;
  id: string;
  sessionKey: string;
};

/** agent turn 准备前传给插件的事件。 */
export type PluginAgentTurnPrepareEvent = {
  prompt: string;
  messages: unknown[];
  queuedInjections: PluginNextTurnInjectionRecord[];
};

/** 插件为已准备的 agent turn 前置/追加上下文的贡献。 */
export type PluginAgentTurnPrepareResult = {
  prependContext?: string;
  appendContext?: string;
};

/** 传给贡献 heartbeat prompt 上下文的插件的事件。 */
export type PluginHeartbeatPromptContributionEvent = {
  sessionKey?: string;
  agentId?: string;
  heartbeatName?: string;
};

/** 插件对 heartbeat prompt 上下文的贡献。 */
export type PluginHeartbeatPromptContributionResult = {
  prependContext?: string;
  appendContext?: string;
};
