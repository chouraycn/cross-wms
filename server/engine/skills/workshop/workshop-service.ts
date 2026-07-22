/**
 * 技能提案工作流系统
 *
 * 参考 OpenClaw 的 workshop 模块：
 * - 技能提案的创建、修订、应用、拒绝流程
 * - 提案快照和回滚机制
 * - 工作流审批策略（apply/reject/quarantine）
 */

import path from "node:path";
import fs from "node:fs/promises";
import { getChildLogger } from "../../logging/logger.js";
import { getSkillOriginTracker } from "../lifecycle/skill-origin.js";

const logger = getChildLogger("skill-workshop");

// ============================================================================
// 类型定义
// ============================================================================

/** 提案状态 */
export type ProposalStatus = "draft" | "review" | "approved" | "rejected" | "applied" | "quarantined";

/** 提案操作 */
export type ProposalAction = "create" | "update" | "submit" | "approve" | "reject" | "apply" | "quarantine" | "restore";

/** 提案变更类型 */
export type ProposalChangeType = "create-skill" | "update-skill" | "delete-skill" | "move-skill" | "rename-skill";

/** 提案变更 */
export interface ProposalChange {
  /** 变更类型 */
  type: ProposalChangeType;
  /** 技能名称 */
  skillName: string;
  /** 旧技能名称（重命名时） */
  oldSkillName?: string;
  /** 新技能名称（重命名时） */
  newSkillName?: string;
  /** 技能内容（创建/更新时） */
  content?: string;
  /** 技能路径 */
  path?: string;
  /** 变更描述 */
  description?: string;
}

/** 提案审核意见 */
export interface ProposalReview {
  /** 审核人 */
  reviewer: string;
  /** 审核时间 */
  timestamp: number;
  /** 审核意见 */
  comment: string;
  /** 是否批准 */
  approved: boolean;
}

/** 技能提案 */
export interface SkillProposal {
  /** 提案 ID */
  id: string;
  /** 提案标题 */
  title: string;
  /** 提案描述 */
  description?: string;
  /** 提案人 */
  author: string;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 当前状态 */
  status: ProposalStatus;
  /** 变更列表 */
  changes: ProposalChange[];
  /** 审核意见列表 */
  reviews: ProposalReview[];
  /** 标签 */
  tags?: string[];
  /** 关联会话 ID */
  sessionId?: string;
  /** 提案快照 */
  snapshot?: string;
}

/** 提案创建选项 */
export interface CreateProposalOptions {
  /** 提案标题 */
  title: string;
  /** 提案描述 */
  description?: string;
  /** 提案人 */
  author: string;
  /** 变更列表 */
  changes: ProposalChange[];
  /** 标签 */
  tags?: string[];
  /** 关联会话 ID */
  sessionId?: string;
}

/** 提案操作结果 */
export interface ProposalActionResult {
  /** 是否成功 */
  success: boolean;
  /** 提案 ID */
  proposalId: string;
  /** 新状态 */
  status?: ProposalStatus;
  /** 操作类型 */
  action: ProposalAction;
  /** 错误信息 */
  error?: string;
}

// ============================================================================
// 技能提案工作流服务
// ============================================================================

/** 技能提案工作流服务 */
export class SkillWorkshopService {
  private proposalsDir: string;
  private proposals: Map<string, SkillProposal> = new Map();

  constructor(proposalsDir?: string) {
    this.proposalsDir = proposalsDir || path.join(process.cwd(), ".proposals");
  }

  /** 初始化 */
  async init(): Promise<void> {
    await fs.mkdir(this.proposalsDir, { recursive: true });
    await this.loadProposals();
  }

  /** 加载所有提案 */
  private async loadProposals(): Promise<void> {
    try {
      const files = await fs.readdir(this.proposalsDir);

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const proposalId = file.replace(".json", "");
        const proposal = await this.loadProposal(proposalId);
        if (proposal) {
          this.proposals.set(proposalId, proposal);
        }
      }
    } catch {
      // 目录不存在
    }
  }

  /** 创建提案 */
  async createProposal(options: CreateProposalOptions): Promise<SkillProposal> {
    const proposalId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();

    const proposal: SkillProposal = {
      id: proposalId,
      title: options.title,
      description: options.description,
      author: options.author,
      createdAt: now,
      updatedAt: now,
      status: "draft",
      changes: options.changes,
      reviews: [],
      tags: options.tags,
      sessionId: options.sessionId,
    };

    this.proposals.set(proposalId, proposal);
    await this.saveProposal(proposal);

    logger.info(`[Workshop] Created proposal: ${proposalId} by ${options.author}`);
    return proposal;
  }

  /** 获取提案 */
  getProposal(proposalId: string): SkillProposal | undefined {
    return this.proposals.get(proposalId);
  }

  /** 加载提案 */
  async loadProposal(proposalId: string): Promise<SkillProposal | null> {
    const filePath = this.getProposalPath(proposalId);

    try {
      const content = await fs.readFile(filePath, "utf8");
      return JSON.parse(content) as SkillProposal;
    } catch {
      return null;
    }
  }

  /** 保存提案 */
  private async saveProposal(proposal: SkillProposal): Promise<void> {
    const filePath = this.getProposalPath(proposal.id);
    await fs.writeFile(filePath, JSON.stringify(proposal, null, 2) + "\n", "utf8");
  }

  /** 获取提案文件路径 */
  private getProposalPath(proposalId: string): string {
    return path.join(this.proposalsDir, `${proposalId}.json`);
  }

  /** 更新提案 */
  async updateProposal(
    proposalId: string,
    updates: Partial<Pick<SkillProposal, "title" | "description" | "changes" | "tags">>
  ): Promise<SkillProposal | null> {
    const proposal = this.proposals.get(proposalId);

    if (!proposal) {
      return null;
    }

    if (proposal.status !== "draft") {
      throw new Error(`Cannot update proposal in state: ${proposal.status}`);
    }

    if (updates.title !== undefined) {
      proposal.title = updates.title;
    }
    if (updates.description !== undefined) {
      proposal.description = updates.description;
    }
    if (updates.changes !== undefined) {
      proposal.changes = updates.changes;
    }
    if (updates.tags !== undefined) {
      proposal.tags = updates.tags;
    }

    proposal.updatedAt = Date.now();
    await this.saveProposal(proposal);

    logger.info(`[Workshop] Updated proposal: ${proposalId}`);
    return proposal;
  }

  /** 提交提案审核 */
  async submitProposal(proposalId: string): Promise<ProposalActionResult> {
    const proposal = this.proposals.get(proposalId);

    if (!proposal) {
      return {
        success: false,
        proposalId,
        action: "submit",
        error: `Proposal "${proposalId}" not found`,
      };
    }

    if (proposal.status !== "draft") {
      return {
        success: false,
        proposalId,
        action: "submit",
        status: proposal.status,
        error: `Cannot submit proposal in state: ${proposal.status}`,
      };
    }

    proposal.status = "review";
    proposal.updatedAt = Date.now();
    await this.saveProposal(proposal);

    logger.info(`[Workshop] Submitted proposal for review: ${proposalId}`);
    return {
      success: true,
      proposalId,
      action: "submit",
      status: "review",
    };
  }

  /** 批准提案 */
  async approveProposal(
    proposalId: string,
    reviewer: string,
    comment: string
  ): Promise<ProposalActionResult> {
    const proposal = this.proposals.get(proposalId);

    if (!proposal) {
      return {
        success: false,
        proposalId,
        action: "approve",
        error: `Proposal "${proposalId}" not found`,
      };
    }

    if (proposal.status !== "review") {
      return {
        success: false,
        proposalId,
        action: "approve",
        status: proposal.status,
        error: `Cannot approve proposal in state: ${proposal.status}`,
      };
    }

    proposal.status = "approved";
    proposal.reviews.push({
      reviewer,
      timestamp: Date.now(),
      comment,
      approved: true,
    });
    proposal.updatedAt = Date.now();
    await this.saveProposal(proposal);

    logger.info(`[Workshop] Proposal approved: ${proposalId} by ${reviewer}`);
    return {
      success: true,
      proposalId,
      action: "approve",
      status: "approved",
    };
  }

  /** 拒绝提案 */
  async rejectProposal(
    proposalId: string,
    reviewer: string,
    comment: string
  ): Promise<ProposalActionResult> {
    const proposal = this.proposals.get(proposalId);

    if (!proposal) {
      return {
        success: false,
        proposalId,
        action: "reject",
        error: `Proposal "${proposalId}" not found`,
      };
    }

    if (proposal.status !== "review") {
      return {
        success: false,
        proposalId,
        action: "reject",
        status: proposal.status,
        error: `Cannot reject proposal in state: ${proposal.status}`,
      };
    }

    proposal.status = "rejected";
    proposal.reviews.push({
      reviewer,
      timestamp: Date.now(),
      comment,
      approved: false,
    });
    proposal.updatedAt = Date.now();
    await this.saveProposal(proposal);

    logger.info(`[Workshop] Proposal rejected: ${proposalId} by ${reviewer}`);
    return {
      success: true,
      proposalId,
      action: "reject",
      status: "rejected",
    };
  }

  /** 应用提案 */
  async applyProposal(proposalId: string): Promise<ProposalActionResult> {
    const proposal = this.proposals.get(proposalId);

    if (!proposal) {
      return {
        success: false,
        proposalId,
        action: "apply",
        error: `Proposal "${proposalId}" not found`,
      };
    }

    if (proposal.status !== "approved") {
      return {
        success: false,
        proposalId,
        action: "apply",
        status: proposal.status,
        error: `Cannot apply proposal in state: ${proposal.status}`,
      };
    }

    // 执行变更
    try {
      await this.executeChanges(proposal);

      proposal.status = "applied";
      proposal.updatedAt = Date.now();
      await this.saveProposal(proposal);

      logger.info(`[Workshop] Applied proposal: ${proposalId}`);
      return {
        success: true,
        proposalId,
        action: "apply",
        status: "applied",
      };
    } catch (err) {
      return {
        success: false,
        proposalId,
        action: "apply",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** 执行提案变更 */
  private async executeChanges(proposal: SkillProposal): Promise<void> {
    const originTracker = getSkillOriginTracker();

    for (const change of proposal.changes) {
      switch (change.type) {
        case "create-skill":
        case "update-skill":
          // 创建或更新技能来源记录
          await originTracker.trackInstallation(change.skillName, {
            version: 1,
            sourceType: "local",
            slug: change.skillName,
            installedVersion: "1.0.0",
            installedAt: Date.now(),
          } as unknown as never);
          break;

        case "delete-skill":
          // 删除技能来源记录
          await originTracker.deleteOrigin(change.skillName);
          break;

        case "rename-skill":
          // 重命名技能来源记录
          if (change.oldSkillName && change.newSkillName) {
            const origin = await originTracker.readOrigin(change.oldSkillName);
            if (origin) {
              await originTracker.writeOrigin(change.newSkillName, {
                ...origin,
                slug: change.newSkillName,
              });
              await originTracker.deleteOrigin(change.oldSkillName);
            }
          }
          break;

        case "move-skill":
          // 移动技能（仅更新路径）
          break;
      }
    }
  }

  /** 隔离提案 */
  async quarantineProposal(proposalId: string, reason: string): Promise<ProposalActionResult> {
    const proposal = this.proposals.get(proposalId);

    if (!proposal) {
      return {
        success: false,
        proposalId,
        action: "quarantine",
        error: `Proposal "${proposalId}" not found`,
      };
    }

    if (proposal.status !== "review" && proposal.status !== "approved") {
      return {
        success: false,
        proposalId,
        action: "quarantine",
        status: proposal.status,
        error: `Cannot quarantine proposal in state: ${proposal.status}`,
      };
    }

    proposal.status = "quarantined";
    proposal.reviews.push({
      reviewer: "system",
      timestamp: Date.now(),
      comment: `Quarantined: ${reason}`,
      approved: false,
    });
    proposal.updatedAt = Date.now();
    await this.saveProposal(proposal);

    logger.info(`[Workshop] Proposal quarantined: ${proposalId} - ${reason}`);
    return {
      success: true,
      proposalId,
      action: "quarantine",
      status: "quarantined",
    };
  }

  /** 恢复隔离的提案 */
  async restoreProposal(proposalId: string): Promise<ProposalActionResult> {
    const proposal = this.proposals.get(proposalId);

    if (!proposal) {
      return {
        success: false,
        proposalId,
        action: "restore",
        error: `Proposal "${proposalId}" not found`,
      };
    }

    if (proposal.status !== "quarantined") {
      return {
        success: false,
        proposalId,
        action: "restore",
        status: proposal.status,
        error: `Cannot restore proposal in state: ${proposal.status}`,
      };
    }

    proposal.status = "review";
    proposal.updatedAt = Date.now();
    await this.saveProposal(proposal);

    logger.info(`[Workshop] Proposal restored: ${proposalId}`);
    return {
      success: true,
      proposalId,
      action: "restore",
      status: "review",
    };
  }

  /** 删除提案 */
  async deleteProposal(proposalId: string): Promise<boolean> {
    const filePath = this.getProposalPath(proposalId);

    try {
      await fs.unlink(filePath);
      this.proposals.delete(proposalId);
      logger.info(`[Workshop] Deleted proposal: ${proposalId}`);
      return true;
    } catch {
      return false;
    }
  }

  /** 列出所有提案 */
  listProposals(status?: ProposalStatus): SkillProposal[] {
    let proposals = Array.from(this.proposals.values());

    if (status) {
      proposals = proposals.filter((p) => p.status === status);
    }

    return proposals.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** 获取提案统计 */
  getStats(): Record<ProposalStatus, number> {
    const stats: Record<ProposalStatus, number> = {
      draft: 0,
      review: 0,
      approved: 0,
      rejected: 0,
      applied: 0,
      quarantined: 0,
    };

    for (const proposal of this.proposals.values()) {
      stats[proposal.status]++;
    }

    return stats;
  }

  /** 获取配置 */
  getConfig(): { proposalsDir: string } {
    return { proposalsDir: this.proposalsDir };
  }
}

// ============================================================================
// 全局实例
// ============================================================================

let globalWorkshopService: SkillWorkshopService | null = null;

/** 获取全局提案工作流服务 */
export function getSkillWorkshopService(): SkillWorkshopService {
  if (!globalWorkshopService) {
    globalWorkshopService = new SkillWorkshopService();
  }
  return globalWorkshopService;
}

/** 初始化全局提案工作流服务 */
export function initSkillWorkshopService(proposalsDir?: string): SkillWorkshopService {
  globalWorkshopService = new SkillWorkshopService(proposalsDir);
  return globalWorkshopService;
}

/** 重置全局服务 */
export function resetSkillWorkshopService(): void {
  globalWorkshopService = null;
}