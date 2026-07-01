/**
 * LSP Server Registry — 语言服务器注册表
 *
 * 管理语言服务器配置、启动/停止、健康检查。
 * 支持多语言服务器：
 * - TypeScript (typescript-language-server)
 * - Python (pyright/pylance)
 * - Go (gopls)
 * - Rust (rust-analyzer)
 * - Java (jdtls)
 */

import { logger } from '../logger.js';
import type { LspServerConfig, LspLanguage } from './lspManager.js';
import type { LSPServerConfigExtended } from './lspTypes.js';
import { getLspClientManager, type LSPClient } from './lspClient.js';

// ===================== 语言服务器配置 =====================

/**
 * 预定义的语言服务器配置
 */
const DEFAULT_SERVER_CONFIGS: LSPServerConfigExtended[] = [
  // TypeScript / JavaScript
  {
    id: 'typescript-language-server',
    name: 'TypeScript Language Server',
    language: 'typescript',
    command: 'typescript-language-server',
    args: ['--stdio'],
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    capabilities: [
      'completion',
      'definition',
      'hover',
      'references',
      'rename',
      'formatting',
      'diagnostics',
      'codeAction',
      'signatureHelp',
      'documentSymbol',
    ],
    initializationOptions: {
      preferences: {
        includeCompletionsForModuleExports: true,
        includeCompletionsWithInsertText: true,
        includeCompletionsWithSnippetText: true,
      },
    },
  },

  // Python (Pyright)
  {
    id: 'pyright',
    name: 'Pyright',
    language: 'python',
    command: 'pyright-langserver',
    args: ['--stdio'],
    fileExtensions: ['.py', '.pyi', '.pyw'],
    capabilities: [
      'completion',
      'definition',
      'hover',
      'references',
      'rename',
      'diagnostics',
      'codeAction',
      'signatureHelp',
    ],
  },

  // Python (Pylance - 如果可用)
  {
    id: 'pylance',
    name: 'Pylance',
    language: 'python',
    command: 'pylance-langserver',
    args: ['--stdio'],
    fileExtensions: ['.py', '.pyi', '.pyw'],
    capabilities: [
      'completion',
      'definition',
      'hover',
      'references',
      'rename',
      'diagnostics',
      'codeAction',
      'signatureHelp',
    ],
  },

  // Go (gopls)
  {
    id: 'gopls',
    name: 'Go Language Server',
    language: 'go',
    command: 'gopls',
    args: ['serve'],
    fileExtensions: ['.go', '.gomod', '.gowork'],
    capabilities: [
      'completion',
      'definition',
      'hover',
      'references',
      'rename',
      'formatting',
      'diagnostics',
      'codeAction',
      'signatureHelp',
    ],
    initializationOptions: {
      usePlaceholders: true,
      staticcheck: true,
    },
  },

  // Rust (rust-analyzer)
  {
    id: 'rust-analyzer',
    name: 'Rust Analyzer',
    language: 'rust',
    command: 'rust-analyzer',
    args: [],
    fileExtensions: ['.rs', '.toml'],
    capabilities: [
      'completion',
      'definition',
      'hover',
      'references',
      'rename',
      'formatting',
      'diagnostics',
      'codeAction',
      'signatureHelp',
      'inlayHints',
    ],
    initializationOptions: {
      checkOnSave: {
        command: 'clippy',
      },
      cargo: {
        loadOutDirsFromCheck: true,
      },
      procMacro: {
        enable: true,
      },
    },
  },

  // Java (jdtls)
  {
    id: 'jdtls',
    name: 'Eclipse JDT Language Server',
    language: 'java',
    command: 'jdtls',
    args: [],
    fileExtensions: ['.java', '.class', '.jar'],
    capabilities: [
      'completion',
      'definition',
      'hover',
      'references',
      'rename',
      'formatting',
      'diagnostics',
      'codeAction',
      'signatureHelp',
    ],
  },

  // JSON
  {
    id: 'json-language-server',
    name: 'JSON Language Server',
    language: 'json',
    command: 'vscode-json-languageserver',
    args: ['--stdio'],
    fileExtensions: ['.json', '.jsonc'],
    capabilities: ['completion', 'hover', 'diagnostics', 'formatting'],
  },

  // YAML
  {
    id: 'yaml-language-server',
    name: 'YAML Language Server',
    language: 'yaml',
    command: 'yaml-language-server',
    args: ['--stdio'],
    fileExtensions: ['.yml', '.yaml'],
    capabilities: ['completion', 'hover', 'diagnostics', 'formatting'],
  },

  // HTML
  {
    id: 'html-language-server',
    name: 'HTML Language Server',
    language: 'html',
    command: 'vscode-html-languageserver',
    args: ['--stdio'],
    fileExtensions: ['.html', '.htm', '.xhtml'],
    capabilities: ['completion', 'hover', 'diagnostics', 'formatting'],
  },

  // CSS
  {
    id: 'css-language-server',
    name: 'CSS Language Server',
    language: 'css',
    command: 'vscode-css-languageserver',
    args: ['--stdio'],
    fileExtensions: ['.css', '.scss', '.sass', '.less'],
    capabilities: ['completion', 'hover', 'diagnostics', 'formatting'],
  },

  // Markdown
  {
    id: 'markdown-language-server',
    name: 'Markdown Language Server',
    language: 'markdown',
    command: 'marksman',
    args: [],
    fileExtensions: ['.md', '.markdown'],
    capabilities: ['completion', 'hover', 'definition', 'references'],
  },
];

// ===================== LSP Server Registry =====================

/**
 * LSP 服务器注册表
 */
export class LSPServerRegistry {
  private readonly configs = new Map<string, LspServerConfig>();
  private readonly healthChecks = new Map<string, NodeJS.Timeout>();
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;

    // 注册默认服务器配置
    for (const config of DEFAULT_SERVER_CONFIGS) {
      this.configs.set(config.id, config);
    }
  }

  // ========== 配置管理 ==========

  /**
   * 注册自定义服务器配置
   */
  registerConfig(config: LspServerConfig): void {
    this.configs.set(config.id, config);
    logger.info(`[LSP Registry] 注册服务器配置: ${config.id}`);
  }

  /**
   * 注销服务器配置
   */
  unregisterConfig(serverId: string): boolean {
    const config = this.configs.get(serverId);
    if (!config) {
      return false;
    }

    // 停止健康检查
    this.stopHealthCheck(serverId);

    this.configs.delete(serverId);
    logger.info(`[LSP Registry] 注销服务器配置: ${serverId}`);
    return true;
  }

  /**
   * 获取服务器配置
   */
  getConfig(serverId: string): LspServerConfig | undefined {
    return this.configs.get(serverId);
  }

  /**
   * 获取所有服务器配置
   */
  getAllConfigs(): LspServerConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * 根据语言获取服务器配置列表
   */
  getConfigsByLanguage(language: LspLanguage): LspServerConfig[] {
    return Array.from(this.configs.values()).filter(
      (config) => config.language === language,
    );
  }

  /**
   * 根据文件扩展名获取服务器配置
   */
  getConfigByExtension(extension: string): LspServerConfig | undefined {
    const ext = extension.toLowerCase();

    for (const config of this.configs.values()) {
      if (config.fileExtensions.some((e) => e.toLowerCase() === ext)) {
        return config;
      }
    }

    return undefined;
  }

  /**
   * 根据文件路径获取服务器配置
   */
  getConfigForFile(filePath: string): LspServerConfig | undefined {
    const extension = '.' + filePath.split('.').pop()?.toLowerCase();
    return this.getConfigByExtension(extension);
  }

  // ========== 服务器启动/停止 ==========

  /**
   * 启动语言服务器
   */
  async startServer(serverId: string): Promise<LSPClient> {
    const config = this.configs.get(serverId);
    if (!config) {
      throw new Error(`未找到服务器配置: ${serverId}`);
    }

    const clientManager = getLspClientManager(this.workspaceRoot);
    const client = await clientManager.startServer(config);

    // 启动健康检查
    this.startHealthCheck(serverId, client);

    logger.info(`[LSP Registry] 服务器启动成功: ${serverId} (PID: ${client.getPid()})`);
    return client;
  }

  /**
   * 停止语言服务器
   */
  async stopServer(serverId: string): Promise<void> {
    // 停止健康检查
    this.stopHealthCheck(serverId);

    const clientManager = getLspClientManager(this.workspaceRoot);
    await clientManager.stopServer(serverId);

    logger.info(`[LSP Registry] 服务器已停止: ${serverId}`);
  }

  /**
   * 启动所有服务器
   */
  async startAllServers(): Promise<Map<string, LSPClient>> {
    const results = new Map<string, LSPClient>();

    for (const [id, config] of this.configs) {
      try {
        const client = await this.startServer(id);
        results.set(id, client);
      } catch (error) {
        logger.error(`[LSP Registry] 启动服务器失败: ${id}`, error);
      }
    }

    return results;
  }

  /**
   * 停止所有服务器
   */
  async stopAllServers(): Promise<void> {
    // 停止所有健康检查
    for (const [serverId] of this.healthChecks) {
      this.stopHealthCheck(serverId);
    }

    const clientManager = getLspClientManager(this.workspaceRoot);
    await clientManager.shutdownAll();

    logger.info('[LSP Registry] 所有服务器已停止');
  }

  // ========== 健康检查 ==========

  /**
   * 启动健康检查
   */
  private startHealthCheck(serverId: string, client: LSPClient): void {
    // 清理现有的健康检查
    this.stopHealthCheck(serverId);

    // 每 30 秒检查一次
    const interval = setInterval(() => {
      this.checkHealth(serverId, client);
    }, 30000);

    this.healthChecks.set(serverId, interval);
  }

  /**
   * 停止健康检查
   */
  private stopHealthCheck(serverId: string): void {
    const interval = this.healthChecks.get(serverId);
    if (interval) {
      clearInterval(interval);
      this.healthChecks.delete(serverId);
    }
  }

  /**
   * 检查服务器健康状态
   */
  private checkHealth(serverId: string, client: LSPClient): void {
    if (!client.isRunning()) {
      logger.warn(`[LSP Registry] 服务器 ${serverId} 未运行，尝试重启`);
      this.stopHealthCheck(serverId);
      this.startServer(serverId).catch((error) => {
        logger.error(`[LSP Registry] 重启服务器失败: ${serverId}`, error);
      });
    } else if (!client.isInitialized()) {
      logger.warn(`[LSP Registry] 服务器 ${serverId} 未初始化`);
    } else {
      logger.debug(`[LSP Registry] 服务器 ${serverId} 健康`);
    }
  }

  // ========== 统计信息 ==========

  /**
   * 获取注册表统计信息
   */
  getStats(): {
    registeredServers: number;
    runningServers: number;
    initializedServers: number;
    byLanguage: Record<LspLanguage, number>;
  } {
    const clientManager = getLspClientManager(this.workspaceRoot);
    const clientStats = clientManager.getStats();

    const byLanguage: Record<LspLanguage, number> = {} as Record<LspLanguage, number>;
    for (const config of this.configs.values()) {
      byLanguage[config.language] = (byLanguage[config.language] ?? 0) + 1;
    }

    return {
      registeredServers: this.configs.size,
      runningServers: clientStats.runningClients,
      initializedServers: clientStats.initializedClients,
      byLanguage,
    };
  }
}

// ===================== 单例实例 =====================

let LSP_REGISTRY_INSTANCE: LSPServerRegistry | null = null;

/**
 * 获取 LSP 服务器注册表实例
 */
export function getLspServerRegistry(workspaceRoot?: string): LSPServerRegistry {
  if (!LSP_REGISTRY_INSTANCE) {
    LSP_REGISTRY_INSTANCE = new LSPServerRegistry(
      workspaceRoot ?? process.cwd(),
    );
  }

  return LSP_REGISTRY_INSTANCE;
}

/**
 * 重置 LSP 服务器注册表（用于测试）
 */
export async function resetLspServerRegistry(): Promise<void> {
  if (LSP_REGISTRY_INSTANCE) {
    await LSP_REGISTRY_INSTANCE.stopAllServers();
  }
  LSP_REGISTRY_INSTANCE = null;
}

/**
 * 获取默认服务器配置列表
 */
export function getDefaultServerConfigs(): LspServerConfig[] {
  return DEFAULT_SERVER_CONFIGS;
}

/**
 * 检查语言服务器是否可用（命令是否存在）
 */
export async function checkServerAvailability(command: string): Promise<boolean> {
  try {
    const { execSync } = await import('child_process');
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 批量检查服务器可用性
 */
export async function checkAllServersAvailability(): Promise<
  Map<string, boolean>
> {
  const results = new Map<string, boolean>();

  for (const config of DEFAULT_SERVER_CONFIGS) {
    const available = await checkServerAvailability(config.command);
    results.set(config.id, available);
    logger.debug(`[LSP Registry] ${config.id} (${config.command}): ${available ? '可用' : '不可用'}`);
  }

  return results;
}