// 移植自 openclaw/src/infra/exec-approval-forwarder.ts
// 降级：channel plugin / config 依赖简化

export type ExecApprovalForwarder = {
  handleRequested: (request: { id: string; expiresAtMs: number; request?: Record<string, unknown> }) => Promise<boolean>;
  handleResolved: (resolved: { id: string; decision?: string; resolvedBy?: string }) => Promise<void>;
  handlePluginApprovalRequested?: (request: unknown) => Promise<boolean>;
  handlePluginApprovalResolved?: (resolved: unknown) => Promise<void>;
  stop: () => void;
};

/** Build a human-readable approval request message. */
export function buildExecApprovalRequestMessage(request: {
  id: string;
  request?: { command?: string; cwd?: string; warningText?: string; agentId?: string };
  expiresAtMs?: number;
}, nowMs?: number): string {
  const lines: string[] = ["🔒 Exec approval required", `ID: ${request.id}`];
  if (request.request?.warningText?.trim()) {
    lines.push("", request.request.warningText.trim());
  }
  if (request.request?.command) {
    lines.push(`Command: \`${request.request.command}\``);
  }
  if (request.request?.cwd) {
    lines.push(`CWD: ${request.request.cwd}`);
  }
  if (request.request?.agentId) {
    lines.push(`Agent: ${request.request.agentId}`);
  }
  if (request.expiresAtMs && nowMs) {
    const remaining = Math.max(0, request.expiresAtMs - nowMs);
    lines.push(`Expires in: ${Math.ceil(remaining / 1000)}s`);
  }
  lines.push(`Reply with: /approve ${request.id}`);
  return lines.join("\n");
}

/** Creates an exec approval forwarder. Simplified without channel plugin delivery. */
export function createExecApprovalForwarder(_deps?: {
  getConfig?: () => unknown;
  deliver?: unknown;
  nowMs?: () => number;
  resolveSessionTarget?: unknown;
}): ExecApprovalForwarder {
  const pending = new Map<string, { timeoutId: NodeJS.Timeout | null }>();

  return {
    handleRequested: async (request) => {
      // Simplified: no real delivery, just track the pending request
      pending.set(request.id, { timeoutId: null });
      return false; // No targets forwarded
    },
    handleResolved: async (resolved) => {
      const entry = pending.get(resolved.id);
      if (entry?.timeoutId) clearTimeout(entry.timeoutId);
      pending.delete(resolved.id);
    },
    stop: () => {
      for (const entry of pending.values()) {
        if (entry.timeoutId) clearTimeout(entry.timeoutId);
      }
      pending.clear();
    },
  };
}
