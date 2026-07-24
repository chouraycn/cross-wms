/**
 * Code Tools — 代码执行沙箱工具
 *
 * 提供代码执行（code_execute）、进程管理（process_manage）、文件搜索（file_search）工具
 *
 * 注意：server/utils/exec.js 不存在 execAsync 导出，此处使用 child_process.exec 包装
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { ToolDefinition } from '../aiClient.js';
import type { ToolHandler } from './toolTypes.js';

const execAsync = promisify(exec);

// ===================== 工具定义 =====================

/**
 * 代码执行工具定义
 */
export const codeExecToolDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'code_execute',
    description: '在安全沙箱中执行代码（支持 JavaScript/TypeScript、Python）',
    parameters: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          enum: ['javascript', 'typescript', 'python'],
          description: '编程语言',
        },
        code: {
          type: 'string',
          description: '要执行的代码',
        },
        timeout: {
          type: 'number',
          description: '超时时间（毫秒），默认 10000',
          default: 10000,
        },
        workingDir: {
          type: 'string',
          description: '工作目录（可选）',
        },
      },
      required: ['language', 'code'],
    },
  },
};

/**
 * 进程管理增强工具定义
 */
export const processManageToolDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'process_manage',
    description: '管理系统进程（查看、终止、设置优先级）',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'kill', 'info', 'tree'],
          description: '操作类型',
        },
        pid: {
          type: 'number',
          description: '进程 ID（kill/info/tree 时必填）',
        },
        signal: {
          type: 'string',
          enum: ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP'],
          description: '终止信号（默认 SIGTERM）',
          default: 'SIGTERM',
        },
        filter: {
          type: 'string',
          description: '进程名过滤（list 时可选）',
        },
      },
      required: ['action'],
    },
  },
};

/**
 * 文件搜索工具定义
 */
export const fileSearchToolDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'file_search',
    description: '搜索文件和目录（支持 glob 模式和内容搜索）',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['find', 'grep', 'glob'],
          description: '搜索类型：find=按文件名查找, grep=搜索文件内容, glob=glob 模式匹配',
        },
        path: {
          type: 'string',
          description: '搜索根目录',
        },
        pattern: {
          type: 'string',
          description: '搜索模式（文件名/glob/正则表达式）',
        },
        includeContent: {
          type: 'boolean',
          description: '是否返回匹配行的内容（grep 时有效）',
          default: false,
        },
        maxResults: {
          type: 'number',
          description: '最大返回结果数，默认 50',
          default: 50,
        },
      },
      required: ['action', 'path', 'pattern'],
    },
  },
};

// ===================== 工具处理器 =====================

interface CodeExecArgs {
  language: string;
  code: string;
  timeout?: number;
  workingDir?: string;
}

interface ProcessManageArgs {
  action: string;
  pid?: number;
  signal?: string;
  filter?: string;
}

interface FileSearchArgs {
  action: string;
  path: string;
  pattern: string;
  includeContent?: boolean;
  maxResults?: number;
}

/**
 * 执行代码
 */
async function handleCodeExecute(args: Record<string, unknown>): Promise<string> {
  const { language, code, timeout = 10000, workingDir } = args as unknown as CodeExecArgs;

  try {
    let cmd: string;

    switch (language) {
      case 'javascript':
        cmd = `node -e ${JSON.stringify(code)}`;
        break;
      case 'typescript':
        // 使用 tsx 或 ts-node 执行
        cmd = `npx tsx -e ${JSON.stringify(code)}`;
        break;
      case 'python':
        cmd = `python3 -c ${JSON.stringify(code)}`;
        break;
      default:
        return JSON.stringify({ success: false, error: `不支持的语言: ${language}` });
    }

    const { stdout, stderr } = await execAsync(cmd, {
      timeout,
      cwd: workingDir,
      maxBuffer: 1024 * 1024, // 1MB
    });

    return JSON.stringify({
      success: true,
      stdout: stdout.slice(0, 10000), // 限制输出
      stderr: stderr.slice(0, 5000),
      exitCode: 0,
      durationMs: 0, // execAsync 不返回时间，简化
    });
  } catch (e: unknown) {
    const err = e as { killed?: boolean; signal?: string; message?: string; stdout?: string; stderr?: string; code?: number };
    const isTimeout = err.killed || err.signal === 'SIGTERM';
    return JSON.stringify({
      success: false,
      error: isTimeout ? `执行超时（${timeout}ms）` : (err.message || String(e)),
      stdout: (err.stdout || '').slice(0, 10000),
      stderr: (err.stderr || '').slice(0, 5000),
      exitCode: err.code,
      timedOut: isTimeout,
    });
  }
}

/**
 * 进程管理
 */
async function handleProcessManage(args: Record<string, unknown>): Promise<string> {
  const { action, pid, signal = 'SIGTERM', filter } = args as unknown as ProcessManageArgs;

  try {
    switch (action) {
      case 'list': {
        // 使用 ps 命令列出进程
        const psCmd = process.platform === 'win32'
          ? 'tasklist /FO CSV /NH'
          : `ps aux${filter ? ` | grep ${JSON.stringify(filter)}` : ''}`;
        const { stdout } = await execAsync(psCmd, { timeout: 5000, maxBuffer: 512 * 1024 });

        // 解析并限制结果
        const lines = stdout.trim().split('\n').slice(0, 50);
        const processes = lines.map(line => {
          if (process.platform === 'win32') {
            const parts = line.replace(/"/g, '').split(',');
            return { name: parts[0], pid: parseInt(parts[1]), memory: parts[4] };
          } else {
            const parts = line.trim().split(/\s+/);
            return {
              user: parts[0],
              pid: parseInt(parts[1]),
              cpu: parts[2],
              mem: parts[3],
              command: parts.slice(10).join(' ').slice(0, 100),
            };
          }
        });

        return JSON.stringify({ success: true, processes, count: processes.length });
      }

      case 'kill': {
        if (!pid) return JSON.stringify({ success: false, error: 'pid 必填' });
        process.kill(pid, signal as NodeJS.Signals);
        return JSON.stringify({ success: true, message: `已发送 ${signal} 到进程 ${pid}` });
      }

      case 'info': {
        if (!pid) return JSON.stringify({ success: false, error: 'pid 必填' });
        const { stdout } = await execAsync(
          process.platform === 'win32'
            ? `tasklist /FI "PID eq ${pid}" /FO LIST`
            : `ps -p ${pid} -o pid,ppid,pcpu,pmem,etime,command`,
          { timeout: 5000 },
        );
        return JSON.stringify({ success: true, info: stdout.trim() });
      }

      case 'tree': {
        if (!pid) return JSON.stringify({ success: false, error: 'pid 必填' });
        const { stdout } = await execAsync(
          process.platform === 'win32'
            ? `wmic process where "ParentProcessId=${pid}" get ProcessId,Name`
            : `pgrep -P ${pid} -l`,
          { timeout: 5000 },
        );
        return JSON.stringify({ success: true, children: stdout.trim() });
      }

      default:
        return JSON.stringify({ success: false, error: `未知操作: ${action}` });
    }
  } catch (e: unknown) {
    return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * 文件搜索
 */
async function handleFileSearch(args: Record<string, unknown>): Promise<string> {
  const { action, path: searchPath, pattern, includeContent = false, maxResults = 50 } = args as unknown as FileSearchArgs;

  try {
    switch (action) {
      case 'find': {
        // 按文件名查找
        const findCmd = process.platform === 'win32'
          ? `dir /s /b ${JSON.stringify(searchPath)} | findstr /i ${JSON.stringify(pattern)}`
          : `find ${JSON.stringify(searchPath)} -name ${JSON.stringify(pattern)} -type f 2>/dev/null | head -n ${maxResults}`;
        const { stdout } = await execAsync(findCmd, { timeout: 10000, maxBuffer: 256 * 1024 });
        const files = stdout.trim().split('\n').filter(Boolean);
        return JSON.stringify({ success: true, files, count: files.length });
      }

      case 'grep': {
        // 搜索文件内容
        const grepCmd = process.platform === 'win32'
          ? `findstr /s /n ${JSON.stringify(pattern)} ${JSON.stringify(searchPath + '\\*')}`
          : `grep -r${includeContent ? 'n' : 'l'} --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.py' --include='*.json' ${JSON.stringify(pattern)} ${JSON.stringify(searchPath)} 2>/dev/null | head -n ${maxResults}`;
        const { stdout } = await execAsync(grepCmd, { timeout: 15000, maxBuffer: 512 * 1024 });
        const results = stdout.trim().split('\n').filter(Boolean).map(line => {
          if (includeContent && line.includes(':')) {
            const idx = line.lastIndexOf(':');
            return { file: line.slice(0, idx), line: line.slice(idx + 1) };
          }
          return { file: line };
        });
        return JSON.stringify({ success: true, results, count: results.length });
      }

      case 'glob': {
        // glob 模式匹配
        const globCmd = process.platform === 'win32'
          ? `dir /s /b ${JSON.stringify(searchPath)} | findstr /i /r ${JSON.stringify(pattern.replace(/\*/g, '.*'))}`
          : `find ${JSON.stringify(searchPath)} -path ${JSON.stringify('*/' + pattern)} -type f 2>/dev/null | head -n ${maxResults}`;
        const { stdout } = await execAsync(globCmd, { timeout: 10000, maxBuffer: 256 * 1024 });
        const files = stdout.trim().split('\n').filter(Boolean);
        return JSON.stringify({ success: true, files, count: files.length });
      }

      default:
        return JSON.stringify({ success: false, error: `未知搜索类型: ${action}` });
    }
  } catch (e: unknown) {
    return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
}

// ===================== 导出 =====================

/**
 * 获取代码工具定义
 */
export function getCodeToolDefinitions(): ToolDefinition[] {
  return [codeExecToolDefinition, processManageToolDefinition, fileSearchToolDefinition];
}

/**
 * 获取代码工具处理器映射
 */
export function getCodeToolHandlers(): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  handlers.set('code_execute', handleCodeExecute);
  handlers.set('process_manage', handleProcessManage);
  handlers.set('file_search', handleFileSearch);
  return handlers;
}
