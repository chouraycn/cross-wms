// 判断 ESM 模块是否作为进程入口运行
import fs from "node:fs";
import path from "node:path";

type IsMainModuleOptions = {
  currentFile: string;
  argv?: string[];
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  wrapperEntryPairs?: Array<{
    wrapperBasename: string;
    entryBasename: string;
  }>;
};

function normalizePathCandidate(candidate: string | undefined, cwd: string): string | undefined {
  if (!candidate) {
    return undefined;
  }

  const resolved = path.resolve(cwd, candidate);
  try {
    // 比较真实路径，使得符号链接的 package bin 与解析后的入口文件仍然匹配
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function resolveDefaultCwd(currentFile: string): string {
  try {
    return process.cwd();
  } catch {
    // 启动目录被删除时 `process.cwd()` 可能抛错；
    // 入口检查仍应相对于当前模块路径工作
    return path.dirname(currentFile);
  }
}

/** 检测模块是否作为进程入口运行，包括 wrapper 启动。 */
export function isMainModule({
  currentFile,
  argv = process.argv,
  env = process.env,
  cwd,
  wrapperEntryPairs = [],
}: IsMainModuleOptions): boolean {
  const resolvedCwd = cwd ?? resolveDefaultCwd(currentFile);
  const normalizedCurrent = normalizePathCandidate(currentFile, resolvedCwd);
  const normalizedArgv1 = normalizePathCandidate(argv[1], resolvedCwd);

  if (normalizedCurrent && normalizedArgv1 && normalizedCurrent === normalizedArgv1) {
    return true;
  }

  // PM2 通过内部 wrapper 运行脚本；`argv[1]` 指向 wrapper。
  // PM2 将实际脚本路径暴露在 `pm_exec_path` 中。
  const normalizedPmExecPath = normalizePathCandidate(env.pm_exec_path, resolvedCwd);
  if (normalizedCurrent && normalizedPmExecPath && normalizedCurrent === normalizedPmExecPath) {
    return true;
  }

  // 为导入真实入口的 wrapper 启动器提供可选的 wrapper->entry 映射
  if (normalizedCurrent && normalizedArgv1 && wrapperEntryPairs.length > 0) {
    const currentBase = path.basename(normalizedCurrent);
    const argvBase = path.basename(normalizedArgv1);
    const matched = wrapperEntryPairs.some(
      ({ wrapperBasename, entryBasename }) =>
        currentBase === entryBasename && argvBase === wrapperBasename,
    );
    if (matched) {
      return true;
    }
  }

  return false;
}
