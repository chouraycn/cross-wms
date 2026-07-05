/**
 * LSP Tools — LSP 工具集成
 *
 * 提供 11 个 LSP 工具供 AI 调用：
 * - lsp_complete — 代码补全
 * - lsp_hover — 类型/文档提示
 * - lsp_definition — 跳转定义
 * - lsp_references — 查找引用
 * - lsp_rename — 重命名符号
 * - lsp_diagnose — 诊断问题
 * - lsp_format — 格式化代码
 * - lsp_code_action — 代码操作建议（quick fix、refactor）
 * - lsp_signature_help — 函数参数提示
 * - lsp_document_symbols — 文档符号列表（大纲视图）
 * - lsp_workspace_symbols — 工作区符号搜索
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
  LSPCodeActionResult,
  LSPSignatureHelpResult,
  LSPDocumentSymbolsResult,
  LSPWorkspaceSymbolsResult,
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
    {
      type: 'function',
      function: {
        name: 'lsp_code_action',
        description: '获取指定位置的代码操作建议（如 quick fix、重构等）。返回可执行的代码操作列表，包括操作标题、类型、关联的诊断信息等。',
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
        name: 'lsp_signature_help',
        description: '获取函数参数提示信息。在函数调用的参数位置获取签名提示，显示函数签名、参数列表和当前活跃参数。适用于查看函数用法、参数类型等。',
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
            triggerCharacter: {
              type: 'string',
              description: '触发字符（可选，如 "(" 或 ","）',
            },
          },
          required: ['file', 'line', 'character'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'lsp_document_symbols',
        description: '获取文档中的所有符号（类、函数、变量等），用于大纲视图。返回符号列表，包括名称、类型、范围、子符号等。适用于理解文件结构、快速定位代码位置。',
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
        name: 'lsp_workspace_symbols',
        description: '在工作区中搜索符号。根据查询字符串搜索整个工作区的符号（类、函数、变量等），返回匹配的符号列表，包括名称、类型、位置等。适用于跨文件查找代码。',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索查询字符串',
            },
            limit: {
              type: 'number',
              description: '最大返回数量（默认 50）',
              default: 50,
            },
          },
          required: ['query'],
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
  handlers.set('lsp_code_action', handleLspCodeAction);
  handlers.set('lsp_signature_help', handleLspSignatureHelp);
  handlers.set('lsp_document_symbols', handleLspDocumentSymbols);
  handlers.set('lsp_workspace_symbols', handleLspWorkspaceSymbols);

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

/**
 * lsp_code_action — 获取代码操作建议
 */
async function handleLspCodeAction(args: Record<string, unknown>): Promise<string> {
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

    const codeActions = await client.getCodeActions(uri, position);

    const duration = Date.now() - startTime;

    const result: LSPCodeActionResult = {
      success: true,
      data: codeActions,
      serverId,
      duration,
    };

    return JSON.stringify(result);
  } catch (error) {
    logger.error('[LSP Tools] lsp_code_action 失败:', error);
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    });
  }
}

/**
 * lsp_signature_help — 函数参数提示
 */
async function handleLspSignatureHelp(args: Record<string, unknown>): Promise<string> {
  const file = args.file as string;
  const line = args.line as number;
  const character = args.character as number;
  const triggerCharacter = args.triggerCharacter as string | undefined;

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

    const signatureHelp = await client.getSignatureHelp(uri, position, triggerCharacter);

    const duration = Date.now() - startTime;

    const result: LSPSignatureHelpResult = {
      success: true,
      data: signatureHelp,
      serverId,
      duration,
    };

    return JSON.stringify(result);
  } catch (error) {
    logger.error('[LSP Tools] lsp_signature_help 失败:', error);
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    });
  }
}

/**
 * lsp_document_symbols — 获取文档符号列表
 */
async function handleLspDocumentSymbols(args: Record<string, unknown>): Promise<string> {
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

    const symbols = await client.getDocumentSymbols(uri);

    const duration = Date.now() - startTime;

    const result: LSPDocumentSymbolsResult = {
      success: true,
      data: symbols,
      serverId,
      duration,
    };

    return JSON.stringify(result);
  } catch (error) {
    logger.error('[LSP Tools] lsp_document_symbols 失败:', error);
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    });
  }
}

/**
 * lsp_workspace_symbols — 工作区符号搜索
 */
async function handleLspWorkspaceSymbols(args: Record<string, unknown>): Promise<string> {
  const query = args.query as string;
  const limit = (args.limit as number) ?? 50;

  const startTime = Date.now();

  try {
    if (!query) {
      return JSON.stringify({
        success: false,
        error: 'query parameter is required',
      });
    }

    // 工作区符号搜索需要一个已启动的服务器
    // 尝试使用 typescript-language-server（如果可用）
    const registry = getLspServerRegistry();
    const configs = registry.getAllConfigs();
    let client: import('./lspClient.js').LSPClient | null = null;
    let serverId = '';

    // 优先使用已运行的 TypeScript 服务器
    const manager = getLspClientManager();
    const runningServers = manager.getRunningServers();
    if (runningServers.length > 0) {
      serverId = runningServers[0];
      client = manager.getClient(serverId) ?? null;
    }

    // 如果没有运行中的服务器，尝试启动 TypeScript 服务器
    if (!client) {
      const tsConfig = configs.find((c) => c.id === 'typescript-language-server') ||
        registry.getConfigForFile('/tmp/file.ts');
      if (tsConfig) {
        const available = await checkServerAvailability(tsConfig.command);
        if (available) {
          try {
            client = await registry.startServer(tsConfig.id);
            serverId = tsConfig.id;
          } catch (err) {
            logger.warn(`[LSP Tools] 无法启动服务器进行工作区搜索: ${err}`);
          }
        }
      }
    }

    if (!client) {
      return JSON.stringify({
        success: false,
        error: '未找到可用的语言服务器（需要至少一个运行中的服务器）',
      });
    }

    const symbols = await client.getWorkspaceSymbols(query);

    // 应用 limit 限制
    const limitedSymbols = symbols.slice(0, limit);

    const duration = Date.now() - startTime;

    const result: LSPWorkspaceSymbolsResult = {
      success: true,
      data: limitedSymbols,
      serverId,
      duration,
    };

    return JSON.stringify(result);
  } catch (error) {
    logger.error('[LSP Tools] lsp_workspace_symbols 失败:', error);
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
  handleLspCodeAction,
  handleLspSignatureHelp,
  handleLspDocumentSymbols,
  handleLspWorkspaceSymbols,
};