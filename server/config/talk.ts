// 对话（语音/Talk）模式配置规范化与解析
// 参考 openclaw/src/config/talk.ts 与 talk-defaults.ts 的设计，
// 提供对话模式配置、TTS（文本转语音）配置、provider 规范化与活动 provider 解析能力。
// cross-wms 为自包含实现，不依赖 openclaw 的 types.gateway / types.secrets 模块。

import { logger } from '../logger.js';

// ============================================================================
// 平台默认值（参考 openclaw talk-defaults.ts）
// ============================================================================

// 各平台语音对话静默超时默认值（毫秒），用于语音回合切分
const TALK_SILENCE_TIMEOUT_MS_BY_PLATFORM = {
  macos: 700,
  android: 700,
  ios: 900,
} as const;

// 格式化 talk 静默超时默认值，供配置帮助文本使用
export function describeTalkSilenceTimeoutDefaults(): string {
  const macos = TALK_SILENCE_TIMEOUT_MS_BY_PLATFORM.macos;
  const ios = TALK_SILENCE_TIMEOUT_MS_BY_PLATFORM.ios;
  return `${macos} ms on macOS and Android, ${ios} ms on iOS`;
}

// ============================================================================
// 默认配置
// ============================================================================

// Talk 配置默认值
export const TALK_CONFIG_DEFAULTS = {
  // 默认语音 provider
  defaultProvider: 'system',
  // 默认静默超时（macOS / Android）
  silenceTimeoutMs: TALK_SILENCE_TIMEOUT_MS_BY_PLATFORM.macos,
  // 默认语音 locale
  speechLocale: 'zh-CN',
  // 默认是否允许语音打断
  interruptOnSpeech: false,
  // 默认咨询思考级别
  consultThinkingLevel: 'medium' as const,
  // 默认快速模式
  consultFastMode: false,
  // 默认实时模式
  realtimeMode: 'stt-tts' as const,
  // 默认传输方式
  transport: 'gateway-relay' as const,
  // 默认大脑模式
  brain: 'agent-consult' as const,
  // 默认咨询路由
  consultRouting: 'provider-direct' as const,
} as const;

// ============================================================================
// 类型定义
// ============================================================================

// Talk provider 配置（provider 拥有的字段，如 voiceId/modelId/apiKey 等）
export interface TalkProviderConfig {
  // 语音 id
  voiceId?: string;
  // 语音别名
  voiceAliases?: string[];
  // 模型 id
  modelId?: string;
  // 输出格式
  outputFormat?: string;
  // API 密钥（明文或密钥引用）
  apiKey?: string | { ref?: string; env?: string };
  // 其他 provider 拥有字段
  [key: string]: unknown;
}

// Talk realtime 配置
export interface TalkRealtimeConfig {
  // provider 标识
  provider?: string;
  // provider 映射
  providers?: Record<string, TalkProviderConfig>;
  // 模型 id
  model?: string;
  // 语音标识
  voice?: string;
  // 说话人语音标识
  speakerVoice?: string;
  // 说话人语音 id
  speakerVoiceId?: string;
  // 实时指令
  instructions?: string;
  // 实时模式：realtime / stt-tts / transcription
  mode?: 'realtime' | 'stt-tts' | 'transcription';
  // 传输方式：webrtc / provider-websocket / gateway-relay / managed-room
  transport?: 'webrtc' | 'provider-websocket' | 'gateway-relay' | 'managed-room';
  // 大脑模式：agent-consult / direct-tools / none
  brain?: 'agent-consult' | 'direct-tools' | 'none';
  // 咨询路由：provider-direct / force-agent-consult
  consultRouting?: 'provider-direct' | 'force-agent-consult';
}

// Talk 配置节
export interface TalkConfig {
  // 语音 locale
  speechLocale?: string;
  // 是否允许语音打断
  interruptOnSpeech?: boolean;
  // 咨询思考级别
  consultThinkingLevel?: string;
  // 咨询快速模式
  consultFastMode?: boolean;
  // 静默超时（毫秒）
  silenceTimeoutMs?: number;
  // 当前活动 provider
  provider?: string;
  // provider 映射
  providers?: Record<string, TalkProviderConfig>;
  // realtime 配置
  realtime?: TalkRealtimeConfig;
}

// 解析后的活动 Talk provider 配置
export interface ResolvedTalkConfig {
  // 活动 provider 标识
  provider: string;
  // provider 拥有配置
  config: TalkProviderConfig;
}

// Talk 配置响应（网关 talk.config 负载）
export interface TalkConfigResponse {
  // 是否允许语音打断
  interruptOnSpeech?: boolean;
  // 静默超时（毫秒）
  silenceTimeoutMs?: number;
  // 咨询思考级别
  consultThinkingLevel?: string;
  // 咨询快速模式
  consultFastMode?: boolean;
  // 语音 locale
  speechLocale?: string;
  // provider 映射
  providers?: Record<string, TalkProviderConfig>;
  // realtime 配置
  realtime?: TalkRealtimeConfig;
  // 当前活动 provider
  provider?: string;
  // 解析后的活动 provider 配置
  resolved?: ResolvedTalkConfig;
}

// ============================================================================
// 工具函数
// ============================================================================

// 判断值是否为普通对象（非数组、非 null）
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 规范化可选字符串：去空白后返回，空串返回 undefined
function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// 规范化 Talk 密钥输入：字符串直接返回，对象视为密钥引用
function normalizeTalkSecretInput(
  value: unknown,
): TalkProviderConfig['apiKey'] | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (isRecord(value)) {
    const ref = normalizeOptionalString(value.ref);
    const env = normalizeOptionalString(value.env);
    if (ref || env) {
      const refObj: { ref?: string; env?: string } = {};
      if (ref) {
        refObj.ref = ref;
      }
      if (env) {
        refObj.env = env;
      }
      return refObj;
    }
  }
  return undefined;
}

// 规范化静默超时：仅接受正整数
function normalizeSilenceTimeoutMs(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

// 规范化思考级别：仅接受 known 值
function normalizeThinkLevel(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const allowed = ['off', 'low', 'medium', 'high'];
  return allowed.includes(value) ? value : undefined;
}

// 规范化快速模式：布尔或字符串 "on"/"off"/"auto"
function normalizeFastMode(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'on' || trimmed === 'true' || trimmed === '1') {
      return true;
    }
    if (trimmed === 'off' || trimmed === 'false' || trimmed === '0') {
      return false;
    }
  }
  return undefined;
}

// 从遗留 flat provider 字段构建兼容 provider 配置
function buildLegacyTalkProviderCompat(
  value: Record<string, unknown>,
): TalkProviderConfig | undefined {
  const provider: TalkProviderConfig = {};
  for (const key of ['voiceId', 'voiceAliases', 'modelId', 'outputFormat'] as const) {
    if (value[key] !== undefined) {
      (provider as Record<string, unknown>)[key] = value[key];
    }
  }
  const apiKey = normalizeTalkSecretInput(value.apiKey);
  if (apiKey !== undefined) {
    provider.apiKey = apiKey;
  }
  return Object.keys(provider).length > 0 ? provider : undefined;
}

// ============================================================================
// provider / realtime 规范化
// ============================================================================

// 规范化单个 Talk provider 配置
function normalizeTalkProviderConfig(value: unknown): TalkProviderConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const provider: TalkProviderConfig = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw === undefined) {
      continue;
    }
    if (key === 'apiKey') {
      const normalized = normalizeTalkSecretInput(raw);
      if (normalized !== undefined) {
        provider.apiKey = normalized;
      }
      continue;
    }
    provider[key] = raw;
  }
  return Object.keys(provider).length > 0 ? provider : undefined;
}

// 规范化 Talk providers 映射
function normalizeTalkProviders(
  value: unknown,
): Record<string, TalkProviderConfig> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const providers: Record<string, TalkProviderConfig> = {};
  for (const [rawProviderId, providerConfig] of Object.entries(value)) {
    const providerId = normalizeOptionalString(rawProviderId);
    if (!providerId) {
      continue;
    }
    const normalizedProvider = normalizeTalkProviderConfig(providerConfig);
    if (!normalizedProvider) {
      continue;
    }
    providers[providerId] = {
      ...providers[providerId],
      ...normalizedProvider,
    };
  }
  return Object.keys(providers).length > 0 ? providers : undefined;
}

// 规范化 Talk realtime 配置
function normalizeTalkRealtimeConfig(value: unknown): TalkRealtimeConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const source = value;
  const normalized: TalkRealtimeConfig = {};

  const provider = normalizeOptionalString(source.provider);
  if (provider) {
    normalized.provider = provider;
  }
  const providers = normalizeTalkProviders(source.providers);
  if (providers) {
    normalized.providers = providers;
  }
  const model = normalizeOptionalString(source.model);
  if (model) {
    normalized.model = model;
  }
  const voice = normalizeOptionalString(source.voice);
  const speakerVoice = normalizeOptionalString(source.speakerVoice) ?? voice;
  const speakerVoiceId = normalizeOptionalString(source.speakerVoiceId);
  if (speakerVoice) {
    normalized.speakerVoice = speakerVoice;
  }
  if (speakerVoiceId) {
    normalized.speakerVoiceId = speakerVoiceId;
  }
  if (voice) {
    normalized.voice = voice;
  }
  const instructions = normalizeOptionalString(source.instructions);
  if (instructions) {
    normalized.instructions = instructions;
  }
  if (source.mode === 'realtime' || source.mode === 'stt-tts' || source.mode === 'transcription') {
    normalized.mode = source.mode;
  }
  if (
    source.transport === 'webrtc' ||
    source.transport === 'provider-websocket' ||
    source.transport === 'gateway-relay' ||
    source.transport === 'managed-room'
  ) {
    normalized.transport = source.transport;
  }
  if (source.brain === 'agent-consult' || source.brain === 'direct-tools' || source.brain === 'none') {
    normalized.brain = source.brain;
  }
  if (
    source.consultRouting === 'provider-direct' ||
    source.consultRouting === 'force-agent-consult'
  ) {
    normalized.consultRouting = source.consultRouting;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

// ============================================================================
// Talk 配置节规范化
// ============================================================================

// 从已规范化的 Talk 配置中提取活动 provider
function activeProviderFromTalk(talk: TalkConfig): string | undefined {
  const provider = normalizeOptionalString(talk.provider);
  const providers = talk.providers;
  if (provider) {
    if (providers && !(provider in providers)) {
      return undefined;
    }
    return provider;
  }
  const providerIds = providers ? Object.keys(providers) : [];
  return providerIds.length === 1 ? providerIds[0] : undefined;
}

// 规范化持久化的 Talk 配置节为标准 provider/providers 形态
// 遗留 flat provider 字段在此忽略，以保持核心配置 provider 无关
export function normalizeTalkSection(value: TalkConfig | undefined): TalkConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  const normalized: TalkConfig = {};
  const speechLocale = normalizeOptionalString(source.speechLocale);
  if (speechLocale) {
    normalized.speechLocale = speechLocale;
  }
  if (typeof source.interruptOnSpeech === 'boolean') {
    normalized.interruptOnSpeech = source.interruptOnSpeech;
  }
  const consultThinkingLevel = normalizeThinkLevel(
    normalizeOptionalString(source.consultThinkingLevel),
  );
  if (consultThinkingLevel) {
    normalized.consultThinkingLevel = consultThinkingLevel;
  }
  const rawConsultFastMode = source.consultFastMode;
  const consultFastMode =
    typeof rawConsultFastMode === 'boolean' || typeof rawConsultFastMode === 'string'
      ? normalizeFastMode(rawConsultFastMode)
      : undefined;
  if (typeof consultFastMode === 'boolean') {
    normalized.consultFastMode = consultFastMode;
  }
  const silenceTimeoutMs = normalizeSilenceTimeoutMs(source.silenceTimeoutMs);
  if (silenceTimeoutMs !== undefined) {
    normalized.silenceTimeoutMs = silenceTimeoutMs;
  }

  const providers = normalizeTalkProviders(source.providers);
  const realtime = normalizeTalkRealtimeConfig(source.realtime);
  const provider = normalizeOptionalString(source.provider);
  if (providers) {
    normalized.providers = providers;
  }
  if (realtime) {
    normalized.realtime = realtime;
  }
  if (provider) {
    normalized.provider = provider;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

// 返回配置副本，当存在有效 Talk 节时替换为规范化版本
export function normalizeTalkConfig<T extends { talk?: TalkConfig }>(config: T): T {
  if (!config.talk) {
    return config;
  }
  const normalizedTalk = normalizeTalkSection(config.talk);
  if (!normalizedTalk) {
    return config;
  }
  return { ...config, talk: normalizedTalk };
}

// ============================================================================
// Talk 配置解析
// ============================================================================

// 解析单个活动 Talk 语音 provider 及其 provider 拥有配置
// 多 provider 配置在 talk.provider 命名前保持未解析状态
export function resolveActiveTalkProviderConfig(
  talk: TalkConfig | undefined,
): ResolvedTalkConfig | undefined {
  const normalizedTalk = normalizeTalkSection(talk);
  if (!normalizedTalk) {
    return undefined;
  }
  const provider = activeProviderFromTalk(normalizedTalk);
  if (!provider) {
    return undefined;
  }
  return {
    provider,
    config: normalizedTalk.providers?.[provider] ?? {},
  };
}

// 解析 Talk 配置：规范化并填充默认值，返回完整可用的配置对象
// 参考 openclaw 的 resolveTalkConfig 语义：输入任意 talk 节，输出规范化后的解析结果
export function resolveTalkConfig(
  value: unknown,
): TalkConfig {
  const normalized = normalizeTalkSection(isRecord(value) ? (value as TalkConfig) : undefined);
  if (!normalized) {
    logger.debug('[config/talk] 无有效 talk 配置，返回默认值');
    return {
      speechLocale: TALK_CONFIG_DEFAULTS.speechLocale,
      interruptOnSpeech: TALK_CONFIG_DEFAULTS.interruptOnSpeech,
      consultThinkingLevel: TALK_CONFIG_DEFAULTS.consultThinkingLevel,
      consultFastMode: TALK_CONFIG_DEFAULTS.consultFastMode,
      silenceTimeoutMs: TALK_CONFIG_DEFAULTS.silenceTimeoutMs,
    };
  }
  return {
    speechLocale: normalized.speechLocale ?? TALK_CONFIG_DEFAULTS.speechLocale,
    interruptOnSpeech: normalized.interruptOnSpeech ?? TALK_CONFIG_DEFAULTS.interruptOnSpeech,
    consultThinkingLevel:
      normalized.consultThinkingLevel ?? TALK_CONFIG_DEFAULTS.consultThinkingLevel,
    consultFastMode: normalized.consultFastMode ?? TALK_CONFIG_DEFAULTS.consultFastMode,
    silenceTimeoutMs: normalized.silenceTimeoutMs ?? TALK_CONFIG_DEFAULTS.silenceTimeoutMs,
    provider: normalized.provider,
    providers: normalized.providers,
    realtime: normalized.realtime,
  };
}

// 构建 Talk 配置响应负载（供网关 talk.config 接口返回）
// 包含规范化 provider 数据，并在选择无歧义时附带解析后的活动 provider
export function buildTalkConfigResponse(value: unknown): TalkConfigResponse | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const normalized = normalizeTalkSection(value as TalkConfig);
  const legacyCompat = buildLegacyTalkProviderCompat(value);
  if (!normalized && !legacyCompat) {
    return undefined;
  }

  const payload: TalkConfigResponse = {};
  if (typeof normalized?.interruptOnSpeech === 'boolean') {
    payload.interruptOnSpeech = normalized.interruptOnSpeech;
  }
  if (typeof normalized?.silenceTimeoutMs === 'number') {
    payload.silenceTimeoutMs = normalized.silenceTimeoutMs;
  }
  if (typeof normalized?.consultThinkingLevel === 'string') {
    payload.consultThinkingLevel = normalized.consultThinkingLevel;
  }
  if (typeof normalized?.consultFastMode === 'boolean') {
    payload.consultFastMode = normalized.consultFastMode;
  }
  if (typeof normalized?.speechLocale === 'string') {
    payload.speechLocale = normalized.speechLocale;
  }
  if (normalized?.providers && Object.keys(normalized.providers).length > 0) {
    payload.providers = normalized.providers;
  }
  if (normalized?.realtime && Object.keys(normalized.realtime).length > 0) {
    payload.realtime = normalized.realtime;
  }

  // 保留遗留 flat ElevenLabs 字段可读性，迁移期间写入走 talk.provider/providers
  const resolved =
    resolveActiveTalkProviderConfig(normalized) ??
    (legacyCompat ? { provider: 'elevenlabs', config: legacyCompat } : undefined);
  const activeProvider = resolved?.provider;
  if (activeProvider) {
    payload.provider = activeProvider;
  }
  if (resolved) {
    payload.resolved = resolved;
  }

  return Object.keys(payload).length > 0 ? payload : undefined;
}
