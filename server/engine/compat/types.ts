/**
 * 兼容层类型定义
 *
 * 定义旧名称到新名称的映射类型，
 * 支持项目演进过程中的向后兼容。
 */

export type LegacyNameMapping = {
  /** 旧名称 */
  oldName: string;
  /** 新名称 */
  newName: string;
  /** 弃用版本（可选） */
  deprecatedSince?: string;
  /** 移除版本（可选） */
  removedIn?: string;
  /** 替换说明 */
  replacement?: string;
  /** 类别 */
  category?: 'config' | 'api' | 'event' | 'command' | 'file' | 'package';
};

export type CompatWarning = {
  /** 旧名称 */
  oldName: string;
  /** 新名称 */
  newName: string;
  /** 警告信息 */
  message: string;
  /** 调用栈（可选） */
  stack?: string;
  /** 时间戳 */
  timestamp: Date;
};

export type CompatOptions = {
  /** 是否发出警告 */
  warnOnLegacy?: boolean;
  /** 是否记录使用情况 */
  trackUsage?: boolean;
  /** 最大警告数 */
  maxWarnings?: number;
};

export const PROJECT_NAME = 'crosswms' as const;

export const LEGACY_PROJECT_NAMES = ['cdf-know', 'cdfknow', 'clawdbot'] as const;

export const MANIFEST_KEY = PROJECT_NAME;

export const LEGACY_MANIFEST_KEYS = LEGACY_PROJECT_NAMES;

export const MACOS_APP_SOURCES_DIR = 'apps/macos/Sources/CrossWMS' as const;
