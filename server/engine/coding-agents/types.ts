/**
 * Coding Agents 类型定义
 *
 * 定义编码代理适配器的统一契约，用于启动后台编码任务、
 * 监控任务状态、获取任务输出与取消任务。
 *
 * 适配的代理包括 GitHub Copilot 与 OpenCode。
 */

/** 编码代理类型标识 */
export type CodingAgentType = "copilot" | "opencode";

/** 任务运行状态 */
export type CodingTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/** 启动编码任务的请求参数 */
export interface StartCodingTaskParams {
  /** 任务提示词/指令 */
  prompt: string;
  /** 工作目录（默认 process.cwd()） */
  cwd?: string;
  /** 使用的模型（可选，透传给代理） */
  model?: string;
  /** 附加命令行参数 */
  extraArgs?: string[];
  /** 环境变量覆盖 */
  env?: Record<string, string>;
  /** 超时时间（毫秒），0 表示不超时 */
  timeoutMs?: number;
}

/** 已启动任务的句柄 */
export interface CodingTaskHandle {
  /** 任务唯一 ID */
  taskId: string;
  /** 代理类型 */
  agent: CodingAgentType;
  /** 启动时间（毫秒时间戳） */
  startedAt: number;
  /** 进程 PID（如适用） */
  pid?: number;
}

/** 任务状态快照 */
export interface CodingTaskStateSnapshot {
  taskId: string;
  agent: CodingAgentType;
  status: CodingTaskStatus;
  startedAt: number;
  /** 结束时间（毫秒时间戳，未结束为 undefined） */
  finishedAt?: number;
  /** 退出码（进程结束时） */
  exitCode?: number;
  /** 失败原因 */
  error?: string;
}

/** 任务输出 */
export interface CodingTaskOutput {
  taskId: string;
  /** 标准输出累积内容 */
  stdout: string;
  /** 标准错误累积内容 */
  stderr: string;
  /** 当前状态 */
  status: CodingTaskStatus;
}

/** 编码代理适配器接口 */
export interface CodingAgentAdapter {
  /** 代理类型标识 */
  readonly agentType: CodingAgentType;
  /** 代理显示名称 */
  readonly label: string;
  /** 是否已配置（CLI 可用 / 凭证存在） */
  isConfigured(): boolean;
  /** 启动后台编码任务 */
  startTask(params: StartCodingTaskParams): Promise<CodingTaskHandle>;
  /** 查询任务状态 */
  getStatus(taskId: string): Promise<CodingTaskStateSnapshot | undefined>;
  /** 获取任务输出 */
  getOutput(taskId: string): Promise<CodingTaskOutput | undefined>;
  /** 取消任务 */
  cancelTask(taskId: string): Promise<boolean>;
}

/** 适配器构造选项 */
export interface CodingAgentAdapterOptions {
  /** 覆盖默认可执行命令路径 */
  command?: string;
  /** 默认模型 */
  defaultModel?: string;
  /** 默认工作目录 */
  defaultCwd?: string;
  /** 默认超时（毫秒） */
  defaultTimeoutMs?: number;
}
