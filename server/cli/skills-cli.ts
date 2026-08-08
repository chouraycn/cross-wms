/**
 * Skills CLI 命令注册
 * 参考 openclaw/src/cli/skills-cli.ts 架构
 *
 * 使用 dynamic import 方式加载实际实现，避免循环依赖。
 */

import type { Command } from "commander";
import path from "node:path";
import os from "node:os";
import {
  formatSkillInfo,
  formatSkillsCheck,
  formatSkillsList,
  type SkillStatusReport,
  type SkillInfoOptions,
  type SkillsCheckOptions,
  type SkillsListOptions,
} from "./skills-cli.format.js";

function parseStrictPositiveIntOption(value: string, flagName: string): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0 || !Number.isFinite(parsed)) {
    throw new Error(`${flagName} must be a positive integer, got: ${value}`);
  }
  return parsed;
}

function resolveWorkspaceDir(opts?: { global?: boolean; agent?: string }): string {
  if (opts?.global) {
    const env = process.env.CDF_DATA_DIR;
    const base = env
      ? path.dirname(env)
      : process.platform === "darwin"
        ? path.join(os.homedir(), "Library", "Application Support", "CDFKnow")
        : path.join(os.homedir(), ".cdf-know");
    return path.join(base, "skills");
  }
  return path.join(process.cwd(), "skills");
}

async function loadSkillStatusReport(options?: {
  agentId?: string;
}): Promise<SkillStatusReport> {
  try {
    const mod = await import("./commands/skills.js");
    const provider = new mod.RealSkillProvider();
    const skills = await provider.list();
    const enabled = skills.filter((s: any) => s.enabled).length;
    const eligible = skills.filter((s: any) => s.eligible ?? s.enabled).length;
    return {
      skills,
      total: skills.length,
      enabled,
      eligible,
      disabled: skills.length - enabled,
    };
  } catch {
    return {
      skills: [],
      total: 0,
      enabled: 0,
      eligible: 0,
      disabled: 0,
    };
  }
}

async function runSkillsAction(
  render: (report: SkillStatusReport) => string,
  options?: { agentId?: string },
): Promise<void> {
  try {
    const report = await loadSkillStatusReport(options);
    process.stdout.write(render(report));
  } catch (err) {
    console.error(String(err));
    process.exit(1);
  }
}

function resolveAgentOption(
  command: Command | undefined,
  opts?: { agent?: string },
): string | undefined {
  if (opts?.agent) return opts.agent;
  if (command) {
    const parent = command.parent;
    if (parent) {
      const agent = (parent as any).opts()?.agent;
      if (agent) return agent;
    }
  }
  return undefined;
}

export function registerSkillsCli(program: Command): void {
  const skills = program
    .command("skills")
    .description("列出和检查可用技能")
    .option("--agent <id>", "目标代理工作区（默认从 cwd 推断，然后回退到默认代理）");

  skills
    .command("search")
    .description("搜索技能（调用 clawhub search）")
    .argument("[query...]", "可选的搜索查询")
    .option("--limit <n>", "结果数量限制", (value) =>
      parseStrictPositiveIntOption(value, "--limit"),
    )
    .option("--json", "JSON 输出", false)
    .action(
      async (
        queryParts: string[],
        opts: { limit?: number; json?: boolean },
        command: Command,
      ) => {
        try {
          const query = queryParts.join(" ");
          const { searchClawHubSkills } = await import(
            "../engine/skills/lifecycle/clawhub.js"
          );
          const results = searchClawHubSkills(
            query || undefined,
            opts.limit,
          );
          if (opts.json) {
            process.stdout.write(JSON.stringify({ results }, null, 2) + "\n");
            return;
          }
          if (results.length === 0) {
            console.log("未找到相关技能。");
            return;
          }
          for (const entry of results) {
            const version = entry.version ? ` v${entry.version}` : "";
            const summary = entry.summary ? `  ${entry.summary}` : "";
            console.log(`${entry.slug}${version}  ${entry.displayName}${summary}`);
          }
        } catch (err) {
          console.error(String(err));
          process.exit(1);
        }
      },
    );

  skills
    .command("install")
    .description("安装技能")
    .argument("<skill-ref>", "技能引用（ClawHub、git 或本地目录）")
    .option("--version <version>", "指定版本")
    .option("--force", "覆盖已存在技能", false)
    .option("--global", "全局安装", false)
    .option("--agent <id>", "指定代理工作区")
    .option("--as <slug>", "git/local 安装时指定 slug")
    .action(
      async (
        skillRef: string,
        opts: {
          version?: string;
          force?: boolean;
          global?: boolean;
          agent?: string;
          as?: string;
        },
        command: Command,
      ) => {
        try {
          const agentId = resolveAgentOption(command, opts);
          const mod = await import("./commands/skills.js");
          const provider = new mod.RealSkillProvider();
          const result = await provider.install(skillRef);
          if (result.error) {
            console.error(`安装失败: ${result.error}`);
            process.exit(1);
            return;
          }
          console.log(`已安装技能 ${result.id}@${result.version}`);
        } catch (err) {
          console.error(String(err));
          process.exit(1);
        }
      },
    );

  skills
    .command("update")
    .description("更新技能")
    .argument("[skill-ref]", "单个技能引用")
    .option("--all", "更新所有", false)
    .option("--global", "全局目录", false)
    .option("--agent <id>", "指定代理工作区")
    .action(
      async (
        skillRef: string | undefined,
        opts: { all?: boolean; global?: boolean; agent?: string },
        command: Command,
      ) => {
        try {
          if (!skillRef && !opts.all) {
            console.error("请提供技能 slug 或使用 --all。");
            process.exit(1);
            return;
          }
          if (skillRef && opts.all) {
            console.error("请使用技能 slug 或 --all，不能同时使用。");
            process.exit(1);
            return;
          }
          const workspaceDir = resolveWorkspaceDir(opts);
          const { updateSkillsFromClawHub } = await import(
            "../engine/skills/lifecycle/clawhub.js"
          );
          const results = await updateSkillsFromClawHub(
            workspaceDir,
            skillRef,
          );
          let failed = false;
          for (const result of results as any[]) {
            if (!result.ok) {
              failed = true;
              console.error(result.error);
              continue;
            }
            if (result.changed) {
              console.log(
                `已更新 ${result.slug}: ${result.previousVersion ?? "unknown"} -> ${result.version}`,
              );
              continue;
            }
            console.log(`${result.slug} 已是最新版本 ${result.version}`);
          }
          if (failed) {
            process.exit(1);
          }
        } catch (err) {
          console.error(String(err));
          process.exit(1);
        }
      },
    );

  skills
    .command("verify")
    .description("验证技能")
    .argument("<skill-ref>", "技能引用")
    .option("--version <version>", "指定版本")
    .option("--card", "输出技能卡片", false)
    .option("--json", "JSON 输出", false)
    .option("--agent <id>", "指定代理工作区")
    .action(
      async (
        skillRef: string,
        opts: { version?: string; card?: boolean; json?: boolean; agent?: string },
        command: Command,
      ) => {
        try {
          const { fetchClawHubSkillVerification } = await import(
            "../engine/skills/lifecycle/clawhub.js"
          );
          const result = fetchClawHubSkillVerification(
            skillRef,
            opts.version,
          );
          if (opts.card) {
            const card = (result as any).card;
            if (card) {
              process.stdout.write(JSON.stringify(card, null, 2) + "\n");
            } else {
              console.error("技能卡片不可用。");
              process.exit(1);
            }
          } else {
            process.stdout.write(JSON.stringify(result, null, 2) + "\n");
          }
        } catch (err) {
          console.error(String(err));
          process.exit(1);
        }
      },
    );

  skills
    .command("list")
    .description("列出所有技能")
    .option("--json", "JSON 输出", false)
    .option("--eligible", "仅显示就绪的", false)
    .option("-v, --verbose", "详细信息", false)
    .option("--agent <id>", "指定代理工作区")
    .action(
      async (
        opts: SkillsListOptions & { agent?: string },
        command: Command,
      ) => {
        await runSkillsAction(
          (report) => formatSkillsList(report, opts),
          { agentId: resolveAgentOption(command, opts) },
        );
      },
    );

  skills
    .command("info")
    .description("查看技能详情")
    .argument("<name>", "技能名称")
    .option("--json", "JSON 输出", false)
    .option("--agent <id>", "指定代理工作区")
    .action(
      async (
        name: string,
        opts: SkillInfoOptions & { agent?: string },
        command: Command,
      ) => {
        await runSkillsAction(
          (report) => formatSkillInfo(report, name, opts),
          { agentId: resolveAgentOption(command, opts) },
        );
      },
    );

  skills
    .command("check")
    .description("检查技能状态")
    .option("--agent <id>", "指定代理工作区")
    .option("--json", "JSON 输出", false)
    .action(
      async (
        opts: SkillsCheckOptions & { agent?: string },
        command: Command,
      ) => {
        await runSkillsAction(
          (report) => formatSkillsCheck(report, opts),
          { agentId: resolveAgentOption(command, opts) },
        );
      },
    );

  const workshop = skills
    .command("workshop")
    .description("管理待处理的技能提案")
    .option("--agent <id>", "指定代理工作区");

  workshop
    .command("list")
    .description("列出提案")
    .option("--json", "JSON 输出", false)
    .action(async (opts: { json?: boolean; agent?: string }) => {
      try {
        const workspaceDir = resolveWorkspaceDir(opts);
        const { listSkillProposals } = await import(
          "../engine/skills/workshop/service.js"
        );
        const manifest = await listSkillProposals(workspaceDir);
        if (opts.json) {
          process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
          return;
        }
        const proposals = (manifest as any).proposals || [];
        if (proposals.length === 0) {
          console.log("没有技能提案。");
          return;
        }
        for (const entry of proposals) {
          console.log(`${entry.id}  ${entry.status}  ${entry.kind}  ${entry.skillName}  ${entry.title}`);
        }
      } catch (err) {
        console.error(String(err));
        process.exit(1);
      }
    });

  workshop
    .command("inspect")
    .description("查看提案")
    .argument("<id>", "提案 ID")
    .option("--json", "JSON 输出", false)
    .action(async (proposalId: string, opts: { json?: boolean; agent?: string }) => {
      try {
        const workspaceDir = resolveWorkspaceDir(opts);
        const { readSkillProposal } = await import(
          "../engine/skills/workshop/service.js"
        );
        const proposal = await readSkillProposal(workspaceDir, proposalId);
        if (!proposal) {
          console.error(`未找到技能提案: ${proposalId}`);
          process.exit(1);
          return;
        }
        if (opts.json) {
          process.stdout.write(JSON.stringify(proposal, null, 2) + "\n");
          return;
        }
        const record = (proposal as any).record;
        console.log(`ID: ${record.id}`);
        console.log(`状态: ${record.status}`);
        console.log(`类型: ${record.kind}`);
        console.log(`技能: ${record.target?.skillName}`);
        console.log(`目标: ${record.target?.skillFile}`);
        console.log("");
        console.log((proposal as any).content);
      } catch (err) {
        console.error(String(err));
        process.exit(1);
      }
    });

  workshop
    .command("propose-create")
    .description("创建提案")
    .requiredOption("--name <name>", "技能名称")
    .requiredOption("--description <description>", "技能描述")
    .option("--json", "JSON 输出", false)
    .action(
      async (
        opts: { name: string; description: string; json?: boolean; agent?: string },
        command: Command,
      ) => {
        try {
          const workspaceDir = resolveWorkspaceDir(opts);
          const { createSkillProposal } = await import(
            "../engine/skills/workshop/service.js"
          );
          const result = await createSkillProposal({
            workspaceDir,
            name: opts.name,
            description: opts.description,
            content: `# ${opts.name}\n\n${opts.description}\n`,
            createdBy: "cli",
          });
          if (!result.success) {
            console.error(`创建失败: ${result.error}`);
            process.exit(1);
            return;
          }
          if (opts.json) {
            process.stdout.write(JSON.stringify({ id: result.proposalId }, null, 2) + "\n");
            return;
          }
          console.log(result.proposalId);
        } catch (err) {
          console.error(String(err));
          process.exit(1);
        }
      },
    );

  workshop
    .command("propose-update")
    .description("更新提案")
    .argument("<skill>", "技能名称或键")
    .option("--description <text>", "提案描述")
    .option("--json", "JSON 输出", false)
    .action(
      async (
        skill: string,
        opts: { description?: string; json?: boolean; agent?: string },
        command: Command,
      ) => {
        try {
          const workspaceDir = resolveWorkspaceDir(opts);
          const { updateSkillProposal } = await import(
            "../engine/skills/workshop/service.js"
          );
          const result = await updateSkillProposal({
            workspaceDir,
            skillName: skill,
            description: opts.description,
            content: `# Update ${skill}\n\n${opts.description || "Skill update proposal"}\n`,
            createdBy: "cli",
          });
          if (!result.success) {
            console.error(`创建失败: ${result.error}`);
            process.exit(1);
            return;
          }
          if (opts.json) {
            process.stdout.write(JSON.stringify({ id: result.proposalId }, null, 2) + "\n");
            return;
          }
          console.log(result.proposalId);
        } catch (err) {
          console.error(String(err));
          process.exit(1);
        }
      },
    );

  workshop
    .command("revise")
    .description("修改提案")
    .argument("<id>", "提案 ID")
    .option("--description <description>", "替换提案描述")
    .option("--json", "JSON 输出", false)
    .action(
      async (
        proposalId: string,
        opts: { description?: string; json?: boolean; agent?: string },
        command: Command,
      ) => {
        try {
          const workspaceDir = resolveWorkspaceDir(opts);
          const { reviseSkillProposal } = await import(
            "../engine/skills/workshop/service.js"
          );
          const result = await reviseSkillProposal({
            workspaceDir,
            proposalId,
            content: `# Revised proposal\n\n${opts.description || "Revised proposal content"}\n`,
            description: opts.description,
          });
          if (opts.json) {
            process.stdout.write(JSON.stringify(result, null, 2) + "\n");
            return;
          }
          const record = (result as any).record;
          console.log(`已修改 ${record.id} ${record.proposedVersion}`);
        } catch (err) {
          console.error(String(err));
          process.exit(1);
        }
      },
    );

  workshop
    .command("apply")
    .description("应用提案")
    .argument("<id>", "提案 ID")
    .option("--json", "JSON 输出", false)
    .action(
      async (
        proposalId: string,
        opts: { json?: boolean; agent?: string },
        command: Command,
      ) => {
        try {
          const workspaceDir = resolveWorkspaceDir(opts);
          const { applySkillProposal } = await import(
            "../engine/skills/workshop/service.js"
          );
          const applied = await applySkillProposal({
            workspaceDir,
            proposalId,
          });
          if (opts.json) {
            process.stdout.write(JSON.stringify(applied, null, 2) + "\n");
            return;
          }
          console.log(
            `已应用 ${(applied as any).record.id} -> ${(applied as any).targetSkillFile}`,
          );
        } catch (err) {
          console.error(String(err));
          process.exit(1);
        }
      },
    );

  workshop
    .command("reject")
    .description("拒绝提案")
    .argument("<id>", "提案 ID")
    .option("--reason <text>", "拒绝原因")
    .option("--json", "JSON 输出", false)
    .action(
      async (
        proposalId: string,
        opts: { reason?: string; json?: boolean; agent?: string },
        command: Command,
      ) => {
        try {
          const workspaceDir = resolveWorkspaceDir(opts);
          const { rejectSkillProposal } = await import(
            "../engine/skills/workshop/service.js"
          );
          const record = await rejectSkillProposal({
            workspaceDir,
            proposalId,
            reason: opts.reason,
          });
          if (opts.json) {
            process.stdout.write(JSON.stringify(record, null, 2) + "\n");
            return;
          }
          console.log(`已拒绝 ${(record as any).id}`);
        } catch (err) {
          console.error(String(err));
          process.exit(1);
        }
      },
    );

  workshop
    .command("quarantine")
    .description("隔离提案")
    .argument("<id>", "提案 ID")
    .option("--reason <text>", "隔离原因")
    .option("--json", "JSON 输出", false)
    .action(
      async (
        proposalId: string,
        opts: { reason?: string; json?: boolean; agent?: string },
        command: Command,
      ) => {
        try {
          const workspaceDir = resolveWorkspaceDir(opts);
          const { updateProposalStatus } = await import(
            "../engine/skills/workshop/store.js"
          );
          const record = await updateProposalStatus(
            workspaceDir,
            proposalId,
            "quarantined",
            opts.reason,
          );
          if (opts.json) {
            process.stdout.write(JSON.stringify(record, null, 2) + "\n");
            return;
          }
          console.log(`已隔离 ${(record as any).id}`);
        } catch (err) {
          console.error(String(err));
          process.exit(1);
        }
      },
    );

  skills.action(async (opts: { agent?: string }, command: Command) => {
    await runSkillsAction(
      (report) => formatSkillsList(report, {}),
      { agentId: resolveAgentOption(command, opts) },
    );
  });
}
