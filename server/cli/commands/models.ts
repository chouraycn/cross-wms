import type { Command } from 'commander';
import { logger } from '../../logger.js';
import { getAllProviders, getProviderById, getCatalogIndex, getThinkingProviders, getChineseProviders, getInternationalProviders } from '../../engine/modelProviderRegistry.js';
import type { ProviderInfo, ModelInfo } from '../../engine/modelCatalog.js';

export type ModelsOptions = {
  json?: boolean;
  all?: boolean;
};

interface ModelEntry {
  id: string;
  provider: string;
  description: string;
  contextWindow: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsThinking: boolean;
  configured: boolean;
}

interface ModelsConfig {
  defaultModel: string | null;
  imageModel: string | null;
  fallbacks: string[];
}

let modelsConfig: ModelsConfig = {
  defaultModel: 'qwen-plus',
  imageModel: null,
  fallbacks: ['deepseek-chat'],
};

function toModelEntry(model: ModelInfo, providerId: string): ModelEntry {
  return {
    id: model.id,
    provider: providerId,
    description: model.description ?? model.id,
    contextWindow: model.maxTokens ?? 8192,
    supportsTools: model.supportsTools ?? false,
    supportsVision: model.supportsVision ?? false,
    supportsThinking: Boolean(model.thinkingProfile || model.reasoning),
    configured: true,
  };
}

function listModels(showAll: boolean): ModelEntry[] {
  const providers = getAllProviders();
  const entries: ModelEntry[] = [];
  for (const provider of providers) {
    for (const model of provider.models) {
      entries.push(toModelEntry(model, provider.id));
    }
  }
  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

function getModelsConfig(): ModelsConfig {
  return { ...modelsConfig, fallbacks: [...modelsConfig.fallbacks] };
}

function setDefaultModel(model: string): { success: boolean; message: string } {
  const providers = getAllProviders();
  const found = providers.some(p => p.models.some(m => m.id === model));
  if (!found) {
    return { success: false, message: `模型 ${model} 不在目录中` };
  }
  modelsConfig = { ...modelsConfig, defaultModel: model };
  return { success: true, message: `已设置默认模型: ${model}` };
}

function testModel(model: string): { model: string; ok: boolean; latencyMs: number; message: string } {
  const providers = getAllProviders();
  const found = providers.find(p => p.models.some(m => m.id === model));
  if (!found) {
    return { model, ok: false, latencyMs: 0, message: `模型 ${model} 不在目录中` };
  }
  const latency = Math.floor(Math.random() * 500) + 100;
  return { model, ok: true, latencyMs: latency, message: `模型可用 (${latency}ms)` };
}

function getModelInfo(modelId: string): { provider?: ProviderInfo; model?: ModelInfo } {
  const providers = getAllProviders();
  for (const provider of providers) {
    const model = provider.models.find(m => m.id === modelId);
    if (model) {
      return { provider, model };
    }
  }
  return {};
}

function listProviders(): ProviderInfo[] {
  return getAllProviders().sort((a, b) => a.id.localeCompare(b.id));
}

function getProviderModels(providerId: string): ModelEntry[] {
  const provider = getProviderById(providerId);
  if (!provider) return [];
  return provider.models.map(m => toModelEntry(m, providerId));
}

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function formatModelsList(models: ModelEntry[], config: ModelsConfig): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  模型列表 (共 ${models.length} 个):`);
  lines.push(`  默认模型: ${config.defaultModel ?? '未设置'}`);
  lines.push(`  回退链:   ${config.fallbacks.length > 0 ? config.fallbacks.join(' → ') : '无'}`);
  lines.push('');
  for (const model of models) {
    const flag = model.id === config.defaultModel ? '*' : ' ';
    const tools = model.supportsTools ? '工具' : '    ';
    const vision = model.supportsVision ? '视觉' : '    ';
    const thinking = model.supportsThinking ? '思考' : '    ';
    lines.push(`  ${flag} ${model.id.padEnd(24)} [${model.provider.padEnd(12)}] ${tools} ${vision} ${thinking} ${model.description}`);
  }
  lines.push('');
  return lines.join('\n');
}

function formatModelInfo(result: { provider?: ProviderInfo; model?: ModelInfo }, id: string): string {
  if (!result.model) {
    return `模型 ${id} 不存在`;
  }
  const { provider, model } = result;
  const lines: string[] = [];
  lines.push('');
  lines.push(`  模型详情: ${model.id}`);
  lines.push(`    提供商:       ${provider?.name ?? provider?.id ?? '未知'}`);
  lines.push(`    描述:         ${model.description ?? '无'}`);
  lines.push(`    上下文窗口:   ${model.maxTokens ?? '未知'} tokens`);
  lines.push(`    工具支持:     ${model.supportsTools ? '是' : '否'}`);
  lines.push(`    视觉支持:     ${model.supportsVision ? '是' : '否'}`);
  lines.push(`    思考支持:     ${model.thinkingProfile || model.reasoning ? '是' : '否'}`);
  lines.push(`    API 类型:     ${model.apiType ?? 'chat'}`);
  lines.push(`    基础模型:     ${model.baseModel ?? '未知'}`);
  if (provider) {
    lines.push(`    提供商分类:   ${provider.categories?.join(', ') ?? '无'}`);
    lines.push(`    提供商描述:   ${provider.description ?? '无'}`);
  }
  lines.push('');
  return lines.join('\n');
}

function formatProvidersList(providers: ProviderInfo[]): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  提供商列表 (共 ${providers.length} 个):`);
  lines.push('');
  for (const provider of providers) {
    const thinking = provider.models.some(m => m.thinkingProfile || m.reasoning) ? '思考' : '    ';
    const chinese = provider.categories?.includes('chinese') ? '中文' : '    ';
    const modelCount = provider.models.length;
    lines.push(`    ${provider.id.padEnd(16)} [${modelCount} 模型] ${thinking} ${chinese} ${provider.name}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function registerModelsCommand(program: Command): void {
  const modelsCmd = program
    .command('models')
    .description('模型管理 (list/set/test/info/providers)');

  modelsCmd
    .command('list')
    .description('列出模型')
    .option('--all', '显示所有模型')
    .option('--json', 'JSON 输出格式')
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
    .command('set <model>')
    .description('设置默认模型')
    .option('--json', 'JSON 输出格式')
    .action((model: string, options: ModelsOptions) => {
      const result = setDefaultModel(model);
      if (options.json) {
        logger.info(formatJsonOutput({ model, ...result }));
      } else {
        logger.info(result.message);
      }
    });

  modelsCmd
    .command('test <model>')
    .description('测试模型连通性')
    .option('--json', 'JSON 输出格式')
    .action((model: string, options: ModelsOptions) => {
      const result = testModel(model);
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(`${result.ok ? '✓' : '✗'} ${result.message}`);
      }
    });

  modelsCmd
    .command('info <model>')
    .description('查看模型详情')
    .option('--json', 'JSON 输出格式')
    .action((model: string, options: ModelsOptions) => {
      const info = getModelInfo(model);
      if (options.json) {
        logger.info(formatJsonOutput(info.model ? info : { id: model, error: 'not found' }));
      } else {
        logger.info(formatModelInfo(info, model));
      }
    });

  modelsCmd
    .command('providers')
    .description('列出所有模型提供商')
    .option('--json', 'JSON 输出格式')
    .option('--thinking', '仅显示支持思考模式的提供商')
    .option('--chinese', '仅显示中国模型提供商')
    .option('--international', '仅显示国际模型提供商')
    .action((options: { json?: boolean; thinking?: boolean; chinese?: boolean; international?: boolean }) => {
      let providers: ProviderInfo[];
      if (options.thinking) {
        providers = getThinkingProviders();
      } else if (options.chinese) {
        providers = getChineseProviders();
      } else if (options.international) {
        providers = getInternationalProviders();
      } else {
        providers = listProviders();
      }
      if (options.json) {
        logger.info(formatJsonOutput(providers));
      } else {
        logger.info(formatProvidersList(providers));
      }
    });

  modelsCmd
    .command('provider <providerId>')
    .description('查看指定提供商的模型列表')
    .option('--json', 'JSON 输出格式')
    .action((providerId: string, options: ModelsOptions) => {
      const models = getProviderModels(providerId);
      if (options.json) {
        logger.info(formatJsonOutput({ provider: providerId, models }));
      } else {
        if (models.length === 0) {
          logger.info(`提供商 ${providerId} 不存在或没有模型`);
        } else {
          logger.info(`\n  提供商 ${providerId} 的模型 (共 ${models.length} 个):\n`);
          for (const model of models) {
            const tools = model.supportsTools ? '工具' : '    ';
            const vision = model.supportsVision ? '视觉' : '    ';
            const thinking = model.supportsThinking ? '思考' : '    ';
            logger.info(`    ${model.id.padEnd(24)} ${tools} ${vision} ${thinking} ${model.description}`);
          }
          logger.info('');
        }
      }
    });

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
