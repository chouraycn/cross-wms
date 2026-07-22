/**
 * Plugin SDK 常量 — 全局配置、版本、能力种类、事件名
 *
 * 与现有 ./contract.ts 的 HOST_API_VERSION 互补：
 * - contract.ts 提供契约校验相关常量
 * - 本文件提供 SDK 运行时全局常量（事件名、能力列表、默认值）
 */

import type { PluginCapabilityKind } from './types.js';

// ===================== SDK 版本 =====================

/** SDK 主版本 */
export const SDK_VERSION_MAJOR = 1;
/** SDK 次版本 */
export const SDK_VERSION_MINOR = 0;
/** SDK 修订号 */
export const SDK_VERSION_PATCH = 0;
/** 完整 SDK 版本字符串 */
export const SDK_VERSION = `${SDK_VERSION_MAJOR}.${SDK_VERSION_MINOR}.${SDK_VERSION_PATCH}`;
/** SDK 兼容范围（semver） */
export const SDK_COMPATIBLE_RANGE = `^${SDK_VERSION_MAJOR}.0.0`;

// ===================== 能力种类 =====================

/** 全部能力种类（运行时可用） */
export const ALL_CAPABILITY_KINDS: readonly PluginCapabilityKind[] = [
  'tool',
  'hook',
  'command',
  'channel',
  'provider',
  'memory-host',
  'embedding',
  'service',
  'search',
  'media',
  'skill',
];

/** 需要显式权限确认的能力 */
export const HIGH_RISK_CAPABILITIES: readonly PluginCapabilityKind[] = [
  'channel',
  'provider',
  'memory-host',
  'media',
];

// ===================== 事件名 =====================

/** 插件加载完成 */
export const EVENT_PLUGIN_LOADED = 'plugin:loaded';
/** 插件已激活 */
export const EVENT_PLUGIN_ACTIVATED = 'plugin:activated';
/** 插件已停用 */
export const EVENT_PLUGIN_DEACTIVATED = 'plugin:deactivated';
/** 插件卸载 */
export const EVENT_PLUGIN_UNINSTALLED = 'plugin:uninstalled';
/** 插件更新 */
export const EVENT_PLUGIN_UPDATED = 'plugin:updated';
/** 插件错误 */
export const EVENT_PLUGIN_ERROR = 'plugin:error';
/** 插件配置变更 */
export const EVENT_PLUGIN_CONFIG_CHANGED = 'plugin:config:changed';
/** 插件权限变更 */
export const EVENT_PLUGIN_PERMISSION_GRANTED = 'plugin:permission:granted';
export const EVENT_PLUGIN_PERMISSION_DENIED = 'plugin:permission:denied';

/** 全部事件名 */
export const ALL_PLUGIN_EVENTS: readonly string[] = [
  EVENT_PLUGIN_LOADED,
  EVENT_PLUGIN_ACTIVATED,
  EVENT_PLUGIN_DEACTIVATED,
  EVENT_PLUGIN_UNINSTALLED,
  EVENT_PLUGIN_UPDATED,
  EVENT_PLUGIN_ERROR,
  EVENT_PLUGIN_CONFIG_CHANGED,
  EVENT_PLUGIN_PERMISSION_GRANTED,
  EVENT_PLUGIN_PERMISSION_DENIED,
];

// ===================== 生命周期状态 =====================

export const LIFECYCLE_STATE_INSTALLED = 'installed';
export const LIFECYCLE_STATE_ENABLING = 'enabling';
export const LIFECYCLE_STATE_ENABLED = 'enabled';
export const LIFECYCLE_STATE_DISABLING = 'disabling';
export const LIFECYCLE_STATE_DISABLED = 'disabled';
export const LIFECYCLE_STATE_UNINSTALLING = 'uninstalling';
export const LIFECYCLE_STATE_UNINSTALLED = 'uninstalled';
export const LIFECYCLE_STATE_UPDATING = 'updating';
export const LIFECYCLE_STATE_ERROR = 'error';

/** 终态集合（不可再迁移） */
export const TERMINAL_LIFECYCLE_STATES: readonly string[] = [
  LIFECYCLE_STATE_UNINSTALLED,
];

// ===================== 默认值 =====================

/** 默认沙箱超时（毫秒） */
export const DEFAULT_SANDBOX_TIMEOUT_MS = 30_000;
/** 默认最大内存增量（字节，128MB） */
export const DEFAULT_SANDBOX_MAX_MEMORY_BYTES = 128 * 1024 * 1024;
/** 默认最大调用次数 */
export const DEFAULT_SANDBOX_MAX_INVOCATIONS = 1_000;
/** 默认最大 fetch 次数 */
export const DEFAULT_SANDBOX_MAX_FETCH_CALLS = 100;

/** 默认健康检查间隔（毫秒） */
export const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 60_000;
/** 默认错误阈值 */
export const DEFAULT_HEALTH_ERROR_THRESHOLD = 5;
/** 默认内存阈值（字节，256MB） */
export const DEFAULT_HEALTH_MEMORY_THRESHOLD_BYTES = 256 * 1024 * 1024;

/** 默认列表分页大小 */
export const DEFAULT_LIST_PAGE_SIZE = 20;
/** 最大列表分页大小 */
export const MAX_LIST_PAGE_SIZE = 200;

/** 最大插件包大小（字节，50MB） */
export const MAX_PLUGIN_PACKAGE_BYTES = 50 * 1024 * 1024;

// ===================== 安装步骤 =====================

export const INSTALL_STEP_DOWNLOAD = 'download';
export const INSTALL_STEP_EXTRACT = 'extract';
export const INSTALL_STEP_SCAN_MANIFEST = 'scan-manifest';
export const INSTALL_STEP_VALIDATE = 'validate';
export const INSTALL_STEP_SECURITY_SCAN = 'security-scan';
export const INSTALL_STEP_RESOLVE_DEPS = 'resolve-deps';
export const INSTALL_STEP_PERSIST = 'persist';
export const INSTALL_STEP_ACTIVATE = 'activate';

/** 安装步骤顺序 */
export const INSTALL_STEP_ORDER: readonly string[] = [
  INSTALL_STEP_DOWNLOAD,
  INSTALL_STEP_EXTRACT,
  INSTALL_STEP_SCAN_MANIFEST,
  INSTALL_STEP_VALIDATE,
  INSTALL_STEP_SECURITY_SCAN,
  INSTALL_STEP_RESOLVE_DEPS,
  INSTALL_STEP_PERSIST,
  INSTALL_STEP_ACTIVATE,
];

// ===================== 通道状态 =====================

export const CHANNEL_STATE_IDLE = 'idle';
export const CHANNEL_STATE_CONNECTING = 'connecting';
export const CHANNEL_STATE_CONNECTED = 'connected';
export const CHANNEL_STATE_DISCONNECTING = 'disconnecting';
export const CHANNEL_STATE_DISCONNECTED = 'disconnected';
export const CHANNEL_STATE_ERROR = 'error';

/** 通道健康检查默认超时（毫秒） */
export const CHANNEL_HEALTH_CHECK_TIMEOUT_MS = 5_000;
/** 通道消息路由默认超时（毫秒） */
export const CHANNEL_ROUTE_TIMEOUT_MS = 10_000;

// ===================== 来源标识 =====================

export const SOURCE_LOCAL = 'local';
export const SOURCE_NPM = 'npm';
export const SOURCE_GIT = 'git';
export const SOURCE_ZIP = 'zip';
export const SOURCE_BUNDLED = 'bundled';
export const SOURCE_DEV = 'dev';

/** 允许跳过安全扫描的来源 */
export const SOURCES_ALLOW_SKIP_SCAN: readonly string[] = [SOURCE_DEV, SOURCE_BUNDLED];

// ===================== 风险等级 =====================

export const RISK_LEVEL_AUTO = 'auto';
export const RISK_LEVEL_CONFIRM = 'confirm';
export const RISK_LEVEL_HIGH_RISK = 'high-risk';

/** 全部风险等级 */
export const ALL_RISK_LEVELS: readonly string[] = [
  RISK_LEVEL_AUTO,
  RISK_LEVEL_CONFIRM,
  RISK_LEVEL_HIGH_RISK,
];
