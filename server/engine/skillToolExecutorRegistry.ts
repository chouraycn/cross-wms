// Leaf module holding a registry for executeToolCall, extracted to break the
// toolRegistry.ts → skillRuntimeBridge.ts → skillLifecycle.ts → skillRegistry.ts → skillContextFactory.ts → toolRegistry.ts cycle (#11).
//
// toolRegistry registers executeToolCall here at module load; skillContextFactory
// calls it via this registry instead of dynamically importing toolRegistry. Both
// modules load at startup, so the executor is registered before any skill runs a tool.

import type { ToolCall } from '../aiCore.js';

type ExecuteToolCallFn = (toolCall: ToolCall, timeoutMs?: number) => Promise<string>;

let registeredExecutor: ExecuteToolCallFn | null = null;

export function registerSkillToolExecutor(fn: ExecuteToolCallFn): void {
  registeredExecutor = fn;
}

export function getSkillToolExecutor(): ExecuteToolCallFn {
  if (!registeredExecutor) {
    throw new Error('skill tool executor not registered yet (toolRegistry not loaded)');
  }
  return registeredExecutor;
}
