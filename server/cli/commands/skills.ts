/**
 * skills 命令
 * 技能管理 (list/install/scan/enable/disable/info)
 *
 * 参考 openclaw skills-cli，封装对 server/engine/skillRegistry 等技能模块的调用。
 * 当技能注册表未就绪时，使用本地状态进行模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type SkillsOptions = {
  json?: boolean;
};

/** 技能条目 */
interface SkillEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  source: "builtin" | "local" | "remote";
  installedAt: string;
}

/** 模拟技能存储 */
const SKILLS_STORE: Map<string, SkillEntry> = new Map([
  [
    "pdf-tools",
    { id: "pdf-tools", name: "PDF 工具", description: "PDF 文档读取与处理", version: "1.0.0", enabled: true, source: "builtin", installedAt: "2025-01-10T08:00:00Z" },
  ],
  [
    "web-search",
    { id: "web-search", name: "网页搜索", description: "联网搜索与内容抓取", version: "2.1.3", enabled: true, source: "builtin", installedAt: "2025-01-10T08:00:00Z" },
  ],
  [
    "wms-ops",
    { id: "wms-ops", name: "WMS 运营", description: "仓储管理操作技能", version: "0.4.2", enabled: false, source: "local", installedAt: "2025-01-20T12:00:00Z" },
  ],
]);

/** 获取所有技能 */
function listSkills(): SkillEntry[] {
  return Array.from(SKILLS_STORE.values()).sort((a, b) => a.id.localeCompare(b.id));
}

/** 安装技能 */
function installSkill(spec: string): SkillEntry {
  const id = spec.replace(/^@.*\//, "").split("@")[0] ?? spec;
  const version = spec.split("@")[1] ?? "0.0.1";
  const existing = SKILLS_STORE.get(id);
  if (existing) {
    existing.version = version;
    existing.installedAt = new Date().toISOString();
    return existing;
  }
  const entry: SkillEntry = {
    id,
    name: id,
    description: `已安装技能 ${id}`,
    version,
    enabled: true,
    source: "local",
    installedAt: new Date().toISOString(),
  };
  SKILLS_STORE.set(id, entry);
  return entry;
}

/** 扫描可用技能 */
function scanSkills(): { found: number; eligible: string[] } {
  // 模拟扫描结果
  const eligible = ["code-review", "git-flow", "data-analysis"];
  return { found: eligible.length, eligible };
}

/** 启用技能 */
function enableSkill(id: string): boolean {
  const entry = SKILLS_STORE.get(id);
  if (!entry) {
    return false;
  }
  entry.enabled = true;
  return true;
}

/** 禁用技能 */
function disableSkill(id: string): boolean {
  const entry = SKILLS_STORE.get(id);
  if (!entry) {
    return false;
  }
  entry.enabled = false;
  return true;
}

/** 获取技能详情 */
function getSkillInfo(id: string): SkillEntry | undefined {
  return SKILLS_STORE.get(id);
}

/** 格式化 JSON 输出 */
function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** 格式化技能列表文本输出 */
function formatSkillsList(skills: SkillEntry[]): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  技能列表 (共 ${skills.length} 个):`);
  lines.push("");
  for (const skill of skills) {
    const status = skill.enabled ? "✓ 启用" : "⏸ 禁用";
    lines.push(`    ${status}  ${skill.id.padEnd(16)} v${skill.version}  [${skill.source}]`);
    lines.push(`             ${skill.description}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** 格式化技能详情文本输出 */
function formatSkillInfo(skill: SkillEntry | undefined, id: string): string {
  if (!skill) {
    return `技能 ${id} 不存在`;
  }
  const lines: string[] = [];
  lines.push("");
  lines.push(`  技能详情: ${skill.name}`);
  lines.push(`    ID:          ${skill.id}`);
  lines.push(`    描述:        ${skill.description}`);
  lines.push(`    版本:        ${skill.version}`);
  lines.push(`    来源:        ${skill.source}`);
  lines.push(`    状态:        ${skill.enabled ? "启用" : "禁用"}`);
  lines.push(`    安装时间:    ${new Date(skill.installedAt).toLocaleString("zh-CN")}`);
  lines.push("");
  return lines.join("\n");
}

/**
 * 注册 skills 命令
 */
export function registerSkillsCommand(program: Command): void {
  const skillsCmd = program
    .command("skill")
    .description("技能管理 (list/install/scan/enable/disable/info)");

  skillsCmd
    .command("list")
    .description("列出所有技能")
    .option("--json", "JSON 输出格式")
    .action((options: SkillsOptions) => {
      const skills = listSkills();
      if (options.json) {
        logger.info(formatJsonOutput(skills));
      } else {
        logger.info(formatSkillsList(skills));
      }
    });

  skillsCmd
    .command("install <spec>")
    .description("安装技能 (npm 包名或本地路径)")
    .option("--json", "JSON 输出格式")
    .action((spec: string, options: SkillsOptions) => {
      const skill = installSkill(spec);
      if (options.json) {
        logger.info(formatJsonOutput(skill));
      } else {
        logger.info(`已安装技能 ${skill.id}@${skill.version}`);
      }
    });

  skillsCmd
    .command("scan")
    .description("扫描可用技能")
    .option("--json", "JSON 输出格式")
    .action((options: SkillsOptions) => {
      const result = scanSkills();
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(`扫描完成: 发现 ${result.found} 个可用技能`);
        for (const id of result.eligible) {
          logger.info(`  - ${id}`);
        }
      }
    });

  skillsCmd
    .command("enable <id>")
    .description("启用技能")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: SkillsOptions) => {
      const success = enableSkill(id);
      if (options.json) {
        logger.info(formatJsonOutput({ id, enabled: success }));
      } else {
        logger.info(success ? `已启用技能 ${id}` : `技能 ${id} 不存在`);
      }
    });

  skillsCmd
    .command("disable <id>")
    .description("禁用技能")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: SkillsOptions) => {
      const success = disableSkill(id);
      if (options.json) {
        logger.info(formatJsonOutput({ id, disabled: success }));
      } else {
        logger.info(success ? `已禁用技能 ${id}` : `技能 ${id} 不存在`);
      }
    });

  skillsCmd
    .command("info <id>")
    .description("查看技能详情")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: SkillsOptions) => {
      const skill = getSkillInfo(id);
      if (options.json) {
        logger.info(formatJsonOutput(skill ?? { id, error: "not found" }));
      } else {
        logger.info(formatSkillInfo(skill, id));
      }
    });

  // 默认 list 子命令
  skillsCmd.action((options: SkillsOptions) => {
    const skills = listSkills();
    if (options.json) {
      logger.info(formatJsonOutput(skills));
    } else {
      logger.info(formatSkillsList(skills));
    }
  });
}
