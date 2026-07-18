// 移植自 openclaw/src/infra/package-update-steps.ts（降级实现）
// 包更新步骤。
export type PackageUpdateStep = {
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAtMs?: number;
  completedAtMs?: number;
  error?: string;
  detail?: Record<string, unknown>;
};

export type PackageUpdatePlan = {
  steps: PackageUpdateStep[];
  createdAtMs: number;
};

/** 创建包更新计划 */
export function createPackageUpdatePlan(stepNames: string[]): PackageUpdatePlan {
  return {
    steps: stepNames.map((name) => ({ name, status: "pending" as const })),
    createdAtMs: Date.now(),
  };
}

/** 标记步骤为运行中 */
export function markStepRunning(plan: PackageUpdatePlan, stepName: string): void {
  const step = plan.steps.find((s) => s.name === stepName);
  if (step) {
    step.status = "running";
    step.startedAtMs = Date.now();
  }
}

/** 标记步骤为完成 */
export function markStepCompleted(plan: PackageUpdatePlan, stepName: string): void {
  const step = plan.steps.find((s) => s.name === stepName);
  if (step) {
    step.status = "completed";
    step.completedAtMs = Date.now();
  }
}

/** 标记步骤为失败 */
export function markStepFailed(plan: PackageUpdatePlan, stepName: string, error: string): void {
  const step = plan.steps.find((s) => s.name === stepName);
  if (step) {
    step.status = "failed";
    step.completedAtMs = Date.now();
    step.error = error;
  }
}

/** 标记步骤为跳过 */
export function markStepSkipped(plan: PackageUpdatePlan, stepName: string): void {
  const step = plan.steps.find((s) => s.name === stepName);
  if (step) {
    step.status = "skipped";
  }
}

/** 检查计划是否完成 */
export function isPlanCompleted(plan: PackageUpdatePlan): boolean {
  return plan.steps.every((s) => s.status === "completed" || s.status === "skipped" || s.status === "failed");
}

/** 获取失败的步骤 */
export function getFailedSteps(plan: PackageUpdatePlan): PackageUpdateStep[] {
  return plan.steps.filter((s) => s.status === "failed");
}
