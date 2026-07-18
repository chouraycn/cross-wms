// 序列化的白名单条目，存储足够的命令上下文以解释为何稍后可重用审批
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
