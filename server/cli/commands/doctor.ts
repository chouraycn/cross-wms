import type { Command } from "commander";
import { logger } from "../../logger.js";
import {
  runDoctorChecks as runAcpDoctorChecks,
  initDoctorChannelRegistry,
} from "../../engine/acp/doctor.js";
import type {
  DoctorReport as AcpDoctorReport,
  DoctorCheckScope,
  HealthFinding,
} from "../../engine/acp/doctor.js";
import { DEFAULT_PERMISSION_PROFILE } from "../../engine/acp/policy.js";

import {
  runDoctorChecks,
  createDefaultDoctorContext,
  getAllDoctorChecks,
} from "../doctor/runner.js";
import type {
  DoctorReport,
  DoctorCategory,
  DoctorCheckId,
} from "../doctor/types.js";
import { DoctorCategory as Category } from "../doctor/types.js";
import {
  formatJsonOutput,
  formatTextOutput,
  formatVerboseOutput,
} from "../doctor/format.js";

export type DoctorOptions = {
  fix?: boolean;
  json?: boolean;
  verbose?: boolean;
  only?: string;
  skip?: string;
  exitCode?: string;
  category?: string;
  system?: boolean;
  all?: boolean;
};

function formatAcpJsonOutput(report: AcpDoctorReport): string {
  return JSON.stringify(report, null, 2);
}

function formatAcpTextOutput(report: AcpDoctorReport): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  CDFKnow ACP 诊断报告`);
  lines.push("");

  if (report.findings.length === 0) {
    lines.push("  ✓ 所有检查通过!");
    lines.push("");
    return lines.join("\n");
  }

  lines.push("  发现:");
  lines.push("");

  const errors = report.findings.filter((f) => f.severity === "error");
  const warnings = report.findings.filter((f) => f.severity === "warning");
  const infos = report.findings.filter((f) => f.severity === "info");

  for (const finding of errors) {
    lines.push(`    ✗ [错误] ${finding.message}`);
    if (finding.fixHint) {
      lines.push(`        ${finding.fixHint}`);
    }
  }

  for (const finding of warnings) {
    lines.push(`    ! [警告] ${finding.message}`);
    if (finding.fixHint) {
      lines.push(`        ${finding.fixHint}`);
    }
  }

  for (const finding of infos) {
    lines.push(`    i [信息] ${finding.message}`);
    if (finding.fixHint) {
      lines.push(`        ${finding.fixHint}`);
    }
  }

  lines.push("");
  lines.push("  摘要:");
  lines.push(`    检查范围: ${report.scopesChecked} 项`);
  lines.push(`    总计发现: ${report.totalFindings} 项`);
  lines.push(`    错误: ${errors.length} 项`);
  lines.push(`    警告: ${warnings.length} 项`);
  lines.push(`    信息: ${infos.length} 项`);
  lines.push("");

  if (errors.length > 0) {
    lines.push("  请修复上述错误项后重新运行 doctor 命令");
  } else if (warnings.length > 0) {
    lines.push("  部分项目存在警告，建议检查");
  }

  lines.push("");
  return lines.join("\n");
}

function formatAcpVerboseOutput(report: AcpDoctorReport): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  CDFKnow ACP 详细诊断报告`);
  lines.push(`  PID: ${process.pid}  Node: ${process.version}  Platform: ${process.platform}`);
  lines.push("");

  if (report.findings.length === 0) {
    lines.push("  ✓ 所有检查通过!");
    lines.push("");
    return lines.join("\n");
  }

  lines.push("  发现详情:");
  lines.push("");

  for (const finding of report.findings) {
    const severityIcon = finding.severity === "error" ? "✗" : finding.severity === "warning" ? "!" : "i";
    const severityText = finding.severity === "error" ? "错误" : finding.severity === "warning" ? "警告" : "信息";
    lines.push(`    ${severityIcon} [${severityText}] ${finding.id}`);
    lines.push(`        消息:  ${finding.message}`);
    if (finding.target) {
      lines.push(`        目标:  ${finding.target}`);
    }
    if (finding.fixHint) {
      lines.push(`        修复:  ${finding.fixHint}`);
    }
  }

  lines.push("");
  lines.push("  摘要:");
  lines.push(`    检查范围: ${report.scopesChecked} 项`);
  lines.push(`    总计发现: ${report.totalFindings} 项`);
  const errors = report.findings.filter((f) => f.severity === "error").length;
  const warnings = report.findings.filter((f) => f.severity === "warning").length;
  const infos = report.findings.filter((f) => f.severity === "info").length;
  lines.push(`    错误: ${errors} 项`);
  lines.push(`    警告: ${warnings} 项`);
  lines.push(`    信息: ${infos} 项`);
  lines.push("");
  return lines.join("\n");
}

function parseScopes(only?: string, skip?: string): DoctorCheckScope[] {
  const allScopes: DoctorCheckScope[] = [
    "core",
    "tools",
    "exec-approvals",
    "channels",
    "sandbox",
    "gateway",
    "model-network",
    "data-auth",
    "policy",
  ];

  let scopes = allScopes;

  if (only) {
    const onlyTypes = only.split(",").map((s) => s.trim()).filter(Boolean);
    scopes = scopes.filter((s) => onlyTypes.includes(s));
  }

  if (skip) {
    const skipTypes = skip.split(",").map((s) => s.trim()).filter(Boolean);
    scopes = scopes.filter((s) => !skipTypes.includes(s));
  }

  return scopes;
}

function parseCategory(category?: string): DoctorCategory | undefined {
  if (!category) {
    return undefined;
  }

  const categoryMap: Record<string, DoctorCategory> = {
    config: Category.CONFIG,
    workspace: Category.WORKSPACE,
    security: Category.SECURITY,
    plugins: Category.PLUGINS,
    sessions: Category.SESSIONS,
    system: Category.SYSTEM,
    gateway: Category.GATEWAY,
  };

  return categoryMap[category.toLowerCase()];
}

function parseCheckIds(only?: string, skip?: string): {
  onlyChecks?: DoctorCheckId[];
  skipChecks?: DoctorCheckId[];
} {
  const allChecks = getAllDoctorChecks().map((c) => c.id);
  const result: { onlyChecks?: DoctorCheckId[]; skipChecks?: DoctorCheckId[] } = {};

  if (only) {
    const onlyIds = only
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean) as DoctorCheckId[];
    result.onlyChecks = onlyIds.filter((id) => allChecks.includes(id));
  }

  if (skip) {
    const skipIds = skip
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean) as DoctorCheckId[];
    result.skipChecks = skipIds.filter((id) => allChecks.includes(id));
  }

  return result;
}

async function runAcpDoctor(options: DoctorOptions): Promise<AcpDoctorReport> {
  initDoctorChannelRegistry(() => ({
    listAll: () => [],
  }));

  const scopes = parseScopes(options.only, options.skip);

  const report = await runAcpDoctorChecks({
    scopes,
    rules: DEFAULT_PERMISSION_PROFILE.rules,
    toolNames: ["exec"],
    defaultLevel: "prompt",
    approvalFlowEnabled: true,
    runtimeAvailable: true,
    enabledChannels: [],
    sandbox: { enabled: false },
    gateway: { mode: "local", authToken: "test" },
    modelNetwork: { providers: ["openai"], authConfigured: true },
    dataAuth: { authProfiles: ["default"], sessionAuthEnabled: true, secretManagementEnabled: true },
  });

  return report;
}

async function runSystemDoctor(options: DoctorOptions): Promise<DoctorReport> {
  const context = createDefaultDoctorContext({
    verbose: options.verbose,
    fix: options.fix,
  });

  const category = parseCategory(options.category);
  const { onlyChecks, skipChecks } = parseCheckIds(options.only, options.skip);

  const report = await runDoctorChecks(context, {
    categories: category ? [category] : undefined,
    onlyChecks,
    skipChecks,
    fix: options.fix,
    verbose: options.verbose,
    parallel: false,
  });

  return report;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("运行 ACP 诊断检查，检测配置问题和安全漏洞")
    .option("--fix", "自动修复可修复的问题 (未完全实现)")
    .option("--json", "以 JSON 格式输出诊断报告")
    .option("-v, --verbose", "显示详细诊断信息")
    .option("--only <scopes>", "只运行指定范围的检查 (逗号分隔)")
    .option("--skip <scopes>", "跳过指定范围的检查 (逗号分隔)")
    .option("--exit-code <code>", "设置发现错误时的退出码 (默认 1)", "1")
    .option("--category <category>", "按类别过滤系统检查 (config/workspace/security/plugins/sessions/system/gateway)")
    .option("--system", "运行系统诊断检查 (额外的系统级检查)")
    .option("--all", "运行所有诊断检查 (ACP + 系统)")
    .action(async (options: DoctorOptions) => {
      const runSystem = options.system || options.all;
      const runAcp = !options.system || options.all;

      if (runAcp && runSystem) {
        const [acpReport, systemReport] = await Promise.all([
          runAcpDoctor(options),
          runSystemDoctor(options),
        ]);

        if (options.json) {
          logger.info(JSON.stringify({
            acp: acpReport,
            system: systemReport,
          }, null, 2));
        } else if (options.verbose) {
          logger.info(formatAcpVerboseOutput(acpReport));
          logger.info(formatVerboseOutput(systemReport));
        } else {
          logger.info(formatAcpTextOutput(acpReport));
          logger.info(formatTextOutput(systemReport));
        }

        const hasErrors = !acpReport.ok || !systemReport.ok;
        if (hasErrors && (options.exitCode ?? "1") !== "0") {
          process.exit(parseInt(options.exitCode ?? "1", 10) || 1);
        }
      } else if (runSystem) {
        const report = await runSystemDoctor(options);

        if (options.json) {
          logger.info(formatJsonOutput(report));
        } else if (options.verbose) {
          logger.info(formatVerboseOutput(report));
        } else {
          logger.info(formatTextOutput(report));
        }

        if (!report.ok && (options.exitCode ?? "1") !== "0") {
          process.exit(parseInt(options.exitCode ?? "1", 10) || 1);
        }
      } else {
        const report = await runAcpDoctor(options);

        if (options.json) {
          logger.info(formatAcpJsonOutput(report));
        } else if (options.verbose) {
          logger.info(formatAcpVerboseOutput(report));
        } else {
          logger.info(formatAcpTextOutput(report));
        }

        if (!report.ok && (options.exitCode ?? "1") !== "0") {
          process.exit(parseInt(options.exitCode ?? "1", 10) || 1);
        }
      }
    });
}
