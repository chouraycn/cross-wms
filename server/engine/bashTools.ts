/**
 * Bash/Exec 工具主入口
 *
 * 提供代码执行工具（bash_exec）和进程控制工具（process_control）
 *
 * 参考自 OpenClaw bash-tools.ts
 */

import type { ToolDefinition } from '../aiClient.js';
import type { ToolHandler } from './toolTypes.js';
import { executeCommand, handleProcessAction } from './bashExecutor.js';
import {
  ExecToolSchema,
  ProcessToolSchema,
  type ExecToolParams,
  type ExecResult,
  type ProcessToolParams,
} from './bashSchemas.js';
import approvalManager, { type ApprovalRiskLevel } from './approvalManager.js';
import { evaluateSandboxPolicy } from './sandboxPolicy.js';

// ===================== 工具定义 =====================

/**
 * Exec 工具定义
 */
export const execToolDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'bash_exec',
    description: `执行终端命令（支持沙箱安全策略）

功能：
- 执行 Shell 命令（支持 macOS/Linux/Windows）
- 超时控制（默认 30 秒，最大 1 小时）
- 后台进程管理（background/yieldMs 参数）
- 环境变量配置
- 工作目录指定
- 输出截断（防止内存溢出）

参数说明：
- command: 要执行的命令（必需）
- workdir: 工作目录（可选，默认当前目录）
- env: 环境变量（可选）
- timeout: 超时秒数（可选，默认 30）
- background: 后台运行（可选）
- yieldMs: 后台等待时间（可选，默认 10000ms）
- pty: PTY 模式（可选，用于交互式 CLI）
- elevated: 提权执行（可选，需要审批）
- host: 执行目标（可选：auto | sandbox | gateway | node）

返回：
- status: 执行状态（completed | failed | running | timeout）
- stdout: 标准输出
- stderr: 标准错误
- exitCode: 退出码
- durationMs: 执行耗时
- sessionId: 会话 ID（后台进程）

安全策略：
- 危险命令检测（rm -rf /, sudo, chmod 777 等）
- 命令白名单/黑名单
- 工作目录限制
- 高风险命令需要审批

使用示例：
1. 简单命令：bash_exec command="ls -la"
2. 指定目录：bash_exec command="npm test" workdir="/project"
3. 后台进程：bash_exec command="npm start" background=true
4. 超时控制：bash_exec command="build" timeout=300`,
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '要执行的 Shell 命令',
        },
        workdir: {
          type: 'string',
          description: '工作目录（可选，默认当前目录）',
        },
        env: {
          type: 'object',
          description: '环境变量（可选）',
          additionalProperties: { type: 'string' },
        },
        timeout: {
          type: 'number',
          description: '超时秒数（可选，默认 30，最大 3600）',
        },
        pty: {
          type: 'boolean',
          description: '是否使用 PTY 模式（可选，用于交互式 CLI）',
        },
        background: {
          type: 'boolean',
          description: '是否后台运行（可选）',
        },
        yieldMs: {
          type: 'number',
          description: '后台等待时间（可选，默认 10000ms）',
        },
        elevated: {
          type: 'boolean',
          description: '是否需要提权执行（可选，需要审批）',
        },
        host: {
          type: 'string',
          enum: ['auto', 'sandbox', 'gateway', 'node'],
          description: '执行目标（可选）',
        },
      },
      required: ['command'],
    },
  },
};

/**
 * Process Control 工具定义
 */
export const processToolDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'process_control',
    description: `控制后台进程（配合 bash_exec 使用）

支持操作：
- list: 列出所有后台进程
- poll: 等待进程输出（阻塞等待新输出）
- log: 获取进程日志（分页）
- write: 写入数据到 stdin
- send-keys: 发送按键序列（支持特殊按键）
- submit: 写入数据并关闭 stdin
- paste: 粘贴文本（支持 bracketed paste）
- kill: 终止进程（SIGTERM -> SIGKILL）
- clear: 清除输出缓冲
- remove: 移除已退出的进程记录

参数说明：
- action: 操作类型（必需）
- sessionId: 会话 ID（除了 list 外都需要）
- data: 写入数据（write/submit）
- keys: 按键序列（send-keys）
- hex: 十六进制字节（send-keys）
- literal: 字面文本（send-keys）
- text: 粘贴文本（paste）
- timeout: poll 等待超时（最大 30000ms）

特殊按键映射：
- Enter/Return: 回车
- Tab: 制表符
- Escape/Esc: ESC
- Backspace/Delete: 删除
- ArrowUp/Down/Left/Right: 方向键
- Home/End: Home/End
- Ctrl+C/D/Z: 控制组合键
- Ctrl+X: 任意控制键

使用示例：
1. 列出进程：process_control action="list"
2. 查看输出：process_control action="poll" sessionId="exec_abc123"
3. 发送输入：process_control action="write" sessionId="exec_abc123" data="hello"
4. 终止进程：process_control action="kill" sessionId="exec_abc123"`,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'poll', 'log', 'write', 'send-keys', 'submit', 'paste', 'kill', 'clear', 'remove'],
          description: '操作类型',
        },
        sessionId: {
          type: 'string',
          description: '会话 ID（除了 list 外都需要）',
        },
        data: {
          type: 'string',
          description: '写入数据（write/submit）',
        },
        keys: {
          type: 'array',
          items: { type: 'string' },
          description: '按键序列（send-keys）',
        },
        hex: {
          type: 'array',
          items: { type: 'string' },
          description: '十六进制字节（send-keys）',
        },
        literal: {
          type: 'string',
          description: '字面文本（send-keys）',
        },
        text: {
          type: 'string',
          description: '粘贴文本（paste）',
        },
        bracketed: {
          type: 'boolean',
          description: '是否使用 bracketed paste 模式',
        },
        eof: {
          type: 'boolean',
          description: '写入后关闭 stdin',
        },
        offset: {
          type: 'number',
          description: '日志偏移量',
        },
        limit: {
          type: 'number',
          description: '日志长度限制',
        },
        timeout: {
          type: 'number',
          description: 'poll 等待超时（毫秒，最大 30000）',
        },
      },
      required: ['action'],
    },
  },
};

// ===================== 工具处理器 =====================

/**
 * Exec 工具处理器
 *
 * @param args - 工具参数
 * @returns 执行结果 JSON
 */
export const handleExecCommand: ToolHandler = async (args: Record<string, unknown>): Promise<string> => {
  try {
    // 解析参数
    const params = ExecToolSchema.parse(args);

    // 检查是否需要审批
    const approvalNeeded = checkExecApprovalNeeded(params);

    if (approvalNeeded) {
      // 创建审批请求
      const request = approvalManager.createRequest(
        'bash_exec',
        { command: params.command, workdir: params.workdir },
        approvalNeeded.riskLevel,
        approvalNeeded.reason,
        undefined,
        undefined,
      );

      // 如果不是自动批准，等待审批
      if (request.status === 'pending') {
        const approved = await approvalManager.waitForApproval(request.id);

        if (approved.status !== 'approved') {
          return JSON.stringify({
            error: `审批被拒绝: ${approved.rejectReason || approved.status}`,
            approvalId: request.id,
          });
        }
      }
    }

    // 执行命令
    const result = await executeCommand({ params });

    // 格式化返回结果
    return formatExecResult(result);
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return JSON.stringify({ error: `参数验证失败: ${err.message}` });
    }
    return JSON.stringify({ error: `执行失败: ${err instanceof Error ? err.message : String(err)}` });
  }
};

/**
 * Process Control 工具处理器
 *
 * @param args - 工具参数
 * @returns 操作结果 JSON
 */
export const handleProcessControl: ToolHandler = async (args: Record<string, unknown>): Promise<string> => {
  try {
    // 解析参数
    const params = ProcessToolSchema.parse(args);

    // 执行操作
    const result = await handleProcessAction(params);

    return result;
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return JSON.stringify({ error: `参数验证失败: ${err.message}` });
    }
    return JSON.stringify({ error: `操作失败: ${err instanceof Error ? err.message : String(err)}` });
  }
};

// ===================== 辅助函数 =====================

/**
 * 检查 Exec 命令是否需要审批
 */
function checkExecApprovalNeeded(params: ExecToolParams): { riskLevel: ApprovalRiskLevel; reason: string } | null {
  // 沙箱策略评估
  const sandboxResult = evaluateSandboxPolicy({
    command: params.command,
    cwd: params.workdir,
  });

  // 如果沙箱策略不允许，直接拒绝
  if (!sandboxResult.allowed) {
    return {
      riskLevel: 'critical',
      reason: sandboxResult.reason,
    };
  }

  // 提权执行需要审批
  if (params.elevated) {
    return {
      riskLevel: 'high',
      reason: '需要提权执行',
    };
  }

  // 检查是否是高风险命令
  const highRiskPatterns = [
    /^sudo\s/i,
    /^su\s/i,
    /^chmod\s/i,
    /^chown\s/i,
    /^rm\s+-rf/i,
    /^dd\s/i,
    /^mkfs/i,
    /^fdisk/i,
    /^parted/i,
    /\|.*sudo/i,
    /\|.*rm\s+-rf/i,
  ];

  for (const pattern of highRiskPatterns) {
    if (pattern.test(params.command)) {
      return {
        riskLevel: 'high',
        reason: `检测到高风险命令模式: ${pattern.source}`,
      };
    }
  }

  // 检查是否是中等风险命令
  const mediumRiskPatterns = [
    /^rm\s/i,
    /^mv\s/i,
    /^cp\s/i,
    /^mkdir\s/i,
    /^rmdir\s/i,
    /^npm\s+publish/i,
    /^git\s+push/i,
    /^docker\s+rm/i,
    /^kubectl\s+delete/i,
  ];

  for (const pattern of mediumRiskPatterns) {
    if (pattern.test(params.command)) {
      return {
        riskLevel: 'medium',
        reason: `检测到中等风险命令: ${pattern.source}`,
      };
    }
  }

  // 网络相关命令
  const networkPatterns = [
    /^curl\s/i,
    /^wget\s/i,
    /^ssh\s/i,
    /^scp\s/i,
    /^rsync\s/i,
  ];

  for (const pattern of networkPatterns) {
    if (pattern.test(params.command)) {
      return {
        riskLevel: 'medium',
        reason: `涉及网络操作: ${pattern.source}`,
      };
    }
  }

  // 默认安全
  return null;
}

/**
 * 格式化 Exec 结果
 */
function formatExecResult(result: ExecResult): string {
  const output: Record<string, unknown> = {
    status: result.status,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    timedOut: result.timedOut,
  };

  // 添加输出
  if (result.stdout) {
    output.stdout = result.stdout;
  }
  if (result.stderr) {
    output.stderr = result.stderr;
  }

  // 添加会话信息
  if (result.sessionId) {
    output.sessionId = result.sessionId;
    output.pid = result.pid;
    output.cwd = result.cwd;
  }

  // 添加错误信息
  if (result.status === 'failed' || result.status === 'timeout') {
    output.reason = result.reason;
    if (result.failureKind) {
      output.failureKind = result.failureKind;
    }
  }

  // 添加退出信号
  if (result.exitSignal) {
    output.exitSignal = result.exitSignal;
  }

  return JSON.stringify(output, null, 2);
}

// ===================== 导出 =====================

// 注意：execToolDefinition / processToolDefinition / handleExecCommand / handleProcessControl
// 已在文件顶部用 `export const` 导出，此处不再重复。
// 仍需导出 checkExecApprovalNeeded / formatExecResult 这两个内部辅助函数。
export {
  checkExecApprovalNeeded,
  formatExecResult,
};

/**
 * 获取所有 Bash 工具定义
 */
export function getBashToolDefinitions(): ToolDefinition[] {
  return [execToolDefinition, processToolDefinition];
}

/**
 * 获取 Bash 工具处理器映射
 */
export function getBashToolHandlers(): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  handlers.set('bash_exec', handleExecCommand);
  handlers.set('process_control', handleProcessControl);
  return handlers;
}