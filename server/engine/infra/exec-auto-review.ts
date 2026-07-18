// 移植自 openclaw/src/infra/exec-auto-review.ts（降级实现）
// 根 exec 自动审查入口 — re-export 自 ./exec-approvals/exec-auto-review.js。
export type {
  ExecAutoReviewDecision,
  ExecAutoReviewHost,
  ExecAutoReviewInput,
  ExecAutoReviewer,
} from "./exec-approvals/exec-auto-review.js";
export { defaultExecAutoReviewer } from "./exec-approvals/exec-auto-review.js";
