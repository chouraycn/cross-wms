/**
 * Skill Workshop — 技能提案工作流
 *
 * 实现技能（Skill）变更的提案-审批-应用-回滚全流程：
 * 1. createProposal — 创建提案，自动调用安全扫描器进行风险检测
 * 2. applyProposal  — 应用提案（需通过安全扫描），保存回滚信息
 * 3. rejectProposal — 拒绝提案
 * 4. quarantineProposal — 隔离高风险提案
 * 5. rollbackProposal — 回滚已应用的提案
 *
 * 安全集成：
 * - 创建提案时自动调用 skillSecurityScanner 扫描
 * - critical 级别发现自动隔离提案
 * - apply 前再次验证扫描结果
 *
 * 持久化：
 * - 使用内存 Map 存储（后续可扩展到数据库）
 * - 提供 exportAll / importAll 功能
 *
 * 参考：openclaw/src/skills/workshop/
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../logger.js';
import { skillSecurityScanner } from './skillSecurityScanner.js';
import type { SkillDefinition } from '../types/skill-runtime.js';

// ===================== 类型定义 =====================

/** 提案状态 */
export type ProposalStatus = 'pending' | 'applied' | 'rejected' | 'quarantined' | 'stale';

/** 提案类型 */
export type ProposalType = 'create' | 'update';

/** 提案来源（追溯提案是由哪个 Agent/会话/消息产生的） */
export interface ProposalOrigin {
  agentId?: string;
  sessionKey?: string;
  runId?: string;
  messageId?: string;
}

/** 提案扫描结果（精简版，来自 skillSecurityScanner） */
export interface ProposalScan {
  /** critical 级别发现数 */
  critical: number;
  /** warn 级别发现数（含 high / medium） */
  warn: number;
  /** info 级别发现数（含 low / none） */
  info: number;
  /** 发现列表 */
  findings: Array<{ level: string; type: string; description: string }>;
}

/** 回滚信息（应用 update 提案时保存旧内容，便于回滚） */
export interface ProposalRollback {
  /** 旧内容哈希 */
  previousContentHash: string;
  /** 旧内容 */
  previousContent: string;
  /** 应用时间戳 */
  appliedAt: number;
}

/**
 * 技能提案
 */
export interface SkillProposal {
  /** 提案 ID */
  id: string;
  /** 提案类型（创建 / 更新） */
  type: ProposalType;
  /** 技能名称 */
  skillName: string;
  /** 技能文件路径（SKILL.md 路径） */
  skillPath: string;
  /** 新的 SKILL.md 内容 */
  content: string;
  /** 内容哈希（用于检测内容是否被篡改） */
  contentHash: string;
  /** 创建 update 提案时目标文件的当前内容哈希（用于 stale 检测） */
  currentContentHash?: string;
  /** 提案状态 */
  status: ProposalStatus;
  /** 提案来源 */
  origin?: ProposalOrigin;
  /** 安全扫描结果 */
  scan: ProposalScan;
  /** 回滚信息（仅 update 提案应用后存在） */
  rollback?: ProposalRollback;
  /** 创建时间戳 */
  createdAt: number;
  /** 更新时间戳 */
  updatedAt: number;
  /** 应用时间戳 */
  appliedAt?: number;
  /** 拒绝时间戳 */
  rejectedAt?: number;
  /** 审批备注 */
  reviewNote?: string;
}

/** 创建提案参数 */
export interface CreateProposalParams {
  /** 提案类型 */
  type: ProposalType;
  /** 技能名称 */
  skillName: string;
  /** 技能文件路径 */
  skillPath: string;
  /** SKILL.md 内容 */
  content: string;
  /** 提案来源 */
  origin?: ProposalOrigin;
  /** 当前已存在的内容（update 类型时用于回滚） */
  previousContent?: string;
  /** 当前目标文件内容哈希（update 类型时用于 stale 检测） */
  currentContentHash?: string;
}

/** 提案过滤条件 */
export interface ProposalFilter {
  /** 按状态过滤 */
  status?: ProposalStatus;
  /** 按类型过滤 */
  type?: ProposalType;
  /** 按技能名过滤 */
  skillName?: string;
}

// ===================== 常量 =====================

/** 最大历史记录数 */
const MAX_PROPOSALS = 1000;

/** 锁超时时间（毫秒），默认 30 秒 */
const LOCK_TIMEOUT_MS = 30000;

/** 文件锁目录 */
const FILE_LOCK_DIR = path.join(os.tmpdir(), 'workbuddy-proposal-locks');

// ===================== SkillWorkshop 类 =====================

/**
 * 技能提案工作坊
 *
 * 管理技能变更提案的完整生命周期。
 */
export class SkillWorkshop {
  /** 提案存储：id → SkillProposal */
  private proposals = new Map<string, SkillProposal>();

  /** 内存锁：skillPathHash → { promise: Promise<void>, timeout: NodeJS.Timeout } */
  private targetLocks = new Map<string, { promise: Promise<void>; timeout: NodeJS.Timeout }>();

  constructor() {
    this.ensureFileLockDir();
  }

  // ===================== 1. 提案创建 =====================

  /**
   * 创建提案
   *
   * 创建时自动调用 skillSecurityScanner 进行安全扫描：
   * - 若发现 critical 级别风险，提案状态自动设为 'quarantined'
   * - 否则状态为 'pending'，等待审批
   *
   * @param params - 创建参数
   * @returns 创建的提案
   */
  createProposal(params: CreateProposalParams): SkillProposal {
    const { type, skillName, skillPath, content, origin, previousContent, currentContentHash } = params;

    if (!skillName || !skillName.trim()) {
      throw new Error('Skill name is required.');
    }
    if (!content || !content.trim()) {
      throw new Error('Proposal content is required.');
    }

    const id = this.generateProposalId(skillName);
    const contentHash = this.hashContent(content);
    const now = Date.now();

    // 构造 SkillDefinition 用于扫描
    const scan = this.scanContent(content, skillName);

    // 根据扫描结果决定初始状态
    const hasCritical = scan.critical > 0;
    const status: ProposalStatus = hasCritical ? 'quarantined' : 'pending';

    const proposal: SkillProposal = {
      id,
      type,
      skillName,
      skillPath,
      content,
      contentHash,
      currentContentHash,
      status,
      ...(origin ? { origin } : {}),
      scan,
      createdAt: now,
      updatedAt: now,
    };

    // update 提案且提供了 previousContent 时，暂存到 rollback（应用时再正式写入）
    if (type === 'update' && previousContent !== undefined) {
      proposal.rollback = {
        previousContentHash: this.hashContent(previousContent),
        previousContent,
        appliedAt: 0, // 占位，apply 时更新
      };
    }

    this.proposals.set(id, proposal);
    this.enforceLimit();

    if (hasCritical) {
      logger.warn(
        `[SkillWorkshop] Proposal '${id}' auto-quarantined due to ${scan.critical} critical finding(s).`,
      );
    } else {
      logger.info(`[SkillWorkshop] Proposal '${id}' created (type=${type}, skill=${skillName}).`);
    }

    return proposal;
  }

  // ===================== 2. 提案应用 =====================

  /**
   * 应用提案
   *
   * 应用前会再次验证扫描结果：
   * - 若存在 critical 风险，自动隔离并拒绝应用
   * - 仅 'pending' 状态的提案可以应用
   *
   * 注意：本方法仅更新提案状态与回滚信息，实际写文件由上层负责。
   *
   * @param id - 提案 ID
   * @param reviewerId - 审批人 ID（可选）
   * @returns 应用后的提案
   */
  applyProposal(id: string, reviewerId?: string): SkillProposal {
    const proposal = this.getProposalRequired(id);

    if (proposal.status !== 'pending') {
      throw new Error(
        `Only pending proposals can be applied. Current status: ${proposal.status}.`,
      );
    }

    // Stale 检测：如果是 update 提案且有 currentContentHash，检查文件是否已被修改
    if (proposal.type === 'update' && proposal.currentContentHash) {
      const isStale = this.checkStale(proposal);
      if (isStale) {
        this.markStale(id);
        throw new Error(
          `Proposal '${id}' is stale: target file content has changed since proposal creation.`,
        );
      }
    }

    // 应用前再次扫描验证（防止内容被篡改后绕过初始扫描）
    const rescan = this.scanContent(proposal.content, proposal.skillName);

    if (rescan.critical > 0) {
      // 自动隔离
      const now = Date.now();
      const quarantined: SkillProposal = {
        ...proposal,
        status: 'quarantined',
        updatedAt: now,
        scan: rescan,
        reviewNote: 'Apply blocked: critical security findings detected on rescan.',
      };
      this.proposals.set(id, quarantined);
      logger.warn(
        `[SkillWorkshop] Proposal '${id}' quarantined during apply (critical findings on rescan).`,
      );
      throw new Error(
        `Proposal '${id}' was quarantined: ${rescan.critical} critical finding(s) detected on rescan.`,
      );
    }

    const now = Date.now();

    // 更新回滚信息
    if (proposal.type === 'update' && proposal.rollback) {
      proposal.rollback.appliedAt = now;
    }

    const applied: SkillProposal = {
      ...proposal,
      status: 'applied',
      updatedAt: now,
      appliedAt: now,
      scan: rescan,
      ...(reviewerId ? { reviewNote: `Applied by ${reviewerId}` } : {}),
    };

    this.proposals.set(id, applied);
    logger.info(`[SkillWorkshop] Proposal '${id}' applied (skill=${proposal.skillName}).`);

    return applied;
  }

  // ===================== 3. 提案拒绝 =====================

  /**
   * 拒绝提案
   *
   * @param id - 提案 ID
   * @param reason - 拒绝原因
   * @param reviewerId - 审批人 ID（可选）
   * @returns 拒绝后的提案
   */
  rejectProposal(id: string, reason: string, reviewerId?: string): SkillProposal {
    const proposal = this.getProposalRequired(id);

    if (proposal.status !== 'pending') {
      throw new Error(
        `Only pending proposals can be rejected. Current status: ${proposal.status}.`,
      );
    }

    const now = Date.now();
    const note = reviewerId ? `Rejected by ${reviewerId}: ${reason}` : reason;

    const rejected: SkillProposal = {
      ...proposal,
      status: 'rejected',
      updatedAt: now,
      rejectedAt: now,
      reviewNote: note,
    };

    this.proposals.set(id, rejected);
    logger.info(`[SkillWorkshop] Proposal '${id}' rejected: ${reason}`);

    return rejected;
  }

  // ===================== 4. 提案隔离 =====================

  /**
   * 隔离提案
   *
   * 通常用于安全风险或异常情况。
   *
   * @param id - 提案 ID
   * @param reason - 隔离原因
   * @returns 隔离后的提案
   */
  quarantineProposal(id: string, reason: string): SkillProposal {
    const proposal = this.getProposalRequired(id);

    if (proposal.status === 'applied') {
      throw new Error('Applied proposals cannot be quarantined. Use rollback instead.');
    }

    const now = Date.now();
    const quarantined: SkillProposal = {
      ...proposal,
      status: 'quarantined',
      updatedAt: now,
      reviewNote: reason,
    };

    this.proposals.set(id, quarantined);
    logger.warn(`[SkillWorkshop] Proposal '${id}' quarantined: ${reason}`);

    return quarantined;
  }

  // ===================== 5. 提案回滚 =====================

  /**
   * 回滚已应用的提案
   *
   * 仅 'applied' 状态的 update 提案可以回滚。
   * 回滚后提案状态变为 'pending'，可重新审批。
   *
   * 注意：本方法仅更新提案状态与回滚信息，实际写文件由上层负责。
   *
   * @param id - 提案 ID
   * @returns 回滚后的提案（包含 previousContent 供上层写回）
   */
  rollbackProposal(id: string): SkillProposal {
    const proposal = this.getProposalRequired(id);

    if (proposal.status !== 'applied') {
      throw new Error(
        `Only applied proposals can be rolled back. Current status: ${proposal.status}.`,
      );
    }

    if (proposal.type !== 'update' || !proposal.rollback) {
      throw new Error('Only update proposals with rollback info can be rolled back.');
    }

    const now = Date.now();
    const rolledBack: SkillProposal = {
      ...proposal,
      status: 'pending',
      updatedAt: now,
      appliedAt: undefined,
      reviewNote: `Rolled back at ${new Date(now).toISOString()}`,
    };

    this.proposals.set(id, rolledBack);
    logger.info(`[SkillWorkshop] Proposal '${id}' rolled back.`);

    return rolledBack;
  }

  // ===================== 6. 查询接口 =====================

  /**
   * 列出提案（支持过滤）
   *
   * @param filter - 过滤条件（可选）
   * @returns 提案列表（按创建时间倒序）
   */
  listProposals(filter?: ProposalFilter): SkillProposal[] {
    let results = Array.from(this.proposals.values());

    if (filter?.status) {
      results = results.filter((p) => p.status === filter.status);
    }

    if (filter?.type) {
      results = results.filter((p) => p.type === filter.type);
    }

    if (filter?.skillName) {
      const name = filter.skillName.toLowerCase();
      results = results.filter((p) => p.skillName.toLowerCase().includes(name));
    }

    // 按创建时间倒序
    results.sort((a, b) => b.createdAt - a.createdAt);

    return results;
  }

  /**
   * 获取提案详情
   *
   * @param id - 提案 ID
   * @returns 提案或 undefined
   */
  getProposal(id: string): SkillProposal | undefined {
    return this.proposals.get(id);
  }

  /**
   * 获取提案（必须存在，否则抛错）
   */
  private getProposalRequired(id: string): SkillProposal {
    const proposal = this.proposals.get(id);
    if (!proposal) {
      throw new Error(`Skill proposal not found: ${id}`);
    }
    return proposal;
  }

  // ===================== 7. 统计信息 =====================

  /**
   * 获取统计信息
   *
   * @returns 按状态分组的提案数量
   */
  getStats(): {
    total: number;
    byStatus: Record<ProposalStatus, number>;
    byType: Record<ProposalType, number>;
  } {
    const byStatus: Record<ProposalStatus, number> = {
      pending: 0,
      applied: 0,
      rejected: 0,
      quarantined: 0,
      stale: 0,
    };

    const byType: Record<ProposalType, number> = {
      create: 0,
      update: 0,
    };

    for (const proposal of this.proposals.values()) {
      byStatus[proposal.status]++;
      byType[proposal.type]++;
    }

    return {
      total: this.proposals.size,
      byStatus,
      byType,
    };
  }

  // ===================== 8. 导入导出 =====================

  /**
   * 导出所有提案（用于持久化）
   *
   * @returns 提案列表
   */
  exportAll(): SkillProposal[] {
    return Array.from(this.proposals.values());
  }

  /**
   * 导入提案（用于恢复或批量加载）
   *
   * @param proposals - 提案列表
   * @param replace - 是否替换现有数据（默认 false，仅追加）
   */
  importAll(proposals: SkillProposal[], replace = false): void {
    if (replace) {
      this.proposals.clear();
    }

    for (const proposal of proposals) {
      this.proposals.set(proposal.id, proposal);
    }

    this.enforceLimit();
    logger.info(
      `[SkillWorkshop] Imported ${proposals.length} proposal(s) (replace=${replace}).`,
    );
  }

  /**
   * 清空所有提案
   */
  clear(): void {
    const count = this.proposals.size;
    this.proposals.clear();
    logger.info(`[SkillWorkshop] Cleared ${count} proposal(s).`);
  }

  // ===================== 9. 辅助方法 =====================

  /**
   * 扫描内容并生成 ProposalScan
   *
   * 将 skillSecurityScanner 的 ScanResult 转换为 ProposalScan：
   * - critical: level === 'critical'
   * - warn: level === 'high' || 'medium'
   * - info: level === 'low' || 'none'
   *
   * @param content - SKILL.md 内容
   * @param skillName - 技能名称
   * @returns 提案扫描结果
   */
  private scanContent(content: string, skillName: string): ProposalScan {
    // 构造 SkillDefinition 供扫描器使用
    const definition: SkillDefinition = {
      id: skillName,
      name: skillName,
      description: '',
      group: 'util',
      source: 'workspace',
      skillMdContent: content,
    };

    // 不使用缓存，确保每次扫描都是最新的
    const result = skillSecurityScanner.scanSkill(definition, false);

    const findings = result.findings.map((f) => ({
      level: f.level,
      type: f.type,
      description: f.description,
    }));

    const critical = findings.filter((f) => f.level === 'critical').length;
    const warn = findings.filter((f) => f.level === 'high' || f.level === 'medium').length;
    const info = findings.filter((f) => f.level === 'low' || f.level === 'none').length;

    return {
      critical,
      warn,
      info,
      findings,
    };
  }

  /**
   * 生成提案 ID
   *
   * 格式：proposal_<skillName>_<timestamp>_<random>
   *
   * @param skillName - 技能名称
   * @returns 提案 ID
   */
  private generateProposalId(skillName: string): string {
    const normalized = skillName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `proposal_${normalized || 'skill'}_${ts}_${rand}`;
  }

  /**
   * 计算内容哈希（SHA-256，取前 16 位）
   *
   * @param content - 内容字符串
   * @returns 哈希值
   */
  private hashContent(content: string): string {
    if (!content) {
      return '0'.repeat(16);
    }
    return crypto
      .createHash('sha256')
      .update(content)
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * 限制提案数量（超出时移除最早的）
   */
  private enforceLimit(): void {
    if (this.proposals.size <= MAX_PROPOSALS) {
      return;
    }

    // 按 createdAt 升序，移除最早的
    const sorted = Array.from(this.proposals.values()).sort(
      (a, b) => a.createdAt - b.createdAt,
    );

    const toRemove = sorted.length - MAX_PROPOSALS;
    for (let i = 0; i < toRemove; i++) {
      this.proposals.delete(sorted[i].id);
    }

    logger.debug(`[SkillWorkshop] Trimmed ${toRemove} old proposal(s) to enforce limit.`);
  }

  // ===================== 10. 目标锁机制 =====================

  /**
   * 使用目标锁执行异步操作
   *
   * 基于 skillPath 的哈希值作为锁 key，同一 skillPath 的并发操作会排队执行。
   * 锁默认 30 秒后自动释放，防止死锁。
   *
   * @param skillPath - 技能文件路径
   * @param fn - 要执行的异步函数
   * @returns 函数执行结果
   */
  async withTargetLock<T>(skillPath: string, fn: () => Promise<T>): Promise<T> {
    const lockKey = this.hashSkillPath(skillPath);
    logger.debug(`[SkillWorkshop] Acquiring target lock for ${skillPath} (key=${lockKey})`);

    const existing = this.targetLocks.get(lockKey);
    let resultPromise: Promise<T>;

    if (existing) {
      resultPromise = existing.promise.then(() => fn());
    } else {
      resultPromise = fn();
    }

    const finalPromise = resultPromise
      .then((result) => {
        this.releaseTargetLock(lockKey);
        logger.debug(`[SkillWorkshop] Target lock released for ${skillPath} (success)`);
        return result;
      })
      .catch((error) => {
        this.releaseTargetLock(lockKey);
        logger.debug(`[SkillWorkshop] Target lock released for ${skillPath} (error: ${error.message})`);
        throw error;
      });

    const timeout = setTimeout(() => {
      if (this.targetLocks.has(lockKey)) {
        logger.warn(`[SkillWorkshop] Target lock timeout for ${skillPath}, auto-releasing.`);
        this.targetLocks.delete(lockKey);
      }
    }, LOCK_TIMEOUT_MS);

    this.targetLocks.set(lockKey, {
      promise: finalPromise.then(() => undefined),
      timeout,
    });

    return finalPromise;
  }

  /**
   * 释放目标锁
   */
  private releaseTargetLock(lockKey: string): void {
    const lock = this.targetLocks.get(lockKey);
    if (lock) {
      clearTimeout(lock.timeout);
      this.targetLocks.delete(lockKey);
    }
  }

  /**
   * 计算 skillPath 的哈希值作为锁 key
   */
  private hashSkillPath(skillPath: string): string {
    return crypto
      .createHash('sha256')
      .update(path.resolve(skillPath))
      .digest('hex')
      .slice(0, 16);
  }

  // ===================== 11. Stale 检测 =====================

  /**
   * 标记提案为 stale
   *
   * @param id - 提案 ID
   * @returns 更新后的提案
   */
  markStale(id: string): SkillProposal {
    const proposal = this.getProposalRequired(id);
    const now = Date.now();

    const stale: SkillProposal = {
      ...proposal,
      status: 'stale',
      updatedAt: now,
      reviewNote: proposal.reviewNote
        ? `${proposal.reviewNote}\nMarked stale at ${new Date(now).toISOString()}`
        : `Marked stale at ${new Date(now).toISOString()}`,
    };

    this.proposals.set(id, stale);
    logger.warn(`[SkillWorkshop] Proposal '${id}' marked as stale.`);
    return stale;
  }

  /**
   * 检查提案是否为 stale
   *
   * @param id - 提案 ID
   * @returns 是否为 stale
   */
  isStale(id: string): boolean {
    const proposal = this.getProposal(id);
    return proposal?.status === 'stale';
  }

  /**
   * 检查提案是否过时（内部方法）
   *
   * 通过读取磁盘上的当前文件内容，与 proposal.currentContentHash 比较。
   * 如果文件不存在或内容不同，则认为 stale。
   */
  private checkStale(proposal: SkillProposal): boolean {
    if (!proposal.currentContentHash) {
      return false;
    }

    try {
      if (!fs.existsSync(proposal.skillPath)) {
        logger.warn(`[SkillWorkshop] Stale check: file not found: ${proposal.skillPath}`);
        return true;
      }

      const currentContent = fs.readFileSync(proposal.skillPath, 'utf-8');
      const currentHash = this.hashContent(currentContent);
      const isStale = currentHash !== proposal.currentContentHash;

      if (isStale) {
        logger.warn(
          `[SkillWorkshop] Stale check: hash mismatch for ${proposal.skillPath} ` +
          `(expected=${proposal.currentContentHash}, actual=${currentHash})`,
        );
      }

      return isStale;
    } catch (error) {
      logger.error(`[SkillWorkshop] Stale check failed for ${proposal.skillPath}:`, error);
      return true;
    }
  }

  // ===================== 12. 文件锁支持 =====================

  /**
   * 确保文件锁目录存在
   */
  private ensureFileLockDir(): void {
    try {
      if (!fs.existsSync(FILE_LOCK_DIR)) {
        fs.mkdirSync(FILE_LOCK_DIR, { recursive: true });
        logger.info(`[SkillWorkshop] File lock directory created: ${FILE_LOCK_DIR}`);
      }
    } catch (error) {
      logger.error(`[SkillWorkshop] Failed to create file lock directory:`, error);
    }
  }

  /**
   * 获取文件锁路径
   */
  private getFileLockPath(skillPath: string): string {
    const hash = this.hashSkillPath(skillPath);
    return path.join(FILE_LOCK_DIR, `${hash}.lock`);
  }

  /**
   * 尝试获取文件锁（进程间安全）
   *
   * 使用 fs.existsSync + setTimeout 轮询实现简单的文件锁。
   *
   * @param skillPath - 技能文件路径
   * @param timeoutMs - 超时时间（毫秒），默认 5000ms
   * @returns 是否成功获取锁
   */
  async acquireFileLock(skillPath: string, timeoutMs = 5000): Promise<boolean> {
    const lockPath = this.getFileLockPath(skillPath);
    const startTime = Date.now();
    const pollIntervalMs = 50;

    logger.debug(`[SkillWorkshop] Attempting to acquire file lock for ${skillPath}`);

    while (Date.now() - startTime < timeoutMs) {
      try {
        if (!fs.existsSync(lockPath)) {
          fs.writeFileSync(lockPath, `${Date.now()}\n${process.pid}`, 'utf-8');
          logger.debug(`[SkillWorkshop] File lock acquired for ${skillPath}`);
          return true;
        }

        await this.sleep(pollIntervalMs);
      } catch (error) {
        logger.error(`[SkillWorkshop] File lock acquire error:`, error);
        return false;
      }
    }

    logger.warn(`[SkillWorkshop] File lock acquire timeout for ${skillPath}`);
    return false;
  }

  /**
   * 释放文件锁
   *
   * @param skillPath - 技能文件路径
   */
  releaseFileLock(skillPath: string): void {
    const lockPath = this.getFileLockPath(skillPath);
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
        logger.debug(`[SkillWorkshop] File lock released for ${skillPath}`);
      }
    } catch (error) {
      logger.error(`[SkillWorkshop] Failed to release file lock for ${skillPath}:`, error);
    }
  }

  /**
   * 简单的 sleep 工具函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ===================== Module-level Singleton =====================

/** 技能提案工作坊单例 */
export const skillWorkshop = new SkillWorkshop();
