/**
 * 技能会话快照系统
 *
 * 参考 OpenClaw 的 runtime/session-snapshot.ts：
 * - 运行时会话状态快照与恢复
 * - 技能使用记录、环境变量、配置的序列化
 * - 支持定时自动快照和手动快照
 */

import path from "node:path";
import fs from "node:fs/promises";
import { getChildLogger } from "../../logging/logger.js";
import { getSkillEnvTracker } from "../security/sandbox.js";
import { getSkillOriginTracker, type SkillOrigin } from "../lifecycle/skill-origin.js";
import { getAgentAllowlistManager } from "../discovery/agent-allowlist.js";

const logger = getChildLogger("session-snapshot" as unknown as Record<string, unknown>);

// ============================================================================
// 类型定义
// ============================================================================

/** 技能使用记录 */
export interface SkillUsageRecord {
  /** 技能名称 */
  skillName: string;
  /** 使用时间 */
  timestamp: number;
  /** 调用次数 */
  callCount: number;
  /** 最后调用时间 */
  lastCalledAt: number;
  /** 成功次数 */
  successCount: number;
  /** 失败次数 */
  failureCount: number;
}

/** 会话快照元数据 */
export interface SnapshotMetadata {
  /** 快照 ID */
  id: string;
  /** 快照名称 */
  name?: string;
  /** 创建时间 */
  createdAt: number;
  /** 快照类型 */
  type: "auto" | "manual" | "scheduled";
  /** 会话 ID */
  sessionId?: string;
  /** 标签 */
  tags?: string[];
  /** 描述 */
  description?: string;
}

/** 会话快照内容 */
export interface SessionSnapshot {
  /** 元数据 */
  metadata: SnapshotMetadata;
  /** 技能列表 */
  skills: string[];
  /** 技能使用记录 */
  skillUsage: SkillUsageRecord[];
  /** 环境变量快照 */
  environment: Record<string, string>;
  /** Agent 配置 */
  agentConfig: {
    defaults?: { skills?: string[] };
    list?: Array<{ id: string; skills?: string[] }>;
  };
  /** 技能来源信息 */
  skillOrigins: Record<string, unknown>;
  /** 系统信息 */
  systemInfo: {
    platform: string;
    nodeVersion: string;
    timestamp: number;
  };
}

/** 快照恢复选项 */
export interface RestoreOptions {
  /** 是否恢复技能使用记录 */
  restoreUsage?: boolean;
  /** 是否恢复环境变量 */
  restoreEnvironment?: boolean;
  /** 是否恢复 Agent 配置 */
  restoreAgentConfig?: boolean;
  /** 是否恢复技能来源 */
  restoreOrigins?: boolean;
}

/** 快照恢复结果 */
export interface RestoreResult {
  /** 是否成功 */
  success: boolean;
  /** 快照 ID */
  snapshotId: string;
  /** 恢复的项目数 */
  restored: {
    skills: number;
    usage: number;
    environment: number;
    agentConfig: number;
    origins: number;
  };
  /** 错误信息 */
  error?: string;
}

// ============================================================================
// 会话快照管理器
// ============================================================================

/** 会话快照管理器 */
export class SessionSnapshotManager {
  private snapshotsDir: string;
  private usageRecords: Map<string, SkillUsageRecord> = new Map();
  private autoSnapshotInterval: ReturnType<typeof setInterval> | null = null;

  constructor(snapshotsDir?: string) {
    this.snapshotsDir = snapshotsDir || path.join(process.cwd(), ".snapshots");
  }

  /** 初始化快照目录 */
  async init(): Promise<void> {
    await fs.mkdir(this.snapshotsDir, { recursive: true });
  }

  /** 记录技能使用 */
  recordUsage(skillName: string, success: boolean): void {
    const now = Date.now();
    let record = this.usageRecords.get(skillName);

    if (!record) {
      record = {
        skillName,
        timestamp: now,
        callCount: 0,
        lastCalledAt: now,
        successCount: 0,
        failureCount: 0,
      };
    }

    record.callCount++;
    record.lastCalledAt = now;

    if (success) {
      record.successCount++;
    } else {
      record.failureCount++;
    }

    this.usageRecords.set(skillName, record);
  }

  /** 获取技能使用记录 */
  getUsageRecords(): SkillUsageRecord[] {
    return Array.from(this.usageRecords.values());
  }

  /** 获取单个技能的使用记录 */
  getUsageRecord(skillName: string): SkillUsageRecord | undefined {
    return this.usageRecords.get(skillName);
  }

  /** 清空使用记录 */
  clearUsageRecords(): void {
    this.usageRecords.clear();
  }

  /** 创建快照 */
  async createSnapshot(
    options?: {
      name?: string;
      type?: "auto" | "manual" | "scheduled";
      sessionId?: string;
      tags?: string[];
      description?: string;
    }
  ): Promise<SessionSnapshot> {
    const snapshotId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const envTracker = getSkillEnvTracker();
    const originTracker = getSkillOriginTracker();
    const agentManager = getAgentAllowlistManager();

    const snapshot: SessionSnapshot = {
      metadata: {
        id: snapshotId,
        name: options?.name,
        createdAt: Date.now(),
        type: options?.type || "manual",
        sessionId: options?.sessionId,
        tags: options?.tags,
        description: options?.description,
      },
      skills: [],
      skillUsage: this.getUsageRecords(),
      environment: {
        activeEnvKeys: JSON.stringify(envTracker.getActiveEnvKeys()),
      },
      agentConfig: agentManager.exportConfig(),
      skillOrigins: await originTracker.exportOrigins(),
      systemInfo: {
        platform: process.platform,
        nodeVersion: process.version,
        timestamp: Date.now(),
      },
    };

    // 保存到文件
    await this.saveSnapshot(snapshot);

    logger.info(`[Snapshot] Created snapshot: ${snapshotId}`);
    return snapshot;
  }

  /** 保存快照到文件 */
  private async saveSnapshot(snapshot: SessionSnapshot): Promise<void> {
    const filePath = this.getSnapshotPath(snapshot.metadata.id);
    await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  }

  /** 获取快照文件路径 */
  private getSnapshotPath(snapshotId: string): string {
    return path.join(this.snapshotsDir, `${snapshotId}.json`);
  }

  /** 加载快照 */
  async loadSnapshot(snapshotId: string): Promise<SessionSnapshot | null> {
    const filePath = this.getSnapshotPath(snapshotId);

    try {
      const content = await fs.readFile(filePath, "utf8");
      return JSON.parse(content) as SessionSnapshot;
    } catch {
      return null;
    }
  }

  /** 删除快照 */
  async deleteSnapshot(snapshotId: string): Promise<boolean> {
    const filePath = this.getSnapshotPath(snapshotId);

    try {
      await fs.unlink(filePath);
      logger.info(`[Snapshot] Deleted snapshot: ${snapshotId}`);
      return true;
    } catch {
      return false;
    }
  }

  /** 列出所有快照 */
  async listSnapshots(): Promise<SnapshotMetadata[]> {
    const snapshots: SnapshotMetadata[] = [];

    try {
      const files = await fs.readdir(this.snapshotsDir);

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const snapshotId = file.replace(".json", "");
        const snapshot = await this.loadSnapshot(snapshotId);
        if (snapshot) {
          snapshots.push(snapshot.metadata);
        }
      }

      // 按时间排序（最新的在前）
      snapshots.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      // 目录不存在
    }

    return snapshots;
  }

  /** 恢复快照 */
  async restoreSnapshot(
    snapshotId: string,
    options?: RestoreOptions
  ): Promise<RestoreResult> {
    const snapshot = await this.loadSnapshot(snapshotId);

    if (!snapshot) {
      return {
        success: false,
        snapshotId,
        restored: { skills: 0, usage: 0, environment: 0, agentConfig: 0, origins: 0 },
        error: `Snapshot "${snapshotId}" not found`,
      };
    }

    const restored = { skills: 0, usage: 0, environment: 0, agentConfig: 0, origins: 0 };

    try {
      const originTracker = getSkillOriginTracker();
      const agentManager = getAgentAllowlistManager();

      // 恢复技能来源
      if (options?.restoreOrigins !== false) {
        const count = await originTracker.importOrigins(
          snapshot.skillOrigins as Record<string, SkillOrigin>
        );
        restored.origins = count;
      }

      // 恢复 Agent 配置
      if (options?.restoreAgentConfig !== false) {
        agentManager.updateConfig(snapshot.agentConfig);
        restored.agentConfig = snapshot.agentConfig.list?.length || 0;
      }

      // 恢复技能使用记录
      if (options?.restoreUsage !== false) {
        this.usageRecords.clear();
        for (const usage of snapshot.skillUsage) {
          this.usageRecords.set(usage.skillName, usage);
        }
        restored.usage = snapshot.skillUsage.length;
      }

      // 恢复环境变量（仅记录，不直接恢复到系统）
      if (options?.restoreEnvironment !== false) {
        restored.environment = Object.keys(snapshot.environment).length;
      }

      restored.skills = snapshot.skills.length;

      logger.info(`[Snapshot] Restored snapshot: ${snapshotId}`);

      return {
        success: true,
        snapshotId,
        restored,
      };
    } catch (err) {
      return {
        success: false,
        snapshotId,
        restored,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** 开始自动快照 */
  startAutoSnapshot(intervalMinutes: number = 60): void {
    if (this.autoSnapshotInterval) {
      this.stopAutoSnapshot();
    }

    this.autoSnapshotInterval = setInterval(async () => {
      try {
        await this.createSnapshot({
          type: "auto",
          tags: ["auto"],
          description: "Auto-snapshot",
        });
      } catch (err) {
        logger.error("[Snapshot] Auto-snapshot failed:", err);
      }
    }, intervalMinutes * 60 * 1000);

    logger.info(`[Snapshot] Auto-snapshot started (interval: ${intervalMinutes}min)`);
  }

  /** 停止自动快照 */
  stopAutoSnapshot(): void {
    if (this.autoSnapshotInterval) {
      clearInterval(this.autoSnapshotInterval);
      this.autoSnapshotInterval = null;
      logger.info("[Snapshot] Auto-snapshot stopped");
    }
  }

  /** 是否正在自动快照 */
  isAutoSnapshotRunning(): boolean {
    return this.autoSnapshotInterval !== null;
  }

  /** 获取配置 */
  getConfig(): { snapshotsDir: string } {
    return { snapshotsDir: this.snapshotsDir };
  }
}

// ============================================================================
// 全局实例
// ============================================================================

let globalSnapshotManager: SessionSnapshotManager | null = null;

/** 获取全局会话快照管理器 */
export function getSessionSnapshotManager(): SessionSnapshotManager {
  if (!globalSnapshotManager) {
    globalSnapshotManager = new SessionSnapshotManager();
  }
  return globalSnapshotManager;
}

/** 初始化全局会话快照管理器 */
export function initSessionSnapshotManager(snapshotsDir?: string): SessionSnapshotManager {
  globalSnapshotManager = new SessionSnapshotManager(snapshotsDir);
  return globalSnapshotManager;
}

/** 重置全局管理器 */
export function resetSessionSnapshotManager(): void {
  globalSnapshotManager = null;
}

// ============================================================================
// 兼容层：旧版 API 支持
// ============================================================================

/** 技能快照格式（旧版） */
export interface SessionSkillSnapshot {
  skills: Array<{ name: string; [key: string]: unknown }>;
  prompt?: string;
  resolvedSkills?: Array<{ name: string; description?: string; [key: string]: unknown }>;
  promptFormatVersion?: string;
  [key: string]: unknown;
}

/** 构建会话技能快照的选项 */
export interface BuildSnapshotOptions {
  includePrompt?: boolean;
  skillFilter?: string[];
}

/** 构建会话技能快照 */
export function buildSessionSkillSnapshot(
  skillEntries: Array<{ skill: { name: string; disableModelInvocation?: boolean; [key: string]: unknown }; frontmatter: Record<string, unknown> }>,
  options?: BuildSnapshotOptions
): SessionSkillSnapshot {
  let filtered = skillEntries;

  if (options?.skillFilter) {
    filtered = filtered.filter((e) => options.skillFilter!.includes(e.skill.name));
  }

  filtered = filtered.filter((e) => !e.skill.disableModelInvocation);

  filtered.sort((a, b) => a.skill.name.localeCompare(b.skill.name));

  const result: SessionSkillSnapshot = {
    skills: filtered.map((e) => e.skill),
    resolvedSkills: filtered.map((e) => ({
      ...e.skill,
      name: e.skill.name,
    })),
    promptFormatVersion: "1.0.0",
    version: "1.0.0",
    createdAt: Date.now(),
  };

  if (options?.includePrompt !== false) {
    result.prompt = filtered.map((e) => e.skill.description || "").join("\n");
  } else {
    result.prompt = "";
  }

  return result;
}

/** 转换为旧版格式 */
export function snapshotToLegacyFormat(snapshot: SessionSkillSnapshot): {
  skills: Array<{ name: string; [key: string]: unknown }>;
  resolvedSkills?: Array<{ name: string; description?: string; [key: string]: unknown }>;
  promptFormatVersion?: string;
  prompt?: string;
  [key: string]: unknown;
} {
  return snapshot;
}

/** 比较两个快照是否相等 */
export function snapshotsEqual(a: SessionSkillSnapshot, b: SessionSkillSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 比较两个快照的差异 */
export function diffSnapshots(a: SessionSkillSnapshot, b: SessionSkillSnapshot): {
  added: string[];
  removed: string[];
  changed: string[];
} {
  const aNames = new Set(a.skills.map((s) => s.name));
  const bNames = new Set(b.skills.map((s) => s.name));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const name of bNames) {
    if (!aNames.has(name)) {
      added.push(name);
    }
  }

  for (const name of aNames) {
    if (!bNames.has(name)) {
      removed.push(name);
    }
  }

  for (const name of aNames) {
    if (bNames.has(name)) {
      const aSkill = a.skills.find((s) => s.name === name);
      const bSkill = b.skills.find((s) => s.name === name);
      if (aSkill && bSkill && JSON.stringify(aSkill) !== JSON.stringify(bSkill)) {
        changed.push(name);
      }
    }
  }

  return { added, removed, changed };
}

/** 从快照获取技能 */
export function getSkillFromSnapshot(
  snapshot: SessionSkillSnapshot,
  skillName: string
): { name: string; [key: string]: unknown } | undefined {
  return snapshot.skills.find(
    (s) => s.name.toLowerCase() === skillName.toLowerCase()
  );
}

/** 从快照获取技能名称列表 */
export function getSkillNamesFromSnapshot(snapshot: SessionSkillSnapshot): string[] {
  return snapshot.skills.map((s) => s.name);
}