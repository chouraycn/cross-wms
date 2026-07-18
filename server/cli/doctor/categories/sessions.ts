/**
 * 会话类检查
 * 包含会话状态、会话锁、网关健康等检查
 */

import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import type {
  DoctorCheck,
  DoctorCheckResult,
  DoctorContext,
  DoctorFinding,
} from "../types.js";
import { DoctorSeverity, DoctorCategory } from "../types.js";

export const sessionChecks: DoctorCheck[] = [
  {
    id: "doctor-session-state",
    category: DoctorCategory.SESSIONS,
    title: "会话状态检查",
    description: "检查会话目录和会话文件状态",
    run: checkSessionState,
  },
  {
    id: "doctor-session-locks",
    category: DoctorCategory.SESSIONS,
    title: "会话锁检查",
    description: "检查会话锁文件和死锁情况",
    run: checkSessionLocks,
  },
  {
    id: "doctor-gateway-health",
    category: DoctorCategory.GATEWAY,
    title: "网关健康检查",
    description: "检查网关服务状态和健康度",
    run: checkGatewayHealth,
  },
];

async function checkSessionState(
  context: DoctorContext,
): Promise<DoctorCheckResult> {
  const findings: DoctorFinding[] = [];
  const sessionsDir = join(context.workspaceDir, "sessions");

  if (!existsSync(sessionsDir)) {
    findings.push({
      id: "doctor/sessions/dir-missing",
      severity: "info",
      message: "会话目录不存在",
      target: sessionsDir,
      fixHint: "会话目录将在创建第一个会话时自动创建",
      fixable: true,
    });

    return {
      checkId: "doctor-session-state",
      category: DoctorCategory.SESSIONS,
      severity: DoctorSeverity.INFO,
      title: "会话状态检查",
      description: "检查会话目录和会话文件状态",
      findings,
      details: { sessionsDir },
    };
  }

  try {
    const entries = readdirSync(sessionsDir, { withFileTypes: true });
    const sessionFiles = entries.filter(
      (e) => e.isFile() && (e.name.endsWith(".json") || e.name.endsWith(".sqlite")),
    );
    const sessionDirs = entries.filter((e) => e.isDirectory());

    findings.push({
      id: "doctor/sessions/count",
      severity: "info",
      message: `发现 ${sessionFiles.length} 个会话文件和 ${sessionDirs.length} 个会话目录`,
      target: sessionsDir,
      fixable: false,
    });

    let activeSessions = 0;
    let corruptedSessions = 0;

    for (const file of sessionFiles) {
      const filePath = join(sessionsDir, file.name);
      try {
        const stats = statSync(filePath);
        if (stats.size === 0) {
          corruptedSessions++;
          findings.push({
            id: `doctor/sessions/empty-${file.name}`,
            severity: "warning",
            message: `会话文件 ${file.name} 为空`,
            target: filePath,
            fixHint: "检查会话文件是否损坏",
            fixable: false,
          });
        }

        const ageDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > 30) {
          findings.push({
            id: `doctor/sessions/old-${file.name}`,
            severity: "info",
            message: `会话 ${file.name} 已超过 30 天未访问`,
            target: filePath,
            fixHint: "考虑清理旧会话以释放空间",
            fixable: false,
          });
        } else {
          activeSessions++;
        }
      } catch {
        corruptedSessions++;
      }
    }

    if (corruptedSessions > 0) {
      findings.push({
        id: "doctor/sessions/corrupted",
        severity: "warning",
        message: `发现 ${corruptedSessions} 个可能损坏的会话`,
        target: sessionsDir,
        fixHint: "建议检查或清理损坏的会话文件",
        fixable: false,
      });
    }

    const severity = findings.some((f) => f.severity === "error")
      ? DoctorSeverity.FAIL
      : findings.some((f) => f.severity === "warning")
        ? DoctorSeverity.WARN
        : DoctorSeverity.PASS;

    return {
      checkId: "doctor-session-state",
      category: DoctorCategory.SESSIONS,
      severity,
      title: "会话状态检查",
      description: "检查会话目录和会话文件状态",
      findings,
      details: {
        sessionsDir,
        totalSessions: sessionFiles.length + sessionDirs.length,
        activeSessions,
        corruptedSessions,
        sessionFiles: sessionFiles.length,
        sessionDirs: sessionDirs.length,
      },
    };
  } catch (err) {
    findings.push({
      id: "doctor/sessions/read-error",
      severity: "error",
      message: `无法读取会话目录: ${err instanceof Error ? err.message : String(err)}`,
      target: sessionsDir,
      fixHint: "检查目录权限和路径正确性",
      fixable: false,
    });

    return {
      checkId: "doctor-session-state",
      category: DoctorCategory.SESSIONS,
      severity: DoctorSeverity.FAIL,
      title: "会话状态检查",
      description: "检查会话目录和会话文件状态",
      findings,
      details: { sessionsDir },
    };
  }
}

async function checkSessionLocks(
  context: DoctorContext,
): Promise<DoctorCheckResult> {
  const findings: DoctorFinding[] = [];
  const sessionsDir = join(context.workspaceDir, "sessions");
  const locksDir = join(sessionsDir, "locks");

  if (!existsSync(sessionsDir)) {
    findings.push({
      id: "doctor/sessions/locks-no-dir",
      severity: "info",
      message: "会话目录不存在，跳过锁检查",
      fixable: false,
    });

    return {
      checkId: "doctor-session-locks",
      category: DoctorCategory.SESSIONS,
      severity: DoctorSeverity.INFO,
      title: "会话锁检查",
      description: "检查会话锁文件和死锁情况",
      findings,
      details: { sessionsDir },
    };
  }

  try {
    let lockFiles: string[] = [];

    if (existsSync(locksDir)) {
      const entries = readdirSync(locksDir);
      lockFiles = entries.filter((f) => f.endsWith(".lock"));
    }

    const sessionEntries = readdirSync(sessionsDir);
    const inlineLocks = sessionEntries.filter((f) => f.endsWith(".lock"));
    lockFiles.push(...inlineLocks);

    if (lockFiles.length === 0) {
      findings.push({
        id: "doctor/sessions/no-locks",
        severity: "info",
        message: "没有发现会话锁文件",
        fixable: false,
      });
    } else {
      findings.push({
        id: "doctor/sessions/lock-count",
        severity: "info",
        message: `发现 ${lockFiles.length} 个会话锁文件`,
        fixable: false,
      });

      const MAX_LOCK_AGE_MS = 30 * 60 * 1000;
      let staleLocks = 0;

      for (const lockFile of lockFiles) {
        try {
          const lockPath = existsSync(locksDir)
            ? join(locksDir, lockFile)
            : join(sessionsDir, lockFile);
          const stats = statSync(lockPath);
          const ageMs = Date.now() - stats.mtime.getTime();

          if (ageMs > MAX_LOCK_AGE_MS) {
            staleLocks++;
            const ageMin = Math.round(ageMs / 60000);
            findings.push({
              id: `doctor/sessions/stale-lock-${lockFile}`,
              severity: "warning",
              message: `锁文件 ${lockFile} 可能已过期 (${ageMin} 分钟)`,
              target: lockPath,
              fixHint: "如果会话已结束，可手动删除锁文件",
              fixable: true,
            });
          }
        } catch {
          // 跳过无法访问的锁文件
        }
      }

      if (staleLocks > 0) {
        findings.push({
          id: "doctor/sessions/stale-locks",
          severity: "warning",
          message: `发现 ${staleLocks} 个可能过期的锁文件`,
          fixHint: "使用 --fix 可尝试清理过期锁文件",
          fixable: true,
        });
      }
    }

    const severity = findings.some((f) => f.severity === "error")
      ? DoctorSeverity.FAIL
      : findings.some((f) => f.severity === "warning")
        ? DoctorSeverity.WARN
        : DoctorSeverity.PASS;

    return {
      checkId: "doctor-session-locks",
      category: DoctorCategory.SESSIONS,
      severity,
      title: "会话锁检查",
      description: "检查会话锁文件和死锁情况",
      findings,
      details: {
        sessionsDir,
        locksDir,
        totalLocks: lockFiles.length,
        hasLocksDir: existsSync(locksDir),
      },
    };
  } catch (err) {
    findings.push({
      id: "doctor/sessions/locks-check-error",
      severity: "warning",
      message: `会话锁检查失败: ${err instanceof Error ? err.message : String(err)}`,
      fixHint: "检查会话目录权限",
      fixable: false,
    });

    return {
      checkId: "doctor-session-locks",
      category: DoctorCategory.SESSIONS,
      severity: DoctorSeverity.WARN,
      title: "会话锁检查",
      description: "检查会话锁文件和死锁情况",
      findings,
      details: { sessionsDir },
    };
  }
}

async function checkGatewayHealth(
  _context: DoctorContext,
): Promise<DoctorCheckResult> {
  const findings: DoctorFinding[] = [];

  findings.push({
    id: "doctor/gateway/status",
    severity: "info",
    message: "网关健康检查功能待实现",
    fixHint: "未来版本将支持网关实时健康检查",
    fixable: false,
  });

  return {
    checkId: "doctor-gateway-health",
    category: DoctorCategory.GATEWAY,
    severity: DoctorSeverity.INFO,
    title: "网关健康检查",
    description: "检查网关服务状态和健康度",
    findings,
    details: {
      gatewayStatus: "unknown",
      healthCheckSupported: false,
    },
  };
}
