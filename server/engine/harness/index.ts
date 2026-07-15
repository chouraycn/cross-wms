/**
 * Harness 系统入口 — 参考 OpenClaw harness 模块
 * 
 * 统一导出线束接口、注册表、策略、生命周期、选择器、结果分类和内置线束。
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
  needsAutoSelection,
  type HarnessPolicy,
  type HarnessRuntime,
} from './policy.js';

export {
  runHarnessLifecycleAttempt,
} from './lifecycle.js';

export {
  selectAgentHarness,
  listSupportedHarnesses,
} from './selection.js';

export {
  applyHarnessResultClassification,
  isFailedClassification,
  shouldRetry,
  type ClassificationContext,
  type ClassificationDetail,
} from './result-classification.js';

export {
  createBuiltinHarness,
  registerBuiltinHarness,
  BUILTIN_HARNESS_ID,
} from './builtin-harness.js';
