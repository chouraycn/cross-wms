/**
 * 健康检查注册表 — 参考 openclaw/src/flows/health-check-registry.ts
 *
 * 进程内的健康检查注册表，由核心检查和插件检查共同填充。
 * 提供注册、查询、列出、清除等操作，支持 doctor lint/fix 执行流程。
 */

import type { HealthCheck } from './types.js';
import { logger } from '../../logger.js';

const REGISTRY = new Map<string, HealthCheck>();

/** 重复注册检查时抛出的错误。 */
export class HealthCheckRegistrationError extends Error {
  readonly code = 'DOCTOR_DUPLICATE_CHECK';
  constructor(readonly checkId: string) {
    super(`健康检查已注册: ${checkId}`);
    this.name = 'HealthCheckRegistrationError';
  }
}

/** 注册一个健康检查，用于 doctor lint/fix 执行。 */
export function registerHealthCheck(check: HealthCheck): void {
  if (REGISTRY.has(check.id)) {
    throw new HealthCheckRegistrationError(check.id);
  }
  REGISTRY.set(check.id, check);
  logger.debug(`[health-check-registry] registered: ${check.id}`);
}

/** 按插入顺序返回所有已注册的检查，保证 doctor 输出确定性。 */
export function listHealthChecks(): readonly HealthCheck[] {
  return [...REGISTRY.values()];
}

/** 返回扩展检查（排除 core 类型），并校验未占用 core 保留 id。 */
export function listExtensionHealthChecksForDoctor(
  coreChecks: readonly HealthCheck[],
): readonly HealthCheck[] {
  const coreIds = new Set(coreChecks.map((check) => check.id));
  const registeredChecks = listHealthChecks();
  for (const check of registeredChecks) {
    if (check.id.startsWith('core/doctor/') || coreIds.has(check.id)) {
      throw new HealthCheckRegistrationError(check.id);
    }
  }
  return registeredChecks.filter((check) => check.kind !== 'core');
}

/** 根据 id 查找已注册的健康检查。 */
export function getHealthCheck(id: string): HealthCheck | undefined {
  return REGISTRY.get(id);
}

/** 检查指定 id 的健康检查是否已注册。 */
export function hasHealthCheck(id: string): boolean {
  return REGISTRY.has(id);
}

/** 返回已注册检查的数量。 */
export function healthCheckCount(): number {
  return REGISTRY.size;
}

/** 清空进程内注册表，用于隔离测试。 */
export function clearHealthChecksForTest(): void {
  REGISTRY.clear();
  logger.debug('[health-check-registry] cleared for test');
}

/** 批量注册健康检查，遇到重复 id 时抛出错误。 */
export function registerHealthChecks(checks: readonly HealthCheck[]): void {
  for (const check of checks) {
    registerHealthCheck(check);
  }
}

/** 按 id 列表批量获取检查，不存在的忽略。 */
export function getHealthChecksByIds(ids: readonly string[]): HealthCheck[] {
  const result: HealthCheck[] = [];
  for (const id of ids) {
    const check = REGISTRY.get(id);
    if (check) {
      result.push(check);
    }
  }
  return result;
}
