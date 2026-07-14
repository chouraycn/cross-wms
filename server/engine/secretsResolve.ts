import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'os';
import { logger } from '../logger.js';
import type { SecretRef, ResolvedSecret } from './secretsTypes.js';
import { AppPaths } from '../config/appPaths.js';

const DEFAULT_PROVIDER_CONCURRENCY = 4;
const DEFAULT_MAX_REFS_PER_PROVIDER = 512;
const DEFAULT_FILE_TIMEOUT_MS = 5_000;
const DEFAULT_EXEC_TIMEOUT_MS = 5_000;
const DEFAULT_EXEC_MAX_OUTPUT_BYTES = 1024 * 1024;
const WINDOWS_ABS_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_PATH_PATTERN = /^\\\\[^\\]+\\[^\\]+/;

export type SecretRefSource = 'env' | 'file' | 'exec';

export interface ResolveSecretRefOptions {
  env?: NodeJS.ProcessEnv;
  cache?: Map<string, unknown>;
}

export interface ResolutionLimits {
  maxProviderConcurrency: number;
  maxRefsPerProvider: number;
}

export class SecretProviderResolutionError extends Error {
  readonly scope = 'provider' as const;
  readonly source: SecretRefSource;
  readonly provider: string;

  constructor(params: {
    source: SecretRefSource;
    provider: string;
    message: string;
    cause?: unknown;
  }) {
    super(params.message);
    if (params.cause !== undefined) {
      (this as Error).cause = params.cause;
    }
    this.name = 'SecretProviderResolutionError';
    this.source = params.source;
    this.provider = params.provider;
  }
}

export class SecretRefResolutionError extends Error {
  readonly scope = 'ref' as const;
  readonly source: SecretRefSource;
  readonly provider: string;
  readonly refId: string;

  constructor(params: {
    source: SecretRefSource;
    provider: string;
    refId: string;
    message: string;
    cause?: unknown;
  }) {
    super(params.message);
    if (params.cause !== undefined) {
      (this as Error).cause = params.cause;
    }
    this.name = 'SecretRefResolutionError';
    this.source = params.source;
    this.provider = params.provider;
    this.refId = params.refId;
  }
}

export function isProviderScopedSecretResolutionError(
  value: unknown,
): value is SecretProviderResolutionError {
  return value instanceof SecretProviderResolutionError;
}

export function isSecretResolutionError(
  value: unknown,
): value is SecretProviderResolutionError | SecretRefResolutionError {
  return (
    value instanceof SecretProviderResolutionError || value instanceof SecretRefResolutionError
  );
}

function providerResolutionError(params: {
  source: SecretRefSource;
  provider: string;
  message: string;
  cause?: unknown;
}): SecretProviderResolutionError {
  return new SecretProviderResolutionError(params);
}

function refResolutionError(params: {
  source: SecretRefSource;
  provider: string;
  refId: string;
  message: string;
  cause?: unknown;
}): SecretRefResolutionError {
  return new SecretRefResolutionError(params);
}

function isAbsolutePathname(value: string): boolean {
  return (
    path.isAbsolute(value) ||
    WINDOWS_ABS_PATH_PATTERN.test(value) ||
    WINDOWS_UNC_PATH_PATTERN.test(value)
  );
}

function isValidSecretProviderAlias(provider: string): boolean {
  return /^[a-z][a-z0-9_-]{0,63}$/.test(provider);
}

function isValidEnvSecretRefId(id: string): boolean {
  return /^[A-Z][A-Z0-9_]{0,127}$/.test(id);
}

function isValidFileSecretRefId(id: string): boolean {
  return isAbsolutePathname(id) || id === 'value';
}

function isValidExecSecretRefId(id: string): boolean {
  return id.length > 0 && id.length <= 1024;
}

function secretRefKey(ref: { source: string; provider: string; id: string }): string {
  return `${ref.source}:${ref.provider}:${ref.id}`;
}

function toProviderKey(source: SecretRefSource, provider: string): string {
  return `${source}:${provider}`;
}

function normalizePositiveInt(value: number | undefined, defaultValue: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  return defaultValue;
}

function resolveResolutionLimits(): ResolutionLimits {
  return {
    maxProviderConcurrency: DEFAULT_PROVIDER_CONCURRENCY,
    maxRefsPerProvider: DEFAULT_MAX_REFS_PER_PROVIDER,
  };
}

async function resolveEnvRefs(refs: Array<{ id: string; provider: string }>, env: NodeJS.ProcessEnv): Promise<Map<string, unknown>> {
  const results = new Map<string, unknown>();
  for (const ref of refs) {
    const value = env[ref.id];
    if (value !== undefined) {
      results.set(ref.id, value);
    }
  }
  return results;
}

async function resolveFileRefs(refs: Array<{ id: string; provider: string }>): Promise<Map<string, unknown>> {
  const results = new Map<string, unknown>();
  for (const ref of refs) {
    try {
      const filePath = ref.id === 'value'
        ? path.join(AppPaths.rootDir, 'secrets', `${ref.provider}.json`)
        : ref.id;

      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        continue;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      results.set(ref.id, parsed);
    } catch {
      continue;
    }
  }
  return results;
}

async function resolveExecRefs(refs: Array<{ id: string; provider: string }>): Promise<Map<string, unknown>> {
  const results = new Map<string, unknown>();
  for (const ref of refs) {
    try {
      const result = await executeCommand(ref.id, DEFAULT_EXEC_TIMEOUT_MS, DEFAULT_EXEC_MAX_OUTPUT_BYTES);
      if (result.success) {
        results.set(ref.id, result.output);
      }
    } catch {
      continue;
    }
  }
  return results;
}

async function executeCommand(command: string, timeoutMs: number, maxOutputBytes: number): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      if (output.length < maxOutputBytes) {
        output += data.toString();
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({ success: false, output: '' });
      } else {
        resolve({ success: code === 0, output: output.trim() });
      }
    });

    child.on('error', () => {
      clearTimeout(timer);
      resolve({ success: false, output: '' });
    });
  });
}

export async function resolveSecretRefValues(
  refs: Array<{ source: SecretRefSource; provider: string; id: string }>,
  options: ResolveSecretRefOptions = {},
): Promise<Map<string, unknown>> {
  if (refs.length === 0) {
    return new Map();
  }

  const limits = resolveResolutionLimits();
  const env = options.env ?? process.env;

  const uniqueRefs = new Map<string, typeof refs[0]>();
  for (const ref of refs) {
    const id = ref.id.trim();
    if (!id) {
      throw new Error('Secret reference id is empty.');
    }
    if (!isValidSecretProviderAlias(ref.provider)) {
      throw new Error(
        `Secret reference provider must match /^[a-z][a-z0-9_-]{0,63}$/ (ref: ${ref.source}:${ref.provider}:${id}).`,
      );
    }
    if (ref.source === 'env' && !isValidEnvSecretRefId(id)) {
      throw new Error(
        `Env secret reference id must match /^[A-Z][A-Z0-9_]{0,127}$/ (ref: ${ref.source}:${ref.provider}:${id}).`,
      );
    }
    if (ref.source === 'file' && !isValidFileSecretRefId(id)) {
      throw new Error(
        `File secret reference id must be an absolute JSON pointer or "value" (ref: ${ref.source}:${ref.provider}:${id}).`,
      );
    }
    if (ref.source === 'exec' && !isValidExecSecretRefId(id)) {
      throw new Error(
        `Exec secret reference id must be non-empty and <= 1024 chars (ref: ${ref.source}:${ref.provider}:${id}).`,
      );
    }
    uniqueRefs.set(secretRefKey(ref), { ...ref, id });
  }

  const grouped = new Map<
    string,
    { source: SecretRefSource; providerName: string; refs: typeof refs }
  >();
  for (const ref of uniqueRefs.values()) {
    const key = toProviderKey(ref.source, ref.provider);
    const existing = grouped.get(key);
    if (existing) {
      existing.refs.push(ref);
      continue;
    }
    grouped.set(key, { source: ref.source, providerName: ref.provider, refs: [ref] });
  }

  const results = new Map<string, unknown>();
  for (const group of grouped.values()) {
    if (group.refs.length > limits.maxRefsPerProvider) {
      throw providerResolutionError({
        source: group.source,
        provider: group.providerName,
        message: `Secret provider "${group.providerName}" exceeded maxRefsPerProvider (${limits.maxRefsPerProvider}).`,
      });
    }

    let values: Map<string, unknown>;
    switch (group.source) {
      case 'env':
        values = await resolveEnvRefs(group.refs, env);
        break;
      case 'file':
        values = await resolveFileRefs(group.refs);
        break;
      case 'exec':
        values = await resolveExecRefs(group.refs);
        break;
      default:
        throw providerResolutionError({
          source: group.source,
          provider: group.providerName,
          message: `Unsupported secret source "${group.source}".`,
        });
    }

    for (const ref of group.refs) {
      const cacheKey = secretRefKey(ref);
      if (values.has(ref.id)) {
        results.set(cacheKey, values.get(ref.id));
      } else {
        throw refResolutionError({
          source: group.source,
          provider: group.providerName,
          refId: ref.id,
          message: `Secret provider "${group.providerName}" did not return id "${ref.id}".`,
        });
      }
    }
  }

  return results;
}

export function convertToInternalRef(ref: SecretRef): { source: SecretRefSource; provider: string; id: string } {
  return {
    source: ref.provider === 'env' ? 'env' : ref.provider === 'file' ? 'file' : 'exec',
    provider: ref.provider,
    id: ref.key,
  };
}

export function resolveSecretWithValidation(
  ref: SecretRef,
  options?: ResolveSecretRefOptions,
): Promise<ResolvedSecret | null> {
  try {
    const internalRef = convertToInternalRef(ref);
    return resolveSecretRefValues([internalRef], options)
      .then((results) => {
        const value = results.get(secretRefKey(internalRef));
        if (value === undefined) {
          return null;
        }
        return {
          ref,
          value: String(value),
          source: ref.provider,
          resolvedAt: Date.now(),
        };
      })
      .catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}