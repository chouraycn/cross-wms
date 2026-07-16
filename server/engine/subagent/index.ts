/**
 * Subagent 模块 - 子代理管理
 */

export {
  getSubagentRegistry,
  registerSubagentDefinition,
  spawnSubagent,
  cancelSubagent,
} from '../subagentRegistry.js';
export type {
  SubagentRegistry,
  SubagentStatus,
  SubagentDefinition,
  SubagentInstance,
  SpawnSubagentParams,
  SubagentSpawnResult,
} from '../subagentRegistry.js';