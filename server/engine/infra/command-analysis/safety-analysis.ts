import type { SafetyAnalysisResult, CommandRisk, SourceSpan, RiskLevel } from "./types.js";
import { checkCommandSyntax } from "./syntax-check.js";

function createSpan(startIndex: number, endIndex: number, text: string): SourceSpan {
  const before = text.slice(0, startIndex);
  const startRow = before.split("\n").length;
  const startColumn = before.length - before.lastIndexOf("\n") - (before.endsWith("\n") ? 0 : 1);
  const between = text.slice(startIndex, endIndex);
  const endRow = startRow + between.split("\n").length - 1;
  const lastNewline = between.lastIndexOf("\n");
  const endColumn =
    lastNewline === -1 ? startColumn + between.length : between.length - lastNewline - 1;
  return {
    startIndex,
    endIndex,
    startPosition: { row: startRow, column: startColumn },
    endPosition: { row: endRow, column: endColumn },
  };
}

const CRITICAL_RISKS = [
  { pattern: /\brm\s+-rf\s+/i, kind: "inline-eval" as const, flag: "-rf", description: "Recursive force delete" },
  { pattern: /\bdd\s+if=.*\s+of=/i, kind: "inline-eval" as const, flag: "dd", description: "Disk write operation" },
  { pattern: /\bwget\s+.*\|\s*(sh|bash)/i, kind: "inline-eval" as const, flag: "pipe", description: "Download and execute" },
  { pattern: /\bcurl\s+.*\|\s*(sh|bash)/i, kind: "inline-eval" as const, flag: "pipe", description: "Download and execute" },
  { pattern: /\bchmod\s+777\b/i, kind: "inline-eval" as const, flag: "777", description: "World-writable permissions" },
];

const HIGH_RISKS = [
  { pattern: /\bsudo\b/i, kind: "inline-eval" as const, flag: "sudo", description: "Privilege escalation" },
  { pattern: /\bsu\s+/i, kind: "inline-eval" as const, flag: "su", description: "User switching" },
  { pattern: /\|.*\b(sh|bash|zsh)\b/i, kind: "shell-wrapper" as const, flag: "-c", description: "Pipe to shell" },
  { pattern: /\b(sh|bash|zsh)\s+-c\b/i, kind: "shell-wrapper" as const, flag: "-c", description: "Shell command execution" },
  { pattern: /`.*`/i, kind: "command-substitution" as const, flag: "", description: "Command substitution" },
  { pattern: /\$\(.*\)/i, kind: "command-substitution" as const, flag: "", description: "Command substitution" },
  { pattern: /\beval\b/i, kind: "eval" as const, flag: "", description: "Eval command" },
];

const MEDIUM_RISKS = [
  { pattern: /\bexec\b/i, kind: "inline-eval" as const, flag: "exec", description: "Exec command" },
  { pattern: /\bsource\b/i, kind: "source" as const, flag: "source", description: "Source command" },
  { pattern: /\bchown\s+-R\b/i, kind: "inline-eval" as const, flag: "-R", description: "Recursive ownership change" },
  { pattern: /&&.*\b(rm|mv|cp)\b/i, kind: "inline-eval" as const, flag: "&&", description: "Chained destructive operation" },
];

const LOW_RISKS = [
  { pattern: /\/dev\/null/i, kind: "redirect" as const, flag: "", description: "Output suppression" },
];

export function analyzeCommandSafety(command: string, args: string[] = []): SafetyAnalysisResult {
  const fullCommand = [command, ...args].join(" ");
  const risks: CommandRisk[] = [];
  const warnings: string[] = [];
  const checks: string[] = [];
  let highestRiskLevel: RiskLevel = "low";

  checks.push("command-parsed");

  const syntaxResult = checkCommandSyntax(fullCommand);
  if (!syntaxResult.valid) {
    for (const error of syntaxResult.errors) {
      risks.push({
        kind: "syntax-error",
        text: error.message,
        span: error.span,
      });
      warnings.push(error.message);
    }
    checks.push("syntax-errors");
  } else {
    checks.push("syntax-valid");
  }

  const scanRisks = (
    patterns: { pattern: RegExp; kind: CommandRisk["kind"]; flag: string; description: string }[],
    level: RiskLevel,
  ) => {
    for (const { pattern, kind, flag, description } of patterns) {
      let match;
      while ((match = pattern.exec(fullCommand)) !== null) {
        risks.push({
          kind,
          command: command,
          flag: kind === "inline-eval" || kind === "shell-wrapper" ? flag : undefined,
          text: match[0],
          span: createSpan(match.index, match.index + match[0].length, fullCommand),
        } as CommandRisk);
        warnings.push(description);
        if (["low", "medium", "high", "critical"].indexOf(level) > ["low", "medium", "high", "critical"].indexOf(highestRiskLevel)) {
          highestRiskLevel = level;
        }
        checks.push(`risk-${level}`);
      }
    }
  };

  scanRisks(CRITICAL_RISKS, "critical");
  scanRisks(HIGH_RISKS, "high");
  scanRisks(MEDIUM_RISKS, "medium");
  scanRisks(LOW_RISKS, "low");

  const isSafe = highestRiskLevel === "low" || highestRiskLevel === "medium";

  return {
    safe: isSafe,
    riskLevel: highestRiskLevel,
    risks,
    warnings,
    checks,
  };
}

export function isCommandSafe(command: string, args: string[] = []): boolean {
  return analyzeCommandSafety(command, args).safe;
}

export function assertCommandSafe(command: string, args: string[] = []): void {
  const result = analyzeCommandSafety(command, args);
  if (!result.safe) {
    throw new Error(`Command rejected by safety policy: ${result.warnings.join("; ") || "unsafe command"}`);
  }
}

export function getRiskLevel(command: string, args: string[] = []): RiskLevel {
  return analyzeCommandSafety(command, args).riskLevel;
}