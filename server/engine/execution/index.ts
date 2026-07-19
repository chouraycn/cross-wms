/**
 * Execution 模块 - 执行管理
 *
 * 管理命令执行、审批、安全策略
 */

// 执行器
export { executeAutomation } from '../executor.js';
export type { ExecutionStep, ExecutionResult } from '../executor.js';

// 执行通道
export {
  LaneManager,
  laneManager,
  LaneExecutionContext,
  laneExecutionContext,
  CommandLane,
} from '../executionLanes.js';
export type { LaneTask, LaneStatus, TaskStatus, LaneExecutor, TaskExecutionOptions } from '../executionLanes.js';

// 执行历史
export { getExecutionHistory } from '../executionHistory.js';

// 执行契约
export type { ExecutionContract } from '../executionContract.js';

// 单工具执行
export { executeSingleTool } from '../executeSingleTool.js';

// 审批管理器
export { ExecApprovalManager } from '../execApprovalManager.js';