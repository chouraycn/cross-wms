/**
 * Plugin Manifest Schema — 插件清单类型定义与校验
 *
 * v3.0: 定义 plugin.json 的 Zod schema，用于插件安装时的校验。
 * 该文件位于 shared/ 目录，供 server 端和未来的工具链共用。
 */

import { z } from 'zod';

/** 插件工具参数定义 Schema */
export const PluginToolParameterSchema = z.object({
  type: z.string().default('string'),
  description: z.string().default(''),
});

/** 插件工具参数 properties Schema */
export const PluginToolParametersSchema = z.object({
  type: z.literal('object'),
  properties: z.record(z.string(), PluginToolParameterSchema).default({}),
  required: z.array(z.string()).default([]),
});

/** 插件工具定义 Schema */
export const PluginToolDefinitionSchema = z.object({
  /** 工具名称（不含 plugin_ 前缀，注册时自动添加） */
  name: z.string().min(1).max(64),
  /** 工具描述（供 AI 理解用途） */
  description: z.string().min(1).max(512),
  /** 工具参数定义 */
  parameters: PluginToolParametersSchema.default({
    type: 'object',
    properties: {},
    required: [],
  }),
  /** 工具风险等级 */
  riskLevel: z.enum(['auto', 'confirm', 'high-risk']).default('confirm'),
});

/** 插件触发器 Schema */
export const PluginTriggerSchema = z.object({
  /** 触发关键词 */
  keyword: z.string().min(1),
  /** 触发说明 */
  description: z.string().default(''),
});

/** 插件清单 Schema — plugin.json 的完整结构 */
export const PluginManifestSchema = z.object({
  /** 插件唯一标识（小写字母、数字、下划线、连字符） */
  id: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/),
  /** 机器名 */
  name: z.string().min(1).max(64),
  /** 显示名 */
  displayName: z.string().min(1).max(128).default(''),
  /** 语义化版本号 */
  version: z.string().default('1.0.0'),
  /** 作者 */
  author: z.string().default(''),
  /** 描述 */
  description: z.string().default(''),
  /** MUI 图标名 */
  icon: z.string().default('Extension'),
  /** 入口文件路径（相对于插件根目录） */
  entry: z.string().default('index.js'),
  /** 工具列表 */
  tools: z.array(PluginToolDefinitionSchema).default([]),
  /** 触发器列表 */
  triggers: z.array(PluginTriggerSchema).default([]),
  /** 权限声明 */
  permissions: z.array(z.string()).default([]),
  /** 整体风险等级 */
  riskLevel: z.enum(['auto', 'confirm', 'high-risk']).default('auto'),
  /** 插件 API 版本（用于兼容性检查） */
  apiVersion: z.string().default('1.0'),
  /** 额外元数据 */
  metadata: z.record(z.string(), z.unknown()).default({}),
});

/** 插件清单类型（从 Zod schema 推导） */
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/** 插件工具定义类型 */
export type PluginToolDefinition = z.infer<typeof PluginToolDefinitionSchema>;

/** 插件触发器类型 */
export type PluginTrigger = z.infer<typeof PluginTriggerSchema>;

/**
 * 校验 plugin.json 对象，成功返回 PluginManifest，失败抛出 ZodError。
 */
export function validateManifest(data: unknown): PluginManifest {
  return PluginManifestSchema.parse(data);
}
