/**
 * Plugin (插件) 类型定义
 *
 * 集中管理插件相关类型，便于复用。
 * - 插件清单（Manifest）类型从 shared/pluginManifest.ts re-export
 * - 运行时插件信息（PluginInfo 等）从 src/services/plugins/api.ts 提取
 *
 * src/services/plugins/api.ts 通过 re-export 保持向后兼容。
 */

// 插件清单（Manifest）相关类型，与后端共用
export type {
  PluginManifest,
  PluginToolDefinition,
  PluginTrigger,
} from '../../shared/pluginManifest';

/** 插件运行时状态 */
export type PluginStatus = 'installed' | 'enabled' | 'disabled' | 'error';

/** 插件信息（对应后端 PluginRow） */
export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  status: PluginStatus;
  enabled: number;
  installedPath: string;
  installedAt: string;
  updatedAt: string;
  manifestJson?: string;
  errorMessage?: string;
}

/** 插件健康状态 */
export interface PluginHealth {
  loaded: number;
  active: number;
  errors: string[];
}

/** 插件配置 Schema 字段 */
export interface PluginConfigSchemaField {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  label?: string;
  description?: string;
  default?: unknown;
  required?: boolean;
  enum?: unknown[];
  properties?: PluginConfigSchemaField[];
}

/** 插件配置 Schema */
export interface PluginConfigSchema {
  version?: string;
  fields: PluginConfigSchemaField[];
}

// ===================== 语义化别名 =====================

/** 插件条目别名（指向运行时 PluginInfo） */
export type Plugin = PluginInfo;
