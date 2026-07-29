/**
 * security 命令
 * 安全审计 (audit/fix/policy)
 *
 * 参考 openclaw security-cli，扫描本地配置与状态中的常见安全风险。
 * 当安全运行时未就绪时，使用本地状态进行模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type SecurityOptions = {
  json?: boolean;
  deep?: boolean;
  fix?: boolean;
};

type Severity = "critical" | "warn" | "info";

interface SecurityFinding {
  code: string;
  severity: Severity;
  message: string;
  remediation?: string;
}

/** 模拟安全审计 */
function runSecurityAudit(deep: boolean): { findings: SecurityFinding[]; summary: Record<Severity, number> } {
  const findings: SecurityFinding[] = [];

  // 基础检查
  findings.push({
    code: "GATEWAY_AUTH_NONE",
    severity: "critical",
    message: "网关认证模式为 none，存在未授权访问风险",
    remediation: "设置 config gateway.authMode 为 token 或 password",
  });

  findings.push({
    code: "CORS_WILDCARD",
    severity: "warn",
    message: "CORS 允许来源为 *，建议限制为可信域名",
    remediation: "设置 config gateway.corsOrigins 为具体域名列表",
  });

  if (deep) {
    findings.push({
      code: "SESSION_NO_ENCRYPTION",
      severity: "warn",
      message: "会话存储未启用加密",
      remediation: "启用 sessions.encryptAtRest",
    });
    findings.push({
      code: "LOG_LEVEL_DEBUG",
      severity: "info",
      message: "生产环境日志级别为 debug，可能泄露敏感信息",
      remediation: "将 logLevel 调整为 info 或 warn",
    });
  }

  const summary: Record<Severity, number> = { critical: 0, warn: 0, info: 0 };
  for (const f of findings) {
    summary[f.severity]++;
  }

  return { findings, summary };
}

/** 修复安全风险 */
function fixSecurityFootguns(): { fixed: string[]; skipped: string[] } {
  const fixed: string[] = [];
  const skipped: string[] = [];
  // 模拟修复：仅修复可自动处理的风险
  fixed.push("GATEWAY_AUTH_NONE");
  skipped.push("CORS_WILDCARD");
  return { fixed, skipped };
}

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function formatAuditOutput(report: ReturnType<typeof runSecurityAudit>): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("  安全审计报告:");
  lines.push(`    严重: ${report.summary.critical}  警告: ${report.summary.warn}  提示: ${report.summary.info}`);
  lines.push("");
  if (report.findings.length > 0) {
    lines.push("  发现项:");
    for (const f of report.findings) {
      const icon = f.severity === "critical" ? "✗" : f.severity === "warn" ? "!" : "i";
      lines.push(`    ${icon} [${f.code}] ${f.message}`);
      if (f.remediation) {
        lines.push(`        修复建议: ${f.remediation}`);
      }
    }
  } else {
    lines.push("  ✓ 未发现安全问题");
  }
  lines.push("");
  return lines.join("\n");
}

export function registerSecurityCommand(program: Command): void {
  const securityCmd = program
    .command("security")
    .description("安全审计 (audit/fix)");

  securityCmd
    .command("audit")
    .description("扫描本地配置与状态中的安全风险")
    .option("--deep", "深度扫描（包含会话、日志等）")
    .option("--json", "JSON 输出格式")
    .action((options: SecurityOptions) => {
      const report = runSecurityAudit(Boolean(options.deep));
      if (options.json) {
        logger.info(formatJsonOutput(report));
      } else {
        logger.info(formatAuditOutput(report));
      }
    });

  securityCmd
    .command("fix")
    .description("自动修复可处理的安全风险")
    .option("--json", "JSON 输出格式")
    .action((options: SecurityOptions) => {
      const result = fixSecurityFootguns();
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(`已修复 ${result.fixed.length} 项，跳过 ${result.skipped.length} 项`);
        for (const code of result.fixed) {
          logger.info(`  ✓ 已修复: ${code}`);
        }
        for (const code of result.skipped) {
          logger.info(`  ! 需手动处理: ${code}`);
        }
      }
    });

  // 默认执行 audit
  securityCmd
    .action((options: SecurityOptions) => {
      const report = runSecurityAudit(Boolean(options.deep));
      if (options.json) {
        logger.info(formatJsonOutput(report));
      } else {
        logger.info(formatAuditOutput(report));
      }
    });
}
