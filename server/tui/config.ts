/**
 * TUI 配置加载器
 *
 * 配置文件位置（按优先级）：
 * 1. 环境变量 CDF_TUI_CONFIG 指定的路径
 * 2. ./tui.json（当前工作目录）
 * 3. ~/.cdf-know-clow/tui.json（用户主目录）
 *
 * 配置项：
 * - backend: 'embedded' | 'http'
 * - http: { baseUrl, timeoutMs, headers, userId }
 * - model: 默认模型 ID
 * - theme: 'dark' | 'light' | 'auto'
 * - toolProfile: 'minimal' | 'coding' | 'messaging' | 'full'
 * - compaction: { enabled, strategy, thresholdRatio, preserveRecent }
 * - agentId: 默认 Agent ID
 * - sessionId: 默认会话 ID
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { logger } from '../logger.js';
import type { ToolProfile, CompactionStrategy } from '../types/aiEngine.js';

export interface TuiConfig {
  /** 后端类型：embedded（本地直连 DAO）/ http（远程服务） */
  backend: 'embedded' | 'http';
  /** HTTP 后端配置 */
  http?: {
    baseUrl: string;
    timeoutMs?: number;
    headers?: Record<string, string>;
    userId?: string;
  };
  /** 默认模型 ID */
  model?: string;
  /** 默认 Agent ID */
  agentId?: string;
  /** 默认会话 ID（用于恢复上次会话） */
  sessionId?: string;
  /** 主题：dark / light / auto */
  theme: 'dark' | 'light' | 'auto';
  /** 工具集 Profile */
  toolProfile: ToolProfile;
  /** 上下文压缩配置 */
  compaction: {
    enabled: boolean;
    strategy: CompactionStrategy;
    thresholdRatio: number;
    preserveRecent: number;
  };
  /** 历史命令条数 */
  historySize: number;
  /** 详细日志 */
  verbose: boolean;
}

export const DEFAULT_TUI_CONFIG: TuiConfig = {
  backend: 'embedded',
  theme: 'auto',
  toolProfile: 'full',
  compaction: {
    enabled: true,
    strategy: 'semantic',
    thresholdRatio: 0.75,
    preserveRecent: 6,
  },
  historySize: 100,
  verbose: false,
};

/**
 * 获取默认配置文件路径
 */
export function getDefaultConfigPath(): string {
  return join(homedir(), '.cdf-know-clow', 'tui.json');
}

/**
 * 加载 TUI 配置
 *
 * @param overridePath 可选的自定义配置文件路径
 * @returns 合并后的配置
 */
export function loadTuiConfig(overridePath?: string): TuiConfig {
  const envPath = process.env.CDF_TUI_CONFIG;
  const candidates = [
    overridePath,
    envPath,
    join(process.cwd(), 'tui.json'),
    getDefaultConfigPath(),
  ].filter(Boolean) as string[];

  let raw: Partial<TuiConfig> = {};
  for (const path of candidates) {
    if (existsSync(path)) {
      try {
        const text = readFileSync(path, 'utf-8');
        const parsed = JSON.parse(text) as Partial<TuiConfig>;
        raw = deepMerge(raw, parsed);
        logger.debug(`[TUI Config] 已加载配置: ${path}`);
        break;
      } catch (err) {
        logger.warn(`[TUI Config] 解析 ${path} 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 环境变量覆盖
  if (process.env.CDF_TUI_BACKEND) {
    raw.backend = process.env.CDF_TUI_BACKEND as TuiConfig['backend'];
  }
  if (process.env.CDF_TUI_BASE_URL) {
    raw.http = { ...(raw.http ?? { baseUrl: '' }), baseUrl: process.env.CDF_TUI_BASE_URL };
  }
  if (process.env.CDF_TUI_THEME) {
    raw.theme = process.env.CDF_TUI_THEME as TuiConfig['theme'];
  }
  if (process.env.CDF_TUI_MODEL) {
    raw.model = process.env.CDF_TUI_MODEL;
  }
  if (process.env.CDF_TUI_AGENT) {
    raw.agentId = process.env.CDF_TUI_AGENT;
  }
  if (process.env.CDF_TUI_TOOL_PROFILE) {
    raw.toolProfile = process.env.CDF_TUI_TOOL_PROFILE as ToolProfile;
  }
  if (process.env.OPENCLAW_THEME) {
    raw.theme = process.env.OPENCLAW_THEME as TuiConfig['theme'];
  }

  return mergeWithDefaults(raw);
}

/**
 * 深度合并配置
 */
function deepMerge<T extends Record<string, any>>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = (base as any)[key];
    const overVal = (override as any)[key];
    if (
      baseVal && overVal &&
      typeof baseVal === 'object' && typeof overVal === 'object' &&
      !Array.isArray(baseVal) && !Array.isArray(overVal)
    ) {
      (result as any)[key] = deepMerge(baseVal, overVal);
    } else if (overVal !== undefined) {
      (result as any)[key] = overVal;
    }
  }
  return result;
}

/**
 * 与默认值合并
 */
export function mergeWithDefaults(raw: Partial<TuiConfig>): TuiConfig {
  return deepMerge(DEFAULT_TUI_CONFIG, raw);
}

/**
 * 保存 TUI 配置到默认路径
 */
export function saveTuiConfig(config: TuiConfig, path?: string): string {
  const target = path ?? getDefaultConfigPath();
  const dir = dirname(target);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(target, JSON.stringify(config, null, 2), 'utf-8');
  return target;
}

/**
 * 验证配置合法性
 */
export function validateTuiConfig(config: TuiConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!['embedded', 'http'].includes(config.backend)) {
    errors.push(`backend 必须是 'embedded' 或 'http'，当前: ${config.backend}`);
  }

  if (config.backend === 'http' && !config.http?.baseUrl) {
    errors.push('backend 为 http 时必须配置 http.baseUrl');
  }

  if (config.http?.baseUrl) {
    try {
      new URL(config.http.baseUrl);
    } catch {
      errors.push(`http.baseUrl 格式不合法: ${config.http.baseUrl}`);
    }
  }

  if (!['dark', 'light', 'auto'].includes(config.theme)) {
    errors.push(`theme 必须是 'dark'/'light'/'auto'，当前: ${config.theme}`);
  }

  if (!['minimal', 'coding', 'messaging', 'full'].includes(config.toolProfile)) {
    errors.push(`toolProfile 必须是 'minimal'/'coding'/'messaging'/'full'，当前: ${config.toolProfile}`);
  }

  if (!['semantic', 'extractive', 'truncation'].includes(config.compaction.strategy)) {
    errors.push(`compaction.strategy 必须是 'semantic'/'extractive'/'truncation'，当前: ${config.compaction.strategy}`);
  }

  if (config.compaction.thresholdRatio < 0 || config.compaction.thresholdRatio > 1) {
    errors.push(`compaction.thresholdRatio 必须在 [0, 1] 范围内，当前: ${config.compaction.thresholdRatio}`);
  }

  if (config.compaction.preserveRecent < 0 || config.compaction.preserveRecent > 100) {
    errors.push(`compaction.preserveRecent 必须在 [0, 100] 范围内，当前: ${config.compaction.preserveRecent}`);
  }

  return { valid: errors.length === 0, errors };
}
