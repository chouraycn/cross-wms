/**
 * 进程管理类型定义
 *
 * 描述受管理进程的状态、配置、句柄、退出信息与事件。
 */

/** 进程生命周期状态 */
export type ProcessState =
  | 'pending'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'exited'
  | 'crashed'
  | 'zombie';

/** 进程退出原因 */
export type TerminationReason =
  | 'manual-stop'
  | 'overall-timeout'
  | 'idle-timeout'
  | 'spawn-error'
  | 'signal'
  | 'exit'
  | 'crash'
  | 'resource-limit'
  | 'health-check-failed'
  | 'restart-policy-stop';

/** 进程优先级 */
export type ProcessPriority = 'critical' | 'normal' | 'low' | 'background';

/** 进程退出信息 */
export interface ProcessExitInfo {
  reason: TerminationReason;
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
  durationMs: number;
  timedOut: boolean;
  restarted?: boolean;
}

/** 资源使用快照 */
export interface ResourceUsage {
  pid: number;
  timestamp: number;
  cpuPercent: number;
  memoryMb: number;
  rssBytes: number;
  heapUsedBytes?: number;
  heapTotalBytes?: number;
  handles?: number;
}

/** 资源限制配置 */
export interface ResourceLimit {
  memoryMb?: number;
  cpuPercent?: number;
  maxHandles?: number;
  maxTimeMs?: number;
}

/** 进程启动配置 */
export interface ProcessConfig {
  /** 进程名称（用于日志/查询） */
  name: string;
  /** 可执行文件路径 */
  command: string;
  /** 命令行参数 */
  args?: string[];
  /** 工作目录 */
  cwd?: string;
  /** 环境变量 */
  env?: NodeJS.ProcessEnv;
  /** 输入数据（写入 stdin 后关闭） */
  input?: string;
  /** 总体超时（毫秒） */
  timeoutMs?: number;
  /** 无输出超时（毫秒） */
  idleTimeoutMs?: number;
  /** 是否捕获 stdout/stderr 到 RunExit */
  captureOutput?: boolean;
  /** 单流最大保留字符数 */
  maxCapturedOutputChars?: number;
  /** 是否启用 IPC 通道（fork 模式） */
  ipc?: boolean;
  /** 优先级 */
  priority?: ProcessPriority;
  /** 资源限制 */
  resourceLimit?: ResourceLimit;
  /** 自动重启策略 id（来自 RestartPolicy 注册表） */
  restartPolicyId?: string;
  /** 健康检查 id */
  healthCheckId?: string;
}

/** 受管理进程句柄 */
export interface ManagedProcess {
  id: string;
  pid?: number;
  name: string;
  state: ProcessState;
  startedAtMs: number;
  lastOutputAtMs: number;
  config: ProcessConfig;
  /** 等待进程退出 */
  wait: () => Promise<ProcessExitInfo>;
  /** 请求停止（先 SIGTERM 后 SIGKILL） */
  stop: (reason?: TerminationReason) => void;
  /** 写入 stdin */
  writeStdin?: (data: string) => void;
  /** 发送信号 */
  sendSignal?: (signal: NodeJS.Signals) => void;
}

/** 进程事件 */
export type ProcessEvent =
  | { type: 'state-change'; processId: string; from: ProcessState; to: ProcessState; reason?: string; timestamp: number }
  | { type: 'stdout'; processId: string; chunk: string; timestamp: number }
  | { type: 'stderr'; processId: string; chunk: string; timestamp: number }
  | { type: 'exit'; processId: string; exit: ProcessExitInfo; timestamp: number }
  | { type: 'health'; processId: string; status: HealthStatus; timestamp: number };

/** 健康状态 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/** 健康检查结果 */
export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message?: string;
  durationMs: number;
  timestamp: number;
}

/** 进程监控快照 */
export interface ProcessSnapshot {
  id: string;
  pid?: number;
  name: string;
  state: ProcessState;
  startedAtMs: number;
  lastOutputAtMs: number;
  restartCount: number;
  uptimeMs: number;
  usage?: ResourceUsage;
  health?: HealthStatus;
}

/** Spawn 适配器接口（抽象 child_process，便于测试） */
export interface SpawnAdapter {
  pid?: number;
  stdin?: {
    write: (data: string) => void;
    end: () => void;
    destroyed?: boolean;
  };
  onStdout: (listener: (chunk: string) => void) => void;
  onStderr: (listener: (chunk: string) => void) => void;
  onIPCMessage?: (listener: (message: unknown) => void) => void;
  wait: () => Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  kill: (signal?: NodeJS.Signals) => void;
  dispose: () => void;
}

/** 事件监听器 */
export type ProcessEventListener = (event: ProcessEvent) => void;
