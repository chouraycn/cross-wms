/**
 * Harness 系统入口 — 参考 OpenClaw harness 模块
 * 
 * 统一导出线束接口、注册表、策略、生命周期和选择器。
 */

export type {
  AgentHarness,
  HarnessSupportContext,
  HarnessSupport,
  HarnessAttemptParams,
  HarnessAttemptResult,
  HarnessCompactParams,
  HarnessCompactResult,
  HarnessResetParams,
  HarnessResultClassification,
  RegisteredHarness,
  ContextEngineHostCapability,
} from './types.js';

export {
  registerAgentHarness,
  getRegisteredAgentHarness,
  listRegisteredAgentHarnesses,
  clearAgentHarnesses,
  restoreRegisteredHarnesses,
  resetRegisteredHarnessSessions,
  disposeRegisteredHarnesses,
} from './registry.js';

export {
  resolveHarnessPolicy,
  type HarnessPolicy,
} from './policy.js';

export {
  runHarnessLifecycleAttempt,
} from './lifecycle.js';

export {
  selectAgentHarness,
  listSupportedHarnesses,
} from './selection.js';
