/**
 * Skills CLI 格式化输出
 * 参考 openclaw/src/cli/skills-cli.format.ts 架构
 */

export interface SkillsListOptions {
  json?: boolean;
  eligible?: boolean;
  verbose?: boolean;
}

export interface SkillInfoOptions {
  json?: boolean;
}

export interface SkillsCheckOptions {
  json?: boolean;
}

export interface SkillStatusEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  source: "builtin" | "local" | "remote";
  installedAt: string;
  eligible?: boolean;
  missingRequirements?: string[];
  error?: string;
}

export interface SkillStatusReport {
  skills: SkillStatusEntry[];
  total: number;
  enabled: number;
  eligible: number;
  disabled: number;
}

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function formatSkillsList(
  report: SkillStatusReport,
  options: SkillsListOptions = {},
): string {
  if (options.json) {
    return formatJson(report);
  }

  const skills = options.eligible
    ? report.skills.filter((s) => s.eligible)
    : report.skills;

  const lines: string[] = [];
  lines.push("");
  lines.push(
    `${ANSI.bold}技能列表${ANSI.reset} ${ANSI.dim}(共 ${skills.length} 个 / 总计 ${report.total})${ANSI.reset}`,
  );
  lines.push("");

  if (skills.length === 0) {
    lines.push(`${ANSI.dim}  没有找到匹配的技能${ANSI.reset}`);
    lines.push("");
    return lines.join("\n");
  }

  for (const skill of skills) {
    const statusIcon = skill.enabled ? `${ANSI.green}✓${ANSI.reset}` : `${ANSI.yellow}⏸${ANSI.reset}`;
    const statusText = skill.enabled ? "启用" : "禁用";
    const eligibleBadge = skill.eligible
      ? `${ANSI.green}就绪${ANSI.reset}`
      : `${ANSI.red}未就绪${ANSI.reset}`;

    lines.push(
      `  ${statusIcon} ${skill.id.padEnd(20)} ${ANSI.cyan}v${skill.version}${ANSI.reset}  ${ANSI.dim}[${skill.source}]${ANSI.reset}  ${eligibleBadge}`,
    );
    lines.push(`     ${ANSI.dim}${skill.description}${ANSI.reset}`);

    if (options.verbose && skill.missingRequirements && skill.missingRequirements.length > 0) {
      lines.push(`     ${ANSI.red}缺失依赖:${ANSI.reset} ${skill.missingRequirements.join(", ")}`);
    }
    if (options.verbose && skill.error) {
      lines.push(`     ${ANSI.red}错误:${ANSI.reset} ${skill.error}`);
    }
  }

  lines.push("");
  lines.push(
    `${ANSI.dim}  启用: ${report.enabled}  禁用: ${report.disabled}  就绪: ${report.eligible}${ANSI.reset}`,
  );
  lines.push("");

  return lines.join("\n");
}

export function formatSkillInfo(
  report: SkillStatusReport,
  name: string,
  options: SkillInfoOptions = {},
): string {
  const skill = report.skills.find((s) => s.id === name || s.name === name);

  if (options.json) {
    return formatJson(skill ?? { id: name, error: "not found" });
  }

  if (!skill) {
    return `${ANSI.red}错误${ANSI.reset}: 找不到技能 "${name}"\n`;
  }

  const lines: string[] = [];
  lines.push("");
  lines.push(`${ANSI.bold}技能详情${ANSI.reset}`);
  lines.push("");
  lines.push(`  ${ANSI.cyan}${skill.name}${ANSI.reset} ${ANSI.dim}v${skill.version}${ANSI.reset}`);
  lines.push("");
  lines.push(`  ${ANSI.bold}ID:${ANSI.reset}          ${skill.id}`);
  lines.push(`  ${ANSI.bold}描述:${ANSI.reset}        ${skill.description}`);
  lines.push(`  ${ANSI.bold}版本:${ANSI.reset}        ${skill.version}`);
  lines.push(`  ${ANSI.bold}来源:${ANSI.reset}        ${skill.source}`);
  lines.push(
    `  ${ANSI.bold}状态:${ANSI.reset}        ${skill.enabled ? `${ANSI.green}启用${ANSI.reset}` : `${ANSI.yellow}禁用${ANSI.reset}`}`,
  );
  lines.push(
    `  ${ANSI.bold}就绪:${ANSI.reset}        ${skill.eligible ? `${ANSI.green}是${ANSI.reset}` : `${ANSI.red}否${ANSI.reset}`}`,
  );
  lines.push(
    `  ${ANSI.bold}安装时间:${ANSI.reset}    ${new Date(skill.installedAt).toLocaleString("zh-CN")}`,
  );

  if (skill.missingRequirements && skill.missingRequirements.length > 0) {
    lines.push("");
    lines.push(`  ${ANSI.red}缺失依赖:${ANSI.reset}`);
    for (const req of skill.missingRequirements) {
      lines.push(`    - ${req}`);
    }
  }

  if (skill.error) {
    lines.push("");
    lines.push(`  ${ANSI.red}错误:${ANSI.reset} ${skill.error}`);
  }

  lines.push("");
  return lines.join("\n");
}

export function formatSkillsCheck(
  report: SkillStatusReport,
  options: SkillsCheckOptions = {},
): string {
  if (options.json) {
    return formatJson({
      total: report.total,
      enabled: report.enabled,
      disabled: report.disabled,
      eligible: report.eligible,
      notEligible: report.total - report.eligible,
      skills: report.skills.map((s) => ({
        id: s.id,
        eligible: s.eligible,
        enabled: s.enabled,
        missingRequirements: s.missingRequirements ?? [],
      })),
    });
  }

  const notEligible = report.skills.filter((s) => !s.eligible);
  const lines: string[] = [];

  lines.push("");
  lines.push(`${ANSI.bold}技能状态检查${ANSI.reset}`);
  lines.push("");
  lines.push(`  总计:     ${report.total}`);
  lines.push(`  启用:     ${ANSI.green}${report.enabled}${ANSI.reset}`);
  lines.push(`  禁用:     ${ANSI.yellow}${report.disabled}${ANSI.reset}`);
  lines.push(`  就绪:     ${ANSI.green}${report.eligible}${ANSI.reset}`);
  lines.push(`  未就绪:   ${ANSI.red}${report.total - report.eligible}${ANSI.reset}`);
  lines.push("");

  if (notEligible.length > 0) {
    lines.push(`${ANSI.red}未就绪的技能:${ANSI.reset}`);
    lines.push("");
    for (const skill of notEligible) {
      const reasons = skill.missingRequirements?.length
        ? ` - 缺失: ${skill.missingRequirements.join(", ")}`
        : skill.error
          ? ` - ${skill.error}`
          : "";
      lines.push(`  ${ANSI.red}✗${ANSI.reset} ${skill.id}${reasons}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
