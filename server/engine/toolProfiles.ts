/**
 * Tool Profile & Schema Projection System
 * 工具 Profile 和 Schema 投影系统
 *
 * 参考 OpenClaw 的 ToolProfileId 和 tool-schema-projection 实现。
 * 通过 Profile 控制工具集合的可见性，通过 Schema 投影按上下文裁剪工具参数。
 */

import { logger } from '../logger.js';

/** 工具 Profile ID */
export type ToolProfileId = 'minimal' | 'coding' | 'messaging' | 'full';

/** 工具 Profile 配置 */
export interface ToolProfile {
  id: ToolProfileId;
  name: string;
  description: string;
  /** 包含的工具命名空间前缀 */
  includeNamespaces: string[];
  /** 排除的特定工具名 */
  excludeTools: string[];
  /** 排除的工具分组 */
  excludeGroups?: string[];
}

/** 内置 Profile 定义 */
export const TOOL_PROFILES: Record<ToolProfileId, ToolProfile> = {
  minimal: {
    id: 'minimal',
    name: '最小集',
    description: '仅包含系统信息和基础文件读取工具',
    includeNamespaces: ['system', 'file'],
    excludeTools: ['file_writeFile', 'file_execCommand'],
  },
  coding: {
    id: 'coding',
    name: '编程集',
    description: '包含文件读写、命令执行、代码搜索工具',
    includeNamespaces: ['system', 'file', 'db', 'web'],
    excludeTools: ['desktop_*'],
  },
  messaging: {
    id: 'messaging',
    name: '消息集',
    description: '包含 Web 搜索、API 调用和消息工具',
    includeNamespaces: ['system', 'web'],
    excludeTools: [],
  },
  full: {
    id: 'full',
    name: '完整集',
    description: '包含所有可用工具（默认）',
    includeNamespaces: ['*'],
    excludeTools: [],
  },
};

/** 内置工具分组 */
export const TOOL_GROUPS: Record<string, string[]> = {
  fs: ['file_listDir', 'file_readFile', 'file_writeFile', 'file_execCommand'],
  web: ['web_search', 'web_fetch', 'web_apiCall', 'web_searchV3', 'web_fetchV3'],
  db: ['db_query', 'wms_inventory'],
  desktop: [
    'desktop_click', 'desktop_type', 'desktop_keyPress', 'desktop_scroll',
    'desktop_screenshot', 'desktop_see', 'desktop_snapshot', 'desktop_find',
    'desktop_clickSmart', 'desktop_appLaunch', 'desktop_appQuit',
    'desktop_windowFocus', 'desktop_clipboard',
  ],
  system: ['system_info'],
};

/** 工具定义结构（与 ToolDefinition 保持结构兼容） */
type ToolLike = {
  function: {
    name: string;
    description: string;
    parameters: any;
  };
};

/** Schema 投影选项 */
export interface SchemaProjectionOptions {
  /** 限制参数数量 */
  maxParams?: number;
  /** 隐藏可选参数 */
  hideOptionalParams?: boolean;
  /** 简化描述（截断长度） */
  maxDescriptionLength?: number;
  /** 排除的参数名 */
  excludeParams?: string[];
};

/**
 * 将通配符模式转换为正则表达式
 * 支持 '*' 匹配任意字符序列
 */
function globToRegExp(pattern: string): RegExp {
  // 转义正则特殊字符，保留 '*' 作为通配符
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/** 判断工具名是否匹配某个模式（支持 '*' 通配符） */
function matchToolName(toolName: string, pattern: string): boolean {
  if (!pattern.includes('*')) {
    return toolName === pattern;
  }
  return globToRegExp(pattern).test(toolName);
}

/** 获取工具的命名空间前缀（工具名中第一个 '_' 之前的部分） */
function getToolNamespace(toolName: string): string {
  const idx = toolName.indexOf('_');
  return idx === -1 ? toolName : toolName.slice(0, idx);
}

/** 深拷贝（适用于 JSON 可序列化的工具定义） */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * 工具 Profile 管理器
 * 负责应用 Profile 到工具列表，控制工具的可见性
 */
export class ToolProfileManager {
  private activeProfile: ToolProfileId = 'full';
  private customOverrides: Partial<ToolProfile> | null = null;

  /** 设置当前 Profile */
  setProfile(profileId: ToolProfileId): void {
    if (!TOOL_PROFILES[profileId]) {
      logger.warn(`[ToolProfile] 未知的 Profile ID: ${profileId}，忽略设置`);
      return;
    }
    this.activeProfile = profileId;
    logger.debug(`[ToolProfile] 当前 Profile 已切换为: ${profileId}`);
  }

  /** 获取当前 Profile（合并自定义覆盖） */
  getProfile(): ToolProfile {
    const base = TOOL_PROFILES[this.activeProfile];
    if (!this.customOverrides) {
      return { ...base };
    }
    return {
      ...base,
      ...this.customOverrides,
      // 数组字段：覆盖优先，缺省回退到基础配置
      includeNamespaces: this.customOverrides.includeNamespaces ?? base.includeNamespaces,
      excludeTools: this.customOverrides.excludeTools ?? base.excludeTools,
      excludeGroups: this.customOverrides.excludeGroups ?? base.excludeGroups,
    };
  }

  /** 设置自定义覆盖 */
  setCustomOverride(override: Partial<ToolProfile>): void {
    this.customOverrides = { ...override };
    logger.debug('[ToolProfile] 已设置自定义覆盖');
  }

  /** 清除自定义覆盖 */
  clearCustomOverride(): void {
    this.customOverrides = null;
    logger.debug('[ToolProfile] 已清除自定义覆盖');
  }

  /**
   * 应用 Profile 到工具列表
   * 根据当前 Profile 的命名空间包含规则与排除规则过滤工具
   */
  applyProfile(
    tools: Array<{ function: { name: string; description: string; parameters: any } }>,
  ): Array<{ function: { name: string; description: string; parameters: any } }> {
    const profile = this.getProfile();
    const includeAll = profile.includeNamespaces.includes('*');

    // 展开排除分组为具体工具名，并合并到排除列表
    const excludeGroups = profile.excludeGroups ?? [];
    const expandedExcludes: string[] = [...profile.excludeTools];
    for (const group of excludeGroups) {
      const groupTools = TOOL_GROUPS[group];
      if (groupTools) {
        expandedExcludes.push(...groupTools);
      }
    }

    const result = tools.filter((tool) => {
      const name = tool.function.name;
      // 命名空间匹配
      if (!includeAll) {
        const ns = getToolNamespace(name);
        if (!profile.includeNamespaces.includes(ns)) {
          return false;
        }
      }
      // 排除规则匹配（支持通配符）
      for (const pattern of expandedExcludes) {
        if (matchToolName(name, pattern)) {
          return false;
        }
      }
      return true;
    });

    logger.debug(
      `[ToolProfile] 应用 Profile "${profile.id}"：输入 ${tools.length} 个工具，保留 ${result.length} 个`,
    );
    return result;
  }

  /**
   * 展开工具分组
   * 将分组名替换为组内的所有具体工具名，非分组名保留原样
   */
  expandToolGroups(toolNames: string[]): string[] {
    const result: string[] = [];
    for (const name of toolNames) {
      const groupTools = TOOL_GROUPS[name];
      if (groupTools) {
        result.push(...groupTools);
      } else {
        result.push(name);
      }
    }
    return result;
  }

  /** 检查工具是否被当前 Profile 允许 */
  isToolAllowed(toolName: string): boolean {
    const profile = this.getProfile();
    const includeAll = profile.includeNamespaces.includes('*');

    // 命名空间匹配
    if (!includeAll) {
      const ns = getToolNamespace(toolName);
      if (!profile.includeNamespaces.includes(ns)) {
        return false;
      }
    }

    // 展开排除分组
    const excludeGroups = profile.excludeGroups ?? [];
    const expandedExcludes: string[] = [...profile.excludeTools];
    for (const group of excludeGroups) {
      const groupTools = TOOL_GROUPS[group];
      if (groupTools) {
        expandedExcludes.push(...groupTools);
      }
    }

    // 排除规则匹配
    for (const pattern of expandedExcludes) {
      if (matchToolName(toolName, pattern)) {
        return false;
      }
    }
    return true;
  }

  /** 列出所有可用 Profile */
  listProfiles(): ToolProfile[] {
    return Object.values(TOOL_PROFILES).map((p) => ({ ...p }));
  }
}

/** 工具 Profile 管理器单例 */
export const toolProfileManager = new ToolProfileManager();

/**
 * 投影工具 Schema（根据上下文裁剪）
 * 按顺序：截断描述 → 隐藏可选参数 → 排除指定参数 → 限制参数数量 → 重新计算 required
 */
export function projectToolSchema(
  tool: { function: { name: string; description: string; parameters: any } },
  options?: SchemaProjectionOptions,
): { function: { name: string; description: string; parameters: any } } {
  if (!options) {
    return deepClone(tool);
  }

  // 深拷贝避免污染原始定义
  const projected = deepClone(tool);
  const fn = projected.function;

  // 1. 截断描述
  if (options.maxDescriptionLength !== undefined && options.maxDescriptionLength > 0) {
    const max = options.maxDescriptionLength;
    if (fn.description.length > max) {
      fn.description = fn.description.slice(0, max);
    }
  }

  const params = fn.parameters as {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  } | null;

  if (!params || typeof params !== 'object' || !params.properties) {
    return projected;
  }

  const properties = params.properties;
  let requiredList = Array.isArray(params.required) ? [...params.required] : [];

  // 2. 隐藏可选参数（仅保留 required 参数）
  if (options.hideOptionalParams) {
    const requiredSet = new Set(requiredList);
    for (const key of Object.keys(properties)) {
      if (!requiredSet.has(key)) {
        delete properties[key];
      }
    }
  }

  // 3. 排除指定参数
  if (Array.isArray(options.excludeParams) && options.excludeParams.length > 0) {
    const excludeSet = new Set(options.excludeParams);
    for (const key of excludeSet) {
      delete properties[key];
    }
    requiredList = requiredList.filter((k) => !excludeSet.has(k));
  }

  // 4. 限制参数数量（仅保留前 N 个 required 参数）
  if (options.maxParams !== undefined && options.maxParams > 0) {
    const keepRequired = requiredList.slice(0, options.maxParams);
    const keepSet = new Set(keepRequired);
    for (const key of Object.keys(properties)) {
      if (!keepSet.has(key)) {
        delete properties[key];
      }
    }
    requiredList = keepRequired;
  }

  // 5. 重新计算 required 数组（仅保留仍存在于 properties 中的）
  const remainingKeys = new Set(Object.keys(properties));
  params.required = requiredList.filter((k) => remainingKeys.has(k));

  return projected;
}

/** 批量投影工具 Schema */
export function projectToolSchemas(
  tools: Array<{ function: { name: string; description: string; parameters: any } }>,
  options?: SchemaProjectionOptions,
): Array<{ function: { name: string; description: string; parameters: any } }> {
  return tools.map((tool) => projectToolSchema(tool, options));
}
