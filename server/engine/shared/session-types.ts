// gateway 会话列表 API 返回的 agent identity 字段
/** gateway 会话列表 API 返回的 agent 标识字段 */
export type GatewayAgentIdentity = {
  name?: string;
  theme?: string;
  emoji?: string;
  avatar?: string;
  avatarUrl?: string;
};

/** agent/会话行的模型摘要 */
export type GatewayAgentModel = {
  primary?: string;
  fallbacks?: string[];
};

/** agent 行的运行时选择元数据 */
export type GatewayAgentRuntime = {
  id: string;
  fallback?: "openclaw" | "none";
  source: "env" | "agent" | "defaults" | "model" | "provider" | "implicit" | "session-key";
};

/** 暴露给 UI 客户端的 thinking-level 选项 */
export type GatewayThinkingLevelOption = {
  id: string;
  label: string;
};

/** 会话列表响应使用的通用 agent 行形状 */
export type GatewayAgentRow = {
  id: string;
  name?: string;
  identity?: GatewayAgentIdentity;
  workspace?: string;
  model?: GatewayAgentModel;
  agentRuntime?: GatewayAgentRuntime;
  thinkingLevels?: GatewayThinkingLevelOption[];
  thinkingOptions?: string[];
  thinkingDefault?: string;
};

/** 分页会话列表响应的通用基类 */
export type SessionsListResultBase<TDefaults, TRow> = {
  ts: number;
  path: string;
  count: number;
  totalCount?: number;
  limitApplied?: number;
  offset?: number;
  nextOffset?: number | null;
  hasMore?: boolean;
  defaults: TDefaults;
  sessions: TRow[];
};

/** 成功会话 patch 响应的通用基类 */
export type SessionsPatchResultBase<TEntry> = {
  ok: true;
  path: string;
  key: string;
  entry: TEntry;
};
