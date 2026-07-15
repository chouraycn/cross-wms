/**
 * 诊断追踪上下文 — 参考 OpenClaw diagnostic-trace-context.ts
 *
 * 基于 W3C Trace Context 标准的轻量级追踪系统：
 * - 生成符合 W3C 标准的 traceparent 头
 * - 支持父子 span 关系追踪
 * - 使用 AsyncLocalStorage 实现上下文传播
 * - 用于问题排查和性能分析
 *
 * W3C Trace Context 格式：
 * traceparent: 00-{trace-id(32位)}-{span-id(16位)}-{flags(2位)}
 * 示例: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
 *
 * @module server/infra/diagnostic-trace-context
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

// ==================== 常量定义 ====================

/** traceparent 版本号（固定为 00） */
const TRACEPARENT_VERSION = '00';

/** 默认追踪标志（01 = sampled） */
const DEFAULT_TRACE_FLAGS = '01';

/** traceparent 最大长度 */
const MAX_TRACEPARENT_LENGTH = 128;

/** trace-id 正则（32 位十六进制） */
const TRACE_ID_RE = /^[0-9a-f]{32}$/;

/** span-id 正则（16 位十六进制） */
const SPAN_ID_RE = /^[0-9a-f]{16}$/;

/** trace-flags 正则（2 位十六进制） */
const TRACE_FLAGS_RE = /^[0-9a-f]{2}$/;

/** traceparent 版本正则 */
const TRACEPARENT_VERSION_RE = /^[0-9a-f]{2}$/;

/** 全局状态符号键 */
const DIAGNOSTIC_TRACE_SCOPE_STATE_KEY = Symbol.for('cross-wms.diagnosticTraceScope.state.v1');

// ==================== 类型定义 ====================

/**
 * 诊断追踪上下文
 *
 * 符合 W3C Trace Context 标准
 */
export interface DiagnosticTraceContext {
  /** W3C trace-id，32 位小写十六进制字符 */
  readonly traceId: string;
  /** 当前 span-id，16 位小写十六进制字符 */
  readonly spanId?: string;
  /** 父 span-id，16 位小写十六进制字符 */
  readonly parentSpanId?: string;
  /** W3C trace-flags，2 位小写十六进制字符，默认为 sampled(01) */
  readonly traceFlags?: string;
}

/**
 * 诊断追踪上下文输入
 */
type DiagnosticTraceContextInput = Partial<DiagnosticTraceContext> & {
  /** W3C traceparent 头 */
  traceparent?: string;
};

/**
 * 诊断追踪范围状态
 */
type DiagnosticTraceScopeState = {
  marker: symbol;
  storage: AsyncLocalStorage<DiagnosticTraceContext>;
};

// ==================== 工具函数 ====================

/**
 * 生成随机十六进制字符串
 *
 * @param bytes - 字节数
 * @returns 十六进制字符串
 */
function randomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * 检查是否为非零十六进制字符串
 *
 * @param value - 十六进制字符串
 * @returns 是否非零
 */
function isNonZeroHex(value: string): boolean {
  return !/^0+$/.test(value);
}

/**
 * 生成随机 trace-id
 *
 * trace-id 必须为非全零的 32 位十六进制字符串
 *
 * @returns trace-id
 */
function randomTraceId(): string {
  let traceId = randomHex(16);
  while (!isNonZeroHex(traceId)) {
    traceId = randomHex(16);
  }
  return traceId;
}

/**
 * 生成随机 span-id
 *
 * span-id 必须为非全零的 16 位十六进制字符串
 *
 * @returns span-id
 */
function randomSpanId(): string {
  let spanId = randomHex(8);
  while (!isNonZeroHex(spanId)) {
    spanId = randomHex(8);
  }
  return spanId;
}

// ==================== 状态管理 ====================

/**
 * 创建诊断追踪范围状态
 */
function createDiagnosticTraceScopeState(): DiagnosticTraceScopeState {
  return {
    marker: DIAGNOSTIC_TRACE_SCOPE_STATE_KEY,
    storage: new AsyncLocalStorage<DiagnosticTraceContext>(),
  };
}

/**
 * 检查是否为有效的诊断追踪范围状态
 *
 * @param value - 待检查的值
 * @returns 是否有效
 */
function isDiagnosticTraceScopeState(value: unknown): value is DiagnosticTraceScopeState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<DiagnosticTraceScopeState>;
  return (
    candidate.marker === DIAGNOSTIC_TRACE_SCOPE_STATE_KEY &&
    candidate.storage instanceof AsyncLocalStorage
  );
}

/**
 * 获取全局诊断追踪范围状态
 *
 * 使用惰性初始化，确保进程内只有一个实例
 *
 * @returns 诊断追踪范围状态
 */
function getDiagnosticTraceScopeState(): DiagnosticTraceScopeState {
  const globalRecord = globalThis as Record<PropertyKey, unknown>;
  const existing = globalRecord[DIAGNOSTIC_TRACE_SCOPE_STATE_KEY];
  if (isDiagnosticTraceScopeState(existing)) {
    return existing;
  }
  const state = createDiagnosticTraceScopeState();
  Object.defineProperty(globalThis, DIAGNOSTIC_TRACE_SCOPE_STATE_KEY, {
    configurable: true,
    enumerable: false,
    value: state,
    writable: false,
  });
  return state;
}

// ==================== 验证函数 ====================

/**
 * 检查是否为有效的 W3C trace-id
 *
 * @param value - 待检查的值
 * @returns 是否为有效的非零 trace-id
 */
export function isValidDiagnosticTraceId(value: unknown): value is string {
  return typeof value === 'string' && TRACE_ID_RE.test(value) && isNonZeroHex(value);
}

/**
 * 检查是否为有效的 W3C span-id
 *
 * @param value - 待检查的值
 * @returns 是否为有效的非零 span-id
 */
export function isValidDiagnosticSpanId(value: unknown): value is string {
  return typeof value === 'string' && SPAN_ID_RE.test(value) && isNonZeroHex(value);
}

/**
 * 检查是否为有效的 W3C trace-flags
 *
 * @param value - 待检查的值
 * @returns 是否为有效的 trace-flags
 */
export function isValidDiagnosticTraceFlags(value: unknown): value is string {
  return typeof value === 'string' && TRACE_FLAGS_RE.test(value);
}

// ==================== 规范化函数 ====================

/**
 * 规范化 trace-id
 *
 * @param value - 原始值
 * @returns 规范化后的 trace-id（如果有效）
 */
function normalizeTraceId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.toLowerCase();
  return isValidDiagnosticTraceId(normalized) ? normalized : undefined;
}

/**
 * 规范化 span-id
 *
 * @param value - 原始值
 * @returns 规范化后的 span-id（如果有效）
 */
function normalizeSpanId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.toLowerCase();
  return isValidDiagnosticSpanId(normalized) ? normalized : undefined;
}

/**
 * 规范化 trace-flags
 *
 * @param value - 原始值
 * @returns 规范化后的 trace-flags（如果有效）
 */
function normalizeTraceFlags(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.toLowerCase();
  return isValidDiagnosticTraceFlags(normalized) ? normalized : undefined;
}

// ==================== 公共 API ====================

/**
 * 解析 W3C traceparent 头
 *
 * 格式: 00-{trace-id}-{span-id}-{flags}
 * 示例: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
 *
 * @param traceparent - W3C traceparent 头
 * @returns 诊断追踪上下文（如果有效）
 */
export function parseDiagnosticTraceparent(
  traceparent: string | undefined,
): DiagnosticTraceContext | undefined {
  if (typeof traceparent !== 'string' || traceparent.length > MAX_TRACEPARENT_LENGTH) {
    return undefined;
  }
  const parts = traceparent.trim().toLowerCase().split('-');
  if (!parts || parts.length < 4) {
    return undefined;
  }
  const [version, traceId, spanId, traceFlags] = parts;
  if (
    !TRACEPARENT_VERSION_RE.test(version) ||
    version === 'ff' ||
    (version === TRACEPARENT_VERSION && parts.length !== 4)
  ) {
    return undefined;
  }
  const normalizedTraceId = normalizeTraceId(traceId);
  const normalizedSpanId = normalizeSpanId(spanId);
  const normalizedTraceFlags = normalizeTraceFlags(traceFlags);
  if (!normalizedTraceId || !normalizedSpanId || !normalizedTraceFlags) {
    return undefined;
  }
  return {
    traceId: normalizedTraceId,
    spanId: normalizedSpanId,
    traceFlags: normalizedTraceFlags,
  };
}

/**
 * 格式化诊断追踪上下文为 W3C traceparent 头
 *
 * @param context - 诊断追踪上下文
 * @returns W3C traceparent 头（如果有效）
 */
export function formatDiagnosticTraceparent(
  context: DiagnosticTraceContext | undefined,
): string | undefined {
  if (!context?.spanId) {
    return undefined;
  }
  const traceId = normalizeTraceId(context.traceId);
  const spanId = normalizeSpanId(context.spanId);
  const traceFlags = normalizeTraceFlags(context.traceFlags) ?? DEFAULT_TRACE_FLAGS;
  if (!traceId || !spanId) {
    return undefined;
  }
  return `${TRACEPARENT_VERSION}-${traceId}-${spanId}-${traceFlags}`;
}

/**
 * 创建诊断追踪上下文
 *
 * 支持以下输入源（优先级从高到低）：
 * 1. 显式字段（traceId, spanId, parentSpanId, traceFlags）
 * 2. traceparent 头解析
 * 3. 随机生成
 *
 * @param input - 输入参数
 * @returns 诊断追踪上下文
 */
export function createDiagnosticTraceContext(
  input: DiagnosticTraceContextInput = {},
): DiagnosticTraceContext {
  const parsed = parseDiagnosticTraceparent(input.traceparent);
  const traceId = normalizeTraceId(input.traceId) ?? parsed?.traceId ?? randomTraceId();
  const spanId = normalizeSpanId(input.spanId) ?? parsed?.spanId ?? randomSpanId();
  const parentSpanId = normalizeSpanId(input.parentSpanId);
  return {
    traceId,
    spanId,
    ...(parentSpanId && parentSpanId !== spanId ? { parentSpanId } : {}),
    traceFlags: normalizeTraceFlags(input.traceFlags) ?? parsed?.traceFlags ?? DEFAULT_TRACE_FLAGS,
  };
}

/**
 * 创建子诊断追踪上下文
 *
 * 保留父上下文的 trace-id，将父 span-id 记录为 parentSpanId
 *
 * @param parent - 父上下文
 * @param input - 输入参数（可选）
 * @returns 子诊断追踪上下文
 */
export function createChildDiagnosticTraceContext(
  parent: DiagnosticTraceContext,
  input: Omit<DiagnosticTraceContextInput, 'traceId' | 'traceparent'> = {},
): DiagnosticTraceContext {
  const spanId = normalizeSpanId(input.spanId) ?? randomSpanId();
  return {
    traceId: parent.traceId,
    spanId,
    parentSpanId: parent.spanId,
    traceFlags: normalizeTraceFlags(input.traceFlags) ?? parent.traceFlags ?? DEFAULT_TRACE_FLAGS,
  };
}

/**
 * 获取当前活跃的诊断追踪上下文
 *
 * 从 AsyncLocalStorage 中获取当前执行上下文的追踪信息
 *
 * @returns 当前诊断追踪上下文（如果存在）
 */
export function getActiveDiagnosticTraceContext(): DiagnosticTraceContext | undefined {
  const state = getDiagnosticTraceScopeState();
  return state.storage.getStore();
}

/**
 * 在诊断追踪上下文中运行函数
 *
 * 使用 AsyncLocalStorage 自动传播上下文
 *
 * @param context - 诊断追踪上下文
 * @param fn - 要运行的函数
 * @returns 函数返回值
 */
export function runWithDiagnosticTraceContext<T>(
  context: DiagnosticTraceContext,
  fn: () => T,
): T {
  const state = getDiagnosticTraceScopeState();
  return state.storage.run(context, fn);
}

/**
 * 冻结当前诊断追踪上下文
 *
 * 返回当前上下文的快照，用于日志记录或传递给其他服务
 *
 * @returns 冻结的诊断追踪上下文（如果存在）
 */
export function freezeDiagnosticTraceContext(): DiagnosticTraceContext | undefined {
  const active = getActiveDiagnosticTraceContext();
  if (!active) {
    return undefined;
  }
  return {
    traceId: active.traceId,
    spanId: active.spanId,
    parentSpanId: active.parentSpanId,
    traceFlags: active.traceFlags,
  };
}

/**
 * 获取当前追踪的 traceparent 头
 *
 * 用于传递给下游服务或日志记录
 *
 * @returns W3C traceparent 头（如果存在活跃上下文）
 */
export function getCurrentTraceparent(): string | undefined {
  const context = getActiveDiagnosticTraceContext();
  return formatDiagnosticTraceparent(context);
}

/**
 * 启动新的追踪
 *
 * 创建新的 trace-id 和 span-id，并在上下文中运行
 *
 * @param fn - 要运行的函数
 * @returns 函数返回值
 */
export function startTrace<T>(fn: () => T): T {
  const context = createDiagnosticTraceContext();
  return runWithDiagnosticTraceContext(context, fn);
}

/**
 * 在当前追踪中创建子 span
 *
 * @param fn - 要运行的函数
 * @returns 函数返回值
 */
export function startChildSpan<T>(fn: () => T): T {
  const parent = getActiveDiagnosticTraceContext();
  if (!parent) {
    return startTrace(fn);
  }
  const childContext = createChildDiagnosticTraceContext(parent);
  return runWithDiagnosticTraceContext(childContext, fn);
}