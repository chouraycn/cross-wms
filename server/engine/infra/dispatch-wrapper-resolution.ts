// 移植自 openclaw/src/infra/dispatch-wrapper-resolution.ts
// 降级：shell-wrapper-resolution 依赖简化

export const MAX_DISPATCH_WRAPPER_DEPTH = 4;

export type UnwrapEnvInvocation = {
  argv: string[];
  envAssignments: Record<string, string>;
};

/** Extracts environment assignment keys from dispatch wrapper invocations. */
export function extractEnvAssignmentKeysFromDispatchWrappers(argv: string[]): string[] {
  const keys: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "env" && i + 1 < argv.length) {
      const assignment = argv[i + 1];
      if (typeof assignment === "string" && assignment.includes("=")) {
        keys.push(assignment.split("=")[0]!);
      }
    }
  }
  return keys;
}

/** Checks if an executable is a known dispatch wrapper. */
export function isDispatchWrapperExecutable(executable: string): boolean {
  const normalized = executable?.trim().toLowerCase();
  if (!normalized) return false;
  const basename = normalized.split("/").pop() ?? normalized;
  const KNOWN_WRAPPERS = new Set(["env", "xcrun", "npm", "npx", "yarn", "pnpm", "bun"]);
  return KNOWN_WRAPPERS.has(basename);
}

/** Unwraps a known dispatch wrapper invocation, returning the inner argv. */
export function unwrapKnownDispatchWrapperInvocation(argv: string[]): string[] | null {
  if (!argv.length) return null;
  const executable = argv[0]!.trim().toLowerCase();
  const basename = executable.split("/").pop() ?? executable;

  if (basename === "env") {
    // Skip env assignments until we find the real command
    let i = 1;
    while (i < argv.length) {
      const arg = argv[i]!;
      if (arg.startsWith("-") && arg !== "-") { i++; continue; }
      if (arg.includes("=")) { i++; continue; }
      break;
    }
    return argv.slice(i);
  }

  if (basename === "npx") {
    // npx <package> [args...]
    const rest = argv.slice(1);
    const hasPackage = rest.findIndex((a) => !a.startsWith("-"));
    if (hasPackage >= 0) {
      return rest.slice(hasPackage);
    }
    return null;
  }

  if (basename === "npm" && argv[1] === "exec") {
    const rest = argv.slice(2);
    const hasPackage = rest.findIndex((a) => !a.startsWith("-"));
    if (hasPackage >= 0) {
      return rest.slice(hasPackage);
    }
    return null;
  }

  return null;
}

/** Unwraps dispatch wrappers for resolution iteratively. */
export function unwrapDispatchWrappersForResolution(argv: string[]): string[] {
  let current = argv;
  let depth = 0;
  while (depth < MAX_DISPATCH_WRAPPER_DEPTH) {
    const unwrapped = unwrapKnownDispatchWrapperInvocation(current);
    if (!unwrapped || unwrapped === current) break;
    current = unwrapped;
    depth++;
  }
  return current;
}

/** Resolves the dispatch wrapper trust plan. */
export function resolveDispatchWrapperTrustPlan(argv: string[]): {
  unwrappedArgv: string[];
  wrapperChain: string[];
  envAssignments: Record<string, string>;
} {
  const wrapperChain: string[] = [];
  const envAssignments: Record<string, string> = {};
  let current = argv;

  for (let depth = 0; depth < MAX_DISPATCH_WRAPPER_DEPTH; depth++) {
    if (!current.length) break;
    const keys = extractEnvAssignmentKeysFromDispatchWrappers(current);
    for (const key of keys) {
      envAssignments[key] = "";
    }
    const unwrapped = unwrapKnownDispatchWrapperInvocation(current);
    if (!unwrapped || unwrapped === current) break;
    wrapperChain.push(current[0]!);
    current = unwrapped;
  }

  return { unwrappedArgv: current, wrapperChain, envAssignments };
}

/** Checks if dispatch wrappers manipulate environment variables. */
export function hasDispatchEnvManipulation(argv: string[]): boolean {
  return extractEnvAssignmentKeysFromDispatchWrappers(argv).length > 0;
}

export type { UnwrapEnvInvocation };
export const unwrapEnvInvocation: unique symbol = Symbol("unwrapEnvInvocation");
