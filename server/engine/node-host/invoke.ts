import { logger } from '../../logger.js';
import { retryAsync } from '../infra/retry.js';
import type { NodeHostConfig } from './config.js';

export type InvokeParams = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  stdin?: string;
};

export type InvokeResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  signal?: string;
  durationMs: number;
};

export async function invokeNode(
  config: NodeHostConfig,
  params: InvokeParams,
): Promise<InvokeResult> {
  const { command, args = [], cwd, env, timeoutMs: paramTimeout, stdin } = params;
  const timeoutMs = paramTimeout ?? config.timeoutMs ?? 30_000;

  logger.info(`[NodeHost] Invoking ${command} on node ${config.nodeId}`);

  if (!config.baseUrl) {
    throw new Error('NodeHost baseUrl not configured');
  }

  const startTime = Date.now();

  return retryAsync(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.token) headers['Authorization'] = `Bearer ${config.token}`;

      const response = await fetch(`${config.baseUrl}/invoke`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ command, args, cwd, env, stdin }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Invoke failed: HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as {
        exitCode: number;
        stdout: string;
        stderr: string;
        signal?: string;
      };

      return {
        ...result,
        durationMs: Date.now() - startTime,
      };
    } finally {
      clearTimeout(timer);
    }
  }, {
    attempts: config.maxRetries ?? 3,
    minDelayMs: 500,
    maxDelayMs: 5_000,
    jitter: 0.2,
    label: `invoke-${command}`,
    shouldRetry: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      return !msg.includes('exit code') && !msg.includes('HTTP 4');
    },
  });
}
