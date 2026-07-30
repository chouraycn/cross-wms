// 会话存储运行时：通道热路径所需的窄会话存储辅助。
// openclaw 原始实现为 barrel 重导出，依赖 ../config/sessions/** 子系统。
// 此处提供最小可用类型与桩函数，待 config/sessions 模块移植后接入。

/** 会话存储读取参数。 */
export type SessionStoreReadParams = {
  agentId?: string;
  env?: NodeJS.ProcessEnv;
  hydrateSkillPromptRefs?: boolean;
  sessionKey: string;
  storePath?: string;
};

/** 会话存储列表参数。 */
export type SessionStoreListParams = Partial<Omit<SessionStoreReadParams, "sessionKey">>;

/** 会话条目（最小结构）。 */
export type SessionEntry = {
  id?: string;
  alias?: string;
  model?: string;
  lastRoute?: string;
  updatedAt?: number;
  meta?: Record<string, unknown>;
};

/** 会话作用域。 */
export type SessionScope = "dm" | "group" | "channel" | "global";

/** 会话访问作用域。 */
export type SessionAccessScope = {
  sessionKey?: string;
  agentId?: string;
  env?: NodeJS.ProcessEnv;
  hydrateSkillPromptRefs?: boolean;
  storePath?: string;
};

/** 会话存储条目摘要。 */
export type SessionStoreEntrySummary = {
  sessionKey: string;
  entry: SessionEntry;
};

/** 会话条目更新函数。 */
export type SessionStoreEntryUpdate = (
  entry: SessionEntry,
) => Promise<Partial<SessionEntry> | null> | Partial<SessionEntry> | null;

/** 会话条目补丁函数。 */
export type SessionStoreEntryPatch = (
  entry: SessionEntry,
  context: { existingEntry?: SessionEntry },
) => Promise<Partial<SessionEntry> | null> | Partial<SessionEntry> | null;

/** 补丁会话条目参数。 */
export type PatchSessionEntryParams = SessionStoreReadParams & {
  fallbackEntry?: SessionEntry;
  maintenanceConfig?: unknown;
  preserveActivity?: boolean;
  replaceEntry?: boolean;
  update: SessionStoreEntryPatch;
};

/** 读取会话更新时间参数。 */
export type ReadSessionUpdatedAtParams = SessionStoreReadParams;

/** 更新会话存储条目参数。 */
export type UpdateSessionStoreEntryParams = {
  storePath: string;
  sessionKey: string;
  update: SessionStoreEntryUpdate;
  skipMaintenance?: boolean;
  takeCacheOwnership?: boolean;
  requireWriteSuccess?: boolean;
};

/** 插入/更新会话条目参数。 */
export type UpsertSessionEntryParams = SessionStoreReadParams & {
  entry: SessionEntry;
};

/** 会话生命周期工件清理参数。 */
export type SessionLifecycleArtifactsCleanupParams = {
  agentId?: string;
  archiveRemovedEntryTranscripts?: boolean;
  env?: NodeJS.ProcessEnv;
  orphanTranscriptMinAgeMs: number;
  sessionStore?: string;
  sessionKeySegmentPrefix: string;
  storePath?: string;
  transcriptContentMarker: string;
  nowMs?: number;
};

/** 会话生命周期工件清理结果。 */
export type SessionLifecycleArtifactsCleanupResult = {
  archivedTranscriptArtifacts: number;
  removedEntries: number;
};

/** 最近会话文本。 */
export type SessionRecentConversationText = {
  userText?: string;
  assistantText?: string;
};

/**
 * @deprecated 使用 getSessionEntry/listSessionEntries 读取，使用
 * patchSessionEntry/upsertSessionEntry 写入。此整体存储辅助仅在 SQLite
 * 迁移前的过渡期保留。调用方应迁移至不直接读取 sessions.json。
 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export async function loadSessionStore(_params?: SessionStoreListParams): Promise<unknown> {
  return { entries: {} };
}

/** 按 agent/session 身份加载单条会话条目。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export function getSessionEntry(_params: SessionStoreReadParams): SessionEntry | undefined {
  return undefined;
}

/** 列出单个 agent 的会话条目。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export function listSessionEntries(
  _params: SessionStoreListParams = {},
): SessionStoreEntrySummary[] {
  return [];
}

/** 按 agent/session 身份补丁单条会话条目。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export async function patchSessionEntry(
  _params: PatchSessionEntryParams,
): Promise<SessionEntry | null> {
  return null;
}

/** 读取单条会话条目的最近活动时间戳。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export function readSessionUpdatedAt(_params: ReadSessionUpdatedAtParams): number | undefined {
  return undefined;
}

/** 按存储路径与会话键更新已存在的会话条目。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export async function updateSessionStoreEntry(
  _params: UpdateSessionStoreEntryParams,
): Promise<SessionEntry | null> {
  return null;
}

/** 按 agent/session 身份替换或创建单条会话条目。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export async function upsertSessionEntry(_params: UpsertSessionEntryParams): Promise<void> {
  // 待 config/sessions/store.js 移植后接入
}

/** 清理单个 agent 存储的陈旧生命周期会话条目与孤儿 transcript。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export async function cleanupSessionLifecycleArtifacts(
  _params: SessionLifecycleArtifactsCleanupParams,
): Promise<SessionLifecycleArtifactsCleanupResult> {
  return { archivedTranscriptArtifacts: 0, removedEntries: 0 };
}

/** 解析会话存储条目。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export function resolveSessionStoreEntry(
  _store: unknown,
  _key: string,
): SessionEntry | undefined {
  return undefined;
}

/** 解析存储路径。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export function resolveStorePath(
  _sessionStore?: string,
  _context?: { agentId?: string; env?: NodeJS.ProcessEnv },
): string {
  return "state/sessions.json";
}

/** 解析目录内会话 transcript 路径。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export function resolveSessionTranscriptPathInDir(_dir: string): string {
  return "transcript.jsonl";
}

/**
 * @deprecated 使用 getSessionEntry 按 agent/session 身份读取会话元数据，
 * 而非解析 transcript 文件路径。仅在 SQLite 迁移前过渡期保留。
 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export function resolveSessionFilePath(_params: unknown): string {
  return "state/transcript.jsonl";
}

/**
 * @deprecated 使用 patchSessionEntry/upsertSessionEntry 按 agent/session
 * 身份持久化会话元数据。仅在 SQLite 迁移前过渡期保留。
 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export async function resolveAndPersistSessionFile(_params: unknown): Promise<string> {
  return "state/transcript.jsonl";
}

/** 读取最近助手文本。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export async function readLatestAssistantTextFromSessionTranscript(
  _sessionFile: string,
): Promise<unknown> {
  return undefined;
}

/** 读取最近用户/助手对话文本。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export async function readRecentUserAssistantTextForSession(
  _sessionFile: string,
): Promise<SessionRecentConversationText | undefined> {
  return undefined;
}

/** 解析会话键。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export function resolveSessionKey(
  _channelId: string,
  _sender: string,
  _scope?: SessionScope,
): string {
  return `${_channelId}:${_sender}`;
}

/** 解析群组会话键。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export function resolveGroupSessionKey(_channelId: string, _groupId: string): string {
  return `${_channelId}:group:${_groupId}`;
}

/** 规范化主会话别名。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export function canonicalizeMainSessionAlias(alias: string): string {
  return alias;
}

/** 清空测试用会话存储缓存。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export function clearSessionStoreCacheForTest(): void {
  // 待 config/sessions/store.js 移植后接入
}

/** 从入站消息记录会话元数据。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export function recordSessionMetaFromInbound(
  _store: unknown,
  _key: string,
  _inbound: unknown,
): void {
  // 待 config/sessions/store.js 移植后接入
}

/** 更新最近路由。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export function updateLastRoute(
  _store: unknown,
  _key: string,
  _route: string,
): void {
  // 待 config/sessions/store.js 移植后接入
}

/**
 * @deprecated 使用 patchSessionEntry/upsertSessionEntry 写入。这些整体
 * 存储辅助仅在 SQLite 迁移前过渡期保留。
 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export async function saveSessionStore(_store: unknown, _path?: string): Promise<void> {
  // 待 config/sessions/store.js 移植后接入
}

/**
 * @deprecated 使用 patchSessionEntry/upsertSessionEntry 写入。
 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export function updateSessionStore(
  _store: unknown,
  _key: string,
  _patch: Partial<SessionEntry>,
): unknown {
  return _store;
}

/** 评估会话新鲜度。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export function evaluateSessionFreshness(_entry: SessionEntry | undefined): boolean {
  return false;
}

/** 解析渠道重置配置。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export function resolveChannelResetConfig(_channelId: string): { mode: string } {
  return { mode: "never" };
}

/** 解析会话重置策略。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export function resolveSessionResetPolicy(_entry: SessionEntry | undefined): string {
  return "never";
}

/** 解析会话重置类型。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export function resolveSessionResetType(_entry: SessionEntry | undefined): string {
  return "never";
}

/** 解析会话线程标记。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export function resolveThreadFlag(_entry: SessionEntry | undefined): boolean {
  return false;
}

/** 解析发送策略。 */
// Contract stub; runtime imports are routed to server/engine/plugin-sdk/* by the resolver
export function resolveSendPolicy(_entry: SessionEntry | undefined): string {
  return "default";
}
