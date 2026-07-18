// exec 自动审查的风险级别与决策类型
/** exec 自动审查器返回的风险级别，用于审批路由决策 */
type ExecAutoReviewRisk = "unknown" | "low" | "medium" | "high";

/** 自动审查结果：允许一次或将命令发送到正常审批流程 */
export type ExecAutoReviewDecision =
  | {
      decision: "allow-once";
      rationale: string;
      risk: "low" | "medium" | "high";
    }
  | {
      decision: "ask";
      rationale: string;
      risk: ExecAutoReviewRisk;
    };

/** 命令策略上下文正在被审查的执行主机 */
export type ExecAutoReviewHost = "gateway" | "node" | "codex-app-server";

/** 提供给 exec 自动审查器的命令与策略事实 */
export type ExecAutoReviewInput = {
  command: string;
  argv?: readonly string[];
  cwd?: string | null;
  envKeys?: readonly string[];
  host: ExecAutoReviewHost;
  reason:
    | "approval-required"
    | "allowlist-miss"
    | "strict-inline-eval"
    | "heredoc"
    | "execution-plan-miss";
  analysis: {
    parsed: boolean;
    allowlistMatched: boolean;
    safeBinMatched?: boolean;
    durableApprovalMatched?: boolean;
    inlineEval: boolean;
    heredoc?: boolean;
    shellWrapper?: boolean;
  };
  agent?: {
    id?: string | null;
    sessionKey?: string | null;
  };
};

/** 在人工审批回退之前由 gateway/node exec 路径使用的审查器函数 */
export type ExecAutoReviewer = (
  input: ExecAutoReviewInput,
) => Promise<ExecAutoReviewDecision> | ExecAutoReviewDecision;

/**
 * 当没有模型支持的审查器可用时的保守回退。
 * 自动模式绝不能成为静态白名单；没有审查器时，延迟到正常人工审批路由。
 */
export const defaultExecAutoReviewer: ExecAutoReviewer = (input) => {
  return {
    decision: "ask",
    rationale: `no model-backed exec reviewer is configured for ${input.host}`,
    risk: input.analysis.inlineEval ? "medium" : "unknown",
  };
};
