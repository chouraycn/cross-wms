#!/usr/bin/env node
/**
 * Cross-WMS TUI 独立启动入口
 *
 * 用法：
 *   cross-wms-tui                     # 使用默认配置（embedded 后端）
 *   cross-wms-tui --http              # 使用 HTTP 后端连接运行中的服务
 *   cross-wms-tui --url http://host:3001  # 自定义 HTTP 后端地址
 *   cross-wms-tui --model <id>        # 指定默认模型
 *   cross-wms-tui --agent <id>        # 指定默认 Agent
 *   cross-wms-tui --session <id>      # 恢复指定会话
 *   cross-wms-tui --theme dark|light|auto  # 设置主题
 *   cross-wms-tui --config <path>     # 使用自定义配置文件
 *   cross-wms-tui --save-config       # 生成默认配置文件
 *   cross-wms-tui --version           # 显示版本
 *   cross-wms-tui --help              # 显示帮助
 *
 * 作为模块使用：
 *   import { runTui, ChatServiceBackend, HttpBackend, loadTuiConfig } from './tui/index.js';
 *
 * 环境变量：
 *   CDF_TUI_BACKEND=embedded|http
 *   CDF_TUI_BASE_URL=http://host:port
 *   CDF_TUI_THEME=dark|light|auto
 *   CDF_TUI_MODEL=<model-id>
 *   CDF_TUI_AGENT=<agent-id>
 *   CDF_TUI_TOOL_PROFILE=minimal|coding|messaging|full
 *   CDF_TUI_CONFIG=/path/to/tui.json
 *   OPENCLAW_THEME=dark|light
 */

import { runTui } from './tui.js';
import { ChatServiceBackend as EmbeddedBackend } from './embeddedBackend.js';
import { HttpBackend } from './httpBackend.js';
import {
  loadTuiConfig,
  saveTuiConfig,
  getDefaultConfigPath,
  validateTuiConfig,
  type TuiConfig,
} from './config.js';
import { logger } from '../logger.js';

const VERSION = '1.0.0';
const DEFAULT_HTTP_URL = 'http://127.0.0.1:3001';

interface CliArgs {
  http: boolean;
  url?: string;
  model?: string;
  agent?: string;
  session?: string;
  theme?: 'dark' | 'light' | 'auto';
  config?: string;
  saveConfig: boolean;
  validateConfig: boolean;
  version: boolean;
  help: boolean;
  verbose: boolean;
  listBackends: boolean;
}

function printHelp(): void {
  console.log(`
Cross-WMS TUI - 独立终端应用

用法:
  cross-wms-tui [options]

选项:
  --http                    使用 HTTP 后端连接运行中的服务
  --url <url>               HTTP 后端地址（默认 ${DEFAULT_HTTP_URL}）
  --model <id>              指定默认模型 ID
  --agent <id>              指定默认 Agent ID
  --session <id>            恢复指定会话
  --theme <name>            主题: dark | light | auto
  --config <path>           使用自定义配置文件
  --save-config             生成默认配置文件并退出
  --validate-config         验证当前配置文件合法性
  --list-backends           列出可用后端
  --verbose                 启用详细日志
  --version                 显示版本
  --help                    显示此帮助

后端选择（按优先级）:
  1. 命令行参数 --http / --url
  2. 环境变量 CDF_TUI_BACKEND
  3. 配置文件 tui.json 中的 backend 字段
  4. 默认值: embedded（直接连本地数据库）

环境变量:
  CDF_TUI_BACKEND          embedded | http
  CDF_TUI_BASE_URL         HTTP 后端地址
  CDF_TUI_THEME            dark | light | auto
  CDF_TUI_MODEL            默认模型 ID
  CDF_TUI_AGENT            默认 Agent ID
  CDF_TUI_TOOL_PROFILE     minimal | coding | messaging | full
  CDF_TUI_CONFIG           配置文件路径
  OPENCLAW_THEME           dark | light（向后兼容）

示例:
  # 启动本地嵌入式 TUI
  cross-wms-tui

  # 连接到远端服务
  cross-wms-tui --http --url http://192.168.1.10:3001

  # 使用特定模型启动
  cross-wms-tui --model gpt-4o

  # 恢复上次会话
  cross-wms-tui --session sess_abc123

  # 生成默认配置文件
  cross-wms-tui --save-config

更多信息请访问：https://github.com/cross-wms/tui
`);
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    http: false,
    saveConfig: false,
    validateConfig: false,
    version: false,
    help: false,
    verbose: false,
    listBackends: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--http':
        args.http = true;
        break;
      case '--url':
        args.url = argv[++i];
        break;
      case '--model':
        args.model = argv[++i];
        break;
      case '--agent':
        args.agent = argv[++i];
        break;
      case '--session':
        args.session = argv[++i];
        break;
      case '--theme':
        args.theme = argv[++i] as 'dark' | 'light' | 'auto';
        break;
      case '--config':
        args.config = argv[++i];
        break;
      case '--save-config':
        args.saveConfig = true;
        break;
      case '--validate-config':
        args.validateConfig = true;
        break;
      case '--list-backends':
        args.listBackends = true;
        break;
      case '--verbose':
        args.verbose = true;
        break;
      case '--version':
      case '-v':
        args.version = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`未知选项: ${arg}`);
          console.error('使用 --help 查看可用选项');
          process.exit(1);
        } else {
          console.error(`未知参数: ${arg}`);
          process.exit(1);
        }
    }
  }

  return args;
}

/**
 * 根据配置和命令行参数选择后端
 */
function selectBackend(config: TuiConfig, args: CliArgs) {
  const useHttp = args.http || config.backend === 'http';
  const baseUrl = args.url || config.http?.baseUrl || DEFAULT_HTTP_URL;

  if (useHttp) {
    logger.info(`[TUI] 使用 HTTP 后端: ${baseUrl}`);
    return new HttpBackend({
      baseUrl,
      timeoutMs: config.http?.timeoutMs ?? 30000,
      userId: config.http?.userId,
      headers: config.http?.headers,
    });
  }

  logger.info('[TUI] 使用嵌入式后端（直接连接本地数据库）');
  return new EmbeddedBackend();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.version) {
    console.log(`cross-wms-tui v${VERSION}`);
    process.exit(0);
  }

  if (args.listBackends) {
    console.log('可用后端:');
    console.log('  embedded  嵌入式后端（直接连接本地数据库）');
    console.log('  http      HTTP 后端（连接运行中的服务）');
    process.exit(0);
  }

  // 加载配置
  const config = loadTuiConfig(args.config);

  // 验证配置
  const validation = validateTuiConfig(config);
  if (!validation.valid) {
    console.error('配置验证失败:');
    for (const err of validation.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  if (args.validateConfig) {
    console.log('配置验证通过 ✓');
    console.log(`配置文件: ${getDefaultConfigPath()}`);
    console.log(JSON.stringify(config, null, 2));
    process.exit(0);
  }

  // 保存配置
  if (args.saveConfig) {
    const path = saveTuiConfig(config);
    console.log(`✓ 已保存配置: ${path}`);
    console.log('\n你可以编辑此文件以自定义 TUI 行为');
    console.log('启动 TUI:');
    console.log('  cross-wms-tui --config ' + path);
    process.exit(0);
  }

  // 命令行参数覆盖配置
  if (args.model) config.model = args.model;
  if (args.agent) config.agentId = args.agent;
  if (args.session) config.sessionId = args.session;
  if (args.theme) config.theme = args.theme;
  if (args.verbose) config.verbose = true;

  if (config.verbose) {
    logger.setLevel?.('debug');
  }

  // 选择后端
  let backend;
  try {
    backend = selectBackend(config, args);
  } catch (err) {
    console.error(`初始化后端失败: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // 启动 TUI
  try {
    const result = await runTui(backend, {
      model: config.model,
      agentId: config.agentId,
      sessionId: config.sessionId,
      verbose: config.verbose,
      historySize: config.historySize,
      configPath: args.config,
    });
    process.exit(result.exitCode);
  } catch (err) {
    console.error(`TUI 启动失败: ${err instanceof Error ? err.message : String(err)}`);
    logger.error('[TUI] 启动失败:', err);
    process.exit(1);
  }
}

// 仅在直接执行时运行（作为模块导入时不会执行）
const isDirectRun = import.meta.url === `file://${process.argv[1]}` ||
  (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? ''));

if (isDirectRun) {
  main().catch((err) => {
    console.error('未捕获的错误:', err);
    process.exit(1);
  });
}

export { main as runTuiCli, parseArgs, selectBackend };
export type { CliArgs };
