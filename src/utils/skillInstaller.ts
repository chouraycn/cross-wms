import type { SkillInstallSpec } from './skillParser';

export type SkillsInstallPreferences = {
  preferBrew: boolean;
  nodeManager: 'npm' | 'pnpm' | 'yarn' | 'bun';
};

export type SkillInstallResult = {
  ok: boolean;
  message: string;
  stdout: string;
  stderr: string;
  code: number | null;
  warnings?: string[];
};

const SAFE_BREW_FORMULA = /^[a-z0-9][a-z0-9+._@-]*(\/[a-z0-9][a-z0-9+._@-]*){0,2}$/;
const SAFE_NODE_PACKAGE = /^(@[a-z0-9._-]+\/)?[a-z0-9._-]+(@[a-z0-9^~>=<.*|-]+)?$/;
const SAFE_GO_MODULE = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*@[a-z0-9v._-]+$/;
const SAFE_UV_PACKAGE = /^[a-z0-9][a-z0-9._-]*(\[[a-z0-9,._-]+\])?(([><=!~]=?|===?)[a-z0-9.*_-]+)?$/i;

function assertSafeInstallerValue(value: string, kind: string, pattern: RegExp): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('-')) {
    return `${kind} value is empty or starts with a dash`;
  }
  if (!pattern.test(trimmed)) {
    return `${kind} value contains invalid characters: ${trimmed}`;
  }
  return null;
}

function buildNodeInstallCommand(packageName: string, prefs: SkillsInstallPreferences): string[] {
  switch (prefs.nodeManager) {
    case 'pnpm':
      return ['pnpm', 'add', '-g', '--ignore-scripts', packageName];
    case 'yarn':
      return ['yarn', 'global', 'add', '--ignore-scripts', packageName];
    case 'bun':
      return ['bun', 'add', '-g', '--ignore-scripts', packageName];
    default:
      return ['npm', 'install', '-g', '--ignore-scripts', packageName];
  }
}

export function buildInstallCommand(
  spec: SkillInstallSpec,
  prefs: SkillsInstallPreferences,
): { argv: string[] | null; error?: string } {
  switch (spec.kind) {
    case 'brew': {
      if (!spec.formula) {
        return { argv: null, error: 'missing brew formula' };
      }
      const err = assertSafeInstallerValue(spec.formula, 'brew formula', SAFE_BREW_FORMULA);
      if (err) {
        return { argv: null, error: err };
      }
      return { argv: ['brew', 'install', spec.formula.trim()] };
    }
    case 'node': {
      if (!spec.package) {
        return { argv: null, error: 'missing node package' };
      }
      const err = assertSafeInstallerValue(spec.package, 'node package', SAFE_NODE_PACKAGE);
      if (err) {
        return { argv: null, error: err };
      }
      return { argv: buildNodeInstallCommand(spec.package.trim(), prefs) };
    }
    case 'go': {
      if (!spec.module) {
        return { argv: null, error: 'missing go module' };
      }
      const err = assertSafeInstallerValue(spec.module, 'go module', SAFE_GO_MODULE);
      if (err) {
        return { argv: null, error: err };
      }
      return { argv: ['go', 'install', spec.module.trim()] };
    }
    case 'uv': {
      if (!spec.package) {
        return { argv: null, error: 'missing uv package' };
      }
      const err = assertSafeInstallerValue(spec.package, 'uv package', SAFE_UV_PACKAGE);
      if (err) {
        return { argv: null, error: err };
      }
      return { argv: ['uv', 'tool', 'install', spec.package.trim()] };
    }
    case 'download': {
      return { argv: null, error: 'download install handled separately' };
    }
    default:
      return { argv: null, error: 'unsupported installer' };
  }
}

export function detectNodeManager(): SkillsInstallPreferences['nodeManager'] {
  if (typeof window !== 'undefined') {
    return 'npm';
  }
  try {
    const { execSync } = require('child_process');
    execSync('pnpm --version', { stdio: 'ignore' });
    return 'pnpm';
  } catch {
    try {
      const { execSync } = require('child_process');
      execSync('yarn --version', { stdio: 'ignore' });
      return 'yarn';
    } catch {
      try {
        const { execSync } = require('child_process');
        execSync('bun --version', { stdio: 'ignore' });
        return 'bun';
      } catch {
        return 'npm';
      }
    }
  }
}

export function getDefaultInstallPreferences(): SkillsInstallPreferences {
  return {
    preferBrew: true,
    nodeManager: detectNodeManager(),
  };
}

export async function installSkillDependencies(
  specs: SkillInstallSpec[],
  preferences?: SkillsInstallPreferences,
): Promise<SkillInstallResult[]> {
  const prefs = preferences || getDefaultInstallPreferences();
  const results: SkillInstallResult[] = [];

  for (const spec of specs) {
    const command = buildInstallCommand(spec, prefs);
    if (command.error) {
      results.push({
        ok: false,
        message: command.error,
        stdout: '',
        stderr: '',
        code: null,
      });
      continue;
    }

    if (!command.argv) {
      results.push({
        ok: false,
        message: 'invalid install command',
        stdout: '',
        stderr: '',
        code: null,
      });
      continue;
    }

    results.push({
      ok: true,
      message: `Install command: ${command.argv.join(' ')}`,
      stdout: '',
      stderr: '',
      code: 0,
    });
  }

  return results;
}
