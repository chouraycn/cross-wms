// 会话配置
// 参考 openclaw/src/config/sessions/session-key.ts 与 sessions.ts 门面的设计，
// 提供会话键解析、会话默认值与会话配置解析能力

// ============================================================================
// 常量
// ============================================================================

// 默认会话配置（参考 openclaw SESSION_DEFAULTS 与 sessions/types.ts）
export const SESSION_DEFAULTS = {
  // 主会话键固定为 "main"，忽略用户配置
  mainKey: 'main',
  // 默认会话作用域：direct（直接对话）/ group（群组）/ channel（通道）/ global（全局）
  defaultScope: 'direct' as const,
  // 默认 Agent id
  defaultAgentId: 'default',
  // 未知发送方的兜底键
  unknownSenderKey: 'unknown',
  // 全局作用域键
  globalKey: 'global',
  // 会话键前缀
  agentPrefix: 'agent:',
  groupSeparator: ':group:',
  channelSeparator: ':channel:',
} as const;

// 会话作用域类型
export type SessionScope = 'direct' | 'group' | 'channel' | 'global';

// ============================================================================
// 类型定义
// ============================================================================

// 会话键解析结果
export interface ParsedSessionKey {
  // 原始键
  raw: string;
  // 规范化后的键
  canonical: string;
  // 是否为 Agent 命名空间键（agent:<agentId>:<subKey>）
  namespaced: boolean;
  // 解析出的 agent id（若有）
  agentId?: string;
  // 解析出的子键（main / group:<id> / channel:<id> 等）
  subKey?: string;
  // 是否为群组会话
  isGroup: boolean;
  // 是否为通道会话
  isChannel: boolean;
  // 是否为全局会话
  isGlobal: boolean;
}

// 会话配置
export interface SessionConfig {
  // 主会话键
  mainKey?: string;
  // 默认作用域
  defaultScope?: SessionScope;
  // 默认 agent id
  defaultAgentId?: string;
  [key: string]: unknown;
}

// 会话解析上下文（从消息上下文中提取的最小字段集）
export interface SessionResolveContext {
  // 发送方标识（E.164 号码或 channel 用户 id）
  from?: string;
  // 显式指定的会话键
  sessionKey?: string;
  // 群组标识
  groupKey?: string;
  // 通道标识
  channelKey?: string;
  // agent id（可选，默认使用 SESSION_DEFAULTS.defaultAgentId）
  agentId?: string;
}

// ============================================================================
// 工具函数
// ============================================================================

function normalizeAgentId(agentId: string | undefined): string {
  const trimmed = (agentId ?? '').trim().toLowerCase();
  return trimmed || SESSION_DEFAULTS.defaultAgentId;
}

function normalizeMainKey(mainKey: string | undefined): string {
  const trimmed = (mainKey ?? '').trim().toLowerCase();
  return trimmed || SESSION_DEFAULTS.mainKey;
}

// 判断会话键是否为群组/通道命名空间
function isNamespacedSessionKey(key: string): boolean {
  return key.startsWith(SESSION_DEFAULTS.agentPrefix);
}

// ============================================================================
// 会话键解析
// ============================================================================

// 解析会话键：将原始键拆解为结构化信息
export function parseSessionKey(rawKey: string): ParsedSessionKey {
  const raw = rawKey ?? '';
  const canonical = raw.trim();

  if (!canonical) {
    return {
      raw,
      canonical: SESSION_DEFAULTS.unknownSenderKey,
      namespaced: false,
      isGroup: false,
      isChannel: false,
      isGlobal: false,
    };
  }

  // 全局会话
  if (canonical === SESSION_DEFAULTS.globalKey) {
    return {
      raw,
      canonical,
      namespaced: false,
      isGroup: false,
      isChannel: false,
      isGlobal: true,
    };
  }

  // 命名空间会话：agent:<agentId>:<subKey>
  if (isNamespacedSessionKey(canonical)) {
    const rest = canonical.slice(SESSION_DEFAULTS.agentPrefix.length);
    const separatorIndex = rest.indexOf(':');
    const agentId = separatorIndex === -1 ? rest : rest.slice(0, separatorIndex);
    const subKey = separatorIndex === -1 ? undefined : rest.slice(separatorIndex + 1);
    const isGroup = subKey?.includes(SESSION_DEFAULTS.groupSeparator) ?? false;
    const isChannel = subKey?.includes(SESSION_DEFAULTS.channelSeparator) ?? false;
    return {
      raw,
      canonical,
      namespaced: true,
      agentId: agentId || undefined,
      subKey,
      isGroup,
      isChannel,
      isGlobal: false,
    };
  }

  // 非命名空间键：检测群组/通道标记
  const isGroup = canonical.includes(SESSION_DEFAULTS.groupSeparator);
  const isChannel = canonical.includes(SESSION_DEFAULTS.channelSeparator);
  return {
    raw,
    canonical,
    namespaced: false,
    isGroup,
    isChannel,
    isGlobal: false,
  };
}

// ============================================================================
// 会话键构建
// ============================================================================

// 构建 Agent 主会话键：agent:<agentId>:<mainKey>
export function buildAgentMainSessionKey(params: {
  agentId?: string;
  mainKey?: string;
}): string {
  const agentId = normalizeAgentId(params.agentId);
  const mainKey = normalizeMainKey(params.mainKey);
  return `${SESSION_DEFAULTS.agentPrefix}${agentId}:${mainKey}`;
}

// 构建 Agent 群组会话键：agent:<agentId>:group:<groupKey>
export function buildAgentGroupSessionKey(params: {
  agentId?: string;
  groupKey: string;
}): string {
  const agentId = normalizeAgentId(params.agentId);
  const groupKey = (params.groupKey ?? '').trim();
  if (!groupKey) {
    return buildAgentMainSessionKey({ agentId });
  }
  return `${SESSION_DEFAULTS.agentPrefix}${agentId}${SESSION_DEFAULTS.groupSeparator}${groupKey}`;
}

// 构建 Agent 通道会话键：agent:<agentId>:channel:<channelKey>
export function buildAgentChannelSessionKey(params: {
  agentId?: string;
  channelKey: string;
}): string {
  const agentId = normalizeAgentId(params.agentId);
  const channelKey = (params.channelKey ?? '').trim();
  if (!channelKey) {
    return buildAgentMainSessionKey({ agentId });
  }
  return `${SESSION_DEFAULTS.agentPrefix}${agentId}${SESSION_DEFAULTS.channelSeparator}${channelKey}`;
}

// ============================================================================
// 会话键派生与解析
// ============================================================================

// 从消息上下文派生原始会话桶（在 agent/mainKey 规范化之前的原始键）
export function deriveSessionKey(ctx: SessionResolveContext): string {
  // 显式会话键优先
  const explicit = ctx.sessionKey?.trim();
  if (explicit) {
    return explicit;
  }
  // 群组
  const groupKey = ctx.groupKey?.trim();
  if (groupKey) {
    return `${SESSION_DEFAULTS.groupSeparator}${groupKey}`;
  }
  // 通道
  const channelKey = ctx.channelKey?.trim();
  if (channelKey) {
    return `${SESSION_DEFAULTS.channelSeparator}${channelKey}`;
  }
  // 直接对话：使用发送方标识
  const from = ctx.from?.trim();
  return from || SESSION_DEFAULTS.unknownSenderKey;
}

// 解析持久化的会话存储键
// 显式会话键直接透传；直接对话收敛为 agent 主会话桶；群组/通道会话保持隔离
export function resolveSessionKey(
  ctx: SessionResolveContext,
  options?: {
    mainKey?: string;
    agentId?: string;
    scope?: SessionScope;
  },
): string {
  const scope = options?.scope ?? SESSION_DEFAULTS.defaultScope;

  // 全局作用域直接返回
  if (scope === 'global') {
    return SESSION_DEFAULTS.globalKey;
  }

  const explicit = ctx.sessionKey?.trim();
  if (explicit) {
    return explicit;
  }

  const raw = deriveSessionKey(ctx);
  const agentId = normalizeAgentId(options?.agentId ?? ctx.agentId);
  const mainKey = normalizeMainKey(options?.mainKey);

  const isGroup = raw.includes(SESSION_DEFAULTS.groupSeparator);
  const isChannel = raw.includes(SESSION_DEFAULTS.channelSeparator);

  if (!isGroup && !isChannel) {
    // 直接对话收敛为 agent 主会话桶
    return buildAgentMainSessionKey({ agentId, mainKey });
  }

  // 群组/通道会话按 agent 命名空间隔离
  return `${SESSION_DEFAULTS.agentPrefix}${agentId}:${raw}`;
}

// ============================================================================
// 会话配置解析
// ============================================================================

// 解析会话配置：填充默认值，规范 mainKey
export function resolveSessionConfig(
  cfg: SessionConfig | null | undefined,
): Required<SessionConfig> {
  const source = cfg ?? {};
  return {
    mainKey: SESSION_DEFAULTS.mainKey,
    defaultScope: source.defaultScope ?? SESSION_DEFAULTS.defaultScope,
    defaultAgentId: source.defaultAgentId ?? SESSION_DEFAULTS.defaultAgentId,
    ...stripUndefinedKeys(source, ['mainKey', 'defaultScope', 'defaultAgentId']),
  };
}

// 从配置对象中移除指定键的 undefined 值，便于合并
function stripUndefinedKeys(
  source: Record<string, unknown>,
  excludeKeys: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (excludeKeys.includes(key)) {
      continue;
    }
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

// ============================================================================
// 会话作用域判断
// ============================================================================

// 判断会话键是否为主会话（agent:<id>:main 形式）
export function isMainSessionKey(key: string): boolean {
  const parsed = parseSessionKey(key);
  if (!parsed.namespaced) {
    return false;
  }
  return parsed.subKey === SESSION_DEFAULTS.mainKey;
}

// 判断会话键是否为群组会话
export function isGroupSessionKey(key: string): boolean {
  return parseSessionKey(key).isGroup;
}

// 判断会话键是否为通道会话
export function isChannelSessionKey(key: string): boolean {
  return parseSessionKey(key).isChannel;
}
