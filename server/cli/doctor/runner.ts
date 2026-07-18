/**
 * Doctor 检查运行器
 * 负责并行/串行执行检查、结果聚合和修复逻辑调度
 */

import type {
  DoctorCheck,
  DoctorCheckResult,
  DoctorContext,
  DoctorReport,
  DoctorRunnerOptions,
  DoctorFinding,
} from "./types.js";
import { DoctorSeverity, DoctorCategory } from "./types.js";

import { configChecks } from "./categories/config.js";
import { workspaceChecks } from "./categories/workspace.js";
import { securityChecks } from "./categories/security.js";
import { pluginChecks } from "./categories/plugins.js";
import { sessionChecks } from "./categories/sessions.js";

export function getAllDoctorChecks(): DoctorCheck[] {
  return [
    ...configChecks,
    ...workspaceChecks,
    ...securityChecks,
    ...pluginChecks,
    ...sessionChecks,
  ];
}

export function filterChecks(
  checks: readonly DoctorCheck[],
  options: DoctorRunnerOptions,
): DoctorCheck[] {
  let filtered = [...checks];

  if (options.categories && options.categories.length > 0) {
    const categorySet = new Set(options.categories);
    filtered = filtered.filter((c) => categorySet.has(c.category));
  }

  if (options.onlyChecks && options.onlyChecks.length > 0) {
    const onlySet = new Set(options.onlyChecks);
    filtered = filtered.filter((c) => onlySet.has(c.id));
  }

  if (options.skipChecks && options.skipChecks.length > 0) {
    const skipSet = new Set(options.skipChecks);
    filtered = filtered.filter((c) => !skipSet.has(c.id));
  }

  return filtered;
}

export async function runDoctorChecks(
  context: DoctorContext,
  options: DoctorRunnerOptions = {},
): Promise<DoctorReport> {
  const startedAt = new Date().toISOString();
  const allChecks = getAllDoctorChecks();
  const checksToRun = filterChecks(allChecks, options);

  const results: DoctorCheckResult[] = [];

  if (options.parallel) {
    const promises = checksToRun.map((check) =>
      runSingleCheck(check, context),
    );
    const parallelResults = await Promise.all(promises);
    results.push(...parallelResults);
  } else {
    for (const check of checksToRun) {
      const result = await runSingleCheck(check, context);
      results.push(result);
    }
  }

  if (options.fix) {
    await runFixes(checksToRun, context, results);
  }

  const finishedAt = new Date().toISOString();
  return buildReport(results, startedAt, finishedAt);
}

async function runSingleCheck(
  check: DoctorCheck,
  context: DoctorContext,
): Promise<DoctorCheckResult> {
  try {
    const result = await check.run(context);
    return result;
  } catch (err) {
    return {
      checkId: check.id,
      category: check.category,
      severity: DoctorSeverity.FAIL,
      title: check.title,
      description: check.description,
      findings: [
        {
          id: `${check.id}/execution-error`,
          severity: "error",
          message: `检查执行失败: ${err instanceof Error ? err.message : String(err)}`,
          fixHint: "这是一个内部错误，请检查日志获取详细信息",
          fixable: false,
        },
      ],
      details: {
        executionError: true,
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

async function runFixes(
  checks: readonly DoctorCheck[],
  context: DoctorContext,
  results: DoctorCheckResult[],
): Promise<void> {
  for (const check of checks) {
    if (check.fix) {
      const result = results.find((r) => r.checkId === check.id);
      if (result && result.severity !== DoctorSeverity.PASS) {
        try {
          await check.fix(context);
        } catch {
          // 忽略修复错误，继续下一个
        }
      }
    }
  }
}

function buildReport(
  results: readonly DoctorCheckResult[],
  startedAt: string,
  finishedAt: string,
): DoctorReport {
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;
  let infoCount = 0;

  const allFindings: DoctorFinding[] = [];
  const categories = new Set<DoctorCategory>();

  for (const result of results) {
    categories.add(result.category);

    switch (result.severity) {
      case DoctorSeverity.PASS:
        passCount++;
        break;
      case DoctorSeverity.WARN:
        warnCount++;
        break;
      case DoctorSeverity.FAIL:
        failCount++;
        break;
      case DoctorSeverity.INFO:
        infoCount++;
        break;
    }

    allFindings.push(...result.findings);
  }

  const ok = failCount === 0;

  return {
    ok,
    checksRun: results.length,
    totalFindings: allFindings.length,
    passCount,
    warnCount,
    failCount,
    infoCount,
    results,
    findings: allFindings,
    categories: Array.from(categories).sort(),
    startedAt,
    finishedAt,
  };
}

export function createDefaultDoctorContext(
  overrides: Partial<DoctorContext> = {},
): DoctorContext {
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  const defaultWorkspace = process.env.CDFKNOW_WORKSPACE ?? join(homeDir, ".cdfknow");
  const defaultConfig = process.env.CDFKNOW_CONFIG ?? join(defaultWorkspace, "config");
  const defaultData = process.env.CDFKNOW_DATA ?? join(defaultWorkspace, "data");

  return {
    workspaceDir: overrides.workspaceDir ?? defaultWorkspace,
    configDir: overrides.configDir ?? defaultConfig,
    dataDir: overrides.dataDir ?? defaultData,
    verbose: overrides.verbose ?? false,
    fix: overrides.fix ?? false,
  };
}

function join(...parts: string[]): string {
  return parts.join("/").replace(/\/+/g, "/");
}
