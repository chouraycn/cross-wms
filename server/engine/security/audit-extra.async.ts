import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../logger.js';
import type { SecurityFinding } from './types.js';

export type ExtraAsyncAuditCheck = {
  id: string;
  name: string;
  category: 'network' | 'auth' | 'config' | 'filesystem' | 'command' | 'secrets';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  check: (context: ExtraAsyncAuditContext) => Promise<SecurityFinding[]>;
};

export type ExtraAsyncAuditContext = {
  config?: Record<string, unknown>;
  rootDir?: string;
  packageJsonPath?: string;
  envFilePath?: string;
};

const ASYNC_AUDIT_CHECKS: ExtraAsyncAuditCheck[] = [
  {
    id: 'async-audit-env-file',
    name: 'Environment File Security',
    category: 'secrets',
    severity: 'high',
    check: async (context) => {
      const findings: SecurityFinding[] = [];
      const envPath = context.envFilePath ?? path.join(context.rootDir ?? process.cwd(), '.env');

      try {
        const stat = await fs.stat(envPath);
        const mode = stat.mode;

        if ((mode & 0o004) !== 0) {
          findings.push({
            id: 'async-env-world-readable',
            title: '.env file is world-readable',
            severity: 'high',
            category: 'secrets',
            description: `Environment file ${envPath} has world-readable permissions (mode: ${mode.toString(8)}).`,
            recommendation: 'Restrict .env file permissions: chmod 600 .env',
            metadata: { path: envPath, mode: mode.toString(8) },
          });
        }

        if ((mode & 0o002) !== 0) {
          findings.push({
            id: 'async-env-world-writable',
            title: '.env file is world-writable',
            severity: 'critical',
            category: 'secrets',
            description: `Environment file ${envPath} has world-writable permissions (mode: ${mode.toString(8)}).`,
            recommendation: 'Restrict .env file permissions immediately: chmod 600 .env',
            metadata: { path: envPath, mode: mode.toString(8) },
          });
        }

        const content = await fs.readFile(envPath, 'utf8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/^\s*#/.test(line)) continue;

          if (/^\s*(API_KEY|TOKEN|PASSWORD|SECRET|AUTH|ACCESS_KEY|PRIVATE_KEY)\s*=\s*$/i.test(line)) {
            findings.push({
              id: `async-env-empty-${i}`,
              title: `Empty secret variable at line ${i + 1}`,
              severity: 'medium',
              category: 'secrets',
              description: `Environment variable at line ${i + 1} is empty. This may indicate a misconfiguration.`,
              recommendation: 'Ensure all secret variables have values or remove unused variables.',
              metadata: { path: envPath, line: i + 1, content: line.trim() },
            });
          }

          if (/=\s*['"]\s*['"]/.test(line)) {
            findings.push({
              id: `async-env-empty-quote-${i}`,
              title: `Empty quoted value at line ${i + 1}`,
              severity: 'medium',
              category: 'secrets',
              description: `Environment variable at line ${i + 1} has an empty quoted value.`,
              recommendation: 'Provide actual values or remove unused variables.',
              metadata: { path: envPath, line: i + 1, content: line.trim() },
            });
          }
        }
      } catch (err) {
        if (!(err instanceof Error) || err.message !== "ENOENT: no such file or directory") {
          logger.debug(`[Security:ExtraAsync] Error checking env file:`, err);
        }
      }

      return findings;
    },
  },
  {
    id: 'async-audit-gitignore',
    name: 'Gitignore Security Check',
    category: 'secrets',
    severity: 'medium',
    check: async (context) => {
      const findings: SecurityFinding[] = [];
      const gitignorePath = path.join(context.rootDir ?? process.cwd(), '.gitignore');

      try {
        const content = await fs.readFile(gitignorePath, 'utf8');
        const lines = content.split('\n').map((l) => l.trim());

        const shouldIgnore = ['.env', '.env.local', '.env.*.local', '*.key', '*.pem', '*.crt', 'config.local.json'];
        const missing: string[] = [];

        for (const pattern of shouldIgnore) {
          const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`^${escapedPattern}(/)?$`, 'm');
          if (!regex.test(content)) {
            missing.push(pattern);
          }
        }

        if (missing.length > 0) {
          findings.push({
            id: 'async-gitignore-missing',
            title: 'Sensitive files not in .gitignore',
            severity: 'medium',
            category: 'secrets',
            description: `The following sensitive file patterns are missing from .gitignore: ${missing.join(', ')}. This could lead to accidental commit of secrets.`,
            recommendation: `Add the following patterns to .gitignore:\n${missing.join('\n')}`,
            metadata: { missingPatterns: missing },
          });
        }

        if (!lines.includes('node_modules/')) {
          findings.push({
            id: 'async-gitignore-nodemodules',
            title: 'node_modules not in .gitignore',
            severity: 'low',
            category: 'config',
            description: 'node_modules/ is not in .gitignore, which can lead to large repository size.',
            recommendation: 'Add node_modules/ to .gitignore.',
            metadata: {},
          });
        }
      } catch (err) {
        findings.push({
          id: 'async-gitignore-missing-file',
          title: '.gitignore file not found',
          severity: 'medium',
          category: 'config',
          description: '.gitignore file is missing from the project root.',
          recommendation: 'Create a .gitignore file with appropriate patterns for sensitive files.',
          metadata: { path: gitignorePath },
        });
      }

      return findings;
    },
  },
  {
    id: 'async-audit-directory-permissions',
    name: 'Directory Permission Audit',
    category: 'filesystem',
    severity: 'medium',
    check: async (context) => {
      const findings: SecurityFinding[] = [];
      const rootDir = context.rootDir ?? process.cwd();

      const sensitiveDirs = ['node_modules', '.git', 'config', 'data', 'logs'];

      for (const dir of sensitiveDirs) {
        const dirPath = path.join(rootDir, dir);

        try {
          const stat = await fs.stat(dirPath);
          if (!stat.isDirectory()) continue;

          const mode = stat.mode;
          const worldWritable = (mode & 0o002) !== 0;
          const worldExecutable = (mode & 0o001) !== 0;

          if (worldWritable) {
            findings.push({
              id: `async-dir-world-writable-${dir}`,
              title: `Directory ${dir} is world-writable`,
              severity: 'high',
              category: 'filesystem',
              description: `Directory ${dirPath} has world-writable permissions (mode: ${mode.toString(8)}).`,
              recommendation: `Restrict directory permissions: chmod 755 ${dirPath}`,
              metadata: { path: dirPath, mode: mode.toString(8) },
            });
          }

          if (worldExecutable && !['node_modules', '.git'].includes(dir)) {
            findings.push({
              id: `async-dir-world-executable-${dir}`,
              title: `Directory ${dir} is world-executable`,
              severity: 'medium',
              category: 'filesystem',
              description: `Directory ${dirPath} has world-executable permissions (mode: ${mode.toString(8)}).`,
              recommendation: `Review directory permissions: chmod 755 ${dirPath}`,
              metadata: { path: dirPath, mode: mode.toString(8) },
            });
          }
        } catch {
          continue;
        }
      }

      return findings;
    },
  },
  {
    id: 'async-audit-package-lock',
    name: 'Package Lock File Check',
    category: 'config',
    severity: 'medium',
    check: async (context) => {
      const findings: SecurityFinding[] = [];
      const rootDir = context.rootDir ?? process.cwd();

      const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

      for (const lockFile of lockFiles) {
        const lockPath = path.join(rootDir, lockFile);

        try {
          await fs.stat(lockPath);
        } catch {
          findings.push({
            id: `async-lock-missing-${lockFile}`,
            title: `${lockFile} not found`,
            severity: 'medium',
            category: 'config',
            description: `${lockFile} is missing. This can lead to inconsistent dependency installations.`,
            recommendation: 'Run npm install, yarn install, or pnpm install to generate lock file.',
            metadata: { path: lockPath },
          });
        }
      }

      return findings;
    },
  },
];

export async function runExtraAsyncAudit(context?: ExtraAsyncAuditContext): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  const promises = [];

  for (const check of ASYNC_AUDIT_CHECKS) {
    promises.push(
      check
        .check(context ?? {})
        .then((checkFindings) => {
          findings.push(...checkFindings);
        })
        .catch((err) => {
          logger.debug(`[Security:ExtraAsync] Error running check ${check.id}:`, err);
        }),
    );
  }

  await Promise.all(promises);

  logger.debug(`[Security:ExtraAsync] Completed ${ASYNC_AUDIT_CHECKS.length} async checks, found ${findings.length} findings`);

  return findings;
}

export function listExtraAsyncChecks(): {
  id: string;
  name: string;
  category: ExtraAsyncAuditCheck['category'];
  severity: ExtraAsyncAuditCheck['severity'];
}[] {
  return ASYNC_AUDIT_CHECKS.map((c) => ({ id: c.id, name: c.name, category: c.category, severity: c.severity }));
}