/**
 * Doctor 输出格式化模块
 * 负责终端输出、颜色、图标、表格和 JSON 格式化
 */

import type {
  DoctorReport,
  DoctorCheckResult,
  DoctorFinding,
  DoctorFormatOptions,
  DoctorSeverity,
  DoctorCategory,
} from "./types.js";
import { DoctorSeverity as Severity } from "./types.js";

const SEVERITY_ICONS: Record<DoctorSeverity, string> = {
  [Severity.PASS]: "✓",
  [Severity.WARN]: "!",
  [Severity.FAIL]: "✗",
  [Severity.INFO]: "i",
};

const FINDING_SEVERITY_ICONS: Record<string, string> = {
  error: "✗",
  warning: "!",
  info: "i",
};

const FINDING_SEVERITY_LABELS: Record<string, string> = {
  error: "错误",
  warning: "警告",
  info: "信息",
};

const CATEGORY_LABELS: Record<DoctorCategory, string> = {
  config: "配置",
  workspace: "工作空间",
  security: "安全",
  plugins: "插件",
  sessions: "会话",
  system: "系统",
  gateway: "网关",
};

export function formatJsonOutput(report: DoctorReport): string {
  return JSON.stringify(report, null, 2);
}

export function formatTextOutput(
  report: DoctorReport,
  options: DoctorFormatOptions = {},
): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(`  CDFKnow 诊断报告`);
  lines.push(`  开始时间: ${report.startedAt}`);
  lines.push(`  结束时间: ${report.finishedAt}`);
  lines.push("");

  const resultsByCategory = groupResultsByCategory(report.results);

  for (const category of Object.keys(resultsByCategory) as DoctorCategory[]) {
    if (options.category && options.category !== category) {
      continue;
    }

    const categoryResults = resultsByCategory[category];
    if (!categoryResults || categoryResults.length === 0) {
      continue;
    }

    lines.push(`  [${CATEGORY_LABELS[category]}]`);
    lines.push("");

    for (const result of categoryResults) {
      const icon = SEVERITY_ICONS[result.severity];
      const severityText = getSeverityLabel(result.severity);
      lines.push(`    ${icon} [${severityText}] ${result.title}`);

      if (options.verbose) {
        lines.push(`        描述: ${result.description}`);
      }

      for (const finding of result.findings) {
        const findingIcon = FINDING_SEVERITY_ICONS[finding.severity] ?? "?";
        const findingLabel = FINDING_SEVERITY_LABELS[finding.severity] ?? finding.severity;
        lines.push(`      ${findingIcon} [${findingLabel}] ${finding.message}`);

        if (finding.target && options.verbose) {
          lines.push(`          目标: ${finding.target}`);
        }
        if (finding.fixHint) {
          lines.push(`          修复: ${finding.fixHint}`);
          if (finding.fixable) {
            lines.push(`          可自动修复: 是`);
          }
        }
      }
    }

    lines.push("");
  }

  lines.push("  摘要:");
  lines.push(`    检查项: ${report.checksRun} 项`);
  lines.push(`    通过: ${report.passCount} 项`);
  lines.push(`    警告: ${report.warnCount} 项`);
  lines.push(`    失败: ${report.failCount} 项`);
  lines.push(`    信息: ${report.infoCount} 项`);
  lines.push(`    总计发现: ${report.totalFindings} 项`);
  lines.push("");

  if (report.failCount > 0) {
    lines.push("  ✗ 存在失败项，请修复上述问题后重新运行 doctor 命令");
  } else if (report.warnCount > 0) {
    lines.push("  ! 部分项目存在警告，建议检查");
  } else {
    lines.push("  ✓ 所有检查通过!");
  }

  lines.push("");
  return lines.join("\n");
}

export function formatVerboseOutput(
  report: DoctorReport,
  options: DoctorFormatOptions = {},
): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(`  CDFKnow 详细诊断报告`);
  lines.push(`  PID: ${process.pid}  Node: ${process.version}  Platform: ${process.platform}`);
  lines.push(`  开始时间: ${report.startedAt}`);
  lines.push(`  结束时间: ${report.finishedAt}`);
  lines.push("");

  const resultsByCategory = groupResultsByCategory(report.results);

  for (const category of Object.keys(resultsByCategory) as DoctorCategory[]) {
    if (options.category && options.category !== category) {
      continue;
    }

    const categoryResults = resultsByCategory[category];
    if (!categoryResults || categoryResults.length === 0) {
      continue;
    }

    lines.push(`  ━━━ ${CATEGORY_LABELS[category]} ━━━`);
    lines.push("");

    for (const result of categoryResults) {
      const icon = SEVERITY_ICONS[result.severity];
      const severityText = getSeverityLabel(result.severity);
      lines.push(`    ${icon} [${severityText}] ${result.checkId}`);
      lines.push(`        标题: ${result.title}`);
      lines.push(`        描述: ${result.description}`);
      lines.push(`        严重程度: ${severityText}`);

      if (result.details && Object.keys(result.details).length > 0) {
        lines.push(`        详情:`);
        for (const [key, value] of Object.entries(result.details)) {
          lines.push(`          ${key}: ${String(value)}`);
        }
      }

      if (result.findings.length > 0) {
        lines.push(`        发现 (${result.findings.length}):`);
        for (const finding of result.findings) {
          const findingIcon = FINDING_SEVERITY_ICONS[finding.severity] ?? "?";
          const findingLabel = FINDING_SEVERITY_LABELS[finding.severity] ?? finding.severity;
          lines.push(`          ${findingIcon} [${findingLabel}] ${finding.id}`);
          lines.push(`              消息: ${finding.message}`);
          if (finding.target) {
            lines.push(`              目标: ${finding.target}`);
          }
          if (finding.fixHint) {
            lines.push(`              修复: ${finding.fixHint}`);
          }
          if (finding.fixable) {
            lines.push(`              可自动修复: 是`);
          }
        }
      }

      lines.push("");
    }
  }

  lines.push("  ━━━ 摘要 ━━━");
  lines.push(`    检查项: ${report.checksRun} 项`);
  lines.push(`    通过: ${report.passCount} 项`);
  lines.push(`    警告: ${report.warnCount} 项`);
  lines.push(`    失败: ${report.failCount} 项`);
  lines.push(`    信息: ${report.infoCount} 项`);
  lines.push(`    总计发现: ${report.totalFindings} 项`);
  lines.push(`    涉及类别: ${report.categories.length} 个`);
  lines.push("");

  if (report.ok) {
    lines.push("  ✓ 所有检查通过!");
  } else {
    lines.push("  ✗ 存在需要关注的问题");
  }

  lines.push("");
  return lines.join("\n");
}

export function formatFindingTable(findings: readonly DoctorFinding[]): string {
  if (findings.length === 0) {
    return "  暂无发现";
  }

  const lines: string[] = [];
  lines.push("");

  const maxIdLen = Math.max(
    10,
    ...findings.map((f) => f.id.length),
  );
  const maxMsgLen = Math.min(
    60,
    Math.max(20, ...findings.map((f) => f.message.length)),
  );

  const header =
    `  | 状态 | ${padRight("ID", maxIdLen)} | ${padRight("消息", maxMsgLen)} |`;
  const separator =
    `  +------+${"-".repeat(maxIdLen + 2)}+${"-".repeat(maxMsgLen + 2)}+`;

  lines.push(separator);
  lines.push(header);
  lines.push(separator);

  for (const finding of findings) {
    const icon = FINDING_SEVERITY_ICONS[finding.severity] ?? "?";
    const id = padRight(truncate(finding.id, maxIdLen), maxIdLen);
    const msg = padRight(truncate(finding.message, maxMsgLen), maxMsgLen);
    lines.push(`  |  ${icon}   | ${id} | ${msg} |`);
  }

  lines.push(separator);
  lines.push("");

  return lines.join("\n");
}

function groupResultsByCategory(
  results: readonly DoctorCheckResult[],
): Partial<Record<DoctorCategory, DoctorCheckResult[]>> {
  const grouped: Partial<Record<DoctorCategory, DoctorCheckResult[]>> = {};

  for (const result of results) {
    if (!grouped[result.category]) {
      grouped[result.category] = [];
    }
    grouped[result.category]!.push(result);
  }

  return grouped;
}

function getSeverityLabel(severity: DoctorSeverity): string {
  const labels: Record<DoctorSeverity, string> = {
    [Severity.PASS]: "通过",
    [Severity.WARN]: "警告",
    [Severity.FAIL]: "失败",
    [Severity.INFO]: "信息",
  };
  return labels[severity];
}

function padRight(str: string, len: number): string {
  if (str.length >= len) {
    return str;
  }
  return str + " ".repeat(len - str.length);
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) {
    return str;
  }
  if (maxLen <= 3) {
    return ".".repeat(maxLen);
  }
  return str.slice(0, maxLen - 3) + "...";
}
