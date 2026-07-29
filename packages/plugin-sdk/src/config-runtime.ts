// 配置运行时公共 SDK 子路径：会话存储、配置读写、策略解析等。
// @deprecated 原 openclaw 实现为 barrel 重导出，依赖 ../config/**、../agents/**、
// ../gateway/**、../cron/** 等大量未移植子系统。此处提供最小可用类型与桩函数。
// 建议优先使用更窄的子路径：plugin-config-runtime、config-mutation、runtime-config-snapshot。

// ---- 会话存储条目类型与操作 ----

/** 会话存储中的单条会话条目。 */
export type SessionStoreEntry = {
  /** 会话唯一标识。 */
  id: string;
  /** 会话别名。 */
  alias?: string;
  /** 最近使用的模型 ID。 */
  model?: string;
  /** 最近路由的渠道 ID。 */
  lastRoute?: string;
  /** 更新时间戳（毫秒）。 */
  updatedAt?: number;
  /** 自定义元数据。 */
  meta?: Record<string, unknown>;
};

/** 会话重置模式。 */
export type SessionResetMode = "never" | "idle" | "manual" | "on-start";

/** 会话作用域。 */
export type SessionScope = "dm" | "group" | "channel" | "global";

/** 整体会话存储结构。 */
export type SessionStore = {
  entries: Record<string, SessionStoreEntry>;
};

// TODO: 依赖模块未移植，暂用本地桩
export async function loadSessionStore(_path?: string): Promise<SessionStore> {
  return { entries: {} };
}

// TODO: 依赖模块未移植，暂用本地桩
export function getSessionEntry(_store: SessionStore, _key: string): SessionStoreEntry | undefined {
  return undefined;
}

// TODO: 依赖模块未移植，暂用本地桩
export function listSessionEntries(store: SessionStore): SessionStoreEntry[] {
  return Object.values(store.entries);
}

// TODO: 依赖模块未移植，暂用本地桩
export function patchSessionEntry(
  store: SessionStore,
  key: string,
  patch: Partial<SessionStoreEntry>,
): SessionStoreEntry {
  const existing = store.entries[key] ?? { id: key };
  const updated = { ...existing, ...patch, updatedAt: Date.now() };
  store.entries[key] = updated;
  return updated;
}

// TODO: 依赖模块未移植，暂用本地桩
export function readSessionUpdatedAt(entry: SessionStoreEntry | undefined): number | undefined {
  return entry?.updatedAt;
}

// TODO: 依赖模块未移植，暂用本地桩
export function updateSessionStoreEntry(
  store: SessionStore,
  key: string,
  patch: Partial<SessionStoreEntry>,
): SessionStore {
  patchSessionEntry(store, key, patch);
  return store;
}

// TODO: 依赖模块未移植，暂用本地桩
export function upsertSessionEntry(
  store: SessionStore,
  key: string,
  entry: SessionStoreEntry,
): SessionStore {
  store.entries[key] = { ...entry, updatedAt: Date.now() };
  return store;
}

// TODO: 依赖模块未移植，暂用本地桩
export async function saveSessionStore(_store: SessionStore, _path?: string): Promise<void> {
  // 待 config/sessions/store.js 移植后接入
}

/** 解析默认 agent ID。 */
// TODO: 依赖模块未移植，暂用本地桩
export function resolveDefaultAgentId(): string {
  return "default";
}

// ---- 运行时配置快照 ----

/** 运行时配置快照来源标记。 */
export type RuntimeConfigSourceSnapshot = {
  path?: string;
  loadedAt?: number;
};

/** 配置写入完成后的回调意图。 */
export type ConfigWriteAfterWrite = "restart" | "reload" | "none";

// TODO: 依赖模块未移植，暂用本地桩
export function getRuntimeConfig(): Record<string, unknown> | undefined {
  return undefined;
}

// TODO: 依赖模块未移植，暂用本地桩
export async function loadConfig(_path?: string): Promise<Record<string, unknown>> {
  return {};
}

// TODO: 依赖模块未移植，暂用本地桩
export function setRuntimeConfigSnapshot(_config: Record<string, unknown>): void {
  // 待 config/io.js 移植后接入
}

// TODO: 依赖模块未移植，暂用本地桩
export function clearRuntimeConfigSnapshot(): void {
  // 待 config/io.js 移植后接入
}

// TODO: 依赖模块未移植，暂用本地桩
export function getRuntimeConfigSnapshot(): Record<string, unknown> | undefined {
  return undefined;
}

// TODO: 依赖模块未移植，暂用本地桩
export function getRuntimeConfigSourceSnapshot(): RuntimeConfigSourceSnapshot | undefined {
  return undefined;
}

// TODO: 依赖模块未移植，暂用本地桩
export function clearConfigCache(): void {
  // 待 config/io.js 移植后接入
}

// TODO: 依赖模块未移植，暂用本地桩
export function readConfigFileSnapshotForWrite(): Record<string, unknown> | undefined {
  return undefined;
}

// TODO: 依赖模块未移植，暂用本地桩
export async function writeConfigFile(
  _config: Record<string, unknown>,
  _path?: string,
): Promise<void> {
  // 待 config/io.js 移植后接入
}

// TODO: 依赖模块未移植，暂用本地桩
export async function mutateConfigFile(
  _path: string,
  _mutator: (config: Record<string, unknown>) => Record<string, unknown>,
  _afterWrite?: ConfigWriteAfterWrite,
): Promise<void> {
  // 待 config/mutate.js 移植后接入
}

// TODO: 依赖模块未移植，暂用本地桩
export async function replaceConfigFile(
  _path: string,
  _config: Record<string, unknown>,
  _afterWrite?: ConfigWriteAfterWrite,
): Promise<void> {
  // 待 config/mutate.js 移植后接入
}

// TODO: 依赖模块未移植，暂用本地桩
export function logConfigUpdated(_path?: string): void {
  // 待 config/logging.js 移植后接入
}

// TODO: 依赖模块未移植，暂用本地桩
export async function updateConfig(
  _patch: Record<string, unknown>,
): Promise<void> {
  // 待 commands/models/shared.js 移植后接入
}

// TODO: 依赖模块未移植，暂用本地桩
export function requireRuntimeConfig(): Record<string, unknown> {
  throw new Error("requireRuntimeConfig: runtime config not loaded (dependency not ported)");
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveLivePluginConfigObject(
  _pluginId: string,
): Record<string, unknown> | undefined {
  return undefined;
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolvePluginConfigObject(
  _pluginId: string,
): Record<string, unknown> | undefined {
  return undefined;
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveChannelModelOverride(
  _channelId: string,
): string | undefined {
  return undefined;
}

// ---- 上下文可见性 ----

/** 上下文可见性模式。 */
export type ContextVisibilityMode = "auto" | "always" | "never";

// TODO: 依赖模块未移植，暂用本地桩
export function resolveDefaultContextVisibility(): ContextVisibilityMode {
  return "auto";
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveChannelContextVisibilityMode(
  _channelId: string,
): ContextVisibilityMode {
  return "auto";
}

// TODO: 依赖模块未移植，暂用本地桩
export function evaluateSupplementalContextVisibility(
  _mode: ContextVisibilityMode,
): boolean {
  return false;
}

// TODO: 依赖模块未移植，暂用本地桩
export function filterSupplementalContextItems<T>(items: T[]): T[] {
  return items;
}

// ---- Markdown 表格 ----

/** Markdown 表格渲染模式。 */
export type MarkdownTableMode = "auto" | "pipe" | "grid";

// TODO: 依赖模块未移植，暂用本地桩
export function resolveMarkdownTableMode(): MarkdownTableMode {
  return "auto";
}

// ---- 群组策略 ----

/** 群组策略。 */
export type GroupPolicy = {
  requireMention?: boolean;
  blocked?: boolean;
};

/** 渠道群组策略。 */
export type ChannelGroupPolicy = GroupPolicy & {
  channelId?: string;
};

export const GROUP_POLICY_BLOCKED_LABEL = "blocked";

// TODO: 依赖模块未移植，暂用本地桩
export function resolveDefaultGroupPolicy(): GroupPolicy {
  return { requireMention: false, blocked: false };
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveChannelGroupPolicy(_channelId: string): ChannelGroupPolicy {
  return { requireMention: false, blocked: false };
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveChannelGroupRequireMention(_channelId: string): boolean {
  return false;
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveToolsBySender(
  _channelId: string,
  _sender: string,
): string[] {
  return [];
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveAllowlistProviderRuntimeGroupPolicy(): GroupPolicy {
  return resolveDefaultGroupPolicy();
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveOpenProviderRuntimeGroupPolicy(): GroupPolicy {
  return resolveDefaultGroupPolicy();
}

// TODO: 依赖模块未移植，暂用本地桩
export function warnMissingProviderGroupPolicyFallbackOnce(): void {
  // 待 config/runtime-group-policy.js 移植后接入
}

// ---- 原生命令 ----

// TODO: 依赖模块未移植，暂用本地桩
export function isNativeCommandsExplicitlyDisabled(): boolean {
  return false;
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveNativeCommandsEnabled(): boolean {
  return true;
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveNativeSkillsEnabled(): boolean {
  return true;
}

// ---- Telegram 命令配置 ----

export const TELEGRAM_COMMAND_NAME_PATTERN = /^[a-z0-9_]+$/;

// TODO: 依赖模块未移植，暂用本地桩
export function normalizeTelegramCommandName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveTelegramCustomCommands(): Array<{ name: string; description: string }> {
  return [];
}

// ---- 会话辅助 ----

// TODO: 依赖模块未移植，暂用本地桩
export function resolveSessionKey(
  _channelId: string,
  _sender: string,
  _scope?: SessionScope,
): string {
  return `${_channelId}:${_sender}`;
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveStorePath(_agentId?: string): string {
  return "state/sessions.json";
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveGroupSessionKey(_channelId: string, _groupId: string): string {
  return `${_channelId}:group:${_groupId}`;
}

// TODO: 依赖模块未移植，暂用本地桩
export function canonicalizeMainSessionAlias(alias: string): string {
  return alias;
}

// TODO: 依赖模块未移植，暂用本地桩
export function evaluateSessionFreshness(_entry: SessionStoreEntry | undefined): boolean {
  return false;
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveChannelResetConfig(_channelId: string): { mode: SessionResetMode } {
  return { mode: "never" };
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveSessionResetPolicy(_entry: SessionStoreEntry | undefined): SessionResetMode {
  return "never";
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveSessionResetType(_entry: SessionStoreEntry | undefined): SessionResetMode {
  return "never";
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveThreadFlag(_entry: SessionStoreEntry | undefined): boolean {
  return false;
}

// TODO: 依赖模块未移植，暂用本地桩
export function recordSessionMetaFromInbound(
  _store: SessionStore,
  _key: string,
  _inbound: unknown,
): void {
  // 待 config/sessions/store.js 移植后接入
}

// TODO: 依赖模块未移植，暂用本地桩
export function updateLastRoute(
  _store: SessionStore,
  _key: string,
  _route: string,
): void {
  // 待 config/sessions/store.js 移植后接入
}

// TODO: 依赖模块未移植，暂用本地桩
export function updateSessionStore(
  _store: SessionStore,
  _key: string,
  _patch: Partial<SessionStoreEntry>,
): SessionStore {
  return _store;
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveSessionStoreEntry(
  _store: SessionStore,
  _key: string,
): SessionStoreEntry | undefined {
  return undefined;
}

// TODO: 依赖模块未移植，暂用本地桩
export function clearSessionStoreCacheForTest(): void {
  // 待 config/sessions/store.js 移植后接入
}

// ---- 危险名称匹配 ----

// TODO: 依赖模块未移植，暂用本地桩
export function isDangerousNameMatchingEnabled(): boolean {
  return false;
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveDangerousNameMatchingEnabled(): boolean {
  return false;
}

// ---- TTS / Talk ----

/** TTS 模式。 */
export type TtsMode = "auto" | "manual" | "off";
/** TTS 自动模式。 */
export type TtsAutoMode = "voice" | "text";
/** TTS 提供商。 */
export type TtsProvider = "openai" | "elevenlabs" | "azure";

// TODO: 依赖模块未移植，暂用本地桩
export function resolveActiveTalkProviderConfig(): unknown {
  return undefined;
}

// ---- Agent 并发 ----

// TODO: 依赖模块未移植，暂用本地桩
export function resolveAgentMaxConcurrent(): number {
  return 1;
}

// ---- Cron 存储 ----

// TODO: 依赖模块未移植，暂用本地桩
export async function loadCronStore(_path?: string): Promise<unknown> {
  return {};
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveCronStorePath(): string {
  return "state/cron.json";
}

// TODO: 依赖模块未移植，暂用本地桩
export async function saveCronStore(_store: unknown, _path?: string): Promise<void> {
  // 待 cron/store.js 移植后接入
}

// ---- 模型覆盖 ----

// TODO: 依赖模块未移植，暂用本地桩
export function applyModelOverrideToSessionEntry(
  _entry: SessionStoreEntry,
  _model: string,
): SessionStoreEntry {
  return _entry;
}

// ---- Secret 引用 ----

/** Secret 引用。 */
export type SecretRef = {
  ref: string;
};

// TODO: 依赖模块未移植，暂用本地桩
export function coerceSecretRef(value: unknown): SecretRef | string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "ref" in value) return value as SecretRef;
  return "";
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveConfiguredSecretInputString(
  _input: unknown,
): string | undefined {
  return undefined;
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveConfiguredSecretInputWithFallback(
  _input: unknown,
  fallback?: string,
): string {
  return fallback ?? "";
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveRequiredConfiguredSecretRefInputString(
  _input: unknown,
): string {
  throw new Error("resolveRequiredConfiguredSecretRefInputString: dependency not ported");
}
