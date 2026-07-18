/**
 * tasks/index.ts — 任务管理系统统一导出
 *
 * 用法：import { TaskRuntime, TaskStore, ... } from './tasks/index.js';
 */

// 类型与常量
export * from './types.js';

// 优先级
export {
  comparePriority,
  compareTaskPriority,
  sortByPriority,
  shiftPriority,
  promotePriority,
  demotePriority,
  inheritPriority,
  clampPriority,
  detailedCompare,
  type PriorityCompareResult,
} from './task-priority.js';

// 进度
export {
  mergeProgress,
  aggregateSubtaskProgress,
  ProgressTracker,
} from './task-progress.js';

// 结果
export {
  okResult,
  errorResult,
  aggregateResults,
  isSuccessfulResult,
  isRetryableResult,
  type AggregatedResult,
} from './task-result.js';

// 事件
export { TaskEventBus } from './task-events.js';

// 依赖
export {
  createGraph,
  ensureNode,
  addEdge,
  removeEdge,
  buildGraphFromTasks,
  hasCycle,
  topologicalSort,
  getAncestors,
  getDescendants,
  getReadyTasks,
  getLayers,
  type DependencyGraph,
} from './task-dependency.js';

// 重试
export {
  DEFAULT_RETRY_POLICY,
  computeDelay,
  shouldRetry,
  canRetryTask,
  fixedRetry,
  exponentialRetry,
  retryOnErrors,
  noRetry,
  type RetryPolicy,
  type RetryStrategy,
} from './task-retry.js';

// 队列
export {
  PriorityQueue,
  DelayedQueue,
  DeadLetterQueue,
  type DeadLetterEntry,
} from './task-queue.js';

// 存储
export {
  TaskStore,
  logStoreEvent,
  type TaskQuery,
} from './task-store.js';

// 超时
export {
  TaskTimeoutManager,
  type TimeoutHandle,
  type TimeoutReason,
  type TimeoutManagerOptions,
} from './task-timeout.js';

// 取消
export {
  CancellationError,
  createToken,
  checkCancelled,
  linkCancellation,
  CancellationRegistry,
  CANCELLED_TOKEN,
  NEVER_TOKEN,
  type CancellationToken,
} from './task-cancellation.js';

// 钩子
export { TaskHooks } from './task-hooks.js';

// 生命周期
export {
  canTransition,
  TaskLifecycle,
  type LifecycleTransitionResult,
} from './task-lifecycle.js';

// 监控
export {
  TaskMonitor,
  summarizeStatus,
  type MonitorSnapshot,
  type ResourceSample,
} from './task-monitor.js';

// 记录器
export {
  TaskRecorder,
  type RecordedEntry,
} from './task-recorder.js';

// 图
export {
  TaskGraph,
  tasksHaveCycle,
} from './task-graph.js';

// 并行化
export {
  parallelLayers,
  hasParallelism,
  batchedParallel,
  estimateCriticalPath,
  isLinearChain,
} from './task-parallelizer.js';

// 分解
export {
  buildSubtasks,
  decomposeByDescription,
  decompose,
  type SubTaskSpec,
  type DecompositionResult,
} from './task-decomposer.js';

// 验证
export {
  validateOptions,
  validateTask,
  validateTaskSet,
  sanitizeOptions,
  type ValidationResult,
} from './task-validator.js';

// 序列化
export {
  SERIALIZATION_VERSION,
  serializeTask,
  serializeTasks,
  deserializeTask,
  deserializeTasks,
  reviveTask,
  cloneTask,
  type SerializedTaskEnvelope,
} from './task-serialization.js';

// 迁移
export {
  migrateTask,
  migrateTasks,
  needsMigration,
  migrateIdempotent,
} from './task-migration.js';

// 执行器
export {
  executeTask,
  runOnce,
  TimeoutError,
  type ExecuteOptions,
  type ExecuteResult,
} from './task-executor.js';

// 调度器
export {
  TaskScheduler,
  type SchedulerOptions,
  type PickedTask,
} from './task-scheduler.js';

// 运行时
export {
  TaskRuntime,
  type RuntimeOptions,
  type SubmitResult,
  type RunOutcome,
} from './task-runtime.js';

// ============================================================================
// 持久化层（engine 层调用 dao 层）
// 封装 dao/taskDao.js 的数据访问，供路由层统一通过 engine/tasks/ 调用。
// 注意：engine/tasks/ 的 runtime/scheduler 是内存任务调度系统，与 dao 的项目任务
// CRUD 属于不同领域（Task 类型不同），此处提供持久化桥接以分层。
// ============================================================================
export {
  findAllTasks,
  findTaskById,
  createTask,
  updateTask,
  deleteTask,
  // migrateTasks 在本模块已从 task-migration.js 导出（schema 迁移），
  // 此处以别名重新导出 dao 的持久化迁移函数，避免命名冲突。
  migrateTasks as migrateTasksToDb,
} from '../../dao/taskDao.js';
