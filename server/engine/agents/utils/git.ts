/**
 * Agent 专用轻量级 Git 工具
 *
 * 仅提供会话/追踪场景下常用的 Git 元信息查询，
 * 不与 server/engine/gitService.ts 的完整 GitService 重复。
 *
 * 参考自 openclaw/src/agents/utils/git.ts 的组织方式。
 */
import simpleGit from 'simple-git';
import { logger } from '../../../logger.js';

/**
 * 获取指定路径所在 Git 仓库的根目录（绝对路径）。
 * 非仓库路径或读取失败时返回 null。
 * @param cwd 工作目录，默认 process.cwd()
 */
export async function getGitRoot(cwd: string = process.cwd()): Promise<string | null> {
  try {
    const git = simpleGit(cwd, { binary: 'git', trimmed: true });
    const root = await git.raw(['rev-parse', '--show-toplevel']);
    return root || null;
  } catch (err) {
    logger.debug(
      `[Agents:Utils:Git] getGitRoot 失败: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * 获取指定路径所在 Git 仓库的当前分支名。
 * 处于 detached HEAD 或非仓库时返回 null。
 * @param cwd 工作目录，默认 process.cwd()
 */
export async function getGitBranch(cwd: string = process.cwd()): Promise<string | null> {
  try {
    const git = simpleGit(cwd, { binary: 'git', trimmed: true });
    const branch = await git.raw(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (!branch || branch === 'HEAD') {
      return null;
    }
    return branch;
  } catch (err) {
    logger.debug(
      `[Agents:Utils:Git] getGitBranch 失败: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * 获取指定路径所在 Git 仓库的当前提交哈希。
 * @param short 是否返回短哈希，默认 false
 * @param cwd 工作目录，默认 process.cwd()
 */
export async function getGitCommit(
  short?: boolean,
  cwd: string = process.cwd(),
): Promise<string | null> {
  try {
    const git = simpleGit(cwd, { binary: 'git', trimmed: true });
    const hash = await git.raw(
      short ? ['rev-parse', '--short', 'HEAD'] : ['rev-parse', 'HEAD'],
    );
    return hash || null;
  } catch (err) {
    logger.debug(
      `[Agents:Utils:Git] getGitCommit 失败: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
