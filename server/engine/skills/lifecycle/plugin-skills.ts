/**
 * 插件携带技能支持
 *
 * 参考 OpenClaw 的 openclaw.plugin.json skills 字段：
 * - 插件启用时自动加载其技能
 * - 插件技能优先级最低，可被覆盖
 */

import path from "node:path";
import fs from "node:fs/promises";
import { getChildLogger } from "../../logging/logger.js";

const logger = getChildLogger({ module: "plugin-skills" });
import { SkillPriority, getSkillPriorityResolver } from "../discovery/skill-priority.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 插件技能配置 */
export interface PluginSkillConfig {
  /** 技能路径（相对于插件目录） */
  path: string;
  /** 技能名称（可选，默认从路径推断） */
  name?: string;
  /** 是否启用 */
  enabled?: boolean;
}

/** 插件清单 */
export interface PluginManifest {
  /** 插件 ID */
  id: string;
  /** 插件版本 */
  version: string;
  /** 插件名称 */
  name?: string;
  /** 插件描述 */
  description?: string;
  /** 携带的技能列表 */
  skills?: PluginSkillConfig[];
  /** 工具路径 */
  tools?: string[];
  /** 钩子路径 */
  hooks?: string[];
}

/** 插件信息 */
export interface PluginInfo {
  /** 插件目录 */
  pluginDir: string;
  /** 插件清单 */
  manifest: PluginManifest;
  /** 技能路径列表 */
  skillPaths: string[];
  /** 是否已加载 */
  loaded: boolean;
}

/** 插件技能同步结果 */
export interface PluginSkillsSyncResult {
  /** 插件 ID */
  pluginId: string;
  /** 同步的技能列表 */
  skills: string[];
  /** 错误列表 */
  errors: string[];
  /** 是否成功 */
  success: boolean;
}

/** 插件管理器配置 */
export interface PluginManagerConfig {
  /** 插件目录列表 */
  pluginDirs?: string[];
  /** 是否自动加载插件技能 */
  autoLoad?: boolean;
  /** 技能目录名称 */
  skillsDirName?: string;
}

// ============================================================================
// 插件技能管理器
// ============================================================================

/** 插件技能管理器 */
export class PluginSkillsManager {
  private config: PluginManagerConfig;
  private plugins: Map<string, PluginInfo> = new Map();
  private loadedSkills: Map<string, string[]> = new Map(); // pluginId -> skills

  private defaultConfig: PluginManagerConfig = {
    pluginDirs: [],
    autoLoad: true,
    skillsDirName: "skills",
  };

  constructor(config?: Partial<PluginManagerConfig>) {
    this.config = { ...this.defaultConfig, ...config };
  }

  /** 发现插件 */
  async discoverPlugins(): Promise<PluginInfo[]> {
    const plugins: PluginInfo[] = [];

    for (const pluginDir of this.config.pluginDirs || []) {
      const discovered = await this.discoverPluginsInDir(pluginDir);
      plugins.push(...discovered);
    }

    return plugins;
  }

  /** 在目录中发现插件 */
  private async discoverPluginsInDir(pluginDir: string): Promise<PluginInfo[]> {
    const plugins: PluginInfo[] = [];

    try {
      const entries = await fs.readdir(pluginDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const pluginPath = path.join(pluginDir, entry.name);
        const manifestPath = path.join(pluginPath, "openclaw.plugin.json");

        try {
          const content = await fs.readFile(manifestPath, "utf8");
          const manifest = JSON.parse(content) as PluginManifest;

          // 收集技能路径
          const skillPaths: string[] = [];
          if (manifest.skills) {
            for (const skill of manifest.skills) {
              const skillPath = path.join(pluginPath, skill.path);
              skillPaths.push(skillPath);
            }
          }

          plugins.push({
            pluginDir: pluginPath,
            manifest,
            skillPaths,
            loaded: false,
          });

          logger.info(`[PluginSkills] Discovered plugin: ${manifest.id}`);
        } catch {
          // 无效插件目录，跳过
        }
      }
    } catch (err) {
      logger.warn(`[PluginSkills] Failed to read plugin dir: ${pluginDir}`, err);
    }

    return plugins;
  }

  /** 加载插件 */
  async loadPlugin(pluginDir: string): Promise<PluginInfo | null> {
    const manifestPath = path.join(pluginDir, "openclaw.plugin.json");

    try {
      const content = await fs.readFile(manifestPath, "utf8");
      const manifest = JSON.parse(content) as PluginManifest;

      const skillPaths: string[] = [];
      if (manifest.skills) {
        for (const skill of manifest.skills) {
          const skillPath = path.join(pluginDir, skill.path);
          skillPaths.push(skillPath);
        }
      }

      const pluginInfo: PluginInfo = {
        pluginDir,
        manifest,
        skillPaths,
        loaded: true,
      };

      this.plugins.set(manifest.id, pluginInfo);

      // 自动同步技能
      if (this.config.autoLoad) {
        await this.syncPluginSkills(manifest.id);
      }

      return pluginInfo;
    } catch (err) {
      logger.error(`[PluginSkills] Failed to load plugin: ${pluginDir}`, err);
      return null;
    }
  }

  /** 卸载插件 */
  async unloadPlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return false;
    }

    // 移除已加载的技能
    const skills = this.loadedSkills.get(pluginId) || [];
    for (const skill of skills) {
      await this.removePluginSkill(pluginId, skill);
    }

    plugin.loaded = false;
    this.loadedSkills.delete(pluginId);

    logger.info(`[PluginSkills] Unloaded plugin: ${pluginId}`);
    return true;
  }

  /** 同步插件技能 */
  async syncPluginSkills(pluginId: string): Promise<PluginSkillsSyncResult> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return {
        pluginId,
        skills: [],
        errors: [`Plugin not found: ${pluginId}`],
        success: false,
      };
    }

    const skills: string[] = [];
    const errors: string[] = [];

    for (const skillPath of plugin.skillPaths) {
      try {
        const skillName = path.basename(skillPath);
        await this.addPluginSkill(pluginId, skillName, skillPath);
        skills.push(skillName);
      } catch (err) {
        errors.push(`Failed to sync skill: ${skillPath} - ${err}`);
      }
    }

    this.loadedSkills.set(pluginId, skills);
    plugin.loaded = true;

    return {
      pluginId,
      skills,
      errors,
      success: errors.length === 0,
    };
  }

  /** 添加插件技能 */
  private async addPluginSkill(
    pluginId: string,
    skillName: string,
    skillPath: string
  ): Promise<void> {
    // 检查技能是否存在
    try {
      await fs.access(skillPath);
    } catch {
      throw new Error(`Skill path does not exist: ${skillPath}`);
    }

    // 注册到优先级解析器（优先级最低）
    const resolver = getSkillPriorityResolver();
    const config = resolver.getConfig();
    const extraDirs = config.extraDirs || [];

    // 将插件技能目录添加到额外目录
    const skillParentDir = path.dirname(skillPath);
    if (!extraDirs.includes(skillParentDir)) {
      extraDirs.push(skillParentDir);
      resolver.updateConfig({ extraDirs });
    }

    logger.debug(`[PluginSkills] Added skill: ${skillName} from plugin: ${pluginId}`);
  }

  /** 移除插件技能 */
  private async removePluginSkill(
    pluginId: string,
    skillName: string
  ): Promise<void> {
    logger.debug(`[PluginSkills] Removed skill: ${skillName} from plugin: ${pluginId}`);
  }

  /** 获取插件信息 */
  getPlugin(pluginId: string): PluginInfo | undefined {
    return this.plugins.get(pluginId);
  }

  /** 获取所有已加载的插件 */
  getLoadedPlugins(): PluginInfo[] {
    return Array.from(this.plugins.values()).filter((p) => p.loaded);
  }

  /** 获取插件的技能列表 */
  getPluginSkills(pluginId: string): string[] {
    return this.loadedSkills.get(pluginId) || [];
  }

  /** 获取所有插件技能 */
  getAllPluginSkills(): Map<string, string[]> {
    return new Map(this.loadedSkills);
  }

  /** 添加插件目录 */
  addPluginDir(pluginDir: string): void {
    if (!this.config.pluginDirs) {
      this.config.pluginDirs = [];
    }
    if (!this.config.pluginDirs.includes(pluginDir)) {
      this.config.pluginDirs.push(pluginDir);
    }
  }

  /** 获取配置 */
  getConfig(): PluginManagerConfig {
    return { ...this.config };
  }
}

// ============================================================================
// 全局实例
// ============================================================================

let globalPluginManager: PluginSkillsManager | null = null;

/** 获取全局插件技能管理器 */
export function getPluginSkillsManager(): PluginSkillsManager {
  if (!globalPluginManager) {
    globalPluginManager = new PluginSkillsManager();
  }
  return globalPluginManager;
}

/** 初始化全局插件技能管理器 */
export function initPluginSkillsManager(
  config?: Partial<PluginManagerConfig>
): PluginSkillsManager {
  globalPluginManager = new PluginSkillsManager(config);
  return globalPluginManager;
}

/** 重置全局管理器 */
export function resetPluginSkillsManager(): void {
  globalPluginManager = null;
}