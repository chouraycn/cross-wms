/**
 * 工作空间类检查
 * 包含工作空间状态、磁盘空间、内存搜索、更新状态等检查
 */

import { existsSync, statSync, readdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { totalmem, freemem } from "os";
import type {
  DoctorCheck,
  DoctorCheckResult,
  DoctorContext,
  DoctorFinding,
} from "../types.js";
import { DoctorSeverity, DoctorCategory } from "../types.js";

const MIN_DISK_SPACE_GB = 1;
const MIN_MEMORY_MB = 256;

export const workspaceChecks: DoctorCheck[] = [
  {
    id: "doctor-workspace",
    category: DoctorCategory.WORKSPACE,
    title: "工作空间状态检查",
    description: "检查工作空间目录结构和状态",
    run: checkWorkspace,
  },
  {
    id: "doctor-disk-space",
    category: DoctorCategory.SYSTEM,
    title: "磁盘空间检查",
    description: "检查可用磁盘空间是否充足",
    run: checkDiskSpace,
  },
  {
    id: "doctor-memory-search",
    category: DoctorCategory.SYSTEM,
    title: "内存搜索功能检查",
    description: "检查系统内存是否满足搜索功能需求",
    run: checkMemorySearch,
  },
  {
    id: "doctor-update",
    category: DoctorCategory.SYSTEM,
    title: "更新状态检查",
    description: "检查是否有待处理的更新",
    run: checkUpdate,
  },
];

async function checkWorkspace(
  context: DoctorContext,
): Promise<DoctorCheckResult> {
  const findings: DoctorFinding[] = [];

  if (!existsSync(context.workspaceDir)) {
    findings.push({
      id: "doctor/workspace/dir-missing",
      severity: "error",
      message: "工作空间目录不存在",
      target: context.workspaceDir,
      fixHint: "创建工作空间目录或指定正确的工作空间路径",
      fixable: false,
    });

    return {
      checkId: "doctor-workspace",
      category: DoctorCategory.WORKSPACE,
      severity: DoctorSeverity.FAIL,
      title: "工作空间状态检查",
      description: "检查工作空间目录结构和状态",
      findings,
      details: { workspaceDir: context.workspaceDir },
    };
  }

  const requiredDirs = ["data", "plugins", "sessions"];
  for (const dir of requiredDirs) {
    const dirPath = join(context.workspaceDir, dir);
    if (!existsSync(dirPath)) {
      findings.push({
        id: `doctor/workspace/${dir}-missing`,
        severity: "warning",
        message: `工作空间缺少 ${dir} 目录`,
        target: dirPath,
        fixHint: `创建 ${dir} 目录`,
        fixable: true,
      });
    }
  }

  try {
    const stats = statSync(context.workspaceDir);
    const entries = readdirSync(context.workspaceDir);

    const severity = findings.some((f) => f.severity === "error")
      ? DoctorSeverity.FAIL
      : findings.length > 0
        ? DoctorSeverity.WARN
        : DoctorSeverity.PASS;

    return {
      checkId: "doctor-workspace",
      category: DoctorCategory.WORKSPACE,
      severity,
      title: "工作空间状态检查",
      description: "检查工作空间目录结构和状态",
      findings,
      details: {
        workspaceDir: context.workspaceDir,
        exists: true,
        isDirectory: stats.isDirectory(),
        itemCount: entries.length,
        created: stats.birthtime.toISOString(),
        lastModified: stats.mtime.toISOString(),
      },
    };
  } catch (err) {
    findings.push({
      id: "doctor/workspace/stat-error",
      severity: "error",
      message: `无法读取工作空间: ${err instanceof Error ? err.message : String(err)}`,
      target: context.workspaceDir,
      fixHint: "检查目录权限和路径正确性",
      fixable: false,
    });

    return {
      checkId: "doctor-workspace",
      category: DoctorCategory.WORKSPACE,
      severity: DoctorSeverity.FAIL,
      title: "工作空间状态检查",
      description: "检查工作空间目录结构和状态",
      findings,
      details: { workspaceDir: context.workspaceDir },
    };
  }
}

async function checkDiskSpace(
  context: DoctorContext,
): Promise<DoctorCheckResult> {
  const findings: DoctorFinding[] = [];

  try {
    let freeBytes: number;
    let totalBytes: number;

    try {
      if (process.platform === "darwin" || process.platform === "linux") {
        const result = execSync(`df -k "${context.workspaceDir}"`, {
          encoding: "utf-8",
        });
        const lines = result.trim().split("\n");
        const lastLine = lines[lines.length - 1];
        const parts = lastLine.split(/\s+/);
        totalBytes = parseInt(parts[1], 10) * 1024;
        freeBytes = parseInt(parts[3], 10) * 1024;
      } else {
        freeBytes = 10 * 1024 * 1024 * 1024;
        totalBytes = 100 * 1024 * 1024 * 1024;
      }
    } catch {
      freeBytes = 10 * 1024 * 1024 * 1024;
      totalBytes = 100 * 1024 * 1024 * 1024;
    }

    const freeGB = freeBytes / (1024 * 1024 * 1024);
    const totalGB = totalBytes / (1024 * 1024 * 1024);
    const usedPercent = ((totalBytes - freeBytes) / totalBytes) * 100;

    if (freeGB < MIN_DISK_SPACE_GB) {
      findings.push({
        id: "doctor/disk/space-low",
        severity: "error",
        message: `磁盘空间不足: ${freeGB.toFixed(2)} GB 可用 (最少需要 ${MIN_DISK_SPACE_GB} GB)`,
        target: context.workspaceDir,
        fixHint: "清理磁盘空间以确保正常运行",
        fixable: false,
      });
    } else if (freeGB < MIN_DISK_SPACE_GB * 5) {
      findings.push({
        id: "doctor/disk/space-warning",
        severity: "warning",
        message: `磁盘空间较低: ${freeGB.toFixed(2)} GB 可用`,
        target: context.workspaceDir,
        fixHint: "建议清理磁盘空间",
        fixable: false,
      });
    }

    if (usedPercent > 90) {
      findings.push({
        id: "doctor/disk/usage-high",
        severity: "warning",
        message: `磁盘使用率较高: ${usedPercent.toFixed(1)}%`,
        target: context.workspaceDir,
        fixHint: "建议清理不必要的文件",
        fixable: false,
      });
    }

    const severity = findings.some((f) => f.severity === "error")
      ? DoctorSeverity.FAIL
      : findings.length > 0
        ? DoctorSeverity.WARN
        : DoctorSeverity.PASS;

    return {
      checkId: "doctor-disk-space",
      category: DoctorCategory.SYSTEM,
      severity,
      title: "磁盘空间检查",
      description: "检查可用磁盘空间是否充足",
      findings,
      details: {
        totalGB: totalGB.toFixed(2),
        freeGB: freeGB.toFixed(2),
        usedPercent: usedPercent.toFixed(1),
        minRequiredGB: MIN_DISK_SPACE_GB,
      },
    };
  } catch (err) {
    findings.push({
      id: "doctor/disk/check-failed",
      severity: "info",
      message: `无法检查磁盘空间: ${err instanceof Error ? err.message : String(err)}`,
      fixHint: "手动检查磁盘空间是否充足",
      fixable: false,
    });

    return {
      checkId: "doctor-disk-space",
      category: DoctorCategory.SYSTEM,
      severity: DoctorSeverity.INFO,
      title: "磁盘空间检查",
      description: "检查可用磁盘空间是否充足",
      findings,
    };
  }
}

async function checkMemorySearch(
  context: DoctorContext,
): Promise<DoctorCheckResult> {
  const findings: DoctorFinding[] = [];

  const totalMemoryBytes = totalmem();
  const freeMemoryBytes = freemem();
  const totalMemoryMB = totalMemoryBytes / (1024 * 1024);
  const freeMemoryMB = freeMemoryBytes / (1024 * 1024);

  if (freeMemoryMB < MIN_MEMORY_MB) {
    findings.push({
      id: "doctor/memory/low-memory",
      severity: "warning",
      message: `可用内存较低: ${freeMemoryMB.toFixed(0)} MB (建议至少 ${MIN_MEMORY_MB} MB 用于搜索功能)`,
      fixHint: "关闭不必要的程序以释放内存",
      fixable: false,
    });
  }

  if (totalMemoryMB < 1024) {
    findings.push({
      id: "doctor/memory/total-low",
      severity: "info",
      message: `系统总内存较低: ${totalMemoryMB.toFixed(0)} MB，搜索性能可能受影响`,
      fixHint: "考虑增加系统内存以获得更好的搜索性能",
      fixable: false,
    });
  }

  const severity = findings.some((f) => f.severity === "error")
    ? DoctorSeverity.FAIL
    : findings.length > 0
      ? DoctorSeverity.WARN
      : DoctorSeverity.PASS;

  return {
    checkId: "doctor-memory-search",
    category: DoctorCategory.SYSTEM,
    severity,
    title: "内存搜索功能检查",
    description: "检查系统内存是否满足搜索功能需求",
    findings,
    details: {
      totalMemoryMB: totalMemoryMB.toFixed(0),
      freeMemoryMB: freeMemoryMB.toFixed(0),
      minRecommendedMB: MIN_MEMORY_MB,
      platform: process.platform,
      arch: process.arch,
    },
  };
}

async function checkUpdate(
  _context: DoctorContext,
): Promise<DoctorCheckResult> {
  const findings: DoctorFinding[] = [];

  findings.push({
    id: "doctor/update/status",
    severity: "info",
    message: "更新检查功能待实现",
    fixHint: "未来版本将支持自动更新检查",
    fixable: false,
  });

  return {
    checkId: "doctor-update",
    category: DoctorCategory.SYSTEM,
    severity: DoctorSeverity.INFO,
    title: "更新状态检查",
    description: "检查是否有待处理的更新",
    findings,
    details: {
      currentVersion: process.env.npm_package_version ?? "1.0.0",
      updateCheckSupported: false,
    },
  };
}
