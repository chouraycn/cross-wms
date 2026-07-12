/**
 * Tool Timeout Config — 工具超时配置
 *
 * 不同工具支持不同的超时时间：
 * 1. 工具类型默认超时
 * 2. 工具名称自定义超时
 * 3. MCP Server 级别超时
 * 4. 动态调整（基于历史执行时间）
 *
 * v11.1: 新增工具超时配置
 */

import { logger } from '../logger.js';
import { toolExecutionStats } from './toolExecutionStats.js';

// ===================== 类型定义 =====================

export interface TimeoutConfig {
  /** 默认超时（毫秒） */
  default: number;
  /** 工具类型默认超时 */
  byType: Record<string, number>;
  /** 特定工具超时 */
  byName: Record<string, number>;
  /** MCP Server 超时 */
  mcpServers: Record<string, number>;
  /** 是否启用动态调整 */
  dynamicAdjustment: boolean;
  /** 动态调整系数（P99 * factor） */
  dynamicFactor: number;
}

// ===================== 默认配置 =====================

const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  default: 60000, // 60 秒
  byType: {
    // 快速工具
    'utility': 10000, // 10 秒
    'query': 30000, // 30 秒
    
    // 慢速工具
    'search': 90000, // 90 秒
    'generation': 120000, // 2 分钟
    'analysis': 120000, // 2 分钟
    
    // 文件操作
    'file': 60000, // 60 秒
    'file_read': 30000, // 30 秒
    'file_write': 60000, // 60 秒
    
    // 网络工具
    'network': 90000, // 90 秒
    'http': 90000, // 90 秒
    
    // Shell 命令
    'shell': 120000, // 2 分钟
    'bash': 120000, // 2 分钟
    
    // MCP 工具
    'mcp': 90000, // 90 秒
  },
  byName: {
    // 特定工具的自定义超时
    'execute_bash': 180000, // 3 分钟
    'search_web': 90000, // 90 秒
    'file_generateFile': 300000, // 5 分钟
    'mcp__playwright__navigate': 120000, // 2 分钟
    'mcp__puppeteer__screenshot': 60000, // 60 秒
  },
  mcpServers: {
    // MCP Server 级别超时
    'filesystem': 60000,
    'playwright': 120000,
    'puppeteer': 120000,
    'brave-search': 90000,
  },
  dynamicAdjustment: true,
  dynamicFactor: 1.5,
};

// ===================== 工具类型映射 =====================

const TOOL_TYPE_MAP: Record<string, string> = {
  'execute_bash': 'bash',
  'execute_command': 'bash',
  'search_web': 'search',
  'search_local': 'search',
  'file_readFile': 'file_read',
  'file_writeFile': 'file_write',
  'file_generateFile': 'generation',
  'file_listFiles': 'utility',
};

// ===================== 校验常量 =====================

const MIN_TIMEOUT_MS = 1000; // 最小超时 1 秒
const MAX_TIMEOUT_MS = 600_000; // 最大超时 10 分钟
const MIN_DYNAMIC_FACTOR = 1.0;
const MAX_DYNAMIC_FACTOR = 5.0;

/**
 * 校验单个 timeoutMs 值是否合法
 * 返回 true 表示合法，false 表示非法（会 log warn）
 */
function isValidTimeout(value: unknown, field: string): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    logger.warn(`[ToolTimeoutConfig] Invalid ${field}: must be a finite number, got=${value}`);
    return false;
  }
  if (value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) {
    logger.warn(`[ToolTimeoutConfig] Invalid ${field}: must be in [${MIN_TIMEOUT_MS}, ${MAX_TIMEOUT_MS}], got=${value}`);
    return false;
  }
  return true;
}

/**
 * 校验 byType / byName / mcpServers 的所有 timeout 值
 * 过滤掉非法值，只保留合法的
 */
function sanitizeTimeoutMap(map: Record<string, number>, field: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(map || {})) {
    if (isValidTimeout(value, `${field}.${key}`)) {
      result[key] = value;
    }
  }
  return result;
}

// ===================== 状态 =====================

class ToolTimeoutConfigManager {
  private config: TimeoutConfig = DEFAULT_TIMEOUT_CONFIG;

  /**
   * 更新配置（P0-1: 增加输入校验，拒绝非法值）
   */
  updateConfig(config: Partial<TimeoutConfig>): void {
    const sanitized: Partial<TimeoutConfig> = {};

    if (config.default !== undefined) {
      if (isValidTimeout(config.default, 'default')) {
        sanitized.default = config.default;
      }
    }
    if (config.dynamicFactor !== undefined) {
      if (typeof config.dynamicFactor === 'number' &&
          config.dynamicFactor >= MIN_DYNAMIC_FACTOR &&
          config.dynamicFactor <= MAX_DYNAMIC_FACTOR) {
        sanitized.dynamicFactor = config.dynamicFactor;
      } else {
        logger.warn(`[ToolTimeoutConfig] Invalid dynamicFactor: must be in [${MIN_DYNAMIC_FACTOR}, ${MAX_DYNAMIC_FACTOR}], got=${config.dynamicFactor}`);
      }
    }
    if (config.dynamicAdjustment !== undefined) {
      sanitized.dynamicAdjustment = !!config.dynamicAdjustment;
    }
    if (config.byType !== undefined && typeof config.byType === 'object') {
      sanitized.byType = sanitizeTimeoutMap(config.byType, 'byType');
    }
    if (config.byName !== undefined && typeof config.byName === 'object') {
      sanitized.byName = sanitizeTimeoutMap(config.byName, 'byName');
    }
    if (config.mcpServers !== undefined && typeof config.mcpServers === 'object') {
      sanitized.mcpServers = sanitizeTimeoutMap(config.mcpServers, 'mcpServers');
    }

    this.config = { ...this.config, ...sanitized };
    logger.debug(`[ToolTimeoutConfig] Config updated: default=${this.config.default}ms`);
  }

  /**
   * 设置工具超时（P0-1: 增加校验）
   */
  setToolTimeout(toolName: string, timeoutMs: number): void {
    if (!isValidTimeout(timeoutMs, `byName.${toolName}`)) {
      return;
    }
    this.config.byName[toolName] = timeoutMs;
    logger.debug(`[ToolTimeoutConfig] Set timeout for ${toolName}: ${timeoutMs}ms`);
  }

  /**
   * 设置 MCP Server 超时（P0-1: 增加校验）
   */
  setMcpServerTimeout(serverName: string, timeoutMs: number): void {
    if (!isValidTimeout(timeoutMs, `mcpServers.${serverName}`)) {
      return;
    }
    this.config.mcpServers[serverName] = timeoutMs;
    logger.debug(`[ToolTimeoutConfig] Set timeout for MCP server ${serverName}: ${timeoutMs}ms`);
  }

  /**
   * 获取工具超时时间
   */
  getTimeout(toolName: string): number {
    // 1. 检查特定工具配置
    if (this.config.byName[toolName]) {
      return this.config.byName[toolName];
    }

    // 2. 检查 MCP Server 配置
    if (toolName.startsWith('mcp__')) {
      const parts = toolName.split('__');
      if (parts.length >= 2) {
        const serverName = parts[1];
        if (this.config.mcpServers[serverName]) {
          return this.config.mcpServers[serverName];
        }
      }
      // MCP 默认超时
      return this.config.byType['mcp'] || this.config.default;
    }

    // 3. 检查工具类型配置
    const toolType = TOOL_TYPE_MAP[toolName] || this.inferToolType(toolName);
    if (this.config.byType[toolType]) {
      // 4. 动态调整（基于历史数据）
      if (this.config.dynamicAdjustment) {
        const dynamicTimeout = this.getDynamicTimeout(toolName);
        if (dynamicTimeout > 0) {
          return Math.max(this.config.byType[toolType], dynamicTimeout);
        }
      }
      return this.config.byType[toolType];
    }

    // 5. 动态调整
    if (this.config.dynamicAdjustment) {
      const dynamicTimeout = this.getDynamicTimeout(toolName);
      if (dynamicTimeout > 0) {
        return Math.max(this.config.default, dynamicTimeout);
      }
    }

    // 6. 默认超时
    return this.config.default;
  }

  /**
   * 推断工具类型
   */
  private inferToolType(toolName: string): string {
    if (toolName.includes('search') || toolName.includes('query')) {
      return 'search';
    }
    if (toolName.includes('file') || toolName.includes('read') || toolName.includes('write')) {
      return 'file';
    }
    if (toolName.includes('http') || toolName.includes('fetch') || toolName.includes('request')) {
      return 'http';
    }
    if (toolName.includes('bash') || toolName.includes('shell') || toolName.includes('execute')) {
      return 'bash';
    }
    if (toolName.includes('generate') || toolName.includes('create')) {
      return 'generation';
    }
    return 'utility';
  }

  /**
   * 获取动态超时（基于历史执行时间）
   */
  private getDynamicTimeout(toolName: string): number {
    const stats = toolExecutionStats.getStats(toolName);
    if (!stats || stats.totalCalls < 3) {
      return 0;
    }

    // 使用 P99 作为基准，乘以系数
    const dynamicTimeout = Math.round(stats.p99DurationMs * this.config.dynamicFactor);
    
    // 设置上下限
    const minTimeout = 10000; // 10 秒
    const maxTimeout = 300000; // 5 分钟
    
    return Math.max(minTimeout, Math.min(maxTimeout, dynamicTimeout));
  }

  /**
   * 获取所有配置
   */
  getConfig(): TimeoutConfig {
    return { ...this.config };
  }

  /**
   * 获取工具超时配置报告
   */
  generateReport(): string {
    const lines: string[] = [
      '# Tool Timeout Configuration Report',
      '',
      `Generated at: ${new Date().toISOString()}`,
      '',
      '## Default Timeout',
      `- ${this.config.default}ms (${this.config.default / 1000}s)`,
      '',
      '## By Type',
    ];

    for (const [type, timeout] of Object.entries(this.config.byType)) {
      lines.push(`- ${type}: ${timeout}ms (${timeout / 1000}s)`);
    }

    lines.push('', '## By Tool Name');
    for (const [name, timeout] of Object.entries(this.config.byName)) {
      lines.push(`- ${name}: ${timeout}ms (${timeout / 1000}s)`);
    }

    lines.push('', '## MCP Servers');
    for (const [server, timeout] of Object.entries(this.config.mcpServers)) {
      lines.push(`- ${server}: ${timeout}ms (${timeout / 1000}s)`);
    }

    return lines.join('\n');
  }
}

// ===================== 导出 =====================

export const toolTimeoutConfig = new ToolTimeoutConfigManager();

/**
 * 获取工具超时时间
 */
export function getToolTimeout(toolName: string): number {
  return toolTimeoutConfig.getTimeout(toolName);
}