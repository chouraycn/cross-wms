/**
 * LSP Tools — LSP 工具集成
 *
 * 提供 7 个 LSP 工具供 AI 调用：
 * - lsp_complete — 代码补全
 * - lsp_hover — 类型/文档提示
 * - lsp_definition — 跳转定义
 * - lsp_references — 查找引用
 * - lsp_rename — 重命名符号
 * - lsp_diagnose — 诊断问题
 * - lsp_format — 格式化代码
 */

import { logger } from '../logger.js';
import { readFile } from 'fs/promises';
import type {
  ToolDefinition,
  ToolCall,
} from '../aiClient.js';
import type { ToolHandler } from './toolTypes.js';
import {
  getLspServerRegistry,
  checkServerAvailability,
} from './lspServerRegistry.js';
import { getLspClientManager } from './lspClient.js';
import type {
  LSPPosition,
  LSPRange,
  LSPCompleteResult,
  LSPHoverResult,
  LSPDefinitionResult,
  LSPReferencesResult,
  LSPDiagnoseResult,
  LSPRenameResultWrapper,
  LSPFormatResultWrapper,
  LSPFormattingOptions,
  LSPCompletionItem,
  LSPCompletionList,
} from './lspTypes.js';

// ===================== 工具定义 =====================

/**
 * LSP 工具定义列表
 */
export function getLspToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'lsp_complete',
        description: '获取代码补全建议。在指定文件和位置获取智能补全列表，支持多种语言（TypeScript、Python、Go、Rust、Java 等）。返回补全项列表，包括标签、类型、文档、插入文本等。',
        parameters: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: '文件路径（绝对路径）',
            },
            line: {
              type: 'number',
              description: '行号（0-based）',
            },
            character: {
              type: 'number',
              description: '列号（0-based，UTF-16 code units）',
            },
            triggerCharacter: {
              type: 'string',
              description: '触发字符（可选，如 "."、":"）',
            },
          },
          required: ['file', 'line', 'character'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'lsp_hover',
        description: '获取类型信息和文档提示。在指定位置获取 Hover 信息，显示类型签名、文档说明等。适用于查看变量类型、函数签名、类定义等。',
        parameters: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: '文件路径（绝对路径）',
            },
            line: {
              type: 'number',
              description: '行号（0-based）',
            },
            character: {
              type: 'number',
              description: '列号（0-based）',
            },
          },
          required: ['file', 'line', 'character'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'lsp_definition',
        description: '跳转到定义位置。查找符号的定义位置，返回定义文件和范围。支持跨文件跳转，适用于查看函数、类、变量的原始定义。',
        parameters: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: '文件路径（绝对路径）',
            },
            line: {
              type: 'number',
              description: '行号（0-based）',
            },
            character: {
              type: 'number',
              description: '列号（0-based）',
            },
          },
          required: ['file', 'line', 'character'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'lsp_references',
        description: '查找所有引用位置。查找符号在项目中的所有引用位置，返回引用列表。适用于分析代码依赖关系、重构准备等。',
        parameters: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: '文件路径（绝对路径）',
            },
            line: {
              type: 'number',
              description: '行号（0-based）',
            },
            character: {
              type: 'number',
              description: '列号（0-based）',
            },
          },
          required: ['file', 'line', 'character'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'lsp_rename',
        description: '重命名符号。在项目中重命名符号（变量、函数、类等），自动更新所有引用位置。返回工作区编辑列表，展示所有需要修改的文件和位置。',
        parameters: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: '文件路径（绝对路径）',
            },
            line: {
              type: 'number',
              description: '行号（0-based）',
            },
            character: {
              type: 'number',
              description: '列号（0-based）',
            },
            newName: {
              type: 'string',
              description: '新符号名称',
            },
          },
          required: ['file', 'line', 'character', 'newName'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'lsp_diagnose',
        description: '诊断文件问题。获取文件的诊断信息（错误、警告、提示），包括语法错误、类型错误、代码风格问题等。返回诊断列表，包括消息、严重性、位置、相关信息等。',
        parameters: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: '文件路径（绝对路径）',
            },
          },
          required: ['file'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'lsp_format',
        description: '格式化代码。根据语言服务器规则格式化代码，支持整个文件或指定范围格式化。返回编辑列表，展示格式化后的文本变更。',
        parameters: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: '文件路径（绝对路径）',
            },
            startLine: {
              type: 'number',
              description: '起始行号（可选，0-based）。不提供则格式化整个文件。',
            },
            startCharacter: {
              type: 'number',
              description: '起始列号（可选，0-based）。不提供则格式化整个文件。',
            },
            endLine: {
              type: 'number',
              description: '结束行号（可选，0-based）。不提供则格式化整个文件。',
            },
            endCharacter: {
              type: 'number',
              description: '结束列号（可选，0-based）。不提供则格式化整个文件。',
            },
            tabSize: {
              type: 'number',
              description: 'Tab 大小（默认 2）',
              default: 2,
            },
            insertSpaces: {
              type: 'boolean',
              description: '是否使用空格缩进（默认 true）',
              default: true,
            },
          },
          required: ['file'],
        },
      },
    },
  ];
}

// ===================== 工具处理器映射 =====================

/**
 * LSP 工具处理器映射
 */
export function getLspToolHandlers(): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  handlers.set('lsp_complete', handleLspComplete);
  handlers.set('lsp_hover', handleLspHover);
  handlers.set('lsp_definition', handleLspDefinition);
  handlers.set('lsp_references', handleLspReferences);
  handlers.set('lsp_rename', handleLspRename);
  handlers.set('lsp_diagnose', handleLspDiagnose);
  handlers.set('lsp_format', handleLspFormat);

  return handlers;
}

// ===================== 工具实现 =====================

/**
 * 获取文件 URI（转换为 LSP 格式）
 */
function getFileUri(filePath: string): string {
  return `file://${filePath}`;
}

/**
 * 确保语言服务器已启动
 */
async function ensureServerStarted(filePath: string): Promise<{
  client: import('./lspClient.js').LSPClient;
  serverId: string;
} | null> {
  const registry = getLspServerRegistry();
  const config = registry.getConfigForFile(filePath);

  if (!config) {
    logger.warn(`[LSP Tools] 未找到支持 ${filePath} 的语言服务器`);
    return null;
  }

  // 检查服务器是否可用
  const available = await checkServerAvailability(config.command);
  if (!available) {
    logger.warn(`[LSP Tools] 语言服务器 ${config.id} (${config.command}) 不可用`);
    return null;
  }

  // 尝试启动服务器
  try {
    const client = await registry.startServer(config.id);
    return { client, serverId: config.id };
  } catch (error) {
    logger.error(`[LSP Tools] 启动服务器 ${config.id} 失败:`, error);
    return null;
  }
}

/**
 * 确保文档已打开
 */
async function ensureDocumentOpen(
  client: import('./lspClient.js').LSPClient,
  filePath: string,
): Promise<string | null> {
  const uri = getFileUri(filePath);

  try {
    // 读取文件内容
    const content = await readFile(filePath, 'utf-8');

    // 获取语言 ID
    const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
    const languageId = getLanguageId(extension);

    // 打开文档
    client.openDocument(uri, languageId, content);

    return content;
  } catch (error) {
    logger.error(`[LSP Tools] 打开文档 ${filePath} 失败:`, error);
    return null;
  }
}

/**
 * 根据文件扩展名获取语言 ID
 */
function getLanguageId(extension: string): string {
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescriptreact',
    js: 'javascript',
    jsx: 'javascriptreact',
    mjs: 'javascript',
    cjs: 'javascript',
    py: 'python',
    pyi: 'python',
    pyw: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    json: 'json',
    jsonc: 'jsonc',
    yml: 'yaml',
    yaml: 'yaml',
    html: 'html',
    htm: 'html',
    xhtml: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    md: 'markdown',
    markdown: 'markdown',
  };

  return languageMap[extension] ?? extension;
}

/**
 * lsp_complete — 代码补全
 */
async function handleLspComplete(args: Record<string, unknown>): Promise<string> {
  const file = args.file as string;
  const line = args.line as number;
  const character = args.character as number;
  const triggerCharacter = args.triggerCharacter as string | undefined;

  const startTime = Date.now();

  try {
    // 确保服务器已启动
    const serverInfo = await ensureServerStarted(file);
    if (!serverInfo) {
      return JSON.stringify({
        success: false,
        error: `未找到支持该文件的语言服务器`,
      });
    }

    const { client, serverId } = serverInfo;

    // 确保文档已打开
    const content = await ensureDocumentOpen(client, file);
    if (!content) {
      return JSON.stringify({
        success: false,
        error: `无法打开文件: ${file}`,
      });
    }

    // 获取补全项
    const uri = getFileUri(file);
    const position: LSPPosition = { line, character };

    const completionList = await client.getCompletion(uri, position, triggerCharacter);

    const duration = Date.now() - startTime;

    const result: LSPCompleteResult = {
      success: true,
      data: completionList,
      serverId,
      duration,
    };

    return JSON.stringify(result);
  } catch (error) {
    logger.error('[LSP Tools] lsp_complete 失败:', error);
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    });
  }
}

/**
 * lsp_hover — 类型/文档提示
 */
async function handleLspHover(args: Record<string, unknown>): Promise<string> {
  const file = args.file as string;
  const line = args.line as number;
  const character = args.character as number;

  const startTime = Date.now();

  try {
    const serverInfo = await ensureServerStarted(file);
    if (!serverInfo) {
      return JSON.stringify({
        success: false,
        error: `未找到支持该文件的语言服务器`,
      });
    }

    const { client, serverId } = serverInfo;

    const content = await ensureDocumentOpen(client, file);
    if (!content) {
      return JSON.stringify({
        success: false,
        error: `无法打开文件: ${file}`,
      });
    }

    const uri = getFileUri(file);
    const position: LSPPosition = { line, character };

    const hover = await client.getHover(uri, position);

    const duration = Date.now() - startTime;

    const result: LSPHoverResult = {
      success: true,
      data: hover ?? undefined,
      serverId,
      duration,
    };

    return JSON.stringify(result);
  } catch (error) {
    logger.error('[LSP Tools] lsp_hover 失败:', error);
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    });
  }
}

/**
 * lsp_definition — 跳转定义
 */
async function handleLspDefinition(args: Record<string, unknown>): Promise<string> {
  const file = args.file as string;
  const line = args.line as number;
  const character = args.character as number;

  const startTime = Date.now();

  try {
    const serverInfo = await ensureServerStarted(file);
    if (!serverInfo) {
      return JSON.stringify({
        success: false,
        error: `未找到支持该文件的语言服务器`,
      });
    }

    const { client, serverId } = serverInfo;

    const content = await ensureDocumentOpen(client, file);
    if (!content) {
      return JSON.stringify({
        success: false,
        error: `无法打开文件: ${file}`,
      });
    }

    const uri = getFileUri(file);
    const position: LSPPosition = { line, character };

    const definitions = await client.getDefinition(uri, position);

    const duration = Date.now() - startTime;

    const result: LSPDefinitionResult = {
      success: true,
      data: definitions ?? [],
      serverId,
      duration,
    };

    return JSON.stringify(result);
  } catch (error) {
    logger.error('[LSP Tools] lsp_definition 失败:', error);
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    });
  }
}

/**
 * lsp_references — 查找引用
 */
async function handleLspReferences(args: Record<string, unknown>): Promise<string> {
  const file = args.file as string;
  const line = args.line as number;
  const character = args.character as number;

  const startTime = Date.now();

  try {
    const serverInfo = await ensureServerStarted(file);
    if (!serverInfo) {
      return JSON.stringify({
        success: false,
        error: `未找到支持该文件的语言服务器`,
      });
    }

    const { client, serverId } = serverInfo;

    const content = await ensureDocumentOpen(client, file);
    if (!content) {
      return JSON.stringify({
        success: false,
        error: `无法打开文件: ${file}`,
      });
    }

    const uri = getFileUri(file);
    const position: LSPPosition = { line, character };

    const references = await client.getReferences(uri, position);

    const duration = Date.now() - startTime;

    const result: LSPReferencesResult = {
      success: true,
      data: references ?? [],
      serverId,
      duration,
    };

    return JSON.stringify(result);
  } catch (error) {
    logger.error('[LSP Tools] lsp_references 失败:', error);
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    });
  }
}

/**
 * lsp_rename — 重命名符号
 */
async function handleLspRename(args: Record<string, unknown>): Promise<string> {
  const file = args.file as string;
  const line = args.line as number;
  const character = args.character as number;
  const newName = args.newName as string;

  const startTime = Date.now();

  try {
    const serverInfo = await ensureServerStarted(file);
    if (!serverInfo) {
      return JSON.stringify({
        success: false,
        error: `未找到支持该文件的语言服务器`,
      });
    }

    const { client, serverId } = serverInfo;

    const content = await ensureDocumentOpen(client, file);
    if (!content) {
      return JSON.stringify({
        success: false,
        error: `无法打开文件: ${file}`,
      });
    }

    const uri = getFileUri(file);
    const position: LSPPosition = { line, character };

    const workspaceEdit = await client.renameSymbol(uri, position, newName);

    const duration = Date.now() - startTime;

    if (!workspaceEdit) {
      return JSON.stringify({
        success: false,
        error: '无法重命名该符号',
        serverId,
        duration,
      });
    }

    // 统计修改数量
    const changeCount = Object.keys(workspaceEdit.changes ?? {}).length;

    const result: LSPRenameResultWrapper = {
      success: true,
      data: {
        edits: workspaceEdit,
        success: true,
      },
      serverId,
      duration,
    };

    logger.info(`[LSP Tools] 重命名成功: ${changeCount} 个文件需要修改`);

    return JSON.stringify(result);
  } catch (error) {
    logger.error('[LSP Tools] lsp_rename 失败:', error);
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    });
  }
}

/**
 * lsp_diagnose — 诊断问题
 */
async function handleLspDiagnose(args: Record<string, unknown>): Promise<string> {
  const file = args.file as string;

  const startTime = Date.now();

  try {
    const serverInfo = await ensureServerStarted(file);
    if (!serverInfo) {
      return JSON.stringify({
        success: false,
        error: `未找到支持该文件的语言服务器`,
      });
    }

    const { client, serverId } = serverInfo;

    const content = await ensureDocumentOpen(client, file);
    if (!content) {
      return JSON.stringify({
        success: false,
        error: `无法打开文件: ${file}`,
      });
    }

    const uri = getFileUri(file);

    // 尝试获取 pull diagnostics
    const diagnostics = await client.getDiagnostics(uri);

    // 注意：很多 LSP 服务器使用 push diagnostics（通过通知推送）
    // 这里可能返回空数组，依赖服务器推送的诊断

    const duration = Date.now() - startTime;

    const result: LSPDiagnoseResult = {
      success: true,
      data: diagnostics,
      serverId,
      duration,
    };

    return JSON.stringify(result);
  } catch (error) {
    logger.error('[LSP Tools] lsp_diagnose 失败:', error);
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    });
  }
}

/**
 * lsp_format — 格式化代码
 */
async function handleLspFormat(args: Record<string, unknown>): Promise<string> {
  const file = args.file as string;
  const startLine = args.startLine as number | undefined;
  const startCharacter = args.startCharacter as number | undefined;
  const endLine = args.endLine as number | undefined;
  const endCharacter = args.endCharacter as number | undefined;
  const tabSize = (args.tabSize as number) ?? 2;
  const insertSpaces = (args.insertSpaces as boolean) ?? true;

  const startTime = Date.now();

  try {
    const serverInfo = await ensureServerStarted(file);
    if (!serverInfo) {
      return JSON.stringify({
        success: false,
        error: `未找到支持该文件的语言服务器`,
      });
    }

    const { client, serverId } = serverInfo;

    const content = await ensureDocumentOpen(client, file);
    if (!content) {
      return JSON.stringify({
        success: false,
        error: `无法打开文件: ${file}`,
      });
    }

    const uri = getFileUri(file);
    const options: LSPFormattingOptions = {
      tabSize,
      insertSpaces,
    };

    // 判断是否格式化范围
    const isRangeFormatting =
      startLine !== undefined &&
      startCharacter !== undefined &&
      endLine !== undefined &&
      endCharacter !== undefined;

    let edits: import('./lspTypes.js').LSPTextEdit[];

    if (isRangeFormatting) {
      const range: LSPRange = {
        start: { line: startLine, character: startCharacter },
        end: { line: endLine, character: endCharacter },
      };
      edits = await client.formatDocumentRange(uri, range, options);
    } else {
      edits = await client.formatDocument(uri, options);
    }

    const duration = Date.now() - startTime;

    const result: LSPFormatResultWrapper = {
      success: true,
      data: {
        edits,
        success: true,
      },
      serverId,
      duration,
    };

    logger.info(`[LSP Tools] 格式化完成: ${edits.length} 个编辑`);

    return JSON.stringify(result);
  } catch (error) {
    logger.error('[LSP Tools] lsp_format 失败:', error);
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    });
  }
}

// ===================== 导出 =====================

export {
  handleLspComplete,
  handleLspHover,
  handleLspDefinition,
  handleLspReferences,
  handleLspRename,
  handleLspDiagnose,
  handleLspFormat,
};