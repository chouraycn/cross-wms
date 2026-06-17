/**
 * Observer Rules — 观察者规则引擎的规则定义
 *
 * 定义全部 Observer 规则，用于检测工具执行结果中的异常模式，
 * 生成反思提示并决定是否重试或调整策略。
 *
 * 规则分类：
 * - SQL 错误组：sql_syntax_error, sql_no_table, sql_no_column
 * - 文件系统组：file_not_found, file_permission_denied, file_write_error
 * - 网络请求组：web_timeout, web_4xx_error, web_5xx_error
 * - Shell 执行组：shell_exec_error, shell_timeout
 * - WMS 业务组：wms_query_empty
 * - 通用组：generic_error, empty_result, json_parse_error
 *
 * v4.0.0: ReAct + Planner 模块
 */

// ===================== 类型定义 =====================

/** 观察级别 */
export type ObservationLevel = 'success' | 'warning' | 'error' | 'retry_suggested';

/** 规则条件 */
export interface RuleCondition {
  /** 工具名称匹配模式，支持 glob：db_* 匹配所有 db 前缀工具 */
  toolNamePattern: string;
  /** 结果文本正则匹配（可选） */
  resultPattern?: string;
  /** JSON 结果含 error 字段（可选） */
  hasError?: boolean;
  /** 结果文本包含的关键词（可选，任一匹配即命中） */
  resultContains?: string[];
  /** HTTP 状态码范围，仅 web_api_call（可选） */
  httpStatusRange?: [number, number];
}

/** 规则动作 */
export interface RuleAction {
  /** 反思提示模板，变量：{toolName}, {error} */
  hintTemplate: string;
  /** 观察级别 */
  level: ObservationLevel;
  /** 是否建议重试 */
  shouldRetry: boolean;
  /** 是否建议调整策略 */
  shouldAdjustStrategy: boolean;
  /** 最大重试次数 */
  maxRetries: number;
  /** 策略调整提示（可选） */
  strategyHint?: string;
}

/** 单条观察者规则 */
export interface ObserverRule {
  /** 规则唯一标识 */
  id: string;
  /** 规则描述 */
  description: string;
  /** 优先级，数字越小越优先 */
  priority: number;
  /** 匹配条件 */
  condition: RuleCondition;
  /** 匹配后动作 */
  action: RuleAction;
}

// ===================== 规则定义 =====================

export const OBSERVER_RULES: ObserverRule[] = [
  // ==================== SQL 错误组 ====================
  {
    id: 'sql_syntax_error',
    description: 'SQL 语法错误',
    priority: 10,
    condition: {
      toolNamePattern: 'db_query',
      hasError: true,
      resultContains: ['syntax', '语法', 'SQL_ERROR', 'near "', 'unexpected'],
    },
    action: {
      hintTemplate: '工具 {toolName} 执行时发生 SQL 语法错误：{error}。请检查 SQL 语句的语法是否正确，特别是关键字、引号和括号的使用。',
      level: 'error',
      shouldRetry: true,
      shouldAdjustStrategy: false,
      maxRetries: 2,
      strategyHint: '修正 SQL 语法错误后重试',
    },
  },
  {
    id: 'sql_no_table',
    description: 'SQL 查询的表不存在',
    priority: 11,
    condition: {
      toolNamePattern: 'db_query',
      hasError: true,
      resultContains: ['no such table', '表不存在', 'does not exist', 'table not found'],
    },
    action: {
      hintTemplate: '工具 {toolName} 查询的表不存在：{error}。请先确认表名是否正确，可使用 sqlite_master 查询现有表。',
      level: 'error',
      shouldRetry: true,
      shouldAdjustStrategy: true,
      maxRetries: 2,
      strategyHint: '查询 sqlite_master 获取正确的表名',
    },
  },
  {
    id: 'sql_no_column',
    description: 'SQL 查询的列不存在',
    priority: 12,
    condition: {
      toolNamePattern: 'db_query',
      hasError: true,
      resultContains: ['no such column', '列不存在', 'column not found', 'unknown column'],
    },
    action: {
      hintTemplate: '工具 {toolName} 查询的列不存在：{error}。请先使用 PRAGMA table_info 查询表的列名。',
      level: 'error',
      shouldRetry: true,
      shouldAdjustStrategy: true,
      maxRetries: 2,
      strategyHint: '查询表结构获取正确的列名',
    },
  },

  // ==================== 文件系统组 ====================
  {
    id: 'file_not_found',
    description: '文件不存在',
    priority: 20,
    condition: {
      toolNamePattern: 'file_*',
      hasError: true,
      resultContains: ['ENOENT', 'not found', '不存在', '无法读取', 'no such file'],
    },
    action: {
      hintTemplate: '工具 {toolName} 操作的文件不存在：{error}。请检查文件路径是否正确，可先用 file_listDir 列出目录。',
      level: 'error',
      shouldRetry: true,
      shouldAdjustStrategy: true,
      maxRetries: 2,
      strategyHint: '先用 file_listDir 确认文件路径',
    },
  },
  {
    id: 'file_permission_denied',
    description: '文件权限不足',
    priority: 21,
    condition: {
      toolNamePattern: 'file_*',
      hasError: true,
      resultContains: ['EACCES', 'permission', '权限', '安全限制', '禁止'],
    },
    action: {
      hintTemplate: '工具 {toolName} 因权限不足被拒绝：{error}。请检查文件权限或更换目标路径。',
      level: 'error',
      shouldRetry: false,
      shouldAdjustStrategy: true,
      maxRetries: 0,
      strategyHint: '更换可访问的文件路径',
    },
  },
  {
    id: 'file_write_error',
    description: '文件写入失败',
    priority: 22,
    condition: {
      toolNamePattern: 'file_writeFile',
      hasError: true,
      resultContains: ['写入失败', '无法写入', 'write error', 'ENOSPC'],
    },
    action: {
      hintTemplate: '工具 {toolName} 写入文件失败：{error}。请检查磁盘空间和目标路径的可写性。',
      level: 'error',
      shouldRetry: true,
      shouldAdjustStrategy: false,
      maxRetries: 1,
    },
  },

  // ==================== 网络请求组 ====================
  {
    id: 'web_timeout',
    description: '网络请求超时',
    priority: 30,
    condition: {
      toolNamePattern: 'web_*',
      hasError: true,
      resultContains: ['timeout', '超时', 'ETIMEDOUT', 'timed out'],
    },
    action: {
      hintTemplate: '工具 {toolName} 网络请求超时：{error}。建议稍后重试或检查网络连接。',
      level: 'warning',
      shouldRetry: true,
      shouldAdjustStrategy: false,
      maxRetries: 2,
    },
  },
  {
    id: 'web_4xx_error',
    description: 'HTTP 4xx 客户端错误',
    priority: 31,
    condition: {
      toolNamePattern: 'web_api_call',
      hasError: true,
      resultContains: ['400', '401', '403', '404', '429', 'Bad Request', 'Unauthorized', 'Forbidden', 'Not Found', 'Too Many Requests'],
    },
    action: {
      hintTemplate: '工具 {toolName} 收到 HTTP 4xx 错误：{error}。请检查请求参数、URL 和认证信息是否正确。',
      level: 'error',
      shouldRetry: false,
      shouldAdjustStrategy: true,
      maxRetries: 0,
      strategyHint: '检查并修正请求参数后重新调用',
    },
  },
  {
    id: 'web_5xx_error',
    description: 'HTTP 5xx 服务端错误',
    priority: 32,
    condition: {
      toolNamePattern: 'web_api_call',
      hasError: true,
      resultContains: ['500', '502', '503', '504', 'Internal Server Error', 'Bad Gateway', 'Service Unavailable', 'Gateway Timeout'],
    },
    action: {
      hintTemplate: '工具 {toolName} 收到 HTTP 5xx 错误：{error}。服务端暂时不可用，建议稍后重试。',
      level: 'warning',
      shouldRetry: true,
      shouldAdjustStrategy: false,
      maxRetries: 3,
    },
  },

  // ==================== Shell 执行组 ====================
  {
    id: 'shell_exec_error',
    description: 'Shell 命令执行失败',
    priority: 40,
    condition: {
      toolNamePattern: 'shell_exec',
      hasError: true,
      resultContains: ['执行失败', '不在白名单', '安全限制', 'Command failed'],
    },
    action: {
      hintTemplate: '工具 {toolName} 执行命令失败：{error}。请检查命令是否在白名单内，以及参数是否正确。',
      level: 'error',
      shouldRetry: true,
      shouldAdjustStrategy: true,
      maxRetries: 1,
      strategyHint: '修正命令或换用白名单内的等效命令',
    },
  },
  {
    id: 'shell_timeout',
    description: 'Shell 命令执行超时',
    priority: 41,
    condition: {
      toolNamePattern: 'shell_exec',
      hasError: true,
      resultContains: ['timeout', '超时', 'ETIMEDOUT'],
    },
    action: {
      hintTemplate: '工具 {toolName} 命令执行超时：{error}。建议简化命令或减少输出量。',
      level: 'warning',
      shouldRetry: true,
      shouldAdjustStrategy: false,
      maxRetries: 1,
    },
  },

  // ==================== WMS 业务组 ====================
  {
    id: 'wms_query_empty',
    description: 'WMS 查询结果为空',
    priority: 50,
    condition: {
      toolNamePattern: 'wms_*',
      hasError: false,
      resultContains: ['[]', '0', '空', 'empty'],
    },
    action: {
      hintTemplate: '工具 {toolName} 查询结果为空。请检查查询条件是否合理，或尝试放宽筛选范围。',
      level: 'warning',
      shouldRetry: true,
      shouldAdjustStrategy: true,
      maxRetries: 2,
      strategyHint: '放宽查询条件或使用不同的查询维度',
    },
  },

  // ==================== 通用组 ====================
  {
    id: 'generic_error',
    description: '通用错误（兜底规则）',
    priority: 99,
    condition: {
      toolNamePattern: '*',
      hasError: true,
    },
    action: {
      hintTemplate: '工具 {toolName} 执行出错：{error}。请检查输入参数并重试。',
      level: 'error',
      shouldRetry: true,
      shouldAdjustStrategy: false,
      maxRetries: 1,
    },
  },
  {
    id: 'empty_result',
    description: '工具返回空结果',
    priority: 98,
    condition: {
      toolNamePattern: '*',
      hasError: false,
      resultContains: ['[]', '{}', '""', 'null', 'empty', '空'],
    },
    action: {
      hintTemplate: '工具 {toolName} 返回了空结果。请确认查询条件是否合理，或尝试调整参数。',
      level: 'warning',
      shouldRetry: false,
      shouldAdjustStrategy: true,
      maxRetries: 0,
      strategyHint: '调整查询参数或换用其他工具',
    },
  },
  {
    id: 'json_parse_error',
    description: 'JSON 解析错误',
    priority: 15,
    condition: {
      toolNamePattern: '*',
      hasError: true,
      resultContains: ['JSON', 'json', '解析失败', 'parse error', 'Unexpected token', 'parse'],
    },
    action: {
      hintTemplate: '工具 {toolName} 返回的结果无法解析：{error}。请检查参数格式是否正确。',
      level: 'error',
      shouldRetry: true,
      shouldAdjustStrategy: false,
      maxRetries: 1,
    },
  },
];
