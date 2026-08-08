/** Types and normalization helpers for configured channel-to-ACP persistent bindings. */
// 移植自 openclaw/src/acp/persistent-bindings.types.ts
// 降级策略：cross-wms 暂未移植完整 ACP 绑定运行时，仅保留类型契约。

export type ConfiguredAcpBindingChannel = string;

export type AcpRuntimeSessionMode = "persistent" | "oneshot";

export type ConfiguredAcpBindingSpec = {
  channel: ConfiguredAcpBindingChannel;
  accountId: string;
  conversationId: string;
  parentConversationId?: string;
  agentId: string;
  acpAgentId?: string;
  mode: AcpRuntimeSessionMode;
  cwd?: string;
  backend?: string;
  label?: string;
};

export type SessionBindingRecord = {
  bindingId: string;
  targetSessionKey: string;
  targetKind: string;
  conversation: {
    channel: string;
    accountId: string;
    conversationId: string;
    parentConversationId?: string;
  };
  status: string;
  boundAt: number;
  metadata?: Record<string, any>;
};

export type ResolvedConfiguredAcpBinding = {
  spec: ConfiguredAcpBindingSpec;
  record: SessionBindingRecord;
};

export function normalizeMode(value: any): AcpRuntimeSessionMode {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return raw === "oneshot" ? "oneshot" : "persistent";
}

export function normalizeBindingConfig(raw: any): {
  mode?: AcpRuntimeSessionMode;
  cwd?: string;
  backend?: string;
  label?: string;
} {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const shape = raw as { mode?: string; cwd?: string; backend?: string; label?: string };
  const mode = typeof shape.mode === "string" ? shape.mode.trim() : "";
  return {
    mode: mode ? normalizeMode(mode) : undefined,
    cwd: typeof shape.cwd === "string" ? shape.cwd.trim() || undefined : undefined,
    backend: typeof shape.backend === "string" ? shape.backend.trim() || undefined : undefined,
    label: typeof shape.label === "string" ? shape.label.trim() || undefined : undefined,
  };
}
