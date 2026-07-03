/**
 * Windows 计划任务守护进程管理
 * 使用 schtasks 命令创建/删除/查询/运行任务。
 * 参考 openclaw/src/daemon/schtasks.ts 的架构对齐实现。
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../logger.js';
import { resolveDaemonPaths, type DaemonPaths } from './paths.js';

export interface SchtasksConfig {
  /** 计划任务名称，默认 CrossWMSDaemon */
  taskName?: string;
  /** 启动命令参数（第一项为可执行程序） */
  programArguments: string[];
  /** 工作目录 */
  workingDirectory?: string;
  /** 环境变量 */
  environment?: Record<string, string>;
  /** 描述信息 */
  description?: string;
  /** 状态目录覆盖 */
  stateDir?: string;
  /** 环境变量来源（用于解析主目录） */
  env?: Record<string, string | undefined>;
}

export interface SchtasksStatus {
  installed: boolean;
  running: boolean;
  state?: string;
  lastRunResult?: string;
  detail?: string;
}

/** 执行系统命令的 Promise 封装。 */
function execCmd(
  file: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { encoding: 'utf8', windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code });
      },
    );
  });
}

/** Windows cmd 参数引用：含空格/引号时用双引号包裹并转义内部引号。 */
function quoteWindowsArg(value: string): string {
  if (!value) return '""';
  if (/[\s"]/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

/** 断言字符串不包含换行（cmd 脚本不允许换行）。 */
function assertNoLineBreak(value: string, label: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`${label} 不能包含换行符`);
  }
}

function resolvePaths(config: SchtasksConfig): DaemonPaths {
  return resolveDaemonPaths({
    label: config.taskName,
    stateDir: config.stateDir,
    env: config.env,
  });
}

function resolveTaskName(config: SchtasksConfig): string {
  return config.taskName ?? 'CrossWMSDaemon';
}

/**
 * 生成 Windows cmd 包装脚本内容。
 * 当存在环境变量或工作目录时，通过 .cmd 脚本封装后再由 schtasks 调用。
 */
export function generateTaskScript(config: SchtasksConfig): string {
  const lines: string[] = ['@echo off'];
  const description = config.description?.trim();
  if (description) {
    assertNoLineBreak(description, '任务描述');
    lines.push(`rem ${description}`);
  }
  if (config.workingDirectory) {
    assertNoLineBreak(config.workingDirectory, '工作目录');
    lines.push(`cd /d ${quoteWindowsArg(config.workingDirectory)}`);
  }
  if (config.environment) {
    for (const [k, v] of Object.entries(config.environment)) {
      if (!v || k.toUpperCase() === 'PATH') continue;
      assertNoLineBreak(k, '环境变量名');
      assertNoLineBreak(v, `环境变量值 ${k}`);
      lines.push(`set ${k}=${v}`);
    }
  }
  const command = config.programArguments.map(quoteWindowsArg).join(' ');
  lines.push(command);
  return `${lines.join('\r\n')}\r\n`;
}

/** 写入 cmd 包装脚本并返回其路径。 */
async function writeTaskScript(config: SchtasksConfig): Promise<string> {
  const paths = resolvePaths(config);
  await fs.mkdir(path.dirname(paths.taskScriptPath), { recursive: true });
  await fs.writeFile(paths.taskScriptPath, generateTaskScript(config), 'utf8');
  return paths.taskScriptPath;
}

/**
 * 安装计划任务：schtasks /Create /TN "CrossWMSDaemon" /TR <command> /SC ONLOGON /RL HIGHEST。
 * 安装前会先删除已存在的同名任务。
 */
export async function installSchtasks(config: SchtasksConfig): Promise<{ scriptPath: string }> {
  const taskName = resolveTaskName(config);
  const paths = resolvePaths(config);
  await fs.mkdir(paths.logDir, { recursive: true });

  // 当存在环境变量或工作目录时，使用 .cmd 包装脚本作为 /TR 目标
  const useWrapper = Boolean(config.workingDirectory || config.environment);
  const tr = useWrapper
    ? quoteWindowsArg(await writeTaskScript(config))
    : config.programArguments.map(quoteWindowsArg).join(' ');

  // 先删除已存在任务，避免 /Create 报错
  await execCmd('schtasks', ['/Delete', '/TN', taskName, '/F']).catch(() => undefined);

  const create = await execCmd('schtasks', [
    '/Create',
    '/TN',
    taskName,
    '/TR',
    tr,
    '/SC',
    'ONLOGON',
    '/RL',
    'HIGHEST',
    '/F',
  ]);
  if (create.code !== 0) {
    throw new Error(`schtasks /Create 失败: ${create.stderr || create.stdout}`);
  }
  logger.info(`[schtasks] 已创建计划任务: ${taskName}`);
  return { scriptPath: useWrapper ? paths.taskScriptPath : '' };
}

/** 卸载计划任务：schtasks /Delete /TN "CrossWMSDaemon" /F，并清理包装脚本。 */
export async function uninstallSchtasks(config: SchtasksConfig): Promise<void> {
  const taskName = resolveTaskName(config);
  const paths = resolvePaths(config);

  const del = await execCmd('schtasks', ['/Delete', '/TN', taskName, '/F']);
  if (del.code !== 0) {
    logger.warn(`[schtasks] /Delete 返回非零退出码: ${del.stderr || del.stdout}`);
  } else {
    logger.info(`[schtasks] 已删除计划任务: ${taskName}`);
  }

  try {
    await fs.unlink(paths.taskScriptPath);
  } catch {
    // 包装脚本可能不存在，忽略
  }
}

/** 运行计划任务：schtasks /Run /TN "CrossWMSDaemon"。 */
export async function startSchtasks(config: SchtasksConfig): Promise<void> {
  const taskName = resolveTaskName(config);
  const res = await execCmd('schtasks', ['/Run', '/TN', taskName]);
  if (res.code !== 0) {
    throw new Error(`schtasks /Run 失败: ${res.stderr || res.stdout}`);
  }
  logger.info(`[schtasks] 已运行计划任务: ${taskName}`);
}

/** 结束计划任务：schtasks /End /TN "CrossWMSDaemon"。 */
export async function stopSchtasks(config: SchtasksConfig): Promise<void> {
  const taskName = resolveTaskName(config);
  const res = await execCmd('schtasks', ['/End', '/TN', taskName]);
  if (res.code !== 0) {
    logger.warn(`[schtasks] /End 返回非零退出码: ${res.stderr || res.stdout}`);
  } else {
    logger.info(`[schtasks] 已结束计划任务: ${taskName}`);
  }
}

/** 查询计划任务状态：schtasks /Query /TN "CrossWMSDaemon" /V /FO LIST。 */
export async function getSchtasksStatus(config: SchtasksConfig): Promise<SchtasksStatus> {
  const taskName = resolveTaskName(config);

  const query = await execCmd('schtasks', ['/Query', '/TN', taskName, '/V', '/FO', 'LIST']);
  if (query.code !== 0) {
    const detail = (query.stderr || query.stdout).trim();
    const missing = /cannot find|无法找到|找不到/i.test(detail);
    return {
      installed: false,
      running: false,
      detail: missing ? undefined : detail || undefined,
    };
  }

  const entries = parseKeyValueOutput(query.stdout, ':');
  const status = entries.status ?? entries['状态'];
  const lastRunResult = entries['last run result'] ?? entries['last result'] ?? entries['上次结果'];

  // 0x41301 表示任务正在运行
  const running = /running|正在运行/i.test(status ?? '') || lastRunResult === '0x41301';

  return {
    installed: true,
    running,
    state: status,
    lastRunResult,
  };
}

/** 解析 key:value 格式的命令输出（schtasks /FO LIST）。 */
function parseKeyValueOutput(output: string, separator: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const idx = line.indexOf(separator);
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + separator.length).trim();
    if (key) entries[key] = value;
  }
  return entries;
}
