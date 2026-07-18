import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { logger } from '../../logger.js';
import { CliOutputFormatter, type CliOutputLine } from './cli-output.js';

export interface CliRunOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  shell?: boolean;
}

export interface CliRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  output: CliOutputLine[];
  timedOut: boolean;
}

export class CliRunner {
  private process: ChildProcessWithoutNullStreams | null = null;
  private formatter: CliOutputFormatter;

  constructor() {
    this.formatter = new CliOutputFormatter();
  }

  async run(options: CliRunOptions): Promise<CliRunResult> {
    const startTime = Date.now();
    let timedOut = false;

    return new Promise((resolve, reject) => {
      try {
        const env = { ...process.env, ...options.env };
        
        this.process = spawn(
          options.command,
          options.args ?? [],
          {
            cwd: options.cwd,
            env,
            shell: options.shell ?? false,
          },
        );

        let timeout: ReturnType<typeof setTimeout> | null = null;
        if (options.timeoutMs) {
          timeout = setTimeout(() => {
            timedOut = true;
            this.kill();
          }, options.timeoutMs);
        }

        this.process.stdout.on('data', (data: Buffer) => {
          const text = data.toString();
          this.formatter.addStdout(text.trimEnd());
        });

        this.process.stderr.on('data', (data: Buffer) => {
          const text = data.toString();
          this.formatter.addStderr(text.trimEnd());
        });

        this.process.on('error', (err) => {
          if (timeout) clearTimeout(timeout);
          reject(err);
        });

        this.process.on('close', (exitCode) => {
          if (timeout) clearTimeout(timeout);
          const durationMs = Date.now() - startTime;
          const summary = this.formatter.getExitSummary();
          
          resolve({
            exitCode: exitCode ?? -1,
            stdout: summary.stdout,
            stderr: summary.stderr,
            durationMs,
            output: this.formatter.getLines(),
            timedOut,
          });
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    if (!this.process || this.process.killed) return false;
    
    try {
      this.process.kill(signal);
      logger.debug('[Agents:CliRunner] Process killed');
      return true;
    } catch (err) {
      logger.error('[Agents:CliRunner] Failed to kill process:', err);
      return false;
    }
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  getOutput(): CliOutputLine[] {
    return this.formatter.getLines();
  }

  getOutputText(): string {
    return this.formatter.getText();
  }
}

export function createCliRunner(): CliRunner {
  return new CliRunner();
}

export async function runCliCommand(options: CliRunOptions): Promise<CliRunResult> {
  const runner = new CliRunner();
  return runner.run(options);
}

logger.debug('[Agents:CliRunner] Module loaded');
