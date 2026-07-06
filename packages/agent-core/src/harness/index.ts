export { AgentHarness } from './agent-harness';
export { PolicyEngine } from './policy';
export { HarnessRegistry } from './registry';
export { HookContextFactory } from './hook-context';
export { AgentExecutionPipeline } from './execution-pipeline';

export type {
  HarnessOptions,
  HarnessEvent,
  HarnessRunOptions,
  AgentPolicy,
  ToolPermission,
  ToolPolicyRule,
  HarnessCapability,
  RegisteredTool,
  HookContext,
  HookExecutionContext,
  HookHandler,
  PipelineStage,
  PipelineContext,
} from './index.js';