/**
 * LSP Types — LSP 协议类型定义
 *
 * 定义 LSP (Language Server Protocol) 相关的类型，包括：
 * - 代码补全项
 * - 诊断信息
 * - 位置信息
 * - 文本编辑
 * - 语言服务器配置
 */

import type { LspLanguage, LspServerStatus } from './lspManager.js';

// ===================== LSP 协议基础类型 =====================

/**
 * LSP 位置（行号、列号）
 */
export interface LSPPosition {
  /** 行号（0-based） */
  line: number;
  /** 列号（0-based，UTF-16 code units） */
  character: number;
}

/**
 * LSP 范围（起始位置到结束位置）
 */
export interface LSPRange {
  start: LSPPosition;
  end: LSPPosition;
}

/**
 * LSP 位置（URI + 范围）
 */
export interface LSPLocation {
  /** 文件 URI（如 file:///path/to/file.ts） */
  uri: string;
  /** 范围 */
  range: LSPRange;
}

/**
 * LSP 文本编辑
 */
export interface LSPTextEdit {
  /** 编辑范围 */
  range: LSPRange;
  /** 新文本内容 */
  newText: string;
}

/**
 * LSP 工作区编辑（多文件编辑）
 */
export interface LSPWorkspaceEdit {
  /** 每个文件的编辑列表 */
  changes?: Record<string, LSPTextEdit[]>;
  /** 文档变更（更复杂的编辑） */
  documentChanges?: Array<{
    textDocument: { uri: string; version?: number };
    edits: LSPTextEdit[];
  }>;
}

// ===================== 补全相关类型 =====================

/**
 * 补全项类型（LSP CompletionItemKind）
 */
export enum LSPCompletionItemKind {
  Text = 1,
  Method = 2,
  Function = 3,
  Constructor = 4,
  Field = 5,
  Variable = 6,
  Class = 7,
  Interface = 8,
  Module = 9,
  Property = 10,
  Unit = 11,
  Value = 12,
  Enum = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18,
  Folder = 19,
  EnumMember = 20,
  Constant = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
}

/**
 * LSP 补全项
 */
export interface LSPCompletionItem {
  /** 显示文本 */
  label: string;
  /** 补全项类型 */
  kind?: LSPCompletionItemKind;
  /** 详细信息（如类型签名） */
  detail?: string;
  /** 文档说明（Markdown 或纯文本） */
  documentation?: string | { kind: 'markdown' | 'plaintext'; value: string };
  /** 插入文本（默认使用 label） */
  insertText?: string;
  /** 插入文本格式（1=纯文本，2=Snippet） */
  insertTextFormat?: 1 | 2;
  /** 排序文本（用于排序补全项） */
  sortText?: string;
  /** 过滤文本（用于过滤补全项） */
  filterText?: string;
  /** 是否预选（默认选中） */
  preselect?: boolean;
  /** 补全项数据（服务器返回的额外数据） */
  data?: unknown;
}

/**
 * 补全列表
 */
export interface LSPCompletionList {
  /** 是否不完整（需要进一步请求） */
  isIncomplete: boolean;
  /** 补全项列表 */
  items: LSPCompletionItem[];
}

// ===================== 诊断相关类型 =====================

/**
 * 诊断严重性级别（LSP DiagnosticSeverity）
 */
export enum LSPDiagnosticSeverity {
  /** 错误 */
  Error = 1,
  /** 警告 */
  Warning = 2,
  /** 信息 */
  Information = 3,
  /** 提示 */
  Hint = 4,
}

/**
 * 诊断相关信息
 */
export interface LSPDiagnosticRelatedInformation {
  /** 相关位置 */
  location: LSPLocation;
  /** 相关消息 */
  message: string;
}

/**
 * LSP 诊断项
 */
export interface LSPDiagnostic {
  /** 范围 */
  range: LSPRange;
  /** 严重性级别 */
  severity?: LSPDiagnosticSeverity;
  /** 诊断代码（数字或字符串） */
  code?: number | string;
  /** 诊断来源（如 "typescript"） */
  source?: string;
  /** 诊断消息 */
  message: string;
  /** 相关信息 */
  relatedInformation?: LSPDiagnosticRelatedInformation[];
  /** 标签（如 unnecessary、deprecated） */
  tags?: number[];
  /** 诊断数据（用于后续操作） */
  data?: unknown;
}

// ===================== Hover 相关类型 =====================

/**
 * LSP Hover 结果
 */
export interface LSPHover {
  /** Hover 内容（字符串、MarkedString 数组或 MarkupContent） */
  contents:
    | string
    | { language: string; value: string }
    | Array<string | { language: string; value: string }>
    | { kind: 'markdown' | 'plaintext'; value: string };
  /** Hover 范围（可选） */
  range?: LSPRange;
}

// ===================== 引用和定义相关类型 =====================

/**
 * LSP 定义链接（LocationLink）
 */
export interface LSPDefinitionLink {
  /** 定义位置 */
  targetUri: string;
  /** 定义范围 */
  targetRange: LSPRange;
  /** 定义选择范围（用于高亮） */
  targetSelectionRange: LSPRange;
  /** 原始选择范围（可选） */
  originSelectionRange?: LSPRange;
}

// ===================== 重命名相关类型 =====================

/**
 * LSP 重命名结果
 */
export interface LSPRenameResult {
  /** 工作区编辑 */
  edits: LSPWorkspaceEdit;
  /** 是否成功 */
  success: boolean;
  /** 错误消息（可选） */
  error?: string;
}

// ===================== 格式化相关类型 =====================

/**
 * LSP 格式化选项
 */
export interface LSPFormattingOptions {
  /** Tab 大小 */
  tabSize: number;
  /** 是否使用空格缩进 */
  insertSpaces: boolean;
  /** 是否在行尾插入空格 */
  trimTrailingWhitespace?: boolean;
  /** 是否插入最终换行符 */
  insertFinalNewline?: boolean;
  /** 是否修剪最终换行符 */
  trimFinalNewlines?: boolean;
}

/**
 * LSP 格式化结果
 */
export interface LSPFormatResult {
  /** 文本编辑列表 */
  edits: LSPTextEdit[];
  /** 是否成功 */
  success: boolean;
  /** 错误消息（可选） */
  error?: string;
}

// ===================== 语言服务器配置类型 =====================

/**
 * LSP 服务器配置（扩展自 lspManager.ts）
 */
export interface LSPServerConfigExtended {
  /** 服务器 ID */
  id: string;
  /** 服务器名称 */
  name: string;
  /** 语言类型 */
  language: LspLanguage;
  /** 启动命令 */
  command: string;
  /** 启动参数 */
  args?: string[];
  /** 环境变量 */
  env?: Record<string, string>;
  /** 工作目录 */
  cwd?: string;
  /** 初始化选项 */
  initializationOptions?: Record<string, unknown>;
  /** 支持的能力 */
  capabilities?: string[];
  /** 文件扩展名 */
  fileExtensions: string[];
  /** 是否自动启动 */
  autoStart?: boolean;
  /** 启动超时（毫秒） */
  startupTimeout?: number;
  /** 健康检查间隔（毫秒） */
  healthCheckInterval?: number;
}

/**
 * LSP 服务器能力
 */
export interface LSPServerCapabilities {
  /** 是否支持补全 */
  completionProvider?: {
    triggerCharacters?: string[];
    resolveProvider?: boolean;
  };
  /** 是否支持 Hover */
  hoverProvider?: boolean;
  /** 是否支持定义跳转 */
  definitionProvider?: boolean;
  /** 是否支持引用查找 */
  referencesProvider?: boolean;
  /** 是否支持重命名 */
  renameProvider?: boolean | { prepareProvider: boolean };
  /** 是否支持诊断 */
  diagnosticProvider?: {
    interFileDependencies?: boolean;
    workspaceDiagnostics?: boolean;
  };
  /** 是否支持格式化 */
  documentFormattingProvider?: boolean;
  /** 是否支持范围格式化 */
  documentRangeFormattingProvider?: boolean;
  /** 是否支持符号查找 */
    workspaceSymbolProvider?: boolean;
  /** 是否支持代码操作 */
  codeActionProvider?: boolean;
  /** 是否支持文档符号（大纲） */
  documentSymbolProvider?: boolean;
  /** 是否支持签名提示 */
  signatureHelpProvider?: {
    triggerCharacters?: string[];
    retriggerCharacters?: string[];
  };
}

/**
 * LSP 服务器状态（扩展自 lspManager.ts）
 */
export interface LSPServerStatusExtended {
  /** 服务器 ID */
  id: string;
  /** 状态 */
  status: LspServerStatus;
  /** 进程 PID */
  pid?: number;
  /** 启动时间 */
  startedAt?: number;
  /** 健康检查时间 */
  lastHealthCheck?: number;
  /** 总请求次数 */
  totalRequests: number;
  /** 活跃请求次数 */
  activeRequests: number;
  /** 错误次数 */
  errorCount: number;
  /** 错误消息 */
  errorMessage?: string;
  /** 服务器信息 */
  serverInfo?: {
    name: string;
    version?: string;
  };
  /** 服务器能力 */
  capabilities?: LSPServerCapabilities;
}

// ===================== 工作区相关类型 =====================

/**
 * LSP 工作区配置
 */
export interface LSPWorkspaceConfig {
  /** 工作区根路径 */
  rootPath: string;
  /** 工作区 URI */
  rootUri: string;
  /** 是否支持多根工作区 */
  workspaceFolders?: Array<{
    uri: string;
    name: string;
  }>;
  /** 项目类型（自动检测） */
  projectType?: 'typescript' | 'python' | 'go' | 'rust' | 'java' | 'mixed' | 'unknown';
  /** 活跃语言服务器 */
  activeServers?: string[];
}

/**
 * LSP 项目检测结果
 */
export interface LSPProjectDetection {
  /** 项目类型 */
  type: string;
  /** 项目根路径 */
  rootPath: string;
  /** 项目配置文件（如 tsconfig.json、package.json） */
  configFiles: string[];
  /** 推荐的语言服务器 */
  recommendedServers: string[];
  /** 依赖安装情况 */
  dependenciesInstalled: boolean;
}

// ===================== 工具调用结果类型 =====================

/**
 * LSP 工具调用通用结果
 */
export interface LSPToolResult<T> {
  /** 是否成功 */
  success: boolean;
  /** 结果数据 */
  data?: T;
  /** 错误消息 */
  error?: string;
  /** 服务器 ID */
  serverId?: string;
  /** 执行时间（毫秒） */
  duration?: number;
}

/**
 * LSP 补全工具结果
 */
export type LSPCompleteResult = LSPToolResult<LSPCompletionList>;

/**
 * LSP Hover 工具结果
 */
export type LSPHoverResult = LSPToolResult<LSPHover>;

/**
 * LSP 定义工具结果
 */
export type LSPDefinitionResult = LSPToolResult<LSPLocation[] | LSPDefinitionLink[]>;

/**
 * LSP 引用工具结果
 */
export type LSPReferencesResult = LSPToolResult<LSPLocation[]>;

/**
 * LSP 诊断工具结果
 */
export type LSPDiagnoseResult = LSPToolResult<LSPDiagnostic[]>;

/**
 * LSP 重命名工具结果
 */
export type LSPRenameResultWrapper = LSPToolResult<LSPRenameResult>;

/**
 * LSP 格式化工具结果
 */
export type LSPFormatResultWrapper = LSPToolResult<LSPFormatResult>;

// ===================== Code Action 相关类型 =====================

/**
 * LSP Code Action（代码操作建议）
 */
export interface LSPCodeAction {
  /** 操作标题（如 "Fix spelling"、"Extract method"） */
  title: string;
  /** 操作类型（quick fix、refactor、source 等） */
  kind?: string;
  /** 操作所属的 diagnostics */
  diagnostics?: LSPDiagnostic[];
  /** 是否首选 */
  isPreferred?: boolean;
  /** 执行后的工作区编辑 */
  edit?: LSPWorkspaceEdit;
  /** 执行的命令 */
  command?: {
    title: string;
    command: string;
    arguments?: unknown[];
  };
  /** 附加数据 */
  data?: unknown;
}

// ===================== Signature Help 相关类型 =====================

/**
 * LSP 签名信息
 */
export interface LSPSignatureInformation {
  /** 函数签名标签（如 "myFunc(a: number, b: string): void"） */
  label: string;
  /** 文档说明 */
  documentation?: string | { kind: 'markdown' | 'plaintext'; value: string };
  /** 参数列表 */
  parameters?: Array<{
    /** 参数标签 */
    label: string | [number, number];
    /** 参数文档 */
    documentation?: string | { kind: 'markdown' | 'plaintext'; value: string };
  }>;
  /** 活跃参数索引 */
  activeParameter?: number;
}

/**
 * LSP Signature Help（函数参数提示）
 */
export interface LSPSignatureHelp {
  /** 可用的签名列表 */
  signatures: LSPSignatureInformation[];
  /** 当前活跃的签名索引 */
  activeSignature?: number;
  /** 当前活跃的参数索引 */
  activeParameter?: number;
}

// ===================== Document Symbol 相关类型 =====================

/**
 * LSP 符号类型（SymbolKind）
 */
export enum LSPSymbolKind {
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26,
}

/**
 * LSP 文档符号（DocumentSymbol）
 */
export interface LSPDocumentSymbol {
  /** 符号名称 */
  name: string;
  /** 符号类型 */
  kind: LSPSymbolKind;
  /** 符号范围 */
  range: LSPRange;
  /** 符号选择范围（高亮用） */
  selectionRange: LSPRange;
  /** 详细信息 */
  detail?: string;
  /** 标签（如 deprecated） */
  tags?: number[];
  /** 子符号 */
  children?: LSPDocumentSymbol[];
}

/**
 * LSP 工作区符号（WorkspaceSymbol）
 */
export interface LSPWorkspaceSymbol {
  /** 符号名称 */
  name: string;
  /** 符号类型 */
  kind: LSPSymbolKind;
  /** 符号位置（URI + 范围） */
  location: LSPLocation | { uri: string };
  /** 容器名称（如所属类名） */
  containerName?: string;
  /** 附加数据 */
  data?: unknown;
}

// ===================== 工具调用结果类型（v3.2 新增） =====================

/**
 * LSP Code Action 工具结果
 */
export type LSPCodeActionResult = LSPToolResult<LSPCodeAction[]>;

/**
 * LSP Signature Help 工具结果
 */
export type LSPSignatureHelpResult = LSPToolResult<LSPSignatureHelp | null>;

/**
 * LSP 文档符号工具结果
 */
export type LSPDocumentSymbolsResult = LSPToolResult<LSPDocumentSymbol[]>;

/**
 * LSP 工作区符号工具结果
 */
export type LSPWorkspaceSymbolsResult = LSPToolResult<LSPWorkspaceSymbol[]>;