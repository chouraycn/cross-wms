/**
 * 配置重载系统 — 参考 OpenClaw gateway/config-reload.ts
 *
 * 支持热重载配置：
 * - 监听配置文件变化
 * - 验证新配置有效性
 * - 平滑过渡到新配置
 * - 回滚失败配置
 * - 配置差异对比
 */

import fs from 'fs';
import { logger } from '../logger.js';
import { publishEvent } from './events.js';

export type ConfigReloadStatus = 'idle' | 'pending' | 'validating' | 'applying' | 'completed' | 'failed';

export interface ConfigDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

export interface ConfigReloadResult {
  success: boolean;
  status: ConfigReloadStatus;
  diff?: ConfigDiff;
  error?: string;
  appliedAt?: number;
}

export interface ConfigValidator {
  validate(config: Record<string, unknown>): string | null;
  name: string;
}

const VALIDATORS: ConfigValidator[] = [];

let currentConfig: Record<string, unknown> = {};
let reloadStatus: ConfigReloadStatus = 'idle';
let configFilePath: string | undefined;
let watcher: fs.FSWatcher | undefined;

function calculateConfigDiff(oldConfig: Record<string, unknown>, newConfig: Record<string, unknown>): ConfigDiff {
  const oldKeys = new Set(Object.keys(oldConfig));
  const newKeys = new Set(Object.keys(newConfig));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const key of newKeys) {
    if (!oldKeys.has(key)) {
      added.push(key);
    } else {
      const oldValue = JSON.stringify(oldConfig[key]);
      const newValue = JSON.stringify(newConfig[key]);
      if (oldValue !== newValue) {
        changed.push(key);
      }
    }
  }

  for (const key of oldKeys) {
    if (!newKeys.has(key)) {
      removed.push(key);
    }
  }

  return { added, removed, changed };
}

function validateConfig(config: Record<string, unknown>): string | null {
  for (const validator of VALIDATORS) {
    const error = validator.validate(config);
    if (error) {
      return `${validator.name}: ${error}`;
    }
  }
  return null;
}

function loadConfigFile(filePath: string): Record<string, unknown> | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch (err) {
    logger.error(`[ConfigReload] 加载配置文件失败: ${filePath}`, err);
    return null;
  }
}

export function registerConfigValidator(validator: ConfigValidator): void {
  const index = VALIDATORS.findIndex((v) => v.name === validator.name);
  if (index >= 0) {
    VALIDATORS[index] = validator;
  } else {
    VALIDATORS.push(validator);
  }
  logger.debug(`[ConfigReload] 注册配置验证器: ${validator.name}`);
}

export function getCurrentConfig(): Record<string, unknown> {
  return { ...currentConfig };
}

export function setCurrentConfig(config: Record<string, unknown>): void {
  currentConfig = config;
  logger.debug('[ConfigReload] 设置当前配置');
}

export async function reloadConfig(newConfig?: Record<string, unknown>): Promise<ConfigReloadResult> {
  reloadStatus = 'pending';

  try {
    const configToApply = newConfig ?? (configFilePath ? loadConfigFile(configFilePath) : null);

    if (!configToApply) {
      reloadStatus = 'failed';
      return {
        success: false,
        status: 'failed',
        error: '无法获取新配置',
      };
    }

    reloadStatus = 'validating';

    const validationError = validateConfig(configToApply);
    if (validationError) {
      reloadStatus = 'failed';
      logger.error(`[ConfigReload] 配置验证失败: ${validationError}`);
      return {
        success: false,
        status: 'failed',
        error: validationError,
      };
    }

    reloadStatus = 'applying';

    const diff = calculateConfigDiff(currentConfig, configToApply);
    const oldConfig = { ...currentConfig };

    try {
      currentConfig = configToApply;

      await publishEvent('system:config_changed', {
        diff,
        oldConfig,
        newConfig: configToApply,
      }, {
        level: 'info',
        message: `配置已重载: 添加 ${diff.added.length} 项, 删除 ${diff.removed.length} 项, 修改 ${diff.changed.length} 项`,
      });

      reloadStatus = 'completed';
      logger.info(`[ConfigReload] 配置重载成功`);

      return {
        success: true,
        status: 'completed',
        diff,
        appliedAt: Date.now(),
      };
    } catch (err) {
      currentConfig = oldConfig;
      reloadStatus = 'failed';
      const error = err instanceof Error ? err.message : String(err);
      logger.error(`[ConfigReload] 应用配置失败，已回滚: ${error}`);
      return {
        success: false,
        status: 'failed',
        error,
      };
    }
  } catch (err) {
    reloadStatus = 'failed';
    const error = err instanceof Error ? err.message : String(err);
    logger.error(`[ConfigReload] 配置重载失败: ${error}`);
    return {
      success: false,
      status: 'failed',
      error,
    };
  }
}

export function startConfigWatcher(filePath: string): void {
  configFilePath = filePath;

  if (watcher) {
    watcher.close();
  }

  watcher = fs.watch(filePath, { persistent: true }, async (eventType) => {
    if (eventType !== 'change') return;

    logger.info(`[ConfigReload] 检测到配置文件变化: ${filePath}`);

    await reloadConfig();
  });

  logger.info(`[ConfigReload] 配置文件监听已启动: ${filePath}`);
}

export function stopConfigWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = undefined;
  }
  configFilePath = undefined;
  logger.info('[ConfigReload] 配置文件监听已停止');
}

export function getConfigReloadStatus(): ConfigReloadStatus {
  return reloadStatus;
}