/**
 * 插件配置管理。
 *
 * 参考 openclaw/src/cli/plugins-config.ts 的对外形态，但补齐为自包含实现：
 * - 以 JSON 文件持久化插件配置（默认位于 ~/.crosswms/plugins-config.json）
 * - 提供列出 / 设置 / 读取 / 删除四类操作
 *
 * 配置文件结构示例：
 * {
 *   "my-plugin": { "enabled": true, "timeout": 5000 },
 *   "another":   { "endpoint": "https://example.com" }
 * }
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';

/** 单个插件的配置项（键值对，值为任意可 JSON 序列化的内容） */
export type PluginConfig = Record<string, unknown>;

/** 全部插件配置：插件名 -> 配置项 */
export type PluginConfigs = Record<string, PluginConfig>;

/** 配置文件默认存放目录（~/.crosswms） */
function resolveConfigDir(): string {
  return process.env.CROSSWMS_STATE_DIR || path.join(os.homedir(), '.crosswms');
}

/** 解析插件配置文件路径 */
export function resolvePluginConfigPath(): string {
  return path.join(resolveConfigDir(), 'plugins-config.json');
}

/** 判断路径是否存在 */
async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 读取全部插件配置。
 * 文件不存在或解析失败时返回空对象。
 */
async function readPluginConfigs(): Promise<PluginConfigs> {
  const configPath = resolvePluginConfigPath();
  if (!(await pathExists(configPath))) {
    return {};
  }
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content) as PluginConfigs;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    // 文件损坏或非合法 JSON 时回退为空
    return {};
  }
}

/**
 * 将全部插件配置写回文件。
 * 自动创建父目录。
 */
async function writePluginConfigs(configs: PluginConfigs): Promise<void> {
  const configPath = resolvePluginConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(configs, null, 2), 'utf-8');
}

/**
 * 列出插件配置。
 * - 不传 pluginName 时返回全部插件的配置
 * - 传入 pluginName 时仅返回该插件的配置（不存在则返回空对象）
 */
export async function listPluginConfigs(pluginName?: string): Promise<PluginConfigs | PluginConfig> {
  const configs = await readPluginConfigs();
  if (pluginName === undefined || pluginName === '') {
    return configs;
  }
  return configs[pluginName] ?? {};
}

/**
 * 获取指定插件的某个配置项。
 * 不存在时返回 undefined。
 */
export async function getPluginConfig(pluginName: string, key: string): Promise<unknown> {
  if (!pluginName || !key) {
    throw new Error('pluginName 与 key 均不能为空');
  }
  const configs = await readPluginConfigs();
  const pluginConfig = configs[pluginName];
  if (!pluginConfig) {
    return undefined;
  }
  return pluginConfig[key];
}

/**
 * 设置指定插件的某个配置项。
 * 插件不存在时自动创建；已存在时覆盖对应键。
 *
 * value 支持以下类型：
 * - 字符串 / 数字 / 布尔：直接写入
 * - 其它类型：尝试 JSON 解析字符串，失败则原样作为字符串写入
 */
export async function setPluginConfig(pluginName: string, key: string, value: string): Promise<unknown> {
  if (!pluginName || !key) {
    throw new Error('pluginName 与 key 均不能为空');
  }
  if (value === undefined || value === null) {
    throw new Error('value 不能为空');
  }

  // 尝试将字符串值转换为更具体的类型
  const parsedValue = coerceConfigValue(value);

  const configs = await readPluginConfigs();
  if (!configs[pluginName]) {
    configs[pluginName] = {};
  }
  configs[pluginName][key] = parsedValue;
  await writePluginConfigs(configs);
  return parsedValue;
}

/**
 * 删除指定插件的某个配置项。
 * 返回是否实际删除了该键。
 * 当插件本身不存在或键不存在时返回 false。
 */
export async function deletePluginConfig(pluginName: string, key: string): Promise<boolean> {
  if (!pluginName || !key) {
    throw new Error('pluginName 与 key 均不能为空');
  }
  const configs = await readPluginConfigs();
  const pluginConfig = configs[pluginName];
  if (!pluginConfig || !(key in pluginConfig)) {
    return false;
  }
  delete pluginConfig[key];
  // 若该插件已无任何配置项，则整体移除，保持文件整洁
  if (Object.keys(pluginConfig).length === 0) {
    delete configs[pluginName];
  }
  await writePluginConfigs(configs);
  return true;
}

/**
 * 将命令行传入的字符串值尝试转换为更具体的类型。
 * - "true"/"false" -> boolean
 * - 纯数字 -> number
 * - 合法 JSON -> 解析后的对象/数组
 * - 其它 -> 原字符串
 */
function coerceConfigValue(raw: string): unknown {
  // 布尔
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  // null
  if (raw === 'null') return null;
  // 数字
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const num = Number(raw);
    if (Number.isFinite(num)) return num;
  }
  // JSON 对象 / 数组
  if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
    try {
      return JSON.parse(raw);
    } catch {
      // 非合法 JSON，按字符串处理
    }
  }
  return raw;
}

/**
 * Commander plugins-config 子命令注册。
 * 与 cross-wms 现有命令风格一致，导出一个 Command 实例。
 */
export const pluginsConfigCommand = new Command('plugins-config')
  .description('管理插件配置（list / get / set / delete）')
  .version('1.0.0');

// list 子命令
pluginsConfigCommand
  .command('list')
  .description('列出插件配置；可指定单个插件名')
  .argument('[pluginName]', '插件名称（可选，不传则列出全部）')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (pluginName: string | undefined, opts: { json: boolean }) => {
    const result = await listPluginConfigs(pluginName);
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (pluginName) {
      const config = result as PluginConfig;
      const entries = Object.entries(config);
      if (entries.length === 0) {
        console.log(`插件 ${pluginName} 暂无配置`);
        return;
      }
      console.log(`插件 ${pluginName} 的配置:`);
      for (const [k, v] of entries) {
        console.log(`  ${k} = ${JSON.stringify(v)}`);
      }
      return;
    }
    const all = result as PluginConfigs;
    const names = Object.keys(all);
    if (names.length === 0) {
      console.log('暂无任何插件配置');
      return;
    }
    console.log('插件配置列表:');
    for (const name of names) {
      const keys = Object.keys(all[name] ?? {});
      console.log(`  ${name} (${keys.length} 项)`);
      for (const k of keys) {
        console.log(`    ${k} = ${JSON.stringify(all[name][k])}`);
      }
    }
  });

// get 子命令
pluginsConfigCommand
  .command('get <pluginName> <key>')
  .description('获取指定插件的某个配置项')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (pluginName: string, key: string, opts: { json: boolean }) => {
    const value = await getPluginConfig(pluginName, key);
    if (value === undefined) {
      console.log(`未找到配置: ${pluginName}.${key}`);
      return;
    }
    if (opts.json) {
      console.log(JSON.stringify(value));
      return;
    }
    console.log(value);
  });

// set 子命令
pluginsConfigCommand
  .command('set <pluginName> <key> <value>')
  .description('设置指定插件的某个配置项')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (pluginName: string, key: string, value: string, opts: { json: boolean }) => {
    const result = await setPluginConfig(pluginName, key, value);
    if (opts.json) {
      console.log(JSON.stringify({ pluginName, key, value: result }));
      return;
    }
    console.log(`已设置 ${pluginName}.${key} = ${JSON.stringify(result)}`);
  });

// delete 子命令
pluginsConfigCommand
  .command('delete <pluginName> <key>')
  .description('删除指定插件的某个配置项')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (pluginName: string, key: string, opts: { json: boolean }) => {
    const removed = await deletePluginConfig(pluginName, key);
    if (opts.json) {
      console.log(JSON.stringify({ pluginName, key, removed }));
      return;
    }
    if (removed) {
      console.log(`已删除 ${pluginName}.${key}`);
    } else {
      console.log(`未找到配置: ${pluginName}.${key}`);
    }
  });
