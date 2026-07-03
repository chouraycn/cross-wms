/**
 * 守护进程命令参数构建
 * 构建启动命令参数，支持 node/tsx 路径解析。
 * 参考 openclaw/src/daemon/cmd-argv.ts 的架构对齐实现。
 */
import fs from 'node:fs';
import path from 'node:path';

export interface DaemonCmdArgvConfig {
  /** 自定义启动命令（如 node 可执行文件路径）。未指定时自动解析。 */
  command?: string;
  /** 守护进程入口脚本路径。未指定时使用当前进程入口。 */
  entry?: string;
  /** 附加命令参数。 */
  args?: string[];
}

/**
 * 解析守护进程入口脚本路径。
 * 优先使用显式传入的入口；否则使用当前进程入口 (process.argv[1])；
 * 兜底回退到项目 server/index.ts。
 */
export function resolveDaemonEntry(entry?: string): string {
  if (entry) {
    return path.resolve(entry);
  }
  const current = process.argv[1];
  if (current) {
    return path.resolve(current);
  }
  return path.resolve(process.cwd(), 'server', 'index.ts');
}

/** 当入口为 .ts 文件时，需要通过 tsx 运行；可通过环境变量强制走 node。 */
function shouldUseTsx(entry: string): boolean {
  if (process.env.CROSS_WMS_DAEMON_USE_NODE === '1') return false;
  return entry.toLowerCase().endsWith('.ts');
}

/** 解析 node 可执行文件路径（运行时即当前进程的 execPath）。 */
function resolveNodeBinary(): string {
  return process.execPath;
}

/**
 * 构建守护进程启动命令参数（不含环境变量，环境变量通过服务配置注入）。
 * 返回的数组第一项为可执行程序，后续为参数，可直接用于 spawn/execFile。
 */
export function buildDaemonCmdArgv(config: DaemonCmdArgvConfig = {}): string[] {
  const entry = resolveDaemonEntry(config.entry);
  const extraArgs = config.args ?? [];

  if (config.command) {
    return [config.command, entry, ...extraArgs];
  }

  if (shouldUseTsx(entry)) {
    // 通过 node --import tsx 运行 TypeScript 入口
    return [resolveNodeBinary(), '--import', 'tsx', entry, ...extraArgs];
  }

  return [resolveNodeBinary(), entry, ...extraArgs];
}

/** 检查入口文件是否存在，用于安装前的预检。 */
export function daemonEntryExists(entry?: string): boolean {
  const resolved = resolveDaemonEntry(entry);
  try {
    return fs.existsSync(resolved);
  } catch {
    return false;
  }
}
