/**
 * LSP Client — LSP 客户端实现
 *
 * 实现 LSP (Language Server Protocol) 客户端，通过 stdio 与语言服务器通信。
 * 支持多语言服务器：
 * - TypeScript (typescript-language-server)
 * - Python (pyright/pylance)
 * - Go (gopls)
 * - Rust (rust-analyzer)
 * - Java (jdtls)
 */

import { spawn, ChildProcess } from 'child_process';
import { logger } from '../logger.js';
import type {
  LSPPosition,
  LSPRange,
  LSPLocation,
  LSPCompletionList,
  LSPHover,
  LSPDiagnostic,
  LSPWorkspaceEdit,
  LSPTextEdit,
  LSPFormattingOptions,
  LSPServerCapabilities,
  LSPCodeAction,
  LSPSignatureHelp,
  LSPDocumentSymbol,
  LSPWorkspaceSymbol,
} from './lspTypes.js';
import type { LspServerConfig } from './lspManager.js';

// ===================== JSON-RPC 消息类型 =====================

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

// ===================== LSP Client 类 =====================

/**
 * LSP 客户端（单个语言服务器连接）
 */
export class LSPClient {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<
    number | string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private buffer = '';
  private capabilities: LSPServerCapabilities | null = null;
  private initialized = false;
  private isShutdown = false;

  constructor(
    private readonly config: LspServerConfig,
    private readonly workspaceRoot: string,
  ) {}

  // ========== 进程管理 ==========

  /**
   * 启动语言服务器进程
   */
  async start(): Promise<void> {
    if (this.process) {
      logger.warn(`[LSP Client] ${this.config.id} 已启动`);
      return;
    }

    logger.info(`[LSP Client] 启动 ${this.config.name}: ${this.config.command}`);

    try {
      this.process = spawn(this.config.command, this.config.args ?? [], {
        cwd: this.config.cwd ?? this.workspaceRoot,
        env: { ...process.env, ...this.config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (!this.process.stdin || !this.process.stdout || !this.process.stderr) {
        throw new Error('无法创建 stdio 流');
      }

      // 监听 stdout（LSP 响应）
      this.process.stdout.on('data', (data: Buffer) => {
        this.handleData(data.toString());
      });

      // 监听 stderr（日志）
      this.process.stderr.on('data', (data: Buffer) => {
        logger.debug(`[LSP ${this.config.id}] stderr: ${data.toString().trim()}`);
      });

      // 监听进程退出
      this.process.on('exit', (code, signal) => {
        logger.info(`[LSP Client] ${this.config.id} 退出: code=${code}, signal=${signal}`);
        this.cleanup();
      });

      // 监听进程错误
      this.process.on('error', (err) => {
        logger.error(`[LSP Client] ${this.config.id} 进程错误:`, err);
        this.cleanup();
      });

      // 发送 initialize 请求
      await this.initialize();

      logger.info(`[LSP Client] ${this.config.id} 启动成功`);
    } catch (error) {
      logger.error(`[LSP Client] ${this.config.id} 启动失败:`, error);
      this.cleanup();
      throw error;
    }
  }

  /**
   * 初始化 LSP 连接
   */
  private async initialize(): Promise<void> {
    const initParams = {
      processId: this.process?.pid,
      clientInfo: {
        name: 'cross-wms-lsp-client',
        version: '1.0.0',
      },
      rootPath: this.workspaceRoot,
      rootUri: `file://${this.workspaceRoot}`,
      capabilities: {
        textDocument: {
          completion: {
            completionItem: {
              snippetSupport: true,
              documentationFormat: ['markdown', 'plaintext'],
            },
          },
          hover: {
            contentFormat: ['markdown', 'plaintext'],
          },
          definition: {
            linkSupport: true,
          },
          references: {},
          rename: {
            prepareSupport: true,
          },
          formatting: {},
          rangeFormatting: {},
          publishDiagnostics: {
            relatedInformation: true,
          },
        },
        workspace: {
          workspaceFolders: true,
        },
      },
      initializationOptions: this.config.initializationOptions,
      workspaceFolders: [
        {
          uri: `file://${this.workspaceRoot}`,
          name: 'workspace',
        },
      ],
    };

    const result = await this.sendRequest('initialize', initParams);
    this.capabilities = result as LSPServerCapabilities;

    // 发送 initialized 通知
    this.sendNotification('initialized', {});

    this.initialized = true;
  }

  /**
   * 关闭语言服务器
   */
  async shutdown(): Promise<void> {
    if (!this.process || this.isShutdown) {
      return;
    }

    this.isShutdown = true;

    try {
      // 发送 shutdown 请求
      await this.sendRequest('shutdown', null);

      // 发送 exit 通知
      this.sendNotification('exit', {});

      // 等待进程退出
      await new Promise<void>((resolve) => {
        if (!this.process) {
          resolve();
          return;
        }

        const timeout = setTimeout(() => {
          logger.warn(`[LSP Client] ${this.config.id} 强制终止进程`);
          this.process?.kill('SIGKILL');
          resolve();
        }, 5000);

        this.process.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    } catch (error) {
      logger.error(`[LSP Client] ${this.config.id} shutdown 失败:`, error);
      this.process?.kill('SIGKILL');
    }

    this.cleanup();
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    this.process = null;
    this.initialized = false;
    this.capabilities = null;

    // 拒绝所有 pending 请求
    for (const [id, { reject }] of this.pendingRequests) {
      reject(new Error('LSP server disconnected'));
      this.pendingRequests.delete(id);
    }
  }

  // ========== JSON-RPC 通信 ==========

  /**
   * 发送 JSON-RPC 请求
   */
  private async sendRequest(method: string, params: unknown): Promise<unknown> {
    if (!this.process?.stdin) {
      throw new Error('LSP server not running');
    }

    const id = this.requestId++;
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const message = JSON.stringify(request);
      const header = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n`;

      this.process!.stdin!.write(header + message);

      // 设置超时
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${id} timeout: ${method}`));
        }
      }, 30000);
    });
  }

  /**
   * 发送 JSON-RPC 通知
   */
  private sendNotification(method: string, params: unknown): void {
    if (!this.process?.stdin) {
      logger.warn(`[LSP Client] ${this.config.id} 无法发送通知: 进程未运行`);
      return;
    }

    const notification: JSONRPCNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const message = JSON.stringify(notification);
    const header = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n`;

    this.process.stdin.write(header + message);
  }

  /**
   * 处理接收到的数据
   */
  private handleData(data: string): void {
    this.buffer += data;

    while (true) {
      // 解析 Content-Length header
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        break;
      }

      const header = this.buffer.slice(0, headerEnd);
      const contentLengthMatch = header.match(/Content-Length: (\d+)/i);
      if (!contentLengthMatch) {
        logger.error('[LSP Client] 无效的 Content-Length header');
        this.buffer = this.buffer.slice(headerEnd + 4);
        break;
      }

      const contentLength = parseInt(contentLengthMatch[1], 10);
      const contentStart = headerEnd + 4;
      const contentEnd = contentStart + contentLength;

      if (this.buffer.length < contentEnd) {
        // 数据不完整，等待更多数据
        break;
      }

      const content = this.buffer.slice(contentStart, contentEnd);
      this.buffer = this.buffer.slice(contentEnd);

      try {
        const message = JSON.parse(content) as JSONRPCResponse | JSONRPCNotification;
        this.handleMessage(message);
      } catch (error) {
        logger.error('[LSP Client] JSON 解析失败:', error);
      }
    }
  }

  /**
   * 处理 JSON-RPC 消息
   */
  private handleMessage(message: JSONRPCResponse | JSONRPCNotification): void {
    if ('id' in message) {
      // 响应消息
      const pending = this.pendingRequests.get(message.id);
      if (!pending) {
        logger.warn(`[LSP Client] 未找到 pending request: ${message.id}`);
        return;
      }

      this.pendingRequests.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
    } else {
      // 通知消息
      this.handleNotification(message as JSONRPCNotification);
    }
  }

  /**
   * 处理通知消息
   */
  private handleNotification(notification: JSONRPCNotification): void {
    switch (notification.method) {
      case 'textDocument/publishDiagnostics':
        // 诊断通知
        logger.debug(`[LSP ${this.config.id}] 收到诊断通知`);
        break;
      case 'window/logMessage':
        // 日志消息
        const params = notification.params as { type: number; message: string };
        logger.debug(`[LSP ${this.config.id}] log: ${params.message}`);
        break;
      case 'window/showMessage':
        // 显示消息
        const showParams = notification.params as { type: number; message: string };
        logger.info(`[LSP ${this.config.id}] show: ${showParams.message}`);
        break;
      default:
        logger.debug(`[LSP ${this.config.id}] notification: ${notification.method}`);
    }
  }

  // ========== 文档管理 ==========

  /**
   * 打开文档
   */
  openDocument(uri: string, languageId: string, content: string): void {
    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: content,
      },
    });
  }

  /**
   * 关闭文档
   */
  closeDocument(uri: string): void {
    this.sendNotification('textDocument/didClose', {
      textDocument: { uri },
    });
  }

  /**
   * 更新文档内容
   */
  changeDocument(uri: string, content: string, version: number): void {
    this.sendNotification('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text: content }],
    });
  }

  // ========== LSP 功能 ==========

  /**
   * 获取补全项
   */
  async getCompletion(
    uri: string,
    position: LSPPosition,
    triggerCharacter?: string,
  ): Promise<LSPCompletionList> {
    const result = await this.sendRequest('textDocument/completion', {
      textDocument: { uri },
      position,
      context: {
        triggerKind: triggerCharacter ? 2 : 1,
        triggerCharacter,
      },
    });

    // LSP 可能返回 CompletionList 或 CompletionItem[]
    if (Array.isArray(result)) {
      return { isIncomplete: false, items: result as LSPCompletionList['items'] };
    }

    return result as LSPCompletionList;
  }

  /**
   * 获取 Hover 信息
   */
  async getHover(uri: string, position: LSPPosition): Promise<LSPHover | null> {
    const result = await this.sendRequest('textDocument/hover', {
      textDocument: { uri },
      position,
    });

    return result as LSPHover | null;
  }

  /**
   * 获取定义位置
   */
  async getDefinition(
    uri: string,
    position: LSPPosition,
  ): Promise<LSPLocation[] | null> {
    const result = await this.sendRequest('textDocument/definition', {
      textDocument: { uri },
      position,
    });

    if (!result) return null;

    // 可能返回 Location[] 或 LocationLink[]
    return Array.isArray(result) ? (result as LSPLocation[]) : [result as LSPLocation];
  }

  /**
   * 获取引用位置
   */
  async getReferences(uri: string, position: LSPPosition): Promise<LSPLocation[] | null> {
    const result = await this.sendRequest('textDocument/references', {
      textDocument: { uri },
      position,
      context: { includeDeclaration: true },
    });

    return result as LSPLocation[] | null;
  }

  /**
   * 重命名符号
   */
  async renameSymbol(
    uri: string,
    position: LSPPosition,
    newName: string,
  ): Promise<LSPWorkspaceEdit | null> {
    const result = await this.sendRequest('textDocument/rename', {
      textDocument: { uri },
      position,
      newName,
    });

    return result as LSPWorkspaceEdit | null;
  }

  /**
   * 获取诊断（pull diagnostics）
   */
  async getDiagnostics(uri: string): Promise<LSPDiagnostic[]> {
    // 大多数 LSP 服务器使用 push diagnostics（通过通知推送）
    // 这里尝试 pull diagnostics（如果服务器支持）
    try {
      const result = await this.sendRequest('textDocument/diagnostic', {
        textDocument: { uri },
      });

      return (result as { items: LSPDiagnostic[] })?.items ?? [];
    } catch {
      // 服务器不支持 pull diagnostics，返回空数组（依赖 push diagnostics）
      return [];
    }
  }

  /**
   * 格式化文档
   */
  async formatDocument(
    uri: string,
    options: LSPFormattingOptions,
  ): Promise<LSPTextEdit[]> {
    const result = await this.sendRequest('textDocument/formatting', {
      textDocument: { uri },
      options,
    });

    return (result as LSPTextEdit[]) ?? [];
  }

  /**
   * 格式化文档范围
   */
  async formatDocumentRange(
    uri: string,
    range: LSPRange,
    options: LSPFormattingOptions,
  ): Promise<LSPTextEdit[]> {
    const result = await this.sendRequest('textDocument/rangeFormatting', {
      textDocument: { uri },
      range,
      options,
    });

    return (result as LSPTextEdit[]) ?? [];
  }

  /**
   * 获取代码操作建议（quick fix、refactor 等）
   */
  async getCodeActions(
    uri: string,
    position: LSPPosition,
  ): Promise<LSPCodeAction[]> {
    const result = await this.sendRequest('textDocument/codeAction', {
      textDocument: { uri },
      range: { start: position, end: position },
      context: { diagnostics: [] },
    });

    return (result as LSPCodeAction[]) ?? [];
  }

  /**
   * 获取函数参数提示（Signature Help）
   */
  async getSignatureHelp(
    uri: string,
    position: LSPPosition,
    triggerCharacter?: string,
  ): Promise<LSPSignatureHelp | null> {
    const result = await this.sendRequest('textDocument/signatureHelp', {
      textDocument: { uri },
      position,
      context: triggerCharacter
        ? { triggerKind: 2, triggerCharacter }
        : undefined,
    });

    return result as LSPSignatureHelp | null;
  }

  /**
   * 获取文档符号列表（大纲视图）
   */
  async getDocumentSymbols(uri: string): Promise<LSPDocumentSymbol[]> {
    const result = await this.sendRequest('textDocument/documentSymbol', {
      textDocument: { uri },
    });

    return (result as LSPDocumentSymbol[]) ?? [];
  }

  /**
   * 在工作区中搜索符号
   */
  async getWorkspaceSymbols(query: string): Promise<LSPWorkspaceSymbol[]> {
    const result = await this.sendRequest('workspace/symbol', { query });

    return (result as LSPWorkspaceSymbol[]) ?? [];
  }

  // ========== 状态检查 ==========

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 检查是否正在运行
   */
  isRunning(): boolean {
    return this.process !== null && !this.shutdown;
  }

  /**
   * 获取服务器能力
   */
  getCapabilities(): LSPServerCapabilities | null {
    return this.capabilities;
  }

  /**
   * 获取进程 PID
   */
  getPid(): number | undefined {
    return this.process?.pid;
  }
}

// ===================== LSP Client Manager =====================

/**
 * LSP 客户端管理器（管理多个语言服务器连接）
 */
export class LSPClientManager {
  private readonly clients = new Map<string, LSPClient>();

  constructor(private readonly workspaceRoot: string) {}

  /**
   * 启动语言服务器
   */
  async startServer(config: LspServerConfig): Promise<LSPClient> {
    const existing = this.clients.get(config.id);
    if (existing?.isRunning()) {
      logger.debug(`[LSP Manager] ${config.id} 已运行`);
      return existing;
    }

    const client = new LSPClient(config, this.workspaceRoot);
    await client.start();

    this.clients.set(config.id, client);
    return client;
  }

  /**
   * 停止语言服务器
   */
  async stopServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (!client) {
      return;
    }

    await client.shutdown();
    this.clients.delete(serverId);
  }

  /**
   * 获取语言服务器客户端
   */
  getClient(serverId: string): LSPClient | undefined {
    return this.clients.get(serverId);
  }

  /**
   * 根据文件路径获取对应的语言服务器
   */
  getClientForFile(filePath: string, configs: LspServerConfig[]): LSPClient | undefined {
    const extension = '.' + filePath.split('.').pop()?.toLowerCase();

    for (const config of configs) {
      if (config.fileExtensions.some((ext) => ext.toLowerCase() === extension)) {
        const client = this.clients.get(config.id);
        if (client?.isRunning()) {
          return client;
        }
      }
    }

    return undefined;
  }

  /**
   * 停止所有语言服务器
   */
  async shutdownAll(): Promise<void> {
    for (const [id, client] of this.clients) {
      try {
        await client.shutdown();
      } catch (error) {
        logger.error(`[LSP Manager] ${id} shutdown 失败:`, error);
      }
    }

    this.clients.clear();
  }

  /**
   * 获取所有运行中的服务器 ID
   */
  getRunningServers(): string[] {
    return Array.from(this.clients.entries())
      .filter(([_, client]) => client.isRunning())
      .map(([id]) => id);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalClients: number;
    runningClients: number;
    initializedClients: number;
  } {
    const clients = Array.from(this.clients.values());

    return {
      totalClients: clients.length,
      runningClients: clients.filter((c) => c.isRunning()).length,
      initializedClients: clients.filter((c) => c.isInitialized()).length,
    };
  }
}

// ===================== 单例实例 =====================

let LSP_CLIENT_MANAGER_INSTANCE: LSPClientManager | null = null;

/**
 * 获取 LSP 客户端管理器实例
 */
export function getLspClientManager(workspaceRoot?: string): LSPClientManager {
  if (!LSP_CLIENT_MANAGER_INSTANCE) {
    LSP_CLIENT_MANAGER_INSTANCE = new LSPClientManager(
      workspaceRoot ?? process.cwd(),
    );
  }

  return LSP_CLIENT_MANAGER_INSTANCE;
}

/**
 * 重置 LSP 客户端管理器（用于测试）
 */
export function resetLspClientManager(): void {
  if (LSP_CLIENT_MANAGER_INSTANCE) {
    LSP_CLIENT_MANAGER_INSTANCE.shutdownAll().catch(() => {});
  }
  LSP_CLIENT_MANAGER_INSTANCE = null;
}