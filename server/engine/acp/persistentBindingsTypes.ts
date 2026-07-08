/**
 * ACP Persistent Bindings - Types
 * 持久绑定类型定义（openclaw 兼容）
 *
 * 参考 openclaw/src/acp/persistent-bindings.types.ts 设计
 */

import type { SessionBinding } from "./sessionMapper.js";
import type { PolicyRule } from "./policy.js";

/** 配置化绑定 channel 类型 */
export type ConfiguredAcpBindingChannel = string;

/** 配置化绑定规范（将一个 channel conversation 映射到一个 ACP session） */
export interface ConfiguredAcpBindingSpec {
  channel: ConfiguredAcpBindingChannel;
  accountId: string;
  conversationId: string;
  parentConversationId?: string;
  /** Owning agent id (用于 session identity/storage) */
  agentId: string;
  /** ACP harness agent id override（可选，默认使用 agentId） */
  acpAgentId?: string;
  mode?: "persistent" | "oneshot";
  cwd?: string;
  backend?: string;
  label?: string;
}

/** 解析后的配置化绑定 */
export interface ResolvedConfiguredAcpBinding {
  spec: ConfiguredAcpBindingSpec;
  record: SessionBindingRecord;
}

/** Session 绑定记录 */
export interface SessionBindingRecord {
  bindingId: string;
  targetSessionKey: string;
  targetKind: "session";
  conversation: {
    channel: ConfiguredAcpBindingChannel;
    accountId: string;
    conversationId: string;
    parentConversationId?: string;
  };
  status: "active" | "inactive" | "expired";
  boundAt: number;
  metadata?: {
    source?: "config" | "dynamic";
    mode?: string;
    agentId?: string;
    acpAgentId?: string;
    label?: string;
    backend?: string;
    cwd?: string;
  };
}

/** Binding 模式（openclaw 兼容） */
export type AcpRuntimeSessionMode = "persistent" | "oneshot";

/** ACP Session 元数据 */
export interface SessionAcpMeta {
  sessionKey: string;
  agent: string;
  mode: AcpRuntimeSessionMode;
  backend?: string;
  cwd?: string;
  runtimeOptions?: { cwd?: string; [key: string]: unknown };
  state: "ready" | "error" | "starting" | "stopped";
}

/** 配置化绑定扩展配置 */
export interface AcpBindingConfigShape {
  mode?: AcpRuntimeSessionMode;
  cwd?: string;
  backend?: string;
  label?: string;
  acpAgentId?: string;
  parentConversationId?: string;
}

/** 解析结果 */
export type BindingResolutionResult =
  | { kind: "ready"; meta: SessionAcpMeta }
  | { kind: "missing" }
  | { kind: "starting" }
  | { kind: "error"; error: string };

/** Persistent Bindings 整体配置 */
export interface PersistentBindingsConfig {
  bindings: SessionBinding[];
  rules: PolicyRule[];
}

/** Lifecycle 操作结果 */
export type BindingLifecycleResult =
  | { ok: true; sessionKey: string }
  | { ok: false; sessionKey: string; error: string };

/** Resolve 操作结果 */
export type BindingResolveResult =
  | { ok: true; binding: ResolvedConfiguredAcpBinding }
  | { ok: false; error: string };
