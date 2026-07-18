/**
 * 进程管理 — 统一导出
 *
 * 提供 ManagedProcess / ProcessConfig / ProcessSupervisor / ProcessManager 等核心 API。
 */

export { ProcessManager, getProcessManager, resetProcessManagerSingleton } from './manager.js';
export type { ProcessManagerOptions } from './manager.js';

export { ProcessSupervisor } from './supervisor.js';
export type { SupervisorDeps, StartOptions, StartResult } from './supervisor.js';

export { ProcessPool } from './pool.js';
export type { ProcessPoolConfig, PoolEntry, PoolFactory, AcquireResult } from './pool.js';

export { LifecycleManager, deriveReasonFromExit } from './lifecycle.js';
export type {
  StateChangeRecord,
  ProcessRuntimeRecord,
  ZombieCleanupConfig,
} from './lifecycle.js';

export { createSpawnAdapter, parseSpawnArgs, resolveMaxCapturedChars, appendCapturedOutput } from './spawner.js';
export type { SpawnDeps, ParsedSpawnArgs } from './spawner.js';

export { ProcessMonitor } from './monitor.js';
export type { MonitorConfig } from './monitor.js';

export { ProcessCommunicator } from './communicator.js';
export type { IPCMessage, CommunicatorEvents } from './communicator.js';

export { TaskQueue } from './queue.js';
export type { QueueEntry, EnqueueOptions, QueueStatus } from './queue.js';

export { TimeoutController, withTimeout, ProcessTimeoutError } from './timeout.js';
export type { TimeoutControllerOptions, TimeoutCallback } from './timeout.js';

export {
  RestartPolicy,
  RestartPolicyRegistry,
  computeRestartDelay,
  DEFAULT_RESTART_POLICY,
} from './restart-policy.js';
export type { RestartMode, RestartPolicyConfig, RestartPolicyState } from './restart-policy.js';

export { HealthChecker, HealthCheckerRegistry } from './health-checker.js';
export type { ProbeConfig, ProbeFn, HeartbeatConfig, HeartbeatState } from './health-checker.js';

export { ResourceLimiter, DEFAULT_RESOURCE_LIMIT } from './resource-limiter.js';
export type { ResourceViolation, ResourceCheckResult } from './resource-limiter.js';

export { ProcessErrorHandler, isFatalError } from './error-handler.js';
export type { ErrorCategory, ClassifiedError, HandleResult } from './error-handler.js';

export type {
  ManagedProcess,
  ProcessConfig,
  ProcessState,
  ProcessExitInfo,
  ProcessEvent,
  ProcessEventListener,
  ProcessSnapshot,
  ProcessPriority,
  TerminationReason,
  ResourceUsage,
  ResourceLimit,
  HealthStatus,
  HealthCheckResult,
  SpawnAdapter,
} from './types.js';
