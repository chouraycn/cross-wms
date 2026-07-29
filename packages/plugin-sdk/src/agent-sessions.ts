// Agent 会话：会话条目类型与持久化辅助。
// openclaw 原始实现为 barrel 重导出，依赖 ../agents/sessions/index.js。
// 此处提供最小可用类型与桩函数，待依赖子系统移植后接入。

/** agent 会话条目。 */
export type AgentSessionEntry = {
  /** 会话 ID。 */
  sessionId: string;
  /** 关联的 agent ID。 */
  agentId: string;
  /** 会话键。 */
  sessionKey?: string;
  /** 最近使用的模型。 */
  model?: string;
  /** 会话状态。 */
  status?: "active" | "idle" | "closed";
  /** 创建时间戳。 */
  createdAt?: number;
  /** 最近更新时间戳。 */
  updatedAt?: number;
  /** 会话元数据。 */
  meta?: Record<string, unknown>;
};

/** agent 会话存储。 */
export type AgentSessionStore = {
  entries: Record<string, AgentSessionEntry>;
};

/** 创建 agent 会话参数。 */
export type CreateAgentSessionParams = {
  agentId: string;
  sessionKey?: string;
  model?: string;
  meta?: Record<string, unknown>;
};

/** 更新 agent 会话参数。 */
export type UpdateAgentSessionParams = {
  sessionId: string;
  model?: string;
  status?: AgentSessionEntry["status"];
  meta?: Record<string, unknown>;
};

/** 查询 agent 会话参数。 */
export type QueryAgentSessionsParams = {
  agentId?: string;
  status?: AgentSessionEntry["status"];
  limit?: number;
};

/** 加载 agent 会话存储。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function loadAgentSessionStore(_path?: string): Promise<AgentSessionStore> {
  return { entries: {} };
}

/** 保存 agent 会话存储。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function saveAgentSessionStore(_store: AgentSessionStore, _path?: string): Promise<void> {
  // 待 agents/sessions 移植后接入
}

/** 创建 agent 会话。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function createAgentSession(
  params: CreateAgentSessionParams,
): Promise<AgentSessionEntry> {
  const now = Date.now();
  return {
    sessionId: `session-${now}`,
    agentId: params.agentId,
    sessionKey: params.sessionKey,
    model: params.model,
    status: "active",
    createdAt: now,
    updatedAt: now,
    meta: params.meta,
  };
}

/** 获取 agent 会话。 */
// TODO: 依赖模块未移植，暂用本地桩
export function getAgentSession(
  _store: AgentSessionStore,
  sessionId: string,
): AgentSessionEntry | undefined {
  return undefined;
}

/** 更新 agent 会话。 */
// TODO: 依赖模块未移植，暂用本地桩
export function updateAgentSession(
  store: AgentSessionStore,
  params: UpdateAgentSessionParams,
): AgentSessionEntry | undefined {
  const entry = store.entries[params.sessionId];
  if (!entry) return undefined;
  const updated: AgentSessionEntry = {
    ...entry,
    ...(params.model !== undefined ? { model: params.model } : {}),
    ...(params.status !== undefined ? { status: params.status } : {}),
    ...(params.meta !== undefined ? { meta: params.meta } : {}),
    updatedAt: Date.now(),
  };
  store.entries[params.sessionId] = updated;
  return updated;
}

/** 查询 agent 会话列表。 */
// TODO: 依赖模块未移植，暂用本地桩
export function queryAgentSessions(
  store: AgentSessionStore,
  params: QueryAgentSessionsParams = {},
): AgentSessionEntry[] {
  let results = Object.values(store.entries);
  if (params.agentId) {
    results = results.filter((e) => e.agentId === params.agentId);
  }
  if (params.status) {
    results = results.filter((e) => e.status === params.status);
  }
  if (params.limit) {
    results = results.slice(0, params.limit);
  }
  return results;
}

/** 删除 agent 会话。 */
// TODO: 依赖模块未移植，暂用本地桩
export function deleteAgentSession(
  store: AgentSessionStore,
  sessionId: string,
): boolean {
  if (store.entries[sessionId]) {
    delete store.entries[sessionId];
    return true;
  }
  return false;
}

/** 关闭 agent 会话。 */
// TODO: 依赖模块未移植，暂用本地桩
export function closeAgentSession(
  store: AgentSessionStore,
  sessionId: string,
): AgentSessionEntry | undefined {
  return updateAgentSession(store, { sessionId, status: "closed" });
}
