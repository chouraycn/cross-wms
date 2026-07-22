/**
 * 技能系统 CLI 增强命令
 *
 * 新增命令：
 * - skills check    — 检查所有技能依赖状态
 * - skills doctor   — 诊断技能系统问题
 * - skills gate     — 显示技能门控条件
 */

import type { Command } from "commander";
import chalk from "chalk";
import {
  getSkillGatingManager,
  type SkillRequires,
} from "../../engine/skills/discovery/skill-gating.js";
import {
  getSkillPriorityResolver,
  getPriorityName,
} from "../../engine/skills/discovery/skill-priority.js";
import {
  getAgentAllowlistManager,
} from "../../engine/skills/discovery/agent-allowlist.js";
import {
  getInstallPolicyManager,
} from "../../engine/skills/security/install-policy.js";
import {
  getSkillOriginTracker,
} from "../../engine/skills/lifecycle/skill-origin.js";
import {
  getSignatureVerifier,
} from "../../engine/skills/security/signature-verifier.js";
import {
  getPluginSkillsManager,
} from "../../engine/skills/lifecycle/plugin-skills.js";
import {
  getRemoteNodeProber,
} from "../../engine/skills/runtime/remote-prober.js";
import { getUserSkills } from "../../engine/skills/index.js";

// ============================================================================
// skills check 命令
// ============================================================================

/** 检查所有技能依赖状态 */
export async function checkSkills(): Promise<void> {
  console.log(chalk.bold("\n🔍 Checking skill dependencies...\n"));

  const skills = getUserSkills();
  const gatingManager = getSkillGatingManager();
  const results: Array<{
    skill: string;
    passed: boolean;
    missingBins: string[];
    missingEnv: string[];
    guidance: string[];
  }> = [];

  for (const skill of skills) {
    const requires: SkillRequires = {
      bins: (skill as unknown as { requires?: { bins?: string[] } }).requires?.bins,
      env: (skill as unknown as { requires?: { env?: string[] } }).requires?.env,
    };

    const result = await gatingManager.checkGating(requires);

    results.push({
      skill: String(skill.name),
      passed: result.passed,
      missingBins: result.missingBins,
      missingEnv: result.missingEnv,
      guidance: result.installGuidance,
    });
  }

  // 显示结果表格
  const header = chalk.cyan("Skill".padEnd(20) + "Status".padEnd(10) + "Missing Bins".padEnd(30) + "Missing Env");
  console.log(header);
  console.log("-".repeat(80));

  for (const r of results) {
    const status = r.passed ? chalk.green("✓ OK") : chalk.red("✗ FAIL");
    const bins = r.missingBins.length > 0 ? r.missingBins.join(", ") : "-";
    const env = r.missingEnv.length > 0 ? r.missingEnv.join(", ") : "-";
    console.log(`${r.skill.padEnd(20)}${status.padEnd(10)}${bins.padEnd(30)}${env}`);
  }

  // 显示安装指引
  const failedSkills = results.filter((r) => !r.passed);
  if (failedSkills.length > 0) {
    console.log(chalk.yellow("\n📦 Installation Guidance:\n"));
    for (const skill of failedSkills) {
      console.log(chalk.bold(skill.skill + ":"));
      for (const g of skill.guidance) {
        console.log("  " + g);
      }
      console.log();
    }
  }

  const passed = results.filter((r) => r.passed).length;
  console.log(chalk.bold(`\n${passed}/${results.length} skills passed\n`));
}

// ============================================================================
// skills doctor 命令
// ============================================================================

/** 诊断技能系统问题 */
export async function diagnoseSkills(): Promise<void> {
  console.log(chalk.bold("\n🩺 Diagnosing skill system...\n"));

  const checks: Array<{ name: string; status: string; details: string }> = [];

  // 1. 检查技能优先级配置
  try {
    const resolver = getSkillPriorityResolver();
    const roots = resolver.getSkillRoots();
    checks.push({
      name: "Priority Resolver",
      status: chalk.green("✓ OK"),
      details: `${roots.length} skill roots configured`,
    });
  } catch (err) {
    checks.push({
      name: "Priority Resolver",
      status: chalk.red("✗ ERROR"),
      details: String(err),
    });
  }

  // 2. 检查 Agent 白名单
  try {
    const manager = getAgentAllowlistManager();
    const agents = manager.getAgents();
    checks.push({
      name: "Agent Allowlist",
      status: chalk.green("✓ OK"),
      details: `${agents.length} agents configured`,
    });
  } catch (err) {
    checks.push({
      name: "Agent Allowlist",
      status: chalk.red("✗ ERROR"),
      details: String(err),
    });
  }

  // 3. 检查安装策略
  try {
    const manager = getInstallPolicyManager();
    const config = manager.getConfig();
    checks.push({
      name: "Install Policy",
      status: chalk.green("✓ OK"),
      details: config.installPolicy?.command
        ? `Policy command: ${config.installPolicy.command}`
        : "No policy command configured",
    });
  } catch (err) {
    checks.push({
      name: "Install Policy",
      status: chalk.red("✗ ERROR"),
      details: String(err),
    });
  }

  // 4. 检查来源追踪
  try {
    const tracker = getSkillOriginTracker();
    void tracker.listTrackedSkills().then((tracked) => {
      checks.push({
        name: "Origin Tracker",
        status: chalk.green("✓ OK"),
        details: `${tracked.length} skills tracked`,
      });
    });
  } catch (err) {
    checks.push({
      name: "Origin Tracker",
      status: chalk.red("✗ ERROR"),
      details: String(err),
    });
  }

  // 5. 检查签名验证
  try {
    const verifier = getSignatureVerifier();
    const keys = verifier.listTrustedKeys();
    checks.push({
      name: "Signature Verifier",
      status: chalk.green("✓ OK"),
      details: `${keys.length} trusted keys`,
    });
  } catch (err) {
    checks.push({
      name: "Signature Verifier",
      status: chalk.red("✗ ERROR"),
      details: String(err),
    });
  }

  // 6. 检查插件技能
  try {
    const manager = getPluginSkillsManager();
    const plugins = manager.getLoadedPlugins();
    checks.push({
      name: "Plugin Skills",
      status: chalk.green("✓ OK"),
      details: `${plugins.length} plugins loaded`,
    });
  } catch (err) {
    checks.push({
      name: "Plugin Skills",
      status: chalk.red("✗ ERROR"),
      details: String(err),
    });
  }

  // 7. 检查远程节点
  try {
    const prober = getRemoteNodeProber();
    const nodes = prober.getAllNodes();
    checks.push({
      name: "Remote Nodes",
      status: chalk.green("✓ OK"),
      details: `${nodes.length} nodes configured`,
    });
  } catch (err) {
    checks.push({
      name: "Remote Nodes",
      status: chalk.red("✗ ERROR"),
      details: String(err),
    });
  }

  // 显示诊断结果
  const header = chalk.cyan("Component".padEnd(25) + "Status".padEnd(15) + "Details");
  console.log(header);
  console.log("-".repeat(80));

  for (const check of checks) {
    console.log(`${check.name.padEnd(25)}${check.status.padEnd(15)}${check.details}`);
  }

  const errors = checks.filter((c) => c.status.includes("ERROR"));
  if (errors.length > 0) {
    console.log(chalk.red(`\n❌ ${errors.length} errors found\n`));
  } else {
    console.log(chalk.green("\n✅ All components healthy\n"));
  }
}

// ============================================================================
// skills gate 命令
// ============================================================================

/** 显示技能门控条件 */
export async function showSkillGate(skillName: string): Promise<void> {
  console.log(chalk.bold(`\n🚪 Skill gate for: ${skillName}\n`));

  const skills = getUserSkills();
  const skill = skills.find((s) => s.name === skillName);

  if (!skill) {
    console.log(chalk.red(`Skill "${skillName}" not found\n`));
    return;
  }

  const requires: SkillRequires = {
    bins: (skill as unknown as { requires?: { bins?: string[] } }).requires?.bins,
    anyBins: (skill as unknown as { requires?: { anyBins?: string[] } }).requires?.anyBins,
    env: (skill as unknown as { requires?: { env?: string[] } }).requires?.env,
    config: (skill as unknown as { requires?: { config?: string[] } }).requires?.config,
  };

  const gatingManager = getSkillGatingManager();
  const result = await gatingManager.checkGating(requires);

  // 显示门控条件
  console.log(chalk.bold("Requirements:"));

  if (requires.bins?.length) {
    const status = result.missingBins.length === 0 ? chalk.green("✓") : chalk.red("✗");
    console.log(`  ${status} bins: ${requires.bins.join(", ")}`);
    if (result.missingBins.length > 0) {
      console.log(`    ${chalk.red("Missing:")} ${result.missingBins.join(", ")}`);
    }
  }

  if (requires.anyBins?.length) {
    const status = result.satisfiedAnyBins.length > 0 ? chalk.green("✓") : chalk.red("✗");
    console.log(`  ${status} anyBins: ${requires.anyBins.join(", ")}`);
    if (result.satisfiedAnyBins.length > 0) {
      console.log(`    ${chalk.green("Satisfied:")} ${result.satisfiedAnyBins.join(", ")}`);
    }
  }

  if (requires.env?.length) {
    const status = result.missingEnv.length === 0 ? chalk.green("✓") : chalk.red("✗");
    console.log(`  ${status} env: ${requires.env.join(", ")}`);
    if (result.missingEnv.length > 0) {
      console.log(`    ${chalk.red("Missing:")} ${result.missingEnv.join(", ")}`);
    }
  }

  if (requires.config?.length) {
    const status = result.missingConfig.length === 0 ? chalk.green("✓") : chalk.red("✗");
    console.log(`  ${status} config: ${requires.config.join(", ")}`);
    if (result.missingConfig.length > 0) {
      console.log(`    ${chalk.red("Missing:")} ${result.missingConfig.join(", ")}`);
    }
  }

  // 显示安装指引
  if (result.installGuidance.length > 0) {
    console.log(chalk.bold("\n📦 Installation Guidance:"));
    for (const g of result.installGuidance) {
      console.log(`  ${g}`);
    }
  }

  console.log(
    result.passed
      ? chalk.green("\n✅ Skill gate passed\n")
      : chalk.red("\n❌ Skill gate failed\n")
  );
}

// ============================================================================
// 注册 CLI 命令
// ============================================================================

/** 注册技能检查命令 */
export function registerSkillCheckCommands(program: Command): void {
  const skills = program.command("skills");

  // skills check
  skills
    .command("check")
    .description("Check all skill dependencies status")
    .action(async () => {
      await checkSkills();
    });

  // skills doctor
  skills
    .command("doctor")
    .description("Diagnose skill system issues")
    .action(async () => {
      await diagnoseSkills();
    });

  // skills gate
  skills
    .command("gate <skill-name>")
    .description("Show skill gating conditions")
    .action(async (skillName: string) => {
      await showSkillGate(skillName);
    });
}
