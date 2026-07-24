/**
 * 技能来源追踪系统
 *
 * 参考 OpenClaw 的 .clawhub/origin.json 配置：
 * - 记录安装来源、版本、签名
 * - 支持来源验证和回滚
 * - 追踪安装历史
 */

import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { getChildLogger } from "../../logging/logger.js";

const logger = getChildLogger({ module: "skill-origin" } as any);

// ============================================================================
// 类型定义
// ============================================================================

/** 技能来源类型 */
export type SkillSourceType = "clawhub" | "git" | "local" | "archive" | "url" | "plugin";

/** 技能来源信息 */
export interface SkillOrigin {
  /** 来源信息版本 */
  version: 1;
  /** 来源类型 */
  sourceType: SkillSourceType;
  /** 注册表 URL（ClawHub 源） */
  registry?: string;
  /** 技能 slug */
  slug: string;
  /** 所有者（可选） */
  ownerHandle?: string;
  /** 安装的版本 */
  installedVersion: string;
  /** 安装时间戳 */
  installedAt: number;
  /** 来源 URL 或路径 */
  sourceUrl?: string;
  /** Git commit hash（Git 源） */
  gitCommit?: string;
  /** Git 分支（Git 源） */
  gitBranch?: string;
  /** 文件 SHA256 */
  sha256?: string;
  /** 签名信息 */
  signature?: {
    /** 签名值 */
    signature: string;
    /** 公钥 ID */
    keyId?: string;
    /** 签名算法 */
    algorithm?: string;
    /** 签名时间 */
    signedAt?: number;
  };
  /** 插件来源信息 */
  pluginInfo?: {
    pluginId: string;
    pluginVersion: string;
  };
}

/** 安装历史记录 */
export interface InstallationRecord {
  /** 记录 ID */
  id: string;
  /** 技能名称 */
  skillName: string;
  /** 操作类型 */
  action: "install" | "update" | "rollback" | "uninstall";
  /** 操作时间 */
  timestamp: number;
  /** 操作前版本 */
  previousVersion?: string;
  /** 操作后版本 */
  newVersion?: string;
  /** 来源信息 */
  origin: SkillOrigin;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

/** 来源追踪文件路径 */
const ORIGIN_FILE_NAME = "origin.json";
const HISTORY_FILE_NAME = "history.json";
const ORIGINS_DIR_NAME = ".clawhub";

// ============================================================================
// 技能来源追踪管理器
// ============================================================================

/** 技能来源追踪管理器 */
export class SkillOriginTracker {
  private originsDir: string;

  constructor(workspaceDir?: string) {
    this.originsDir = workspaceDir
      ? path.join(workspaceDir, ORIGINS_DIR_NAME)
      : path.join(process.cwd(), ORIGINS_DIR_NAME);
  }

  /** 获取技能来源文件路径 */
  private getOriginFilePath(skillName: string): string {
    return path.join(this.originsDir, "origins", `${skillName}.json`);
  }

  /** 获取历史文件路径 */
  private getHistoryFilePath(): string {
    return path.join(this.originsDir, HISTORY_FILE_NAME);
  }

  /** 确保目录存在 */
  private async ensureDir(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
  }

  /** 写入技能来源信息 */
  async writeOrigin(skillName: string, origin: SkillOrigin): Promise<void> {
    const filePath = this.getOriginFilePath(skillName);
    await this.ensureDir(filePath);

    // 验证版本
    if (origin.version !== 1) {
      throw new Error(`Unsupported origin version: ${origin.version}`);
    }

    await fs.writeFile(filePath, JSON.stringify(origin, null, 2) + "\n", "utf8");
    logger.info(`[OriginTracker] Written origin for skill: ${skillName}`);
  }

  /** 读取技能来源信息 */
  async readOrigin(skillName: string): Promise<SkillOrigin | null> {
    const filePath = this.getOriginFilePath(skillName);

    try {
      const content = await fs.readFile(filePath, "utf8");
      const origin = JSON.parse(content) as SkillOrigin;

      // 验证必要字段
      if (
        origin.version === 1 &&
        origin.slug &&
        origin.installedVersion &&
        origin.installedAt
      ) {
        return origin;
      }

      logger.warn(`[OriginTracker] Invalid origin file for skill: ${skillName}`);
      return null;
    } catch {
      return null;
    }
  }

  /** 删除技能来源信息 */
  async deleteOrigin(skillName: string): Promise<boolean> {
    const filePath = this.getOriginFilePath(skillName);

    try {
      await fs.unlink(filePath);
      logger.info(`[OriginTracker] Deleted origin for skill: ${skillName}`);
      return true;
    } catch {
      return false;
    }
  }

  /** 检查技能来源是否存在 */
  async hasOrigin(skillName: string): Promise<boolean> {
    const origin = await this.readOrigin(skillName);
    return origin !== null;
  }

  /** 获取所有已追踪的技能 */
  async listTrackedSkills(): Promise<string[]> {
    const originsDir = path.join(this.originsDir, "origins");

    try {
      const files = await fs.readdir(originsDir);
      return files
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(".json", ""));
    } catch {
      return [];
    }
  }

  /** 追踪安装操作 */
  async trackInstallation(
    skillName: string,
    origin: SkillOrigin
  ): Promise<InstallationRecord> {
    const record: InstallationRecord = {
      id: crypto.randomUUID(),
      skillName,
      action: "install",
      timestamp: Date.now(),
      newVersion: origin.installedVersion,
      origin,
      success: true,
    };

    await this.writeOrigin(skillName, origin);
    await this.appendHistory(record);

    return record;
  }

  /** 追踪更新操作 */
  async trackUpdate(
    skillName: string,
    previousVersion: string,
    newOrigin: SkillOrigin
  ): Promise<InstallationRecord> {
    const record: InstallationRecord = {
      id: crypto.randomUUID(),
      skillName,
      action: "update",
      timestamp: Date.now(),
      previousVersion,
      newVersion: newOrigin.installedVersion,
      origin: newOrigin,
      success: true,
    };

    await this.writeOrigin(skillName, newOrigin);
    await this.appendHistory(record);

    return record;
  }

  /** 追踪回滚操作 */
  async trackRollback(
    skillName: string,
    previousVersion: string,
    newVersion: string,
    origin: SkillOrigin
  ): Promise<InstallationRecord> {
    const record: InstallationRecord = {
      id: crypto.randomUUID(),
      skillName,
      action: "rollback",
      timestamp: Date.now(),
      previousVersion,
      newVersion,
      origin,
      success: true,
    };

    await this.writeOrigin(skillName, origin);
    await this.appendHistory(record);

    return record;
  }

  /** 追踪卸载操作 */
  async trackUninstallation(skillName: string, origin: SkillOrigin): Promise<InstallationRecord> {
    const record: InstallationRecord = {
      id: crypto.randomUUID(),
      skillName,
      action: "uninstall",
      timestamp: Date.now(),
      previousVersion: origin.installedVersion,
      origin,
      success: true,
    };

    await this.deleteOrigin(skillName);
    await this.appendHistory(record);

    return record;
  }

  /** 追踪失败操作 */
  async trackFailure(
    skillName: string,
    action: InstallationRecord["action"],
    origin: SkillOrigin,
    error: string
  ): Promise<InstallationRecord> {
    const record: InstallationRecord = {
      id: crypto.randomUUID(),
      skillName,
      action,
      timestamp: Date.now(),
      origin,
      success: false,
      error,
    };

    await this.appendHistory(record);

    return record;
  }

  /** 追加历史记录 */
  private async appendHistory(record: InstallationRecord): Promise<void> {
    const filePath = this.getHistoryFilePath();
    await this.ensureDir(filePath);

    let history: InstallationRecord[] = [];

    try {
      const content = await fs.readFile(filePath, "utf8");
      history = JSON.parse(content) as InstallationRecord[];
    } catch {
      history = [];
    }

    history.push(record);

    // 保持历史记录不超过 1000 条
    if (history.length > 1000) {
      history = history.slice(-1000);
    }

    await fs.writeFile(filePath, JSON.stringify(history, null, 2) + "\n", "utf8");
  }

  /** 读取安装历史 */
  async readHistory(limit?: number): Promise<InstallationRecord[]> {
    const filePath = this.getHistoryFilePath();

    try {
      const content = await fs.readFile(filePath, "utf8");
      const history = JSON.parse(content) as InstallationRecord[];
      return limit ? history.slice(-limit) : history;
    } catch {
      return [];
    }
  }

  /** 读取指定技能的历史 */
  async readSkillHistory(skillName: string): Promise<InstallationRecord[]> {
    const history = await this.readHistory();
    return history.filter((r) => r.skillName === skillName);
  }

  /** 验证来源完整性 */
  async verifyOrigin(skillName: string, expectedSha256?: string): Promise<{
    valid: boolean;
    reason?: string;
  }> {
    const origin = await this.readOrigin(skillName);

    if (!origin) {
      return { valid: false, reason: "No origin found" };
    }

    if (expectedSha256 && origin.sha256 !== expectedSha256) {
      return { valid: false, reason: "SHA256 mismatch" };
    }

    return { valid: true };
  }

  /** 导出所有来源信息 */
  async exportOrigins(): Promise<Record<string, SkillOrigin>> {
    const skills = await this.listTrackedSkills();
    const origins: Record<string, SkillOrigin> = {};

    for (const skill of skills) {
      const origin = await this.readOrigin(skill);
      if (origin) {
        origins[skill] = origin;
      }
    }

    return origins;
  }

  /** 导入来源信息 */
  async importOrigins(origins: Record<string, SkillOrigin>): Promise<number> {
    let count = 0;

    for (const [skillName, origin] of Object.entries(origins)) {
      try {
        await this.writeOrigin(skillName, origin);
        count++;
      } catch (err) {
        logger.warn(`[OriginTracker] Failed to import origin for ${skillName}:`, err);
      }
    }

    return count;
  }
}

// ============================================================================
// 全局实例
// ============================================================================

let globalTracker: SkillOriginTracker | null = null;

/** 获取全局来源追踪器 */
export function getSkillOriginTracker(): SkillOriginTracker {
  if (!globalTracker) {
    globalTracker = new SkillOriginTracker();
  }
  return globalTracker;
}

/** 初始化全局来源追踪器 */
export function initSkillOriginTracker(workspaceDir?: string): SkillOriginTracker {
  globalTracker = new SkillOriginTracker(workspaceDir);
  return globalTracker;
}

/** 重置全局追踪器 */
export function resetSkillOriginTracker(): void {
  globalTracker = null;
}

// ============================================================================
// 辅助函数
// ============================================================================

/** 计算 SHA256 */
export function calculateSha256(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/** 创建来源信息 */
export function createSkillOrigin(
  sourceType: SkillSourceType,
  slug: string,
  version: string,
  options?: Partial<SkillOrigin>
): SkillOrigin {
  return {
    version: 1,
    sourceType,
    slug,
    installedVersion: version,
    installedAt: Date.now(),
    ...options,
  };
}