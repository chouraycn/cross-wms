import { logger } from '../../logger.js';

const ENV_NORMALIZATION_KEY_GROUPS: string[][] = [
  ['ZAI_API_KEY', 'Z_AI_API_KEY'],
];

const loggedEnvOptions = new Set<string>();

export function logAcceptedEnvOption(option: string, value?: string): void {
  if (loggedEnvOptions.has(option)) return;
  loggedEnvOptions.add(option);
  const displayValue = value ? '<redacted>' : '(empty)';
  logger.info(`[Env] Accepted env option: ${option}=${displayValue}`);
}

export function expandEnvNormalizationKeys(keys: string[]): string[] {
  const result: string[] = [];
  for (const key of keys) {
    const group = ENV_NORMALIZATION_KEY_GROUPS.find(g => g.includes(key));
    if (group) result.push(...group);
    else result.push(key);
  }
  return [...new Set(result)];
}

export function resolveEnvNormalizationKeys(key: string): string[] {
  const group = ENV_NORMALIZATION_KEY_GROUPS.find(g => g.includes(key));
  return group ?? [key];
}

export function isTruthyEnvValue(value: string | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase().trim();
  return lower === '1' || lower === 'on' || lower === 'true' || lower === 'yes';
}

export function isVitestRuntimeEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VITEST === 'true' || env.NODE_ENV === 'test';
}

export function normalizeZaiEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (env.Z_AI_API_KEY && !env.ZAI_API_KEY) {
    env.ZAI_API_KEY = env.Z_AI_API_KEY;
    delete env.Z_AI_API_KEY;
  }
}

export function normalizeEnv(): void {
  normalizeZaiEnv();
}
