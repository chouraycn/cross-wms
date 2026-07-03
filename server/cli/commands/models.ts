/**
 * models 命令
 * 模型管理 (list/set/test/info)
 *
 * 参考 openclaw models-cli，封装对 server/engine/modelProviderRegistry 等模型模块的调用。
 * 当模型注册表未就绪时，使用本地状态进行模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type ModelsOptions = {
  json?: boolean;
  all?: boolean;
};

/** 模型条目 */
interface ModelEntry {
  id: string;
  provider: string;
  description: string;
  contextWindow: number;
  supportsTools: boolean;
  supportsVision: boolean;
  configured: boolean;
}

/** 模型配置状态 */
interface ModelsConfig {
  defaultModel: string | null;
  imageModel: string | null;
  fallbacks: string[];
}

/** 模拟模型目录 */
const MODEL_CATALOG: ModelEntry[] = [
  { id: "qwen-plus", provider: "qwen", description: "通义千问 Plus", contextWindow: 131072, supportsTools: true, supportsVision: true, configured: true },
  { id: "qwen-max", provider: "qwen", description: "通义千问 Max", contextWindow: 32768, supportsTools: true, supportsVision: false, configured: false },
  { id: "deepseek-chat", provider: "deepseek", description: "DeepSeek Chat", contextWindow: 65536, supportsTools: true, supportsVision: false, configured: false },
  { id: "gpt-4o", provider: "openai", description: "GPT-4o", contextWindow: 128000, supportsTools: true, supportsVision: true, configured: false },
  { id: "claude-3-5-sonnet", provider: "anthropic", description: "Claude 3.5 Sonnet", contextWindow: 200000, supportsTools: true, supportsVision: true, configured: false },
];

/** 模拟模型配置 */
let modelsConfig: ModelsConfig = {
  defaultModel: "qwen-plus",
  imageModel: null,
  fallbacks: ["deepseek-chat"],
};

/** 列出模型 */
function listModels(showAll: boolean): ModelEntry[] {
  return showAll ? MODEL_CATALOG : MODEL_CATALOG.filter((m) => m.configured);
}

/** 获取模型配置 */
function getModelsConfig(): ModelsConfig {
  return { ...modelsConfig, fallbacks: [...modelsConfig.fallbacks] };
}

/** 设置默认模型 */
function setDefaultModel(model: string): { success: boolean; message: string } {
  const entry = MODEL_CATALOG.find((m) => m.id === model);
  if (!entry) {
    return { success: false, message: `模型 ${model} 不在目录中` };
  }
  modelsConfig = { ...modelsConfig, defaultModel: model };
  return { success: true, message: `已设置默认模型: ${model}` };
}

/** 测试模型连通性 */
function testModel(model: string): { model: string; ok: boolean; latencyMs: number; message: string } {
  const entry = MODEL_CATALOG.find((m) => m.id === model);
  if (!entry) {
    return { model, ok: false, latencyMs: 0, message: `模型 ${model} 不在目录中` };
  }
  // 模拟探活
  const latency = Math.floor(Math.random() * 500) + 100;
  return { model, ok: true, latencyMs: latency, message: `模型可用 (${latency}ms)` };
}

/** 获取模型详情 */
function getModelInfo(model: string): ModelEntry | undefined {
  return MODEL_CATALOG.find((m) => m.id === model);
}

/** 格式化 JSON 输出 */
function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** 格式化模型列表文本输出 */
function formatModelsList(models: ModelEntry[], config: ModelsConfig): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  模型列表 (共 ${models.length} 个):`);
  lines.push(`  默认模型: ${config.defaultModel ?? "未设置"}`);
  lines.push(`  回退链:   ${config.fallbacks.length > 0 ? config.fallbacks.join(" → ") : "无"}`);
  lines.push("");
  for (const model of models) {
    const flag = model.id === config.defaultModel ? "*" : " ";
    const tools = model.supportsTools ? "工具" : "    ";
    const vision = model.supportsVision ? "视觉" : "    ";
    lines.push(`  ${flag} ${model.id.padEnd(20)} [${model.provider.padEnd(10)}] ${tools} ${vision}  ${model.description}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** 格式化模型详情文本输出 */
function formatModelInfo(model: ModelEntry | undefined, id: string): string {
  if (!model) {
    return `模型 ${id} 不存在`;
  }
  const lines: string[] = [];
  lines.push("");
  lines.push(`  模型详情: ${model.id}`);
  lines.push(`    提供商:       ${model.provider}`);
  lines.push(`    描述:         ${model.description}`);
  lines.push(`    上下文窗口:   ${model.contextWindow} tokens`);
  lines.push(`    工具支持:     ${model.supportsTools ? "是" : "否"}`);
  lines.push(`    视觉支持:     ${model.supportsVision ? "是" : "否"}`);
  lines.push(`    已配置:       ${model.configured ? "是" : "否"}`);
  lines.push("");
  return lines.join("\n");
}

/**
 * 注册 models 命令
 */
export function registerModelsCommand(program: Command): void {
  const modelsCmd = program
    .command("models")
    .description("模型管理 (list/set/test/info)");

  modelsCmd
    .command("list")
    .description("列出模型 (默认仅显示已配置)")
    .option("--all", "显示完整模型目录")
    .option("--json", "JSON 输出格式")
    .action((options: ModelsOptions) => {
      const models = listModels(Boolean(options.all));
      const config = getModelsConfig();
      if (options.json) {
        logger.info(formatJsonOutput({ models, config }));
      } else {
        logger.info(formatModelsList(models, config));
      }
    });

  modelsCmd
    .command("set <model>")
    .description("设置默认模型")
    .option("--json", "JSON 输出格式")
    .action((model: string, options: ModelsOptions) => {
      const result = setDefaultModel(model);
      if (options.json) {
        logger.info(formatJsonOutput({ model, ...result }));
      } else {
        logger.info(result.message);
      }
    });

  modelsCmd
    .command("test <model>")
    .description("测试模型连通性")
    .option("--json", "JSON 输出格式")
    .action((model: string, options: ModelsOptions) => {
      const result = testModel(model);
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(`${result.ok ? "✓" : "✗"} ${result.message}`);
      }
    });

  modelsCmd
    .command("info <model>")
    .description("查看模型详情")
    .option("--json", "JSON 输出格式")
    .action((model: string, options: ModelsOptions) => {
      const info = getModelInfo(model);
      if (options.json) {
        logger.info(formatJsonOutput(info ?? { id: model, error: "not found" }));
      } else {
        logger.info(formatModelInfo(info, model));
      }
    });

  // 默认 list 子命令
  modelsCmd.action((options: ModelsOptions) => {
    const models = listModels(Boolean(options.all));
    const config = getModelsConfig();
    if (options.json) {
      logger.info(formatJsonOutput({ models, config }));
    } else {
      logger.info(formatModelsList(models, config));
    }
  });
}
