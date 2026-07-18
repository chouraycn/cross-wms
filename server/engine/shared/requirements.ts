// 配置要求检查：基于运行时事实判定某项配置要求是否满足
export type RequirementCheckResult = {
  /** 是否满足 */
  satisfied: boolean;
  /** 不满足时的原因 */
  reason?: string;
};

/** 把布尔与原因打包为结果 */
export function requirementResult(satisfied: boolean, reason?: string): RequirementCheckResult {
  return satisfied ? { satisfied: true } : { satisfied: false, reason };
}

/** 合并多个要求检查结果，任一不满足则整体不满足 */
export function mergeRequirements(
  ...results: ReadonlyArray<RequirementCheckResult>
): RequirementCheckResult {
  for (const result of results) {
    if (!result.satisfied) {
      return result;
    }
  }
  return { satisfied: true };
}
