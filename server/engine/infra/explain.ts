// 移植自 openclaw/src/infra/explain.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type CommandExplanationSummary = unknown;
export function summarizeCommandExplanation(...args: unknown[]): unknown {
  throw new Error("not implemented: summarizeCommandExplanation");
}
export function summarizeCommandSegmentsForDisplay(...args: unknown[]): unknown {
  throw new Error("not implemented: summarizeCommandSegmentsForDisplay");
}
export function resolveCommandAnalysisSummaryForDisplay(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveCommandAnalysisSummaryForDisplay");
}
export function explainCommandForDisplay(...args: unknown[]): unknown {
  throw new Error("not implemented: explainCommandForDisplay");
}
