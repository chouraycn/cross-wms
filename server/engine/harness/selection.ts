/**
 * 线束选择 — 参考 OpenClaw harness/selection.ts
 * 
 * 根据策略和上下文从注册表中选择最合适的线束。
 */

import { logger } from '../../logger.js';
import { listRegisteredAgentHarnesses } from './registry.js';
import type { AgentHarness, HarnessSupportContext } from './types.js';

/** 选择候选 */
interface SelectionCandidate {
  harness: AgentHarness;
  priority: number;
  reason: string;
}

/** 选择最合适的线束 */
export function selectAgentHarness(
  ctx: HarnessSupportContext,
): AgentHarness {
  const candidates: SelectionCandidate[] = [];

  for (const entry of listRegisteredAgentHarnesses()) {
    const { harness } = entry;
    const support = harness.supports(ctx);
    if (support.supported) {
      candidates.push({
        harness,
        priority: support.priority ?? harness.priority ?? 0,
        reason: support.reason ?? 'supported',
      });
    }
  }

  if (candidates.length === 0) {
    throw new Error(`没有可用的线束支持 provider=${ctx.provider}, model=${ctx.modelId ?? 'unknown'}`);
  }

  // 按优先级降序排序
  candidates.sort((a, b) => b.priority - a.priority);

  const selected = candidates[0];
  logger.debug(
    `[HarnessSelection] 选择线束: ${selected.harness.id} (优先级=${selected.priority}, 原因=${selected.reason})`,
  );

  return selected.harness;
}

/** 列出所有支持的线束 */
export function listSupportedHarnesses(
  ctx: HarnessSupportContext,
): AgentHarness[] {
  const result: AgentHarness[] = [];
  for (const entry of listRegisteredAgentHarnesses()) {
    if (entry.harness.supports(ctx).supported) {
      result.push(entry.harness);
    }
  }
  return result;
}
