// 移植自 openclaw/src/infra/exec-approvals.types.ts
// 序列化的 allowlist 条目，包含足够命令上下文以解释后续可重用审批。
export type ExecAllowlistEntry = {
  id?: string;
  pattern: string;
  source?: "allow-always";
  commandText?: string;
  argPattern?: string;
  lastUsedAt?: number;
  lastUsedCommand?: string;
  lastResolvedPath?: string;
};
