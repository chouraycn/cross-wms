/**
 * 技能优先级系统
 *
 * 参考 OpenClaw 的技能加载优先级（从高到低）：
 * 1. 工作区技能       <workspace>/skills
 * 2. 项目 Agent 技能  <workspace>/.agents/skills
 * 3. 个人 Agent 技能  ~/.agents/skills
 * 4. 托管/本地技能    ~/.openclaw/skills
 * 5. 内置技能         shipped with install
 * 6. 额外目录/插件    extraDirs + plugin skills
 *
 * 同名技能高优先级覆盖低优先级。
 */

import path from "node:path";
import fs from "node:fs/promises";
import { getChildLogger } from "../../logging/logger.js";
import { AppPaths } from "../../../config/appPaths.js";

const logger = getChildLogger({ module: "skill-priority" } as any);

// ============================================================================
// 类型定义
// ============================================================================

/** 技能来源优先级 */
export enum SkillPriority {
  /** 1 — 最高：工作区技能 */
  WORKSPACE = 1,
  /** 2：项目 Agent 技能 */
  PROJECT_AGENT = 2,
  /** 3：个人 Agent 技能 */
  PERSONAL_AGENT = 3,
  /** 4：托管/本地技能 */
  MANAGED = 4,
  /** 5：内置技能 */
  BUNDLED = 5,
  /** 6 — 最低：额外目录/插件 */
  EXTRA = 6,
}

/** 技能来源信息 */
export interface SkillSourceInfo {
  /** 来源路径 */
  path: string;
  /** 优先级 */
  priority: SkillPriority;
  /** 来源类型名称 */
  typeName: string;
  /** 是否为符号链接 */
  isSymlink?: boolean;
  /** 符号链接目标（如果是指向外部） */
  symlinkTarget?: string;
}

/** 技能解析结果 */
export interface SkillResolutionResult {
  /** 技能名称 */
  skillName: string;
  /** 所有找到的来源（按优先级排序） */
  sources: SkillSourceInfo[];
  /** 最终选择的来源（最高优先级） */
  selected?: SkillSourceInfo;
  /** 是否被覆盖 */
  overridden: boolean;
  /** 覆盖来源（如果有） */
  overrideBy?: SkillSourceInfo;
}

/** 技能来源根目录配置 */
export interface SkillRootConfig {
  /** 工作区目录 */
  workspaceDir?: string;
  /** 项目 Agent 目录 */
  projectAgentDir?: string;
  /** 个人 Agent 目录 */
  personalAgentDir?: string;
  /** 托管技能目录 */
  managedDir?: string;
  /** 内置技能目录 */
  bundledDir?: string;
  /** 额外目录列表 */
  extraDirs?: string[];
  /** 允许的符号链接目标 */
  allowedSymlinkTargets?: string[];
}

// ============================================================================
// 技能优先级解析器
// ============================================================================

/** 技能优先级解析器 */
export class SkillPriorityResolver {
  private config: SkillRootConfig;
  private skillCache: Map<string, SkillResolutionResult> = new Map();

  constructor(config?: SkillRootConfig) {
    this.config = this.resolveConfig(config);
  }

  /** 解析配置 */
  private resolveConfig(config?: SkillRootConfig): SkillRootConfig {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    const workspaceDir = config?.workspaceDir || process.cwd();
    const managedDir = config?.managedDir || AppPaths.skillsDir;

    return {
      workspaceDir,
      projectAgentDir: config?.projectAgentDir || path.join(workspaceDir, ".agents", "skills"),
      personalAgentDir: config?.personalAgentDir || path.join(homeDir, ".agents", "skills"),
      managedDir,
      bundledDir: config?.bundledDir || path.join(managedDir, "bundled"),
      extraDirs: config?.extraDirs || [],
      allowedSymlinkTargets: config?.allowedSymlinkTargets || [],
    };
  }

  /** 更新配置 */
  updateConfig(config: Partial<SkillRootConfig>): void {
    this.config = { ...this.config, ...config };
    this.skillCache.clear();
    logger.debug("[SkillPriority] Config updated, cache cleared");
  }

  /** 获取所有技能根目录（按优先级排序） */
  getSkillRoots(): Array<{ path: string; priority: SkillPriority; typeName: string }> {
    const roots: Array<{ path: string; priority: SkillPriority; typeName: string }> = [];

    // 1. 工作区技能
    if (this.config.workspaceDir) {
      roots.push({
        path: path.join(this.config.workspaceDir, "skills"),
        priority: SkillPriority.WORKSPACE,
        typeName: "workspace",
      });
    }

    // 2. 项目 Agent 技能
    if (this.config.projectAgentDir) {
      roots.push({
        path: this.config.projectAgentDir,
        priority: SkillPriority.PROJECT_AGENT,
        typeName: "project-agent",
      });
    }

    // 3. 个人 Agent 技能
    if (this.config.personalAgentDir) {
      roots.push({
        path: this.config.personalAgentDir,
        priority: SkillPriority.PERSONAL_AGENT,
        typeName: "personal-agent",
      });
    }

    // 4. 托管技能
    if (this.config.managedDir) {
      roots.push({
        path: this.config.managedDir,
        priority: SkillPriority.MANAGED,
        typeName: "managed",
      });
    }

    // 5. 内置技能
    if (this.config.bundledDir) {
      roots.push({
        path: this.config.bundledDir,
        priority: SkillPriority.BUNDLED,
        typeName: "bundled",
      });
    }

    // 6. 额外目录
    if (this.config.extraDirs) {
      for (const extraDir of this.config.extraDirs) {
        roots.push({
          path: extraDir,
          priority: SkillPriority.EXTRA,
          typeName: "extra",
        });
      }
    }

    return roots;
  }

  /** 查找技能的所有来源 */
  async findSkillSources(skillName: string): Promise<SkillSourceInfo[]> {
    const roots = this.getSkillRoots();
    const sources: SkillSourceInfo[] = [];

    for (const root of roots) {
      const skillPath = path.join(root.path, skillName);
      const skillMdPath = path.join(skillPath, "SKILL.md");
      const skillMdLowerPath = path.join(skillPath, "skill.md");

      try {
        // 检查技能目录是否存在
        await fs.access(skillPath);

        // 检查是否有 SKILL.md
        let hasSkillMd = false;
        try {
          await fs.access(skillMdPath);
          hasSkillMd = true;
        } catch {
          try {
            await fs.access(skillMdLowerPath);
            hasSkillMd = true;
          } catch {
            // 无 SKILL.md
          }
        }

        if (hasSkillMd) {
          // 检查符号链接
          const stat = await fs.lstat(skillPath);
          const isSymlink = stat.isSymbolicLink();
          let symlinkTarget: string | undefined;

          if (isSymlink) {
            symlinkTarget = await fs.readlink(skillPath);

            // 安全检查：符号链接目标是否在允许列表中
            if (!this.isSymlinkAllowed(skillPath, symlinkTarget)) {
              logger.warn(
                `[SkillPriority] Symlink target not allowed: ${skillPath} -> ${symlinkTarget}`
              );
              continue; // 跳过不允许的符号链接
            }
          }

          sources.push({
            path: skillPath,
            priority: root.priority,
            typeName: root.typeName,
            isSymlink,
            symlinkTarget,
          });
        }
      } catch {
        // 目录不存在，跳过
      }
    }

    // 按优先级排序（高优先级在前）
    sources.sort((a, b) => a.priority - b.priority);

    return sources;
  }

  /** 检查符号链接是否被允许 */
  private isSymlinkAllowed(skillPath: string, target: string): boolean {
    // 解析绝对路径
    const resolvedTarget = path.resolve(skillPath, target);

    // 检查是否在允许列表中
    if (this.config.allowedSymlinkTargets) {
      for (const allowed of this.config.allowedSymlinkTargets) {
        const resolvedAllowed = path.resolve(allowed);
        if (resolvedTarget.startsWith(resolvedAllowed)) {
          return true;
        }
      }
    }

    // 默认：符号链接目标必须在与技能根相同的目录下
    const roots = this.getSkillRoots();
    for (const root of roots) {
      const resolvedRoot = path.resolve(root.path);
      if (resolvedTarget.startsWith(resolvedRoot)) {
        return true;
      }
    }

    return false;
  }

  /** 解析技能（返回最高优先级的来源） */
  async resolveSkill(skillName: string): Promise<SkillResolutionResult> {
    // 检查缓存
    const cached = this.skillCache.get(skillName);
    if (cached) {
      return cached;
    }

    const sources = await this.findSkillSources(skillName);
    const selected = sources.length > 0 ? sources[0] : undefined;
    const overridden = sources.length > 1;

    const result: SkillResolutionResult = {
      skillName,
      sources,
      selected,
      overridden,
      overrideBy: overridden && sources.length > 1 ? sources[1] : undefined,
    };

    // 缓存结果
    this.skillCache.set(skillName, result);

    return result;
  }

  /** 批量解析技能 */
  async resolveSkills(skillNames: string[]): Promise<Map<string, SkillResolutionResult>> {
    const results = new Map<string, SkillResolutionResult>();

    await Promise.all(
      skillNames.map(async (name) => {
        const result = await this.resolveSkill(name);
        results.set(name, result);
      })
    );

    return results;
  }

  /** 获取技能的优先级 */
  async getSkillPriority(skillName: string): Promise<SkillPriority | null> {
    const result = await this.resolveSkill(skillName);
    return result.selected?.priority ?? null;
  }

  /** 检查技能是否被覆盖 */
  async isSkillOverridden(skillName: string): Promise<boolean> {
    const result = await this.resolveSkill(skillName);
    return result.overridden;
  }

  /** 清除缓存 */
  clearCache(): void {
    this.skillCache.clear();
    logger.debug("[SkillPriority] Cache cleared");
  }

  /** 获取配置 */
  getConfig(): SkillRootConfig {
    return { ...this.config };
  }
}

// ============================================================================
// 全局实例
// ============================================================================

let globalResolver: SkillPriorityResolver | null = null;

/** 获取全局优先级解析器 */
export function getSkillPriorityResolver(): SkillPriorityResolver {
  if (!globalResolver) {
    globalResolver = new SkillPriorityResolver();
  }
  return globalResolver;
}

/** 初始化全局优先级解析器 */
export function initSkillPriorityResolver(config?: SkillRootConfig): SkillPriorityResolver {
  globalResolver = new SkillPriorityResolver(config);
  return globalResolver;
}

/** 重置全局解析器 */
export function resetSkillPriorityResolver(): void {
  globalResolver = null;
}

// ============================================================================
// 辅助函数
// ============================================================================

/** 获取优先级名称 */
export function getPriorityName(priority: SkillPriority): string {
  const names: Record<number, string> = {
    [SkillPriority.WORKSPACE]: "Workspace",
    [SkillPriority.PROJECT_AGENT]: "Project Agent",
    [SkillPriority.PERSONAL_AGENT]: "Personal Agent",
    [SkillPriority.MANAGED]: "Managed",
    [SkillPriority.BUNDLED]: "Bundled",
    [SkillPriority.EXTRA]: "Extra",
  };
  return names[priority] || "Unknown";
}

/** 比较两个优先级 */
export function comparePriority(a: SkillPriority, b: SkillPriority): number {
  return a - b; // 数值越小优先级越高
}

/** 判断优先级是否更高 */
export function isHigherPriority(a: SkillPriority, b: SkillPriority): boolean {
  return a < b;
}