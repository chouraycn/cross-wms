import { exec } from 'node:child_process';

export interface RunCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runCommandWithTimeout(
  command: string,
  timeoutMs: number,
  options?: { cwd?: string; env?: NodeJS.ProcessEnv }
): Promise<RunCommandResult> {
  return new Promise((resolve, reject) => {
    const child = exec(command, {
      cwd: options?.cwd,
      env: options?.env,
      timeout: timeoutMs,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', data => { stdout += data; });
    child.stderr?.on('data', data => { stderr += data; });

    child.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode ?? 0 });
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}
