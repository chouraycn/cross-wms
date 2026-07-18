export type NodeHostConfig = {
  nodeId: string;
  baseUrl?: string;
  token?: string;
  timeoutMs?: number;
  maxRetries?: number;
  capabilities?: string[];
  platform?: string;
  maxMemoryMB?: number;
  maxCpuPercent?: number;
  maxExecutionTimeMs?: number;
  maxConcurrentInvocations?: number;
  allowedCommands?: string[];
  deniedCommands?: string[];
  pluginPaths?: string[];
};

export type Invocation = {
  id: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  stdin?: string;
  priority?: number;
  metadata?: Record<string, unknown>;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';
};

export type ExecutionResult = {
  invocationId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  signal?: string;
  durationMs: number;
  timedOut: boolean;
  success: boolean;
  error?: string;
  truncated: boolean;
  resourceUsage?: ResourceUsage;
};

export type ResourceUsage = {
  memoryBytes?: number;
  cpuPercent?: number;
  wallTimeMs: number;
  userTimeMs?: number;
  systemTimeMs?: number;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  permissions?: string[];
  timeoutMs?: number;
  category?: string;
  version?: string;
};

export type ToolHandler = (
  input: Record<string, unknown>,
  context: ToolContext,
) => Promise<Record<string, unknown>>;

export type ToolContext = {
  invocationId: string;
  nodeId: string;
  abortSignal?: AbortSignal;
  logger?: {
    info: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
  };
  metadata?: Record<string, unknown>;
};

export type Permission = {
  action: string;
  resource: string;
  effect: 'allow' | 'deny';
  conditions?: Record<string, unknown>;
};

export type PermissionCheckResult = {
  allowed: boolean;
  reason?: string;
  matchedPermission?: Permission;
};

export type SandboxOptions = {
  timeoutMs?: number;
  maxMemoryMB?: number;
  allowedPaths?: string[];
  deniedPaths?: string[];
  env?: Record<string, string>;
  cwd?: string;
  readonly?: boolean;
};

export type SandboxExecutionResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  memoryUsedBytes?: number;
};

export type InvocationQueueOptions = {
  maxSize?: number;
  maxConcurrent?: number;
  defaultTimeoutMs?: number;
};

export type QueueStats = {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  totalProcessed: number;
  averageDurationMs: number;
};

export type ResourceMonitorOptions = {
  sampleIntervalMs?: number;
  maxMemoryMB?: number;
  maxCpuPercent?: number;
  onExceedLimit?: (type: 'memory' | 'cpu', value: number, limit: number) => void;
};

export type ResourceSnapshot = {
  timestamp: number;
  memoryBytes: number;
  cpuPercent: number;
  uptimeMs: number;
};

export type PluginDefinition = {
  id: string;
  name: string;
  version: string;
  description?: string;
  tools?: ToolDefinition[];
  permissions?: string[];
  entryPoint?: string;
};

export type PluginInstance = {
  definition: PluginDefinition;
  loadedAt: number;
  status: 'loaded' | 'active' | 'disabled' | 'error';
  error?: string;
  tools: Map<string, ToolHandler>;
};

export type FunctionLoaderOptions = {
  allowedPaths?: string[];
  maxModuleSizeBytes?: number;
  enableCache?: boolean;
  cacheTTLMs?: number;
};

export type LoadedFunction = {
  id: string;
  name: string;
  sourcePath: string;
  loadedAt: number;
  fn: (...args: unknown[]) => unknown;
  metadata?: Record<string, unknown>;
};

export type NodeHostError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
  invocationId?: string;
  timestamp: number;
};

export type ErrorHandlerOptions = {
  onError?: (error: NodeHostError) => void;
  maxErrorHistory?: number;
  enableRetryableTracking?: boolean;
};

export type RetryableError = {
  error: NodeHostError;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: number;
};
