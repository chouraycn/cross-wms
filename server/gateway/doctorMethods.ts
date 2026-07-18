/**
 * Doctor Gateway Methods — Doctor RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/doctor.ts
 * - 精简版：只实现 check / fix / listChecks 三个核心方法
 * - 提供通用的检查/修复框架，支持注册不同检查项
 */

import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';

// Registry 类型从 getMethodRegistry 推导，避免依赖未导出的 MethodRegistry 类
type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

export type DoctorCheckSeverity = 'info' | 'warning' | 'critical';

export interface DoctorCheckResult {
  checkId: string;
  ok: boolean;
  severity: DoctorCheckSeverity;
  message: string;
  details?: Record<string, unknown>;
  fixable: boolean;
}

export interface DoctorFixResult {
  checkId: string;
  fixed: boolean;
  message: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

interface DoctorCheck {
  id: string;
  name: string;
  description: string;
  severity: DoctorCheckSeverity;
  run: () => Promise<DoctorCheckResult>;
  fix?: () => Promise<DoctorFixResult>;
}

// 注册中心：所有 doctor 检查项
const doctorChecks = new Map<string, DoctorCheck>();

/**
 * 注册一个 doctor 检查项（供其他模块扩展）
 */
export function registerDoctorCheck(check: DoctorCheck): void {
  doctorChecks.set(check.id, check);
}

// ========== 默认检查项：进程内存 ==========

registerDoctorCheck({
  id: 'process.memory',
  name: '进程内存检查',
  description: '检查 Node.js 进程堆内存使用率',
  severity: 'warning',
  run: async (): Promise<DoctorCheckResult> => {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
    const ratio = heapTotalMB > 0 ? heapUsedMB / heapTotalMB : 0;
    const ok = ratio < 0.9;
    return {
      checkId: 'process.memory',
      ok,
      severity: ratio < 0.7 ? 'info' : ratio < 0.9 ? 'warning' : 'critical',
      message: `堆内存使用 ${Math.round(heapUsedMB)}MB / ${Math.round(heapTotalMB)}MB (${Math.round(ratio * 100)}%)`,
      details: {
        heapUsedMB: Math.round(heapUsedMB),
        heapTotalMB: Math.round(heapTotalMB),
        ratio: Math.round(ratio * 100) / 100,
        rssMB: Math.round(memoryUsage.rss / 1024 / 1024),
      },
      fixable: true,
    };
  },
  fix: async (): Promise<DoctorFixResult> => {
    const before = process.memoryUsage();
    if (typeof globalThis.gc === 'function') {
      // 仅在 --expose-gc 启动时可用
      globalThis.gc();
    }
    const after = process.memoryUsage();
    return {
      checkId: 'process.memory',
      fixed: true,
      message: '已触发垃圾回收（若启用 --expose-gc）',
      before: {
        heapUsedMB: Math.round(before.heapUsed / 1024 / 1024),
      },
      after: {
        heapUsedMB: Math.round(after.heapUsed / 1024 / 1024),
      },
    };
  },
});

// ========== 默认检查项：进程运行时长 ==========

registerDoctorCheck({
  id: 'process.uptime',
  name: '进程运行时长',
  description: '检查进程是否需要重启',
  severity: 'info',
  run: async (): Promise<DoctorCheckResult> => {
    const uptimeMs = process.uptime() * 1000;
    const uptimeHours = uptimeMs / 3600_000;
    // 超过 7 天建议重启
    const ok = uptimeHours < 24 * 7;
    return {
      checkId: 'process.uptime',
      ok,
      severity: ok ? 'info' : 'warning',
      message: `进程已运行 ${Math.round(uptimeHours * 10) / 10} 小时`,
      details: {
        uptimeMs,
        uptimeHours: Math.round(uptimeHours * 10) / 10,
      },
      fixable: false,
    };
  },
});

// ========== Doctor Check ==========

async function doctorCheck(params: unknown, _ctx: GatewayMethodContext) {
  const { checkId } = params as { checkId?: string };

  if (checkId) {
    const check = doctorChecks.get(checkId);
    if (!check) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: `Check ${checkId} not found` },
      };
    }
    const result = await check.run();
    return {
      ok: true,
      results: [result],
      total: 1,
    };
  }

  // 未指定 checkId：运行所有检查
  const results: DoctorCheckResult[] = [];
  for (const check of doctorChecks.values()) {
    try {
      results.push(await check.run());
    } catch (err) {
      results.push({
        checkId: check.id,
        ok: false,
        severity: 'critical',
        message: `检查执行失败: ${(err as Error)?.message ?? String(err)}`,
        fixable: false,
      });
    }
  }

  return {
    ok: true,
    results,
    total: results.length,
  };
}

// ========== Doctor Fix ==========

async function doctorFix(params: unknown, _ctx: GatewayMethodContext) {
  const { checkId } = params as { checkId?: string };

  if (!checkId) {
    return {
      ok: false,
      error: { code: 'MISSING_PARAMS', message: 'checkId is required' },
    };
  }

  const check = doctorChecks.get(checkId);
  if (!check) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: `Check ${checkId} not found` },
    };
  }

  if (!check.fix) {
    return {
      ok: false,
      error: { code: 'NOT_FIXABLE', message: `Check ${checkId} is not fixable` },
    };
  }

  try {
    const result = await check.fix();
    return {
      ok: true,
      result,
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'FIX_FAILED',
        message: `修复失败: ${(err as Error)?.message ?? String(err)}`,
      },
    };
  }
}

// ========== Doctor List Checks ==========

async function doctorListChecks(_params: unknown, _ctx: GatewayMethodContext) {
  const checks = Array.from(doctorChecks.values()).map((check) => ({
    id: check.id,
    name: check.name,
    description: check.description,
    severity: check.severity,
    fixable: typeof check.fix === 'function',
  }));

  return {
    ok: true,
    checks,
    total: checks.length,
  };
}

/**
 * 注册所有 Doctor 方法
 */
export function registerDoctorMethods(registry: GatewayMethodRegistry): void {
  registry.register('doctor.check', doctorCheck);
  registry.register('doctor.fix', doctorFix);
  registry.register('doctor.listChecks', doctorListChecks);
}
