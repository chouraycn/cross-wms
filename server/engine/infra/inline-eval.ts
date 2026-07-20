// 移植自 openclaw/src/infra/inline-eval.ts

export type InterpreterInlineEvalHit = {
  interpreter: string;
  evalFlag: string;
  evalText: string;
  argv: string[];
  span: { startIndex: number; endIndex: number };
};

const INTERPRETER_EVAL_FLAGS: Record<string, string[]> = {
  node: ["-e", "--eval", "-pe", "-p"],
  python: ["-c"],
  python3: ["-c"],
  ruby: ["-e"],
  perl: ["-e"],
  php: ["-r"],
  lua: ["-e"],
  bash: ["-c"],
  sh: ["-c"],
  zsh: ["-c"],
};

/** Detects interpreter inline eval in argv. */
export function detectInterpreterInlineEvalArgv(argv: string[]): InterpreterInlineEvalHit | null {
  if (!argv.length) return null;
  const interpreter = argv[0]!.trim().toLowerCase();
  const basename = interpreter.split("/").pop() ?? interpreter;
  const flags = INTERPRETER_EVAL_FLAGS[basename];
  if (!flags) return null;

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!;
    if (flags.includes(arg) && i + 1 < argv.length) {
      return {
        interpreter: basename,
        evalFlag: arg,
        evalText: argv[i + 1] ?? "",
        argv,
        span: { startIndex: 0, endIndex: argv.join(" ").length },
      };
    }
  }
  return null;
}

/** Describes interpreter inline eval in human-readable form. */
export function describeInterpreterInlineEval(hit: InterpreterInlineEvalHit): string {
  return `${hit.interpreter} ${hit.evalFlag} <inline-code>`;
}

/** Checks if an interpreter matches allowlist patterns for inline eval. */
export function isInterpreterLikeAllowlistPattern(executable: string, allowlist?: readonly string[]): boolean {
  const normalized = executable?.trim().toLowerCase();
  if (!normalized) return false;
  const basename = normalized.split("/").pop() ?? normalized;
  if (allowlist?.length) {
    return allowlist.some((pattern) => {
      if (pattern === basename) return true;
      if (pattern.includes("*")) {
        const regex = new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
        return regex.test(basename);
      }
      return false;
    });
  }
  return basename in INTERPRETER_EVAL_FLAGS;
}
