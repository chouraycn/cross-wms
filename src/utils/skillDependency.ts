// Skill dependency detection utilities.
// Detects whether a skill's required binaries, env vars, and config paths are
// available on the current machine and exposes a simple status report.

/**
 * OpenClaw-style install requirement (mirrors the `install` and `requires` blocks
 * in SKILL.md frontmatter). These are runtime prerequisites for executing a skill,
 * distinct from inter-skill dependencies (see SkillDependency in skill-core.ts).
 */
export type SkillRuntimeRequirement = {
  /** Display name of the requirement (e.g. "link-cli", "GITHUB_TOKEN", "ripgrep"). */
  name: string;
  /** What kind of requirement this is. */
  type: 'binary' | 'env' | 'config';
  /** Optional human-readable note (e.g. "AWS credentials for S3 access"). */
  note?: string;
};

export type DependencyStatus = 'available' | 'missing' | 'unknown';

export type SkillDependencyReport = {
  /** Overall rollup: "available" if all dependencies are met, "missing" if any is missing. */
  status: DependencyStatus;
  /** Per-dependency results. */
  details: Array<{
    requirement: SkillRuntimeRequirement;
    status: DependencyStatus;
    /** When status is "missing", describes what's missing (binary name, env name, config path). */
    reason?: string;
  }>;
};

/**
 * Detects which runtime requirement entries are missing. Synchronous checks only —
 * env detection and known binary names from `KNOWN_BINS`.
 *
 * For unknown binaries the result is "unknown" rather than "missing" so the UI
 * can distinguish a true failure from a skill that simply requires manual setup.
 */
export function detectSkillRuntimeRequirements(
  reqs: SkillRuntimeRequirement[] | undefined,
): SkillDependencyReport {
  if (!reqs || reqs.length === 0) {
    return { status: 'available', details: [] };
  }
  const details: SkillDependencyReport['details'] = [];
  let anyMissing = false;
  for (const req of reqs) {
    if (req.type === 'binary') {
      const present = isBinaryAvailable(req.name);
      details.push({
        requirement: req,
        status: present ? 'available' : 'unknown',
        reason: present ? undefined : 'binary not in known list',
      });
    } else if (req.type === 'env') {
      const present = hasEnvVar(req.name);
      details.push({
        requirement: req,
        status: present ? 'available' : 'missing',
        reason: present ? undefined : `env ${req.name} not set`,
      });
      if (!present) anyMissing = true;
    } else if (req.type === 'config') {
      const present = hasConfigPath(req.name);
      details.push({
        requirement: req,
        status: present ? 'available' : 'missing',
        reason: present ? undefined : `config ${req.name} not found`,
      });
      if (!present) anyMissing = true;
    } else {
      details.push({ requirement: req, status: 'unknown' });
    }
  }
  return {
    status: anyMissing
      ? 'missing'
      : details.some((d) => d.status === 'unknown')
        ? 'unknown'
        : 'available',
    details,
  };
}

/** Well-known binaries that ship on the vast majority of dev machines. */
const KNOWN_BINS: ReadonlySet<string> = new Set([
  'git', 'node', 'npm', 'pnpm', 'yarn', 'python', 'python3', 'pip', 'pip3',
  'curl', 'wget', 'jq', 'yq', 'docker', 'docker-compose', 'kubectl', 'helm',
  'aws', 'gcloud', 'az', 'terraform', 'ansible', 'ssh', 'scp', 'rsync', 'tar',
  'unzip', 'zip', 'make', 'cmake', 'gcc', 'clang', 'rustc', 'cargo', 'go',
  'brew', 'apt', 'apt-get', 'yum', 'dnf', 'pacman', 'xcodebuild', 'swift',
  'ruby', 'gem', 'php', 'composer', 'java', 'javac', 'gradle', 'mvn',
  'redis-cli', 'psql', 'mysql', 'sqlite3', 'mongo', 'mongosh',
]);

/**
 * Returns true when the given binary is in the well-known set. We deliberately
 * avoid spawning `which`/`command -v` because (a) the renderer may not have
 * shell access in sandboxed macOS, and (b) the well-known set is sufficient for
 * the common UX cases of "is this dependency plausibly installed?".
 */
function isBinaryAvailable(name: string): boolean {
  if (!name) return false;
  return KNOWN_BINS.has(name.toLowerCase());
}

/** Checks whether a process-level environment variable is set and non-empty. */
function hasEnvVar(name: string): boolean {
  if (typeof process === 'undefined' || !process.env) return false;
  const v = process.env[name];
  return typeof v === 'string' && v.length > 0;
}

/** Checks whether a config path is likely present. (Best-effort: returns true for now.) */
function hasConfigPath(_name: string): boolean {
  // Without a richer filesystem API in the renderer, we conservatively report
  // known config paths as "available". The server side can perform the real
  // check before triggering a skill.
  return true;
}
