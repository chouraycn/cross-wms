// 移植自 openclaw/src/infra/explain.ts
// 降级：tree-sitter / command-explainer 依赖简化

import type { CommandExplanation, CommandStep, CommandRisk } from "./extract.js";

export type CommandExplanationSummary = {
  source: string;
  topLevelCommandCount: number;
  nestedCommandCount: number;
  riskCount: number;
  shapes: string[];
  topCommands: string[];
  riskKinds: string[];
};

/** Summarizes a command explanation into a display-friendly summary. */
export function summarizeCommandExplanation(explanation: CommandExplanation): CommandExplanationSummary {
  return {
    source: explanation.source,
    topLevelCommandCount: explanation.topLevelCommands.length,
    nestedCommandCount: explanation.nestedCommands.length,
    riskCount: explanation.risks.length,
    shapes: explanation.shapes,
    topCommands: explanation.topLevelCommands.map((cmd) => cmd.executable),
    riskKinds: [...new Set(explanation.risks.map((r) => r.kind))],
  };
}

/** Summarizes command segments for display. */
export function summarizeCommandSegmentsForDisplay(steps: CommandStep[]): string[] {
  return steps.map((step) => {
    const args = step.argv.length > 1 ? ` ${step.argv.slice(1).join(" ")}` : "";
    return `${step.executable}${args}`;
  });
}

/** Resolves command analysis summary for display. */
export function resolveCommandAnalysisSummaryForDisplay(explanation: CommandExplanation): string {
  const summary = summarizeCommandExplanation(explanation);
  const lines: string[] = [summary.source];
  if (summary.riskCount > 0) {
    lines.push(`⚠ ${summary.riskCount} risk(s): ${summary.riskKinds.join(", ")}`);
  }
  if (summary.shapes.length > 0) {
    lines.push(`Shapes: ${summary.shapes.join(", ")}`);
  }
  return lines.join("\n");
}

/** Explains a command for display. */
export async function explainCommandForDisplay(source: string): Promise<string> {
  const { explainShellCommand } = await import("./extract.js");
  const explanation = await explainShellCommand(source);
  return resolveCommandAnalysisSummaryForDisplay(explanation);
}
