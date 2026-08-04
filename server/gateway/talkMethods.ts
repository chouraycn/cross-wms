/**
 * Talk Gateway Methods — 语音对话 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/talk.ts 与 talk-session.ts
 * - 精简版：实现 catalog / config / session 生命周期 / speak / mode 12 个方法
 * - 配置层复用 engine/talk/index.ts 的 resolveTalkConfig / buildTalkConfigResponse
 * - 会话运行时使用内存态 TalkSessionRegistry（精简版，未对接 realtime-relay / transcription-relay）
 * - speak 委托 engine/tts/runtime 的 synthesize（与 REST /api/talk 共用）
 */

import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';
import {
  TALK_CONFIG_DEFAULTS,
  resolveTalkConfig,
  buildTalkConfigResponse,
  normalizeTalkSection,
  listRealtimeVoiceProviders,
  type TalkConfig,
} from '../engine/talk/index.js';
import { logger } from '../logger.js';

// Registry 类型从 getMethodRegistry 推导
type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

// ========== 类型定义 ==========

type TalkMode = 'realtime' | 'stt-tts' | 'transcription';
type TalkTransport = 'webrtc' | 'provider-websocket' | 'gateway-relay' | 'managed-room';
type TalkBrain = 'agent-consult' | 'direct-tools' | 'none';

interface TalkSessionRecord {
  sessionId: string;
  sessionKey?: string;
  provider?: string;
  model?: string;
  voice?: string;
  mode: TalkMode;
  transport: TalkTransport;
  brain: TalkBrain;
  token: string;
  createdAt: number;
  activeConnId?: string;
  closed: boolean;
  /** 当前 turnId（如有） */
  currentTurnId?: string;
  /** 已追加的音频数据计数（仅用于诊断） */
  appendedAudioChunks: number;
}

interface TalkModeState {
  enabled: boolean;
  phase?: string | null;
  ts: number;
}

// ========== 内存状态 ==========

// 当前 Talk 配置（与 /api/talk/config REST 路由共享同一份内存）
// 注：REST 路由维护自己的 currentTalkConfig；此处独立维护 RPC 副本以避免循环依赖
let currentRpcTalkConfig: TalkConfig | undefined = undefined;

// Talk 会话注册表（sessionId -> record）
const talkSessions = new Map<string, TalkSessionRecord>();

// Talk 模式状态
const talkModeState: TalkModeState = {
  enabled: false,
  phase: null,
  ts: Date.now(),
};

// ========== 辅助函数 ==========

function normalizeTalkMode(value: unknown): TalkMode {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'realtime' || lower === 'stt-tts' || lower === 'transcription') {
      return lower;
    }
  }
  return 'realtime';
}

function normalizeTalkTransport(value: unknown): TalkTransport {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (
      lower === 'webrtc' ||
      lower === 'provider-websocket' ||
      lower === 'gateway-relay' ||
      lower === 'managed-room'
    ) {
      return lower;
    }
  }
  return 'gateway-relay';
}

function normalizeTalkBrain(value: unknown): TalkBrain {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'agent-consult' || lower === 'direct-tools' || lower === 'none') {
      return lower;
    }
  }
  return 'agent-consult';
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function generateSessionId(): string {
  return `talk_sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateToken(): string {
  return `tok_${Math.random().toString(36).slice(2, 18)}`;
}

// 将 TTS AudioFormat 映射为 MIME 类型
function formatToMimeType(format: string): string {
  switch (format) {
    case 'mp3':
      return 'audio/mpeg';
    case 'opus':
      return 'audio/ogg';
    case 'wav':
      return 'audio/wav';
    case 'pcm':
      return 'audio/pcm';
    case 'aac':
      return 'audio/aac';
    default:
      return 'audio/mpeg';
  }
}

function buildTalkCatalog() {
  // 列出已注册的 realtime voice providers（来自 engine/talk provider-registry）
  let realtimeProviders: Array<Record<string, unknown>> = [];
  try {
    realtimeProviders = listRealtimeVoiceProviders().map((p) => {
      const entry: Record<string, unknown> = {
        id: p.id,
        label: p.label ?? p.id,
        modes: ['realtime'],
        brains: p.capabilities?.supportsToolCalls === false ? ['none'] : ['agent-consult'],
        supportsBrowserSession: Boolean(p.capabilities?.supportsBrowserSession),
      };
      if (p.aliases && p.aliases.length > 0) {
        entry.aliases = [...p.aliases];
      }
      if (typeof p.autoSelectOrder === 'number') {
        entry.autoSelectOrder = p.autoSelectOrder;
      }
      if (p.capabilities?.transports) {
        entry.transports = [...p.capabilities.transports];
      }
      if (p.capabilities?.supportsBargeIn !== undefined) {
        entry.supportsBargeIn = p.capabilities.supportsBargeIn;
      }
      if (p.capabilities?.supportsToolCalls !== undefined) {
        entry.supportsToolCalls = p.capabilities.supportsToolCalls;
      }
      if (p.capabilities?.supportsVideoFrames !== undefined) {
        entry.supportsVideoFrames = p.capabilities.supportsVideoFrames;
      }
      if (p.capabilities?.supportsSessionResumption !== undefined) {
        entry.supportsSessionResumption = p.capabilities.supportsSessionResumption;
      }
      return entry;
    });
  } catch (err) {
    logger.warn(`[talk.catalog] list realtime providers failed: ${(err as Error).message}`);
  }

  return {
    modes: ['realtime', 'stt-tts', 'transcription'],
    transports: ['webrtc', 'provider-websocket', 'gateway-relay', 'managed-room'],
    brains: ['agent-consult', 'direct-tools', 'none'],
    speech: {
      providers: [],
    },
    transcription: {
      providers: [],
    },
    realtime: {
      providers: realtimeProviders,
    },
  };
}

// ========== RPC 方法实现 ==========

/**
 * talk.catalog — 获取可用语音配置目录
 * 参数：{} (空)
 * 返回：catalog 对象（modes / transports / brains / speech / transcription / realtime）
 */
async function talkCatalog(_params: unknown, _ctx: GatewayMethodContext) {
  return buildTalkCatalog();
}

/**
 * talk.config — 获取/设置语音配置
 * 参数：{ includeSecrets?: boolean, patch?: Partial<TalkConfig> }
 * - 不传 patch：读取当前配置
 * - 传 patch：合并并持久化（内存态），返回合并后的配置
 * 返回：{ config: TalkConfigResponse }
 */
async function talkConfig(params: unknown, _ctx: GatewayMethodContext) {
  const { patch } = (params || {}) as { patch?: Record<string, unknown> };

  if (patch) {
    // 合并 patch 到现有配置
    const merged: TalkConfig = {
      ...(currentRpcTalkConfig ?? {}),
      ...(patch as Partial<TalkConfig>),
    };
    const normalized = normalizeTalkSection(merged);
    if (!normalized) {
      return {
        ok: false,
        error: { code: 'INVALID_REQUEST', message: 'invalid talk config' },
      };
    }
    currentRpcTalkConfig = normalized;
  }

  const resolved = resolveTalkConfig(currentRpcTalkConfig);
  const response = buildTalkConfigResponse(resolved) ?? {
    interruptOnSpeech: resolved.interruptOnSpeech,
    silenceTimeoutMs: resolved.silenceTimeoutMs,
    consultThinkingLevel: resolved.consultThinkingLevel,
    consultFastMode: resolved.consultFastMode,
    speechLocale: resolved.speechLocale,
    provider: resolved.provider,
    providers: resolved.providers,
    realtime: resolved.realtime,
  };

  return {
    config: response,
  };
}

/**
 * talk.session.create — 创建语音会话
 * 参数：{ sessionKey?, provider?, model?, voice?, mode?, transport?, brain?, ttlMs? }
 * 返回：{ sessionId, provider, mode, transport, brain, token, createdAt, ... }
 */
async function talkSessionCreate(params: unknown, _ctx: GatewayMethodContext) {
  const p = (params || {}) as {
    sessionKey?: string;
    provider?: string;
    model?: string;
    voice?: string;
    mode?: string;
    transport?: string;
    brain?: string;
    ttlMs?: number;
  };

  const mode = normalizeTalkMode(p.mode);
  const transport = normalizeTalkTransport(p.transport);
  const brain = normalizeTalkBrain(p.brain);

  const sessionId = generateSessionId();
  const token = generateToken();
  const record: TalkSessionRecord = {
    sessionId,
    sessionKey: normalizeOptionalString(p.sessionKey),
    provider: normalizeOptionalString(p.provider),
    model: normalizeOptionalString(p.model),
    voice: normalizeOptionalString(p.voice),
    mode,
    transport,
    brain,
    token,
    createdAt: Date.now(),
    closed: false,
    appendedAudioChunks: 0,
  };

  talkSessions.set(sessionId, record);

  return {
    sessionId,
    provider: record.provider ?? null,
    mode,
    transport,
    brain,
    token,
    createdAt: record.createdAt,
    sessionKey: record.sessionKey ?? null,
  };
}

/**
 * talk.session.join — 加入语音会话（managed-room 模式下使用 token 认证）
 * 参数：{ sessionId, token }
 * 返回：{ ok: true, sessionId, activeClientId }
 */
async function talkSessionJoin(params: unknown, ctx: GatewayMethodContext) {
  const { sessionId, token } = (params || {}) as { sessionId?: string; token?: string };

  if (!sessionId) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'sessionId is required' } };
  }
  if (!token) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'token is required' } };
  }

  const record = talkSessions.get(sessionId);
  if (!record) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `session not found: ${sessionId}` } };
  }
  if (record.closed) {
    return { ok: false, error: { code: 'SESSION_CLOSED', message: 'session already closed' } };
  }
  if (record.token !== token) {
    return { ok: false, error: { code: 'INVALID_TOKEN', message: 'invalid token' } };
  }

  // 接管为活动连接
  record.activeConnId = ctx.requestId;
  return {
    ok: true,
    sessionId,
    activeClientId: ctx.requestId,
  };
}

/**
 * talk.session.appendAudio — 追加音频数据到会话
 * 参数：{ sessionId, audioBase64, timestamp? }
 * 返回：{ ok: true }
 */
async function talkSessionAppendAudio(params: unknown, _ctx: GatewayMethodContext) {
  const { sessionId, audioBase64 } = (params || {}) as {
    sessionId?: string;
    audioBase64?: string;
  };

  if (!sessionId) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'sessionId is required' } };
  }
  if (!audioBase64) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'audioBase64 is required' } };
  }

  const record = talkSessions.get(sessionId);
  if (!record) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `session not found: ${sessionId}` } };
  }
  if (record.closed) {
    return { ok: false, error: { code: 'SESSION_CLOSED', message: 'session already closed' } };
  }

  // 精简版：仅累加计数，实际音频转发由 realtime-relay / transcription-relay 处理
  record.appendedAudioChunks += 1;

  return { ok: true };
}

/**
 * talk.session.startTurn — 开始对话轮次
 * 参数：{ sessionId, turnId? }
 * 返回：{ ok: true, turnId }
 */
async function talkSessionStartTurn(params: unknown, _ctx: GatewayMethodContext) {
  const { sessionId, turnId } = (params || {}) as { sessionId?: string; turnId?: string };

  if (!sessionId) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'sessionId is required' } };
  }

  const record = talkSessions.get(sessionId);
  if (!record) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `session not found: ${sessionId}` } };
  }
  if (record.closed) {
    return { ok: false, error: { code: 'SESSION_CLOSED', message: 'session already closed' } };
  }

  const resolvedTurnId = turnId ?? `turn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  record.currentTurnId = resolvedTurnId;

  return { ok: true, turnId: resolvedTurnId };
}

/**
 * talk.session.endTurn — 结束对话轮次
 * 参数：{ sessionId, turnId? }
 * 返回：{ ok: true, turnId }
 */
async function talkSessionEndTurn(params: unknown, _ctx: GatewayMethodContext) {
  const { sessionId, turnId } = (params || {}) as { sessionId?: string; turnId?: string };

  if (!sessionId) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'sessionId is required' } };
  }

  const record = talkSessions.get(sessionId);
  if (!record) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `session not found: ${sessionId}` } };
  }
  if (record.closed) {
    return { ok: false, error: { code: 'SESSION_CLOSED', message: 'session already closed' } };
  }

  const resolvedTurnId = turnId ?? record.currentTurnId ?? '';
  record.currentTurnId = undefined;

  return { ok: true, turnId: resolvedTurnId };
}

/**
 * talk.session.cancelTurn — 取消对话轮次
 * 参数：{ sessionId, turnId?, reason? }
 * 返回：{ ok: true, turnId, reason }
 */
async function talkSessionCancelTurn(params: unknown, _ctx: GatewayMethodContext) {
  const { sessionId, turnId, reason } = (params || {}) as {
    sessionId?: string;
    turnId?: string;
    reason?: string;
  };

  if (!sessionId) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'sessionId is required' } };
  }

  const record = talkSessions.get(sessionId);
  if (!record) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `session not found: ${sessionId}` } };
  }
  if (record.closed) {
    return { ok: false, error: { code: 'SESSION_CLOSED', message: 'session already closed' } };
  }

  const resolvedTurnId = turnId ?? record.currentTurnId ?? '';
  record.currentTurnId = undefined;

  return { ok: true, turnId: resolvedTurnId, reason: reason ?? 'cancelled' };
}

/**
 * talk.session.cancelOutput — 取消输出（仅 realtime-relay 真正生效，精简版直接返回）
 * 参数：{ sessionId, reason? }
 * 返回：{ ok: true, reason }
 */
async function talkSessionCancelOutput(params: unknown, _ctx: GatewayMethodContext) {
  const { sessionId, reason } = (params || {}) as { sessionId?: string; reason?: string };

  if (!sessionId) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'sessionId is required' } };
  }

  const record = talkSessions.get(sessionId);
  if (!record) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `session not found: ${sessionId}` } };
  }
  if (record.closed) {
    return { ok: false, error: { code: 'SESSION_CLOSED', message: 'session already closed' } };
  }

  return { ok: true, reason: reason ?? 'output-cancelled' };
}

/**
 * talk.session.close — 关闭语音会话
 * 参数：{ sessionId }
 * 返回：{ ok: true }
 */
async function talkSessionClose(params: unknown, _ctx: GatewayMethodContext) {
  const { sessionId } = (params || {}) as { sessionId?: string };

  if (!sessionId) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'sessionId is required' } };
  }

  const record = talkSessions.get(sessionId);
  if (!record) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `session not found: ${sessionId}` } };
  }

  record.closed = true;
  record.activeConnId = undefined;
  talkSessions.delete(sessionId);

  return { ok: true };
}

/**
 * talk.speak — 文本转语音（同步返回 base64 音频）
 * 参数：{ text, voiceId?, speed?, rateWpm? }
 * 返回：{ audioBase64, provider, outputFormat, mimeType } 或错误
 *
 * 精简版：委托 engine/tts/runtime 的 synthesize，失败时返回 UNAVAILABLE
 */
async function talkSpeak(params: unknown, _ctx: GatewayMethodContext) {
  const { text, voiceId, speed, rateWpm } = (params || {}) as {
    text?: string;
    voiceId?: string;
    speed?: number;
    rateWpm?: number;
  };

  if (!text || typeof text !== 'string') {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'talk.speak requires text' } };
  }

  // 动态导入避免循环依赖与启动期开销
  let synthesize: (typeof import('../engine/tts/runtime.js'))['synthesize'] | undefined;
  try {
    const mod = await import('../engine/tts/runtime.js');
    synthesize = mod.synthesize;
  } catch (err) {
    logger.warn(`[talk.speak] load TTS runtime failed: ${(err as Error).message}`);
    return {
      ok: false,
      error: {
        code: 'UNAVAILABLE',
        message: 'talk.speak unavailable: TTS runtime not loaded',
      },
    };
  }

  try {
    // 解析速率：speed 优先，否则 rateWpm / 175
    let resolvedSpeed = typeof speed === 'number' ? speed : undefined;
    if (resolvedSpeed === undefined && typeof rateWpm === 'number' && rateWpm > 0) {
      const r = rateWpm / 175;
      if (r > 0.5 && r < 2) resolvedSpeed = r;
    }

    const result = await synthesize({
      text,
      ...(voiceId ? { voice: voiceId } : {}),
      ...(resolvedSpeed !== undefined ? { speed: resolvedSpeed } : {}),
    });

    // synthesize 成功返回 TTSResult（含 audio Buffer / format / provider），
    // 失败时会抛出异常，由下方 catch 处理
    const audioBuffer = Buffer.isBuffer(result.audio)
      ? result.audio
      : Buffer.from(result.audio);
    const format = result.format ?? 'mp3';

    return {
      audioBase64: audioBuffer.toString('base64'),
      provider: result.provider ?? 'unknown',
      outputFormat: format,
      mimeType: formatToMimeType(format),
    };
  } catch (err) {
    logger.warn(`[talk.speak] synthesis failed: ${(err as Error).message}`);
    return {
      ok: false,
      error: {
        code: 'UNAVAILABLE',
        message: `talk synthesis failed: ${(err as Error).message}`,
      },
    };
  }
}

/**
 * talk.mode — 获取/设置语音模式
 * 参数：{ enabled?, phase? }
 * - 不传 enabled：返回当前模式状态
 * - 传 enabled：更新模式状态
 * 返回：{ enabled, phase, ts }
 */
async function talkMode(params: unknown, _ctx: GatewayMethodContext) {
  const { enabled, phase } = (params || {}) as {
    enabled?: boolean;
    phase?: string;
  };

  if (typeof enabled === 'boolean') {
    talkModeState.enabled = enabled;
    talkModeState.phase = phase ?? null;
    talkModeState.ts = Date.now();
  }

  return {
    enabled: talkModeState.enabled,
    phase: talkModeState.phase ?? null,
    ts: talkModeState.ts,
  };
}

// ========== 注册函数 ==========

/**
 * 注册所有 Talk 方法
 */
export function registerTalkMethods(registry: GatewayMethodRegistry): void {
  registry.register('talk.catalog', talkCatalog);
  registry.register('talk.config', talkConfig);
  registry.register('talk.session.create', talkSessionCreate);
  registry.register('talk.session.join', talkSessionJoin);
  registry.register('talk.session.appendAudio', talkSessionAppendAudio);
  registry.register('talk.session.startTurn', talkSessionStartTurn);
  registry.register('talk.session.endTurn', talkSessionEndTurn);
  registry.register('talk.session.cancelTurn', talkSessionCancelTurn);
  registry.register('talk.session.cancelOutput', talkSessionCancelOutput);
  registry.register('talk.session.close', talkSessionClose);
  registry.register('talk.speak', talkSpeak);
  registry.register('talk.mode', talkMode);
}

// 导出默认配置常量（供其他模块引用）
export { TALK_CONFIG_DEFAULTS };
