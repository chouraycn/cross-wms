/**
 * 线束策略解析 — 参考 OpenClaw harness/policy.ts
 * 
 * 根据模型、Provider、配置解析出应该使用的线束策略。
 */

/** 线束策略 */
export interface HarnessPolicy {
  /** 运行时类型 */
  runtime: string;
  /** 策略来源 */
  runtimeSource?: 'model' | 'provider' | 'implicit';
}

/** 解析线束策略 */
export function resolveHarnessPolicy(params: {
  provider?: string;
  modelId?: string;
  config?: Record<string, unknown>;
  agentId?: string;
  sessionKey?: string;
}): HarnessPolicy {
  // TODO: 从配置中解析运行时策略
  // 当前使用隐式策略
  return {
    runtime: 'auto',
    runtimeSource: 'implicit',
  };
}
