/**
 * LSP Types - Language Server Protocol 类型定义
 *
 * 定义前端使用的 LSP 相关类型,包括:
 * - 服务器状态
 * - 服务器配置
 * - 工具定义
 * - 统计信息
 */

// ===================== 服务器状态 =====================

/**
 * LSP 服务器状态
 */
export type LspServerStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

/**
 * LSP 语言类型
 */
export type LspLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'json'
  | 'yaml'
  | 'html'
  | 'css'
  | 'markdown'
  | 'go'
  | 'rust'
  | 'java';

// ===================== 服务器配置 =====================

/**
 * LSP 服务器配置
 */
export interface LspServerConfig {
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
}

/**
 * LSP 服务器实例
 */
export interface LspServerInstance {
  /** 服务器 ID */
  id: string;
  /** 服务器配置 */
  config: LspServerConfig;
  /** 状态 */
  status: LspServerStatus;
  /** 进程 PID */
  pid?: number;
  /** 启动时间 */
  startedAt?: number;
  /** 停止时间 */
  stoppedAt?: number;
  /** 最后活跃时间 */
  lastActiveAt?: number;
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
    version: string;
  };
  /** 服务器能力 */
  capabilities?: Record<string, unknown>;
}

// ===================== LSP 工具定义 =====================

/**
 * LSP 工具名称
 */
export type LspToolName =
  | 'lsp_complete'
  | 'lsp_hover'
  | 'lsp_definition'
  | 'lsp_references'
  | 'lsp_rename'
  | 'lsp_diagnose'
  | 'lsp_format';

/**
 * LSP 工具信息
 */
export interface LspToolInfo {
  /** 工具名称 */
  name: LspToolName;
  /** 显示名称 */
  displayName: string;
  /** 描述 */
  description: string;
  /** 图标 */
  icon: string;
  /** 是否需要文件路径 */
  requiresFile: boolean;
  /** 是否需要位置信息 */
  requiresPosition: boolean;
  /** 额外参数 */
  extraParams?: string[];
}

/**
 * 预定义的 LSP 工具列表
 */
export const LSP_TOOLS: LspToolInfo[] = [
  {
    name: 'lsp_complete',
    displayName: '代码补全',
    description: '获取代码补全建议,支持多种语言',
    icon: '💡',
    requiresFile: true,
    requiresPosition: true,
  },
  {
    name: 'lsp_hover',
    displayName: 'Hover 信息',
    description: '获取类型信息和文档提示',
    icon: '📖',
    requiresFile: true,
    requiresPosition: true,
  },
  {
    name: 'lsp_definition',
    displayName: '跳转定义',
    description: '查找符号的定义位置',
    icon: '🔍',
    requiresFile: true,
    requiresPosition: true,
  },
  {
    name: 'lsp_references',
    displayName: '查找引用',
    description: '查找符号在项目中的所有引用',
    icon: '🔗',
    requiresFile: true,
    requiresPosition: true,
  },
  {
    name: 'lsp_rename',
    displayName: '重命名',
    description: '在项目中重命名符号,自动更新所有引用',
    icon: '✏️',
    requiresFile: true,
    requiresPosition: true,
    extraParams: ['newName'],
  },
  {
    name: 'lsp_diagnose',
    displayName: '诊断',
    description: '获取文件的诊断信息(错误、警告、提示)',
    icon: '⚠️',
    requiresFile: true,
    requiresPosition: false,
  },
  {
    name: 'lsp_format',
    displayName: '格式化',
    description: '根据语言服务器规则格式化代码',
    icon: '🎨',
    requiresFile: true,
    requiresPosition: false,
    extraParams: ['tabSize', 'insertSpaces'],
  },
];

// ===================== 统计信息 =====================

/**
 * LSP 统计信息
 */
export interface LspStats {
  /** 总服务器数 */
  totalServers: number;
  /** 运行中的服务器数 */
  runningServers: number;
  /** 已停止的服务器数 */
  stoppedServers: number;
  /** 错误的服务器数 */
  errorServers: number;
  /** 打开的文档数 */
  openDocuments: number;
  /** 总请求次数 */
  totalRequests: number;
  /** 总诊断数 */
  totalDiagnostics: number;
  /** 按严重性的错误统计 */
  errorsBySeverity: {
    error: number;
    warning: number;
    info: number;
    hint: number;
  };
}

// ===================== 日志 =====================

/**
 * LSP 日志条目
 */
export interface LspLogEntry {
  /** 时间戳 */
  timestamp: number;
  /** 日志级别 */
  level: 'info' | 'warn' | 'error' | 'debug';
  /** 消息 */
  message: string;
  /** 服务器 ID */
  serverId?: string;
  /** 详情 */
  details?: unknown;
}

// ===================== 项目检测 =====================

/**
 * LSP 项目检测结果
 */
export interface LspProjectDetection {
  /** 项目类型 */
  type: LspLanguage | 'mixed' | 'unknown';
  /** 配置文件列表 */
  configFiles: string[];
  /** 推荐的服务器列表 */
  recommendedServers: string[];
  /** 依赖是否已安装 */
  dependenciesInstalled: boolean;
}

/**
 * LSP 工作区配置
 */
export interface LspWorkspaceConfig {
  /** 工作区根路径 */
  rootPath: string;
  /** 工作区 URI */
  rootUri: string;
  /** 项目类型 */
  projectType?: LspLanguage | 'mixed' | 'unknown';
  /** 活跃的服务器列表 */
  activeServers: string[];
}