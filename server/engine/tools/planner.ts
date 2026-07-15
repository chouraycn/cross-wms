/**
 * 确定性工具规划器 — 参考 OpenClaw tools/planner.ts
 *
 * 从描述符、可用性和请求约束构建可用工具计划。
 *
 * 规划器对描述符排序，隐藏不可用的工具并附带诊断信息，
 * 仅当可见工具描述符违反执行器/名称契约时才抛出异常。
 */

import { evaluateToolAvailability } from './availability.js';
import type {
  BuildToolPlanOptions,
  HiddenToolPlanEntry,
  ToolDescriptor,
  ToolPlan,
  ToolPlanEntry,
} from './types.js';

/** 规划器契约错误 */
export class ToolPlanContractError extends Error {
  readonly code: string;
  readonly toolName: string;

  constructor(params: {
    code: string;
    toolName: string;
    message: string;
  }) {
    super(params.message);
    this.name = 'ToolPlanContractError';
    this.code = params.code;
    this.toolName = params.toolName;
  }
}

/** 比较两个描述符的排序顺序 */
function compareDescriptors(left: ToolDescriptor, right: ToolDescriptor): number {
  return (
    (left.sortKey ?? left.name).localeCompare(right.sortKey ?? right.name) ||
    left.name.localeCompare(right.name)
  );
}

/** 断言描述符名称唯一 */
function assertUniqueNames(descriptors: readonly ToolDescriptor[]): void {
  const seen = new Set<string>();
  for (const descriptor of descriptors) {
    if (seen.has(descriptor.name)) {
      throw new ToolPlanContractError({
        code: 'duplicate-tool-name',
        toolName: descriptor.name,
        message: `重复的工具描述符名称: ${descriptor.name}`,
      });
    }
    seen.add(descriptor.name);
  }
}

/** 构建可见和隐藏的工具计划 */
export function buildToolPlan(options: BuildToolPlanOptions): ToolPlan {
  const descriptors = options.descriptors.toSorted(compareDescriptors);
  assertUniqueNames(descriptors);

  const visible: ToolPlanEntry[] = [];
  const hidden: HiddenToolPlanEntry[] = [];

  for (const descriptor of descriptors) {
    const diagnostics = Array.from(
      evaluateToolAvailability({ descriptor, context: options.availability }),
    );

    if (diagnostics.length > 0) {
      hidden.push({ descriptor, diagnostics });
      continue;
    }

    if (!descriptor.executor) {
      // 隐藏工具可以省略执行器；可见工具必须有执行器
      throw new ToolPlanContractError({
        code: 'missing-executor',
        toolName: descriptor.name,
        message: `可见工具描述符缺少执行器引用: ${descriptor.name}`,
      });
    }

    visible.push({ descriptor, executor: descriptor.executor });
  }

  return { visible, hidden };
}
