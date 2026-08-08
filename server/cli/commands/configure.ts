/**
 * configure 命令
 * 配置向导 (wizard/set/get/list)
 *
 * 参考 openclaw configure-cli，提供交互式配置向导。
 * 使用模拟实现，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type ConfigureOptions = {
  json?: boolean;
  nonInteractive?: boolean;
};

interface ConfigSection {
  key: string;
  label: string;
  description: string;
  currentValue: string;
  options?: string[];
}

function getConfigSections(): ConfigSection[] {
  return [
    { key: "gateway.port", label: "网关端口", description: "HTTP 服务监听端口", currentValue: "7331" },
    { key: "gateway.authMode", label: "认证模式", description: "网关认证方式", currentValue: "none", options: ["none", "token", "password"] },
    { key: "log.level", label: "日志级别", description: "全局日志级别", currentValue: "info", options: ["debug", "info", "warn", "error"] },
    { key: "model.default", label: "默认模型", description: "默认使用的 AI 模型", currentValue: "gpt-4" },
    { key: "memory.enabled", label: "记忆功能", description: "是否启用记忆引擎", currentValue: "true", options: ["true", "false"] },
  ];
}

const CONFIG_VALUES: Map<string, string> = new Map(
  getConfigSections().map((s) => [s.key, s.currentValue]),
);

function setValue(key: string, value: string): boolean {
  CONFIG_VALUES.set(key, value);
  return true;
}

function getValue(key: string): string | undefined {
  return CONFIG_VALUES.get(key);
}

function runWizard(nonInteractive: boolean): { applied: number; sections: ConfigSection[] } {
  const sections = getConfigSections();
  let applied = 0;
  if (nonInteractive) {
    for (const section of sections) {
      CONFIG_VALUES.set(section.key, section.currentValue);
      applied++;
    }
  }
  return { applied, sections };
}

function formatJsonOutput(data: any): string {
  return JSON.stringify(data, null, 2);
}

export function registerConfigureCommand(program: Command): void {
  const configureCmd = program
    .command("configure")
    .description("配置向导 (wizard/set/get/list)");

  configureCmd
    .command("wizard")
    .description("启动交互式配置向导")
    .option("--non-interactive", "非交互模式")
    .option("--json", "JSON 输出格式")
    .action((options: ConfigureOptions) => {
      const result = runWizard(Boolean(options.nonInteractive));
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info("配置向导:");
        for (const section of result.sections) {
          logger.info(`  ${section.label} (${section.key})`);
          logger.info(`    当前: ${section.currentValue}`);
          if (section.options) {
            logger.info(`    可选: ${section.options.join(", ")}`);
          }
        }
        if (options.nonInteractive) {
          logger.info(`\n已应用 ${result.applied} 项配置`);
        }
      }
    });

  configureCmd
    .command("set <key> <value>")
    .description("设置配置项")
    .option("--json", "JSON 输出格式")
    .action((key: string, value: string, options: ConfigureOptions) => {
      setValue(key, value);
      if (options.json) {
        logger.info(formatJsonOutput({ key, value, applied: true }));
      } else {
        logger.info(`已设置: ${key} = ${value}`);
      }
    });

  configureCmd
    .command("get <key>")
    .description("获取配置项")
    .option("--json", "JSON 输出格式")
    .action((key: string, options: ConfigureOptions) => {
      const value = getValue(key);
      if (value === undefined) {
        logger.error(`未找到配置项: ${key}`);
        return;
      }
      if (options.json) {
        logger.info(formatJsonOutput({ key, value }));
      } else {
        logger.info(`${key} = ${value}`);
      }
    });

  configureCmd
    .command("list")
    .description("列出所有配置项")
    .option("--json", "JSON 输出格式")
    .action((options: ConfigureOptions) => {
      const sections = getConfigSections();
      if (options.json) {
        logger.info(formatJsonOutput(sections));
      } else {
        logger.info("配置项:");
        for (const s of sections) {
          logger.info(`  ${s.key} = ${s.currentValue}  (${s.label})`);
        }
      }
    });

  // 默认 wizard
  configureCmd
    .option("--non-interactive", "非交互模式")
    .option("--json", "JSON 输出格式")
    .action((options: ConfigureOptions) => {
      const result = runWizard(Boolean(options.nonInteractive));
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info("配置项:");
        for (const s of result.sections) {
          logger.info(`  ${s.key} = ${s.currentValue}`);
        }
      }
    });
}
