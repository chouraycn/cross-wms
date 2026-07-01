/**
 * Bash/Exec 工具的 Zod Schema 定义
 *
 * 定义代码执行工具的参数 schema 和返回类型
 */

import { z } from 'zod';

// ===================== Exec Tool Schema =====================

/** Exec 工具参数 Schema */
export const ExecToolSchema = z.object({
  /** 要执行的 Shell 命令 */
  command: z.string(
    'command 是必需参数',
  ).min(1, 'command 不能为空'),

  /** 工作目录（可选，默认为当前目录） */
  workdir: z.string().optional(),

  /** 环境变量（可选） */
  env: z.record(z.string(), z.string()).optional(),

  /** 超时时间（秒，可选，默认 30 秒） */
  timeout: z.number().int().positive().max(3600).optional(),

  /** 是否使用 PTY 模式（可选，默认 false） */
  pty: z.boolean().optional(),

  /** 是否后台运行（可选，默认 false） */
  background: z.boolean().optional(),

  /** 后台等待时间（毫秒，可选，默认 10000ms） */
  yieldMs: z.number().int().positive().max(120000).optional(),

  /** 是否需要提权执行（可选，默认 false） */
  elevated: z.boolean().optional(),

  /** 执行目标（可选：auto | sandbox | gateway | node） */
  host: z.enum(['auto', 'sandbox', 'gateway', 'node']).optional(),
});

/** Exec 工具参数类型 */
export type ExecToolParams = z.infer<typeof ExecToolSchema>;

// ===================== Exec Result Schema =====================

/** Exec 执行结果状态 */
export const ExecResultStatusSchema = z.enum(['completed', 'failed', 'running', 'timeout']);

/** Exec 执行结果 Schema */
export const ExecResultSchema = z.object({
  /** 执行状态 */
  status: ExecResultStatusSchema,

  /** 标准输出 */
  stdout: z.string(),

  /** 标准错误 */
  stderr: z.string(),

  /** 退出码（null 表示未正常退出） */
  exitCode: z.number().int().nullable(),

  /** 退出信号 */
  exitSignal: z.string().nullable(),

  /** 执行耗时（毫秒） */
  durationMs: z.number().int().positive(),

  /** 是否超时 */
  timedOut: z.boolean(),

  /** 会话 ID（后台进程） */
  sessionId: z.string().optional(),

  /** 进程 PID */
  pid: z.number().int().optional(),

  /** 工作目录 */
  cwd: z.string().optional(),

  /** 失败原因 */
  reason: z.string().optional(),

  /** 失败类型 */
  failureKind: z.enum([
    'shell-command-not-found',
    'shell-not-executable',
    'overall-timeout',
    'no-output-timeout',
    'signal',
    'aborted',
    'runtime-error',
  ]).optional(),
});

/** Exec 执行结果类型 */
export type ExecResult = z.infer<typeof ExecResultSchema>;
export type ExecResultStatus = z.infer<typeof ExecResultStatusSchema>;

// ===================== Process Tool Schema =====================

/** Process 工具动作类型 */
export const ProcessActionSchema = z.enum([
  'list',      // 列出所有后台进程
  'poll',      // 等待进程输出
  'log',       // 获取进程日志
  'write',     // 写入数据到进程 stdin
  'send-keys', // 发送按键序列
  'submit',    // 发送数据并关闭 stdin
  'paste',     // 粘贴文本
  'kill',      // 终止进程
  'clear',     // 清除进程输出缓冲
  'remove',    // 移除已退出的进程记录
]);

/** Process 工具参数 Schema */
export const ProcessToolSchema = z.object({
  /** 动作类型 */
  action: ProcessActionSchema,

  /** 会话 ID（除了 list 外都需要） */
  sessionId: z.string().optional(),

  /** 写入数据（write/submit） */
  data: z.string().optional(),

  /** 按键序列（send-keys） */
  keys: z.array(z.string()).optional(),

  /** 十六进制字节（send-keys） */
  hex: z.array(z.string()).optional(),

  /** 字面文本（send-keys） */
  literal: z.string().optional(),

  /** 粘贴文本（paste） */
  text: z.string().optional(),

  /** 是否使用 bracketed paste 模式 */
  bracketed: z.boolean().optional(),

  /** 写入后关闭 stdin */
  eof: z.boolean().optional(),

  /** 日志偏移量 */
  offset: z.number().int().nonnegative().optional(),

  /** 日志长度限制 */
  limit: z.number().int().positive().optional(),

  /** poll 等待超时（毫秒，最大 30000） */
  timeout: z.number().int().min(0).max(30000).optional(),
});

/** Process 工具参数类型 */
export type ProcessToolParams = z.infer<typeof ProcessToolSchema>;
export type ProcessAction = z.infer<typeof ProcessActionSchema>;

// ===================== Process Session Schema =====================

/** Process 会话信息 Schema */
export const ProcessSessionSchema = z.object({
  /** 会话 ID */
  id: z.string(),

  /** 原始命令 */
  command: z.string(),

  /** 进程 PID */
  pid: z.number().int().optional(),

  /** 启动时间戳 */
  startedAt: z.number().int().positive(),

  /** 工作目录 */
  cwd: z.string(),

  /** 是否已退出 */
  exited: z.boolean(),

  /** 退出码 */
  exitCode: z.number().int().nullable().optional(),

  /** 退出信号 */
  exitSignal: z.string().nullable().optional(),

  /** 是否后台运行 */
  backgrounded: z.boolean(),

  /** 输出截断状态 */
  truncated: z.boolean(),

  /** 当前输出缓冲 */
  aggregated: z.string(),
});

/** Process 会话信息类型 */
export type ProcessSession = z.infer<typeof ProcessSessionSchema>;

// ===================== Approval Schema =====================

/** Exec 审批请求 Schema */
export const ExecApprovalRequestSchema = z.object({
  /** 审批 ID */
  id: z.string(),

  /** 命令内容 */
  command: z.string(),

  /** 工作目录 */
  cwd: z.string().optional(),

  /** 环境变量 */
  env: z.record(z.string(), z.string()).optional(),

  /** 风险等级 */
  riskLevel: z.enum(['safe', 'low', 'medium', 'high', 'critical']),

  /** 是否需要提权 */
  elevated: z.boolean(),

  /** 请求时间戳 */
  createdAt: z.number().int().positive(),

  /** 状态 */
  status: z.enum(['pending', 'approved', 'rejected', 'timeout', 'cancelled']),
});

/** Exec 审批请求类型 */
export type ExecApprovalRequest = z.infer<typeof ExecApprovalRequestSchema>;

/** 审批决策 Schema */
export const ApprovalDecisionSchema = z.enum([
  'allow',         // 允许执行一次
  'allow-always',  // 永久允许（加入白名单）
  'deny',          // 拒绝执行
  'deny-always',   // 永久拒绝（加入黑名单）
]);

/** 审批决策类型 */
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;