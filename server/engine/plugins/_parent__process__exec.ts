import { exec } from 'node:child_process';

export interface RunCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  code: number;
}

export async function runCommandWithTimeout(
  args: string[] | string,
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs: number }
): Promise<RunCommandResult> {
  const command = Array.isArray(args) ? args.join(' ') : args;
  return new Promise((resolve, reject) => {
    const child = exec(command, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeoutMs,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', data => { stdout += data; });
    child.stderr?.on('data', data => { stderr += data; });

    child.on('close', (exitCode) => {
      const code = exitCode ?? 0;
      resolve({ stdout, stderr, exitCode: code, code });
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}
