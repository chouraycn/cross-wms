import type { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { logger } from '../../logger.js';
import { AppPaths } from '../../config/appPaths.js';

export type ConfigOptions = {
  json?: boolean;
  dryRun?: boolean;
};

interface ConfigItem {
  key: string;
  value: unknown;
  description?: string;
}

interface ConfigSchema {
  [key: string]: {
    description?: string;
    type?: 'string' | 'boolean' | 'number' | 'array';
    validValues?: string[];
    required?: boolean;
    default?: unknown;
  };
}

const CONFIG_SCHEMA: ConfigSchema = {
  'app.language': { description: '应用语言', type: 'string', validValues: ['zh-CN', 'en-US'], default: 'zh-CN' },
  'app.theme': { description: '应用主题', type: 'string', validValues: ['light', 'dark', 'system'], default: 'system' },
  'ai.defaultModel': { description: '默认模型', type: 'string', required: true },
  'ai.imageModel': { description: '图片生成模型', type: 'string' },
  'ai.timeoutMs': { description: '模型调用超时时间(毫秒)', type: 'number', default: 60000 },
  'memory.enabled': { description: '记忆功能开关', type: 'boolean', default: true },
  'memory.maxEntries': { description: '最大记忆条目数', type: 'number', default: 1000 },
  'wms.defaultWarehouse': { description: '默认仓库', type: 'string', default: 'wh-001' },
  'security.execApproval': { description: '执行审批模式', type: 'string', validValues: ['allow', 'deny', 'ask'], default: 'ask' },
  'server.port': { description: '服务端口', type: 'number', default: 3000 },
};

function loadConfigFile(): Record<string, unknown> {
  if (!fs.existsSync(AppPaths.settingsFile)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(AppPaths.settingsFile, 'utf-8'));
  } catch {
    return {};
  }
}

function saveConfigFile(config: Record<string, unknown>): void {
  const dir = path.dirname(AppPaths.settingsFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(AppPaths.settingsFile, JSON.stringify(config, null, 2), 'utf-8');
}

function getAllConfigs(): ConfigItem[] {
  const fileConfig = loadConfigFile();
  const items: ConfigItem[] = [];
  for (const key of Object.keys(CONFIG_SCHEMA)) {
    items.push({
      key,
      value: fileConfig[key] ?? CONFIG_SCHEMA[key].default,
      description: CONFIG_SCHEMA[key].description,
    });
  }
  for (const key of Object.keys(fileConfig)) {
    if (!CONFIG_SCHEMA[key]) {
      items.push({ key, value: fileConfig[key] });
    }
  }
  return items.sort((a, b) => a.key.localeCompare(b.key));
}

function getConfig(key: string): ConfigItem | undefined {
  const fileConfig = loadConfigFile();
  const schema = CONFIG_SCHEMA[key];
  if (schema) {
    return { key, value: fileConfig[key] ?? schema.default, description: schema.description };
  }
  if (Object.prototype.hasOwnProperty.call(fileConfig, key)) {
    return { key, value: fileConfig[key] };
  }
  return undefined;
}

function setConfig(key: string, value: string, dryRun: boolean): { success: boolean; message: string } {
  const schema = CONFIG_SCHEMA[key];
  let parsedValue: unknown = value;
  
  if (schema?.type === 'boolean') {
    parsedValue = value.toLowerCase() === 'true' || value === '1';
  } else if (schema?.type === 'number') {
    const num = parseFloat(value);
    if (isNaN(num)) {
      return { success: false, message: `值必须是数字类型` };
    }
    parsedValue = num;
  } else if (schema?.type === 'array') {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      parsedValue = value.split(',');
    }
  }

  if (schema?.validValues && !schema.validValues.includes(String(parsedValue))) {
    return { success: false, message: `值必须是: ${schema.validValues.join(', ')}` };
  }

  if (dryRun) {
    return { success: true, message: `(dry-run) 准备设置 ${key} = ${JSON.stringify(parsedValue)}` };
  }

  const fileConfig = loadConfigFile();
  fileConfig[key] = parsedValue;
  saveConfigFile(fileConfig);
  return { success: true, message: `已设置 ${key} = ${JSON.stringify(parsedValue)}` };
}

function unsetConfig(key: string, dryRun: boolean): { success: boolean; message: string } {
  const fileConfig = loadConfigFile();
  if (!Object.prototype.hasOwnProperty.call(fileConfig, key)) {
    return { success: false, message: `配置项 ${key} 不存在` };
  }

  if (dryRun) {
    return { success: true, message: `(dry-run) 准备删除 ${key}` };
  }

  delete fileConfig[key];
  saveConfigFile(fileConfig);
  return { success: true, message: `已删除配置项 ${key}` };
}

function patchConfig(patchJson: string, dryRun: boolean): { success: boolean; message: string } {
  let patch: Record<string, unknown>;
  try {
    patch = JSON.parse(patchJson);
  } catch {
    return { success: false, message: 'JSON 格式无效' };
  }

  if (dryRun) {
    return { success: true, message: `(dry-run) 准备应用 patch: ${JSON.stringify(patch)}` };
  }

  const fileConfig = loadConfigFile();
  Object.assign(fileConfig, patch);
  saveConfigFile(fileConfig);
  return { success: true, message: `已应用 patch，更新了 ${Object.keys(patch).length} 个配置项` };
}

function validateConfig(key: string, value: string): { valid: boolean; message: string } {
  const schema = CONFIG_SCHEMA[key];
  if (!schema) {
    return { valid: true, message: '未知配置项，跳过验证' };
  }

  let parsedValue: unknown = value;
  if (schema.type === 'boolean') {
    parsedValue = value.toLowerCase() === 'true' || value === '1';
  } else if (schema.type === 'number') {
    const num = parseFloat(value);
    if (isNaN(num)) {
      return { valid: false, message: `值必须是数字类型` };
    }
    parsedValue = num;
  }

  if (schema.validValues && !schema.validValues.includes(String(parsedValue))) {
    return { valid: false, message: `值必须是: ${schema.validValues.join(', ')}` };
  }

  if (schema.required && (!parsedValue || parsedValue === '')) {
    return { valid: false, message: `配置项 ${key} 是必填项` };
  }

  return { valid: true, message: '配置值有效' };
}

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function formatConfigList(configs: ConfigItem[]): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('  配置项:');
  lines.push('');
  for (const config of configs) {
    const desc = config.description ? ` # ${config.description}` : '';
    const valueStr = typeof config.value === 'string' ? config.value : JSON.stringify(config.value);
    lines.push(`    ${config.key.padEnd(28)} = ${valueStr}${desc}`);
  }
  lines.push('');
  return lines.join('\n');
}

function formatConfigGet(key: string, config: ConfigItem | undefined): string {
  if (!config) {
    return `配置项 ${key} 不存在`;
  }
  const desc = config.description ? ` (${config.description})` : '';
  const valueStr = typeof config.value === 'string' ? config.value : JSON.stringify(config.value);
  return `${config.key} = ${valueStr}${desc}`;
}

export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command('config')
    .description('配置管理 (get/set/unset/patch/list/validate)');

  configCmd
    .command('list')
    .description('列出所有配置项')
    .option('--json', 'JSON 输出格式')
    .action((options: ConfigOptions) => {
      const configs = getAllConfigs();
      if (options.json) {
        logger.info(formatJsonOutput(configs));
      } else {
        logger.info(formatConfigList(configs));
      }
    });

  configCmd
    .command('get <key>')
    .description('获取指定配置项的值')
    .option('--json', 'JSON 输出格式')
    .action((key: string, options: ConfigOptions) => {
      const config = getConfig(key);
      if (options.json) {
        logger.info(formatJsonOutput(config ?? { key, value: null }));
      } else {
        logger.info(formatConfigGet(key, config));
      }
    });

  configCmd
    .command('set <key> <value>')
    .description('设置配置项的值')
    .option('--json', 'JSON 输出格式')
    .option('--dry-run', '模拟设置，不写入文件')
    .action((key: string, value: string, options: ConfigOptions) => {
      const result = setConfig(key, value, Boolean(options.dryRun));
      if (options.json) {
        logger.info(formatJsonOutput({ key, value, ...result }));
      } else {
        logger.info(result.message);
      }
    });

  configCmd
    .command('unset <key>')
    .description('删除配置项')
    .option('--json', 'JSON 输出格式')
    .option('--dry-run', '模拟删除，不写入文件')
    .action((key: string, options: ConfigOptions) => {
      const result = unsetConfig(key, Boolean(options.dryRun));
      if (options.json) {
        logger.info(formatJsonOutput({ key, ...result }));
      } else {
        logger.info(result.message);
      }
    });

  configCmd
    .command('patch <json>')
    .description('批量更新配置项（JSON 格式）')
    .option('--json', 'JSON 输出格式')
    .option('--dry-run', '模拟更新，不写入文件')
    .action((json: string, options: ConfigOptions) => {
      const result = patchConfig(json, Boolean(options.dryRun));
      if (options.json) {
        logger.info(formatJsonOutput({ patch: json, ...result }));
      } else {
        logger.info(result.message);
      }
    });

  configCmd
    .command('validate <key> <value>')
    .description('验证配置值是否有效')
    .option('--json', 'JSON 输出格式')
    .action((key: string, value: string, options: ConfigOptions) => {
      const result = validateConfig(key, value);
      if (options.json) {
        logger.info(formatJsonOutput({ key, value, ...result }));
      } else {
        const status = result.valid ? '✓ 有效' : '✗ 无效';
        logger.info(`${status}: ${result.message}`);
      }
    });

  configCmd.action((options: ConfigOptions) => {
    const configs = getAllConfigs();
    if (options.json) {
      logger.info(formatJsonOutput(configs));
    } else {
      logger.info(formatConfigList(configs));
    }
  });
}
