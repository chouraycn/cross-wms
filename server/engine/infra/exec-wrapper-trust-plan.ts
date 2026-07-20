// 移植自 openclaw/src/infra/exec-wrapper-trust-plan.ts
// 降级：依赖 dispatch-wrapper-resolution / shell-wrapper-resolution 简化实现

export type ExecWrapperTrustPlan = {
  argv: string[];
  policyArgv: string[];
  wrapperChain: string[];
  policyBlocked: boolean;
  blockedWrapper?: string;
  shellWrapperExecutable: boolean;
  shellInlineCommand: string | null;
};

function blockedExecWrapperTrustPlan(params: {
  argv: string[];
  policyArgv?: string[];
  wrapperChain: string[];
  blockedWrapper: string;
}): ExecWrapperTrustPlan {
  return {
    argv: params.argv,
    policyArgv: params.policyArgv ?? params.argv,
    wrapperChain: params.wrapperChain,
    policyBlocked: true,
    blockedWrapper: params.blockedWrapper,
    shellWrapperExecutable: false,
    shellInlineCommand: null,
  };
}

/** Resolves transparent dispatch wrappers into the executable that policy should inspect. */
export function resolveExecWrapperTrustPlan(
  argv: string[],
  _maxDepth = 10,
  _platform: NodeJS.Platform = process.platform,
): ExecWrapperTrustPlan {
  if (!argv.length || !argv[0]?.trim()) {
    return {
      argv,
      policyArgv: argv,
      wrapperChain: [],
      policyBlocked: false,
      shellWrapperExecutable: false,
      shellInlineCommand: null,
    };
  }
  // Simplified: no wrapper chain resolution, treat argv as-is
  const executable = argv[0].trim();
  const KNOWN_SHELL_WRAPPERS = new Set(["bash", "sh", "zsh", "dash", "ksh", "csh", "tcsh", "fish"]);
  const shellWrapperExecutable = KNOWN_SHELL_WRAPPERS.has(executable);
  let shellInlineCommand: string | null = null;
  if (shellWrapperExecutable) {
    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === "-c" && i + 1 < argv.length) {
        shellInlineCommand = argv[i + 1] ?? null;
        break;
      }
    }
  }
  return {
    argv,
    policyArgv: argv,
    wrapperChain: [],
    policyBlocked: false,
    shellWrapperExecutable,
    shellInlineCommand,
  };
}

export { blockedExecWrapperTrustPlan };
