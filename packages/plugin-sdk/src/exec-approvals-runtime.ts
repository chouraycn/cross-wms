// 执行审批策略文件辅助：不依赖 infra-runtime 大桶的窄接口。
// openclaw 原始实现从 ../infra/exec-approvals.js 重导出，该模块未移植，
// 此处提供最小可用类型与桩函数，待依赖模块移植后替换。

/** 单条执行审批规则。 */
export type ExecApprovalRule = {
  /** 命令匹配模式（glob 或正则字符串）。 */
  pattern: string;
  /** 审批策略：always 表示始终需要审批；never 表示永不审批。 */
  policy: "always" | "never";
  /** 可选的审批超时时间（毫秒）。 */
  timeoutMs?: number;
};

/** 执行审批文件结构。 */
export type ExecApprovalsFile = {
  /** 规则列表。 */
  rules: ExecApprovalRule[];
  /** 文件来源路径。 */
  sourcePath?: string;
};

// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export async function loadExecApprovals(
  _filePath?: string,
): Promise<ExecApprovalsFile> {
  return { rules: [] };
}

// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export async function resolveExecApprovalsFromFile(
  _filePath?: string,
): Promise<ExecApprovalsFile> {
  return { rules: [] };
}
