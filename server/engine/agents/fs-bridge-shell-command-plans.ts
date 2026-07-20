/**
 * Shell command plans for sandbox filesystem bridge operations.
 * Ported from openclaw/src/agents/sandbox/fs-bridge-shell-command-plans.ts
 */

/** Path plus operation constraints to validate before execution. */
type PathSafetyCheck = {
  target: {
    containerPath: string;
    hostPath: string;
  };
  options: {
    action: string;
    aliasPolicy?: unknown;
    requireWritable?: boolean;
    allowedType?: "file" | "directory";
  };
};

/** Entry anchored by canonical parent path after symlink resolution. */
type AnchoredSandboxEntry = {
  canonicalParentPath: string;
  basename: string;
};

export type SandboxFsCommandPlan = {
  checks: PathSafetyCheck[];
  script: string;
  args?: string[];
  stdin?: Buffer | string;
  recheckBeforeCommand?: boolean;
  allowFailure?: boolean;
};

/** Builds a stat command that anchors the path at its canonical parent before reading metadata. */
export function buildStatPlan(
  target: { containerPath: string; hostPath: string },
  anchoredTarget: AnchoredSandboxEntry,
): SandboxFsCommandPlan {
  return {
    checks: [{ target, options: { action: "stat files" } }],
    script: 'set -eu\ncd -- "$1"\nstat -c "%F|%s|%y" -- "$2"',
    args: [anchoredTarget.canonicalParentPath, anchoredTarget.basename],
    allowFailure: true,
  };
}
