// 移植自 openclaw/src/infra/command-explainer/extract.ts
// 降级：tree-sitter 依赖不可用，提供简化文本解析

export type SourceSpan = {
  startIndex: number;
  endIndex: number;
};

export type CommandRisk =
  | { kind: "inline-eval"; command: string; flag: string; text: string; span: SourceSpan }
  | { kind: "eval"; text: string; span: SourceSpan }
  | { kind: "source"; command: string; text: string; span: SourceSpan }
  | { kind: "dynamic-argument"; command: string; argumentIndex: number; text: string; span: SourceSpan }
  | { kind: "shell-wrapper"; executable: string; flag: string; payload: string; text: string; span: SourceSpan }
  | { kind: "syntax-error"; text: string; span: SourceSpan }
  | { kind: string; text: string; span: SourceSpan; [key: string]: unknown };

export type CommandStep = {
  id: string;
  context: string;
  executable: string;
  argv: string[];
  text: string;
  span: SourceSpan;
  parentCommandId?: string;
};

export type CommandExplanation = {
  ok: boolean;
  source: string;
  shapes: string[];
  topLevelCommands: CommandStep[];
  nestedCommands: CommandStep[];
  operators: unknown[];
  risks: CommandRisk[];
};

const INLINE_EVAL_COMMANDS = new Set(["eval"]);
const SOURCE_COMMANDS = new Set(["source", "."]);
const SHELL_WRAPPERS = new Set(["bash", "sh", "zsh", "dash", "ksh", "fish"]);

/** Parses a shell command into command steps, shapes, and risks (simplified without tree-sitter). */
export async function explainShellCommand(source: string): Promise<CommandExplanation> {
  const risks: CommandRisk[] = [];
  const commands: CommandStep[] = [];
  const trimmed = source.trim();
  if (!trimmed) {
    return { ok: true, source, shapes: [], topLevelCommands: [], nestedCommands: [], operators: [], risks: [] };
  }

  // Simple shell parsing: split by common operators, then by whitespace
  const segments = trimmed.split(/\s*(?:;|&&|\|\|)\s*/).filter(Boolean);
  let commandIndex = 0;
  let offset = 0;

  for (const segment of segments) {
    const startIndex = source.indexOf(segment, offset);
    const span: SourceSpan = { startIndex: startIndex >= 0 ? startIndex : offset, endIndex: (startIndex >= 0 ? startIndex : offset) + segment.length };
    offset = span.endIndex;

    const parts = segment.split(/\s+/).filter(Boolean);
    const executable = parts[0] ?? "";
    const argv = parts;

    const step: CommandStep = {
      id: `command-${commandIndex}`,
      context: "top-level",
      executable,
      argv,
      text: segment,
      span,
    };
    commandIndex++;
    commands.push(step);

    const normalizedExecutable = executable.toLowerCase();
    if (INLINE_EVAL_COMMANDS.has(normalizedExecutable)) {
      risks.push({ kind: "eval", text: segment, span });
    }
    if (SOURCE_COMMANDS.has(normalizedExecutable)) {
      risks.push({ kind: "source", command: normalizedExecutable, text: segment, span });
    }
    if (SHELL_WRAPPERS.has(normalizedExecutable)) {
      const cIdx = argv.indexOf("-c");
      if (cIdx >= 0 && cIdx + 1 < argv.length) {
        risks.push({ kind: "shell-wrapper", executable: normalizedExecutable, flag: "-c", payload: argv[cIdx + 1], text: segment, span });
      }
    }
  }

  const shapes: string[] = [];
  if (/&&/.test(source)) shapes.push("and");
  if (/\|\|/.test(source)) shapes.push("or");
  if (/\|/.test(source) && !/\|\|/.test(source)) shapes.push("pipeline");
  if (/;/.test(source) && segments.length > 1) shapes.push("sequence");

  return {
    ok: true,
    source,
    shapes,
    topLevelCommands: commands,
    nestedCommands: [],
    operators: [],
    risks,
  };
}
