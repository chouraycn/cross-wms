/**
 * config 命令
 * 配置管理 (get/set/list/validate)
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type ConfigOptions = {
  json?: boolean;
};

interface ConfigItem {
  key: string;
  value: string;
  description?: string;
}

/** 模拟配置存储 */
const CONFIG_STORE: Map<string, ConfigItem> = new Map([
  ["app.language", { key: "app.language", value: "zh-CN", description: "应用语言" }],
  ["app.theme", { key: "app.theme", value: "system", description: "应用主题" }],
  ["ai.defaultModel", { key: "ai.defaultModel", value: "qwen-plus", description: "默认模型" }],
  ["memory.enabled", { key: "memory.enabled", value: "true", description: "记忆功能开关" }],
  ["wms.defaultWarehouse", { key: "wms.defaultWarehouse", value: "wh-001", description: "默认仓库" }],
]);

/** 获取所有配置项 */
function getAllConfigs(): ConfigItem[] {
  return Array.from(CONFIG_STORE.values());
}

/** 获取指定配置 */
function getConfig(key: string): ConfigItem | undefined {
  return CONFIG_STORE.get(key);
}

/** 设置配置 */
function setConfig(key: string, value: string): boolean {
  const existing = CONFIG_STORE.get(key);
  if (existing) {
    CONFIG_STORE.set(key, { ...existing, value });
  } else {
    CONFIG_STORE.set(key, { key, value });
  }
  return true;
}

/** 验证配置值 */
function validateConfig(key: string, value: string): { valid: boolean; message: string } {
  if (key.startsWith("app.")) {
    if (key === "app.language" && !["zh-CN", "en-US"].includes(value)) {
      return { valid: false, message: "app.language 必须是 zh-CN 或 en-US" };
    }
    if (key === "app.theme" && !["light", "dark", "system"].includes(value)) {
      return { valid: false, message: "app.theme 必须是 light、dark 或 system" };
    }
  }
  if (key.startsWith("ai.")) {
    if (key === "ai.defaultModel" && !value) {
      return { valid: false, message: "ai.defaultModel 不能为空" };
    }
  }
  return { valid: true, message: "配置值有效" };
}

/** 格式化 JSON 输出 */
function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** 格式化配置列表文本输出 */
function formatConfigList(configs: ConfigItem[]): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("  配置项:");
  lines.push("");
  for (const config of configs) {
    const desc = config.description ? ` # ${config.description}` : "";
    lines.push(`    ${config.key.padEnd(24)} = ${config.value}${desc}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** 格式化单个配置文本输出 */
function formatConfigGet(key: string, config: ConfigItem | undefined): string {
  if (!config) {
    return `配置项 ${key} 不存在`;
  }
  return `${config.key} = ${config.value}`;
}

/** 格式化配置设置文本输出 */
function formatConfigSet(key: string, value: string): string {
  return `已设置 ${key} = ${value}`;
}

/** 格式化配置验证文本输出 */
function formatConfigValidate(key: string, result: { valid: boolean; message: string }): string {
  const status = result.valid ? "✓ 有效" : "✗ 无效";
  return `${status}: ${result.message}`;
}

/**
 * 注册 config 命令
 */
export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command("config")
    .description("配置管理 (get/set/list/validate)");

  configCmd
    .command("list")
    .description("列出所有配置项")
    .option("--json", "JSON 输出格式")
    .action((options: ConfigOptions) => {
      const configs = getAllConfigs();
      if (options.json) {
        logger.info(formatJsonOutput(configs));
      } else {
        logger.info(formatConfigList(configs));
      }
    });

  configCmd
    .command("get <key>")
    .description("获取指定配置项的值")
    .option("--json", "JSON 输出格式")
    .action((key: string, options: ConfigOptions) => {
      const config = getConfig(key);
      if (options.json) {
        logger.info(formatJsonOutput(config ?? { key, value: null }));
      } else {
        logger.info(formatConfigGet(key, config));
      }
    });

  configCmd
    .command("set <key> <value>")
    .description("设置配置项的值")
    .option("--json", "JSON 输出格式")
    .action((key: string, value: string, options: ConfigOptions) => {
      setConfig(key, value);
      if (options.json) {
        logger.info(formatJsonOutput({ key, value, success: true }));
      } else {
        logger.info(formatConfigSet(key, value));
      }
    });

  configCmd
    .command("validate <key> <value>")
    .description("验证配置值是否有效")
    .option("--json", "JSON 输出格式")
    .action((key: string, value: string, options: ConfigOptions) => {
      const result = validateConfig(key, value);
      if (options.json) {
        logger.info(formatJsonOutput({ key, value, ...result }));
      } else {
        logger.info(formatConfigValidate(key, result));
      }
    });

  // 默认 list 子命令
  configCmd.action((options: ConfigOptions) => {
    const configs = getAllConfigs();
    if (options.json) {
      logger.info(formatJsonOutput(configs));
    } else {
      logger.info(formatConfigList(configs));
    }
  });
}
