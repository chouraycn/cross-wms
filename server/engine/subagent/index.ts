/**
 * Subagent 模块 — 子代理管理 barrel 导出
 *
 * 聚合子代理注册表、运行器和生命周期管理的公开 API。
 */

// ==================== 子代理注册表 ====================
export {
  getSubagentRegistry,
  registerSubagentDefinition,
  spawnSubagent,
  cancelSubagent,
  resetSubagentRegistryForTests,
} from "../subagentRegistry.js";
export type {
  SubagentStatus,
  SubagentDefinition,
  SubagentInstance,
  SpawnSubagentParams,
  SubagentSpawnResult,
  SubagentAvailableTools,
  SubagentRegistry,
} from "../subagentRegistry.js";

// ==================== 子代理运行器 ====================
export type {
  SubagentMode as RunnerSubagentMode,
  SubagentSandboxMode,
  SubagentContextMode,
  SubagentRunStatus,
  SubagentExecutionResult,
  SubagentEvent,
  SubagentEventListener,
  SubagentConfig,
  SubagentIsolationContext,
  SubagentMessage as RunnerSubagentMessage,
} from "../subagentRunner.js";
export {
  SubagentRunner,
  getSubagentRunner,
  executeSubagent,
} from "../subagentRunner.js";

// ==================== 子代理生命周期 ====================
export type {
  SubagentMode as LifecycleSubagentMode,
  SubagentStatus as LifecycleSubagentStatus,
  SubagentInfo,
  SubagentCreateOptions,
  SubagentLifecycleEvent,
  SubagentLifecycleListener,
} from "../subagent-lifecycle.js";
export {
  SubagentLifecycleManager,
  getGlobalSubagentLifecycleManager,
  setGlobalSubagentLifecycleManager,
  createSubagentLifecycleManager,
} from "../subagent-lifecycle.js";
