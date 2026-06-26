/**
 * 配置热重载服务
 *
 * 功能：
 * 1. 监听配置文件变化（JSON、YAML、ENV）
 * 2. 自动解析并验证配置
 * 3. 增量更新内存中的配置
 * 4. 通过 SSE 通知前端配置已更新
 * 5. 支持回滚机制
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import chokidar, { FSWatcher } from 'chokidar';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

/** 配置变更事件 */
export interface ConfigChangeEvent {
  type: 'added' | 'changed' | 'removed' | 'error';
  file: string;
  key?: string;
  previousValue?: unknown;
  currentValue?: unknown;
  timestamp: number;
  error?: string;
}

/** 配置条目 */
export interface ConfigEntry<T = unknown> {
  key: string;
  value: T;
  source: string;
  lastModified: number;
  version: number;
}

/** 配置快照（用于回滚） */
interface ConfigSnapshot {
  timestamp: number;
  entries: Map<string, ConfigEntry>;
}

/** 配置验证器 */
export type ConfigValidator<T> = (value: unknown) => { valid: boolean; error?: string; parsed?: T };

/** 配置解析器 */
export type ConfigParser = (content: string) => Record<string, unknown>;

// ===================== 默认解析器 =====================

const parsers: Record<string, ConfigParser> = {
  '.json': (content: string) => JSON.parse(content),
  '.yaml': (content: string) => {
    // 简单的 YAML 解析（支持基本结构）
    const result: Record<string, unknown> = {};
    const lines = content.split('\n');
    let currentSection: Record<string, unknown> = result;
    const sectionStack: { key: string; parent: Record<string, unknown> }[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) continue;

      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1].length : 0;

      // 调整缩进层级
      while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].key.length >= indent) {
        sectionStack.pop();
        currentSection = result;
        for (const s of sectionStack) {
          currentSection = currentSection[s.key] as Record<string, unknown>;
        }
      }

      // 键值对
      const kvMatch = trimmed.match(/^([^:]+):\s*(.*)$/);
      if (kvMatch) {
        const key = kvMatch[1].trim();
        let value: unknown = kvMatch[2].trim();

        // 移除引号
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        // 布尔值
        if (value === 'true') value = true;
        if (value === 'false') value = false;
        if (value === 'null' || value === '~') value = null;

        // 数字
        if (/^\d+$/.test(value as string)) value = parseInt(value as string, 10);
        if (/^\d+\.\d+$/.test(value as string)) value = parseFloat(value as string);

        currentSection[key] = value;

        // 如果值是空的，后续行可能是子项
        if (!kvMatch[2].trim()) {
          sectionStack.push({ key, parent: currentSection });
          currentSection = currentSection[key] as Record<string, unknown>;
        }
      }
    }

    return result;
  },
  '.env': (content: string) => {
    const result: Record<string, string> = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();

        // 移除引号
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        result[key] = value;
      }
    }

    return result;
  },
  '.ini': (content: string) => {
    const result: Record<string, Record<string, string>> = {};
    let currentSection = '';
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) continue;

      const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1];
        result[currentSection] = {};
        continue;
      }

      const kvMatch = trimmed.match(/^([^=]+)=(.*)$/);
      if (kvMatch && currentSection) {
        result[currentSection][kvMatch[1].trim()] = kvMatch[2].trim();
      }
    }

    return result;
  },
};

// ===================== 配置热重载服务 =====================

export class ConfigHotReload extends EventEmitter {
  private configDir: string;
  private entries: Map<string, ConfigEntry> = new Map();
  private watchers: Map<string, FSWatcher> = new Map();
  private snapshots: ConfigSnapshot[] = [];
  private maxSnapshots = 10;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private debounceMs = 300;
  private sseClients: Set<{
    write: (data: string) => void;
    destroy: () => void;
  }> = new Set();
  private validators: Map<string, ConfigValidator<unknown>> = new Map();

  constructor(configDir?: string) {
    super();
    this.configDir = configDir || path.join(os.homedir(), '.cdf-know-clow');
  }

  /**
   * 注册配置验证器
   */
  registerValidator<T>(pattern: string, validator: ConfigValidator<T>): void {
    this.validators.set(pattern, validator as ConfigValidator<unknown>);
    logger.info(`[ConfigHotReload] Registered validator for: ${pattern}`);
  }

  /**
   * 注册自定义解析器
   */
  registerParser(extension: string, parser: ConfigParser): void {
    parsers[extension] = parser;
    logger.info(`[ConfigHotReload] Registered parser for: ${extension}`);
  }

  /**
   * 添加要监听的配置文件
   */
  addConfigFile(filePath: string, options?: {
    key?: string;
    validate?: boolean;
  }): void {
    const key = options?.key || path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath).toLowerCase();

    if (!parsers[ext]) {
      logger.warn(`[ConfigHotReload] No parser for extension: ${ext}`);
      return;
    }

    // 检查是否已监听
    if (this.watchers.has(filePath)) {
      logger.info(`[ConfigHotReload] Already watching: ${filePath}`);
      return;
    }

    // 创建 watcher
    const watcher = chokidar.watch(filePath, {
      persistent: true,
      ignoreInitial: false,
    });

    watcher
      .on('add', () => this.handleFileChange(filePath, key, 'added'))
      .on('change', () => this.handleFileChange(filePath, key, 'changed'))
      .on('unlink', () => this.handleFileRemove(filePath, key))
      .on('error', (error) => {
        logger.error(`[ConfigHotReload] Watcher error for ${filePath}:`, error);
        this.emitEvent({
          type: 'error',
          file: filePath,
          error: error.message,
          timestamp: Date.now(),
        });
      });

    this.watchers.set(filePath, watcher);
    logger.info(`[ConfigHotReload] Now watching: ${filePath}`);
  }

  /**
   * 移除监听的配置文件
   */
  removeConfigFile(filePath: string): void {
    const watcher = this.watchers.get(filePath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(filePath);
      logger.info(`[ConfigHotReload] Stopped watching: ${filePath}`);
    }
  }

  /**
   * 处理文件变化
   */
  private handleFileChange(filePath: string, key: string, changeType: 'added' | 'changed'): void {
    // 防抖
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(filePath);

      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const ext = path.extname(filePath).toLowerCase();
        const parser = parsers[ext];

        if (!parser) {
          throw new Error(`No parser for: ${ext}`);
        }

        const parsed = parser(content);
        const previousEntry = this.entries.get(key);

        // 验证
        let validated = parsed;
        const validator = this.validators.get(key);
        if (validator && changeType === 'changed') {
          const result = validator(parsed);
          if (!result.valid) {
            logger.warn(`[ConfigHotReload] Validation failed for ${key}:`, result.error);
            this.emitEvent({
              type: 'error',
              file: filePath,
              key,
              error: result.error,
              timestamp: Date.now(),
            });
            return;
          }
          validated = result.parsed || parsed;
        }

        // 保存快照（如果是变化）
        if (changeType === 'changed' && previousEntry) {
          this.saveSnapshot();
        }

        // 更新内存中的配置
        const entry: ConfigEntry = {
          key,
          value: validated,
          source: filePath,
          lastModified: Date.now(),
          version: (previousEntry?.version || 0) + 1,
        };

        this.entries.set(key, entry);

        logger.info(`[ConfigHotReload] Config ${changeType}: ${key}`);

        this.emitEvent({
          type: changeType,
          file: filePath,
          key,
          previousValue: previousEntry?.value,
          currentValue: entry.value,
          timestamp: Date.now(),
        });

      } catch (error) {
        logger.error(`[ConfigHotReload] Failed to read ${filePath}:`, error);
        this.emitEvent({
          type: 'error',
          file: filePath,
          key,
          error: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        });
      }
    }, this.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * 处理文件删除
   */
  private handleFileRemove(filePath: string, key: string): void {
    const previousEntry = this.entries.get(key);

    // 保存快照
    if (previousEntry) {
      this.saveSnapshot();
    }

    this.entries.delete(key);

    logger.info(`[ConfigHotReload] Config removed: ${key}`);

    this.emitEvent({
      type: 'removed',
      file: filePath,
      key,
      previousValue: previousEntry?.value,
      timestamp: Date.now(),
    });
  }

  /**
   * 保存配置快照（用于回滚）
   */
  private saveSnapshot(): void {
    const snapshot: ConfigSnapshot = {
      timestamp: Date.now(),
      entries: new Map(this.entries),
    };

    this.snapshots.push(snapshot);

    // 限制快照数量
    while (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    logger.debug(`[ConfigHotReload] Saved snapshot, total: ${this.snapshots.length}`);
  }

  /**
   * 回滚到上一个快照
   */
  rollback(): boolean {
    if (this.snapshots.length === 0) {
      logger.warn('[ConfigHotReload] No snapshots to rollback');
      return false;
    }

    const snapshot = this.snapshots.pop()!;
    this.entries = new Map(snapshot.entries);

    logger.info(`[ConfigHotReload] Rolled back to ${new Date(snapshot.timestamp).toISOString()}`);

    this.emitEvent({
      type: 'changed',
      file: 'rollback',
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * 获取配置值
   */
  get<T = unknown>(key: string): T | undefined {
    return this.entries.get(key)?.value as T | undefined;
  }

  /**
   * 获取所有配置
   */
  getAll(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of this.entries) {
      result[key] = entry.value;
    }
    return result;
  }

  /**
   * 获取配置条目详情
   */
  getEntry(key: string): ConfigEntry | undefined {
    return this.entries.get(key);
  }

  /**
   * 获取所有条目
   */
  getAllEntries(): ConfigEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * 检查配置是否存在
   */
  has(key: string): boolean {
    return this.entries.has(key);
  }

  /**
   * 注册 SSE 客户端
   */
  addSSEClient(client: { write: (data: string) => void; destroy: () => void }): () => void {
    this.sseClients.add(client);

    // 发送当前状态
    const entries = this.getAllEntries();
    for (const entry of entries) {
      this.emitToClient(client, {
        type: 'changed' as const,
        file: entry.source,
        key: entry.key,
        currentValue: entry.value,
        timestamp: Date.now(),
      });
    }

    return () => {
      this.sseClients.delete(client);
    };
  }

  /**
   * 发送事件给 SSE 客户端
   */
  private emitEvent(event: ConfigChangeEvent): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(data);
      } catch {
        this.sseClients.delete(client);
      }
    }

    // 同时触发事件
    this.emit('change', event);
  }

  /**
   * 发送数据给单个客户端
   */
  private emitToClient(client: { write: (data: string) => void }, data: unknown): void {
    try {
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      this.sseClients.delete(client as typeof client & { destroy?: () => void });
    }
  }

  /**
   * 启动服务
   */
  start(configFiles?: string[]): void {
    if (configFiles) {
      for (const file of configFiles) {
        this.addConfigFile(file);
      }
    }
    logger.info(`[ConfigHotReload] Started, watching: ${this.configDir}`);
  }

  /**
   * 停止服务
   */
  stop(): void {
    // 关闭所有 watcher
    for (const [file, watcher] of this.watchers) {
      watcher.close();
      logger.info(`[ConfigHotReload] Stopped watching: ${file}`);
    }
    this.watchers.clear();

    // 清除所有定时器
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    this.sseClients.clear();

    logger.info('[ConfigHotReload] Stopped');
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    this.stop();
    this.removeAllListeners();
    this.entries.clear();
    this.snapshots = [];
    this.validators.clear();
    logger.info('[ConfigHotReload] Destroyed');
  }
}

// ===================== 便捷函数 =====================

/**
 * 创建带类型的配置验证器
 */
export function createValidator<T>(
  schema: Record<string, (v: unknown) => boolean>
): ConfigValidator<T> {
  return (value: unknown) => {
    if (typeof value !== 'object' || value === null) {
      return { valid: false, error: 'Expected object' };
    }

    const obj = value as Record<string, unknown>;
    for (const [key, check] of Object.entries(schema)) {
      if (!check(obj[key])) {
        return { valid: false, error: `Invalid value for key: ${key}` };
      }
    }

    return { valid: true, parsed: value as T };
  };
}

// ===================== 单例导出 =====================

export const configHotReload = new ConfigHotReload();
