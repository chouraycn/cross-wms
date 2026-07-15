/**
 * Harness 系统核心类型定义 — 参考 OpenClaw harness/types.ts
 * 
 * 定义 Agent 线束的接口契约，包括：
 * - 线束能力接口（运行、侧问、压缩、生命周期）
 * - 尝试参数和结果
 * - 支持性检查
 */

import type { DiagnosticTraceContext } from '../../infra/diagnostic-trace-context.js';

/** 线束支持性检查上下文 */
export interface HarnessSupportContext {
  provider: string;
  modelId?: string;
  runtime?: string;
}

/** 线束支持性结果 */
export type HarnessSupport =
  | { supported: true; priority?: number; reason?: string }
  | { supported: false; reason?: string };

/** 线束尝试参数 */
export interface HarnessAttemptParams {
  runId: string;
  sessionId: string;
  sessionKey?: string;
  provider: string;
  modelId: string;
  prompt: string;
  messages: unknown[];
  tools?: unknown[];
  agentId?: string;
  trigger?: string;
  /** 诊断追踪上下文 */
  trace?: DiagnosticTraceContext;
  /** 通道名称 */
  lane?: string;
  /** 是否为新会话 */
  isNewSession?: boolean;
  /** 工作区目录 */
  workspaceDir?: string;
  /** 上下文引擎（可选） */
  contextEngine?: { info: { id: string } };
}

/** 线束尝试结果 */
export interface HarnessAttemptResult {
  text: string;
  aborted?: boolean;
  externalAbort?: boolean;
  timedOut?: boolean;
  idleTimedOut?: boolean;
  timedOutDuringCompaction?: boolean;
  promptError?: string;
  promptErrorSource?: string;
  agentHarnessResultClassification?: string;
  tokensUsed?: number;
  durationMs?: number;
}

/** 线束压缩参数 */
export interface HarnessCompactParams {
  sessionId: string;
  sessionKey?: string;
  messages: unknown[];
  keepRecentCount?: number;
}

/** 线束压缩结果 */
export interface HarnessCompactResult {
  summary: string;
  originalCount: number;
  compactedCount: number;
}

/** 线束重置参数 */
export interface HarnessResetParams {
  sessionId?: string;
  sessionKey?: string;
  reason?: 'new' | 'reset' | 'idle' | 'compaction' | 'deleted' | 'unknown';
}

/** 结果分类 */
export type HarnessResultClassification =
  | 'ok'
  | 'error'
  | 'aborted'
  | 'blocked'
  | 'timeout'
  | 'compaction_failure';

/** 上下文引擎宿主能力 */
export type ContextEngineHostCapability = string;

/** Agent 线束接口 */
export interface AgentHarness {
  /** 线束唯一标识 */
  id: string;
  /** 线束标签 */
  label: string;
  /** 插件 ID（可选） */
  pluginId?: string;
  /** 上下文引擎宿主能力 */
  contextEngineHostCapabilities?: readonly ContextEngineHostCapability[];
  /** 排序优先级（数值越大越优先） */
  priority?: number;
  /** 检查是否支持给定上下文 */
  supports(ctx: HarnessSupportContext): HarnessSupport;
  /** 运行一次尝试 */
  runAttempt(params: HarnessAttemptParams): Promise<HarnessAttemptResult>;
  /** 运行侧问（可选） */
  runSideQuestion?(params: { question: string; sessionId: string; provider: string; model: string }): Promise<{ text: string }>;
  /** 压缩会话（可选） */
  compact?(params: HarnessCompactParams): Promise<HarnessCompactResult | undefined>;
  /** 分类结果（可选） */
  classify?(result: HarnessAttemptResult, ctx: HarnessAttemptParams): HarnessResultClassification | undefined;
  /** 重置会话（可选） */
  reset?(params: HarnessResetParams): Promise<void> | void;
  /** 释放资源（可选） */
  dispose?(): Promise<void> | void;
}

/** 已注册的线束记录 */
export interface RegisteredHarness {
  harness: AgentHarness;
  ownerPluginId?: string;
}
