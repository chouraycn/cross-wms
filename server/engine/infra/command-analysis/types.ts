export type CommandContext =
  | "top-level"
  | "command-substitution"
  | "process-substitution"
  | "function-definition"
  | "wrapper-payload";

export type CommandShape =
  | "pipeline"
  | "and"
  | "or"
  | "sequence"
  | "if"
  | "for"
  | "while"
  | "case"
  | "subshell"
  | "group"
  | "background";

export type SourceSpan = {
  startIndex: number;
  endIndex: number;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
};

export type CommandStep = {
  id?: string;
  parentCommandId?: string;
  context: CommandContext;
  executable: string;
  argv: string[];
  text: string;
  span: SourceSpan;
  executableSpan: SourceSpan;
};

export type CommandOperatorKind =
  | "and"
  | "or"
  | "sequence"
  | "newline-sequence"
  | "pipe"
  | "stderr-pipe"
  | "background";

export type CommandOperator = {
  id: string;
  kind: CommandOperatorKind;
  text: string;
  span: SourceSpan;
  fromCommandId: string;
  toCommandId: string;
  parentCommandId?: string;
};

export type CommandRisk =
  | { kind: "inline-eval"; command: string; flag: string; text: string; span: SourceSpan }
  | {
      kind: "shell-wrapper";
      executable: string;
      flag: string;
      payload: string;
      text: string;
      span: SourceSpan;
    }
  | { kind: "shell-wrapper-through-carrier"; command: string; text: string; span: SourceSpan }
  | { kind: "command-carrier"; command: string; flag?: string; text: string; span: SourceSpan }
  | { kind: "command-substitution"; text: string; span: SourceSpan }
  | { kind: "process-substitution"; text: string; span: SourceSpan }
  | { kind: "dynamic-executable"; text: string; span: SourceSpan }
  | {
      kind: "dynamic-argument";
      command: string;
      argumentIndex: number;
      text: string;
      span: SourceSpan;
    }
  | { kind: "eval"; text: string; span: SourceSpan }
  | { kind: "source"; command: string; text: string; span: SourceSpan }
  | { kind: "alias"; text: string; span: SourceSpan }
  | { kind: "function-definition"; name: string; text: string; span: SourceSpan }
  | { kind: "line-continuation"; text: string; span: SourceSpan }
  | { kind: "heredoc"; text: string; span: SourceSpan }
  | { kind: "here-string"; text: string; span: SourceSpan }
  | { kind: "redirect"; text: string; span: SourceSpan }
  | { kind: "syntax-error"; text: string; span: SourceSpan };

export type CommandExplanation = {
  ok: boolean;
  source: string;
  shapes: CommandShape[];
  topLevelCommands: CommandStep[];
  nestedCommands: CommandStep[];
  operators?: CommandOperator[];
  risks: CommandRisk[];
};

export type SyntaxError = {
  message: string;
  span: SourceSpan;
  errorCode?: string;
};

export type SyntaxCheckResult = {
  valid: boolean;
  errors: SyntaxError[];
  warnings: string[];
};

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type SafetyAnalysisResult = {
  safe: boolean;
  riskLevel: RiskLevel;
  risks: CommandRisk[];
  warnings: string[];
  checks: string[];
};

export type ParsedArg = {
  type: "option" | "flag" | "argument" | "positional";
  name: string;
  value?: string;
  raw: string;
  index: number;
};

export type ArgsParseResult = {
  command: string;
  args: ParsedArg[];
  rawArgs: string[];
  errors: string[];
};

export type PathResolutionResult = {
  resolvedPath: string;
  isAbsolute: boolean;
  isRelative: boolean;
  isSafe: boolean;
  warnings: string[];
};

export type CommandPolicyAnalysis =
  | {
      ok: true;
      source: "argv" | "shell";
      segments: CommandStep[];
    }
  | {
      ok: false;
      source: "argv" | "shell";
      reason?: string;
      segments: [];
    };

export type CommandExplanationSummary = {
  commandCount: number;
  nestedCommandCount: number;
  riskKinds: string[];
  warningLines: string[];
};