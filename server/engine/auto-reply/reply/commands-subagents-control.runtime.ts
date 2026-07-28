// @ts-nocheck
/** Runtime facade for controlling subagent runs from reply commands. */
export {
  listControlledSubagentRuns,
  killAllControlledSubagentRuns,
  killControlledSubagentRun,
  sendControlledSubagentMessage,
  steerControlledSubagentRun,
} from '@openclaw-src/agents/subagent-control.js';
