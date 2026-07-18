import { Command } from 'commander';
import { promises as fs } from 'fs';
import path from 'path';

/** 预设模型文件路径 */
function getPresetModelsPath(): string {
  return path.join(process.cwd(), 'shared', 'data', 'preset-models.json');
}

/** 配置文件路径 */
function getConfigPath(): string {
  return path.join(process.cwd(), 'config.json');
}

/** 读取预设模型 */
async function readPresetModels(): Promise<
  Array<{
    id: string;
    name: string;
    provider: string;
    description?: string;
    capabilities?: string[];
    contextWindow?: number;
  }>
> {
  try {
    const content = await fs.readFile(getPresetModelsPath(), 'utf-8');
    const data = JSON.parse(content) as {
      models?: Array<{
        id: string;
        name: string;
        provider: string;
        description?: string;
        capabilities?: string[];
        contextWindow?: number;
      }>;
    };
    return data.models ?? [];
  } catch {
    return [];
  }
}

/** 读取默认模型 */
async function readDefaultModel(): Promise<string> {
  try {
    const content = await fs.readFile(getConfigPath(), 'utf-8');
    const config = JSON.parse(content) as {
      models?: { default?: string };
    };
    return config.models?.default ?? 'gpt-4o';
  } catch {
    return process.env.CROSS_WMS_MODELS_DEFAULT ?? 'gpt-4o';
  }
}

/** 设置默认模型 */
async function writeDefaultModel(modelId: string): Promise<void> {
  const configPath = getConfigPath();
  let config: Record<string, unknown> = {};
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // 忽略
  }
  config.models = {
    ...(typeof config.models === 'object' && config.models !== null
      ? (config.models as Record<string, unknown>)
      : {}),
    default: modelId,
  };
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export const modelsCommand = new Command('models')
  .description('管理模型')
  .version('1.0.0');

// list 子命令
modelsCommand
  .command('list')
  .description('列出所有可用模型')
  .action(async () => {
    const models = await readPresetModels();

    console.log('可用模型列表:');
    console.log('');
    for (const model of models) {
      const id = model.id ?? 'unknown';
      console.log(`  ${id}: ${model.name}`);
      console.log(`    提供商: ${model.provider}`);
      if (model.description) {
        console.log(`    描述: ${model.description}`);
      }
      if (model.capabilities && model.capabilities.length > 0) {
        console.log(`    能力: ${model.capabilities.join(', ')}`);
      }
      if (model.contextWindow) {
        console.log(`    上下文: ${model.contextWindow.toLocaleString()} tokens`);
      }
      console.log('');
    }
    console.log(`共 ${models.length} 个模型`);
  });

// default 子命令
modelsCommand
  .command('default')
  .description('显示默认模型')
  .action(async () => {
    const defaultModel = await readDefaultModel();
    console.log(`默认模型: ${defaultModel}`);
  });

// set-default 子命令
modelsCommand
  .command('set-default <modelId>')
  .description('设置默认模型')
  .action(async (modelId: string) => {
    // 验证模型是否存在
    const presets = await readPresetModels();
    const valid = presets.some((m) => m.id === modelId);

    if (!valid) {
      console.log(`警告: 模型 ${modelId} 不在已知模型列表中`);
    }

    await writeDefaultModel(modelId);
    console.log(`默认模型已设置为: ${modelId}`);
  });
