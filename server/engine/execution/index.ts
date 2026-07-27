/**
 * Execution 模块 - 执行管理
 *
 * 统一导出执行引擎、类型定义和相关工具。
 *
 * 子模块：
 * - types           核心类型定义
 * - executionEngine 执行引擎实现
 *
 * 同时 re-export 现有执行相关模块以保持向后兼容。
 */

// 核心类型
export type {
  ExecutionStatus,
  StepType,
  ExecutionStep,
  StepResult,
  ExecutionResult,
  ExecutionContext,
  ExecutionConfig,
  ToolExecutor,
  ToolRegistration,
  ExecutionEventType,
  ExecutionEvent,
} from './types.js';

// 执行引擎
export {
  ExecutionEngine,
  default as executionEngine,
} from './executionEngine.js';

// 执行器（向后兼容）
export { executeAutomation } from '../executor.js';
export type { ExecutionStep as LegacyExecutionStep, ExecutionResult as LegacyExecutionResult } from '../executor.js';

// 执行通道（向后兼容）
export {
  LaneManager,
  laneManager,
  LaneExecutionContext,
  laneExecutionContext,
  CommandLane,
} from '../executionLanes.js';
export type { LaneTask, LaneStatus, TaskStatus, LaneExecutor, TaskExecutionOptions } from '../executionLanes.js';

// 执行历史（向后兼容）
export { getExecutionHistory } from '../executionHistory.js';

// 执行契约（向后兼容）
export type { ExecutionContract } from '../executionContract.js';

// 单工具执行（向后兼容）
export { executeSingleTool } from '../executeSingleTool.js';

// 审批管理器（向后兼容）
export { ExecApprovalManager } from '../execApprovalManager.js';

import executionEngine from './executionEngine.js';

/**
 * Execution 模块聚合对象
 */
export const execution = {
  engine: executionEngine,
};

export default execution;
