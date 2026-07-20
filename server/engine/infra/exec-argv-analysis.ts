// 移植自 openclaw/src/infra/exec-argv-analysis.ts

export type ExecCommandSegment = {
  raw: string;
  argv: string[];
  sourceArgv: string[];
};

export type ExecCommandAnalysis =
  | { ok: true; segments: ExecCommandSegment[] }
  | { ok: false; reason: string; segments: [] };

/** Analyzes an argv command into command segments. */
export function analyzeArgvCommand(params: {
  argv: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: string | null;
}): ExecCommandAnalysis {
  const argv = params.argv.filter((entry) => entry.trim().length > 0);
  if (argv.length === 0) {
    return { ok: false, reason: "empty argv", segments: [] };
  }
  return {
    ok: true,
    segments: [
      {
        raw: argv.join(" "),
        argv,
        sourceArgv: [...params.argv],
      },
    ],
  };
}
