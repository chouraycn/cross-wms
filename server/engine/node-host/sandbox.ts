import { logger } from '../../logger.js';
import type { SandboxOptions, SandboxExecutionResult } from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_MEMORY_MB = 512;

export class Sandbox {
  private options: Required<SandboxOptions>;

  constructor(options: SandboxOptions = {}) {
    this.options = {
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxMemoryMB: options.maxMemoryMB ?? DEFAULT_MAX_MEMORY_MB,
      allowedPaths: options.allowedPaths ?? [],
      deniedPaths: options.deniedPaths ?? [],
      env: options.env ?? {},
      cwd: options.cwd ?? process.cwd(),
      readonly: options.readonly ?? false,
    };
  }

  async execute(
    command: string,
    args: string[] = [],
    overrides: Partial<SandboxOptions> = {},
  ): Promise<SandboxExecutionResult> {
    const opts = { ...this.options, ...overrides };
    const startTime = Date.now();

    logger.debug(`[Sandbox] Executing: ${command} ${args.join(' ')}`);

    if (opts.readonly) {
      logger.debug('[Sandbox] Read-only mode enabled');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);

    let timedOut = false;
    let stdout = '';
    let stderr = '';
    let exitCode = 0;

    try {
      const result = await this.runCommand(command, args, opts, controller.signal);
      stdout = result.stdout;
      stderr = result.stderr;
      exitCode = result.exitCode;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        timedOut = true;
        exitCode = -1;
        stderr = `Command timed out after ${opts.timeoutMs}ms`;
        logger.warn(`[Sandbox] Command timed out: ${command}`);
      } else {
        throw err;
      }
    } finally {
      clearTimeout(timeoutId);
    }

    const durationMs = Date.now() - startTime;

    return {
      exitCode,
      stdout,
      stderr,
      durationMs,
      timedOut,
      memoryUsedBytes: this.estimateMemoryUsage(stdout, stderr),
    };
  }

  private async runCommand(
    command: string,
    args: string[],
    opts: Required<SandboxOptions>,
    signal: AbortSignal,
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
    const { execFile } = await import('node:child_process');

    return new Promise((resolve, reject) => {
      const child = execFile(command, args, {
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env },
        maxBuffer: 10 * 1024 * 1024,
        signal,
      }, (error, stdout, stderr) => {
        if (error) {
          if (signal.aborted || error.killed) {
            const abortError = new Error('Command timed out');
            abortError.name = 'AbortError';
            reject(abortError);
            return;
          }
          resolve({
            stdout: stdout as string,
            stderr: stderr as string,
            exitCode: (error as { code?: number }).code ?? 1,
            timedOut: false,
          });
          return;
        }
        resolve({
          stdout: stdout as string,
          stderr: stderr as string,
          exitCode: 0,
          timedOut: false,
        });
      });
    });
  }

  private estimateMemoryUsage(stdout: string, stderr: string): number {
    return Buffer.byteLength(stdout + stderr, 'utf8');
  }

  isPathAllowed(targetPath: string): boolean {
    const { deniedPaths, allowedPaths } = this.options;

    for (const denied of deniedPaths) {
      if (targetPath.startsWith(denied)) {
        return false;
      }
    }

    if (allowedPaths.length === 0) {
      return true;
    }

    for (const allowed of allowedPaths) {
      if (targetPath.startsWith(allowed)) {
        return true;
      }
    }

    return false;
  }

  getOptions(): Readonly<Required<SandboxOptions>> {
    return { ...this.options };
  }

  updateOptions(updates: Partial<SandboxOptions>): void {
    this.options = { ...this.options, ...updates };
    logger.debug('[Sandbox] Options updated');
  }
}

export function createSandbox(options?: SandboxOptions): Sandbox {
  return new Sandbox(options);
}
