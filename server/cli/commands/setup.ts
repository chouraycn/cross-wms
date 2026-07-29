/**
 * setup 命令
 * 引导安装 (init/configure/verify)
 *
 * 参考 openclaw setup-cli，提供首次安装与配置引导。
 * 使用模拟实现，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type SetupOptions = {
  json?: boolean;
  nonInteractive?: boolean;
};

interface SetupStep {
  name: string;
  label: string;
  status: "pending" | "done" | "skipped";
}

function getSetupSteps(): SetupStep[] {
  return [
    { name: "check-env", label: "检查环境依赖 (Node.js, 数据库)", status: "done" },
    { name: "create-dirs", label: "创建数据目录", status: "done" },
    { name: "init-config", label: "初始化配置文件", status: "pending" },
    { name: "init-database", label: "初始化数据库 schema", status: "pending" },
    { name: "register-agents", label: "注册默认代理", status: "pending" },
    { name: "start-gateway", label: "启动网关", status: "pending" },
  ];
}

function runSetup(nonInteractive: boolean): { steps: SetupStep[]; completed: number; skipped: number } {
  const steps = getSetupSteps();
  let completed = 0;
  let skipped = 0;
  for (const step of steps) {
    if (step.status === "done") {
      completed++;
      continue;
    }
    if (nonInteractive) {
      step.status = "done";
      completed++;
    }
  }
  return { steps, completed, skipped };
}

function verifySetup(): { ok: boolean; checks: { name: string; ok: boolean; message: string }[] } {
  const checks = [
    { name: "config", ok: true, message: "配置文件存在" },
    { name: "database", ok: true, message: "数据库连接正常" },
    { name: "agents", ok: false, message: "未注册任何代理" },
    { name: "gateway", ok: true, message: "网关端口可用" },
  ];
  return { ok: checks.every((c) => c.ok), checks };
}

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function registerSetupCommand(program: Command): void {
  const setupCmd = program
    .command("setup")
    .description("引导安装 (init/verify)");

  setupCmd
    .command("init")
    .description("执行首次安装引导")
    .option("--non-interactive", "非交互模式（自动确认）")
    .option("--json", "JSON 输出格式")
    .action((options: SetupOptions) => {
      const result = runSetup(Boolean(options.nonInteractive));
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info("安装步骤:");
        for (const step of result.steps) {
          const icon = step.status === "done" ? "✓" : step.status === "skipped" ? "·" : "○";
          logger.info(`  ${icon} ${step.name}: ${step.label}`);
        }
        logger.info(`\n已完成 ${result.completed}/${result.steps.length} 步`);
      }
    });

  setupCmd
    .command("verify")
    .description("验证安装状态")
    .option("--json", "JSON 输出格式")
    .action((options: SetupOptions) => {
      const result = verifySetup();
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(result.ok ? "✓ 安装验证通过" : "✗ 安装验证未通过");
        for (const check of result.checks) {
          logger.info(`  ${check.ok ? "✓" : "✗"} ${check.name}: ${check.message}`);
        }
      }
    });

  // 默认 init
  setupCmd
    .option("--non-interactive", "非交互模式")
    .option("--json", "JSON 输出格式")
    .action((options: SetupOptions) => {
      const result = runSetup(Boolean(options.nonInteractive));
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info("安装步骤:");
        for (const step of result.steps) {
          const icon = step.status === "done" ? "✓" : "○";
          logger.info(`  ${icon} ${step.name}: ${step.label}`);
        }
      }
    });
}
