import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../../logger.js';

const execFileAsync = promisify(execFile);

export type GitCommitOptions = {
  cwd?: string;
  message: string;
  author?: string;
  addAll?: boolean;
  files?: string[];
  sign?: boolean;
  noVerify?: boolean;
};

export type GitCommitResult = {
  success: boolean;
  hash?: string;
  error?: string;
};

export async function gitCommit(options: GitCommitOptions): Promise<GitCommitResult> {
  try {
    const cwd = options.cwd ?? process.cwd();

    if (options.addAll) {
      await execFileAsync('git', ['add', '-A'], { cwd });
    } else if (options.files && options.files.length > 0) {
      await execFileAsync('git', ['add', ...options.files], { cwd });
    }

    const args = ['commit', '-m', options.message];
    
    if (options.author) {
      args.push('--author', options.author);
    }
    if (options.sign) {
      args.push('-S');
    }
    if (options.noVerify) {
      args.push('--no-verify');
    }

    await execFileAsync('git', args, { cwd });

    const { stdout: hashStdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd });
    const hash = hashStdout.trim();

    logger.info(`[Git] Committed ${hash} in ${cwd}`);

    return {
      success: true,
      hash,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(`[Git] Commit failed: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function gitIsRepo(cwd: string = process.cwd()): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd });
    return true;
  } catch {
    return false;
  }
}

export async function gitCurrentBranch(cwd: string = process.cwd()): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
    return stdout.trim();
  } catch {
    return undefined;
  }
}

export async function gitStatus(cwd: string = process.cwd()): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd });
    return stdout.trim();
  } catch {
    return '';
  }
}

export async function gitHasChanges(cwd: string = process.cwd()): Promise<boolean> {
  const status = await gitStatus(cwd);
  return status.length > 0;
}

export async function gitLastCommit(cwd: string = process.cwd()): Promise<{ hash: string; message: string } | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['log', '-1', '--format=%H%n%s'], { cwd });
    const lines = stdout.trim().split('\n');
    if (lines.length >= 2) {
      return {
        hash: lines[0] ?? '',
        message: lines.slice(1).join('\n'),
      };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function gitDiff(cwd: string = process.cwd(), staged = false): Promise<string> {
  try {
    const args = ['diff'];
    if (staged) {
      args.push('--staged');
    }
    const { stdout } = await execFileAsync('git', args, { cwd });
    return stdout;
  } catch {
    return '';
  }
}

export async function gitAdd(files: string[], cwd: string = process.cwd()): Promise<boolean> {
  try {
    await execFileAsync('git', ['add', ...files], { cwd });
    return true;
  } catch {
    return false;
  }
}
