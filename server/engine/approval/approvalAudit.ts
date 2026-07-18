/**
 * Approval Audit — 审批审计日志
 *
 * 与 approvalManager 配合使用，记录所有审批请求的审计痕迹。
 *
 * 功能：
 * - 记录审计条目
 * - 多维度查询（工具、会话、批准人、时间、风险等级）
 * - 统计概览（总数、状态分布、风险等级分布、工具分布）
 * - 导出 JSONL 与 Markdown 报告
 * - 可选持久化到 logs/approval-audit.jsonl（写入失败时回退到内存）
 *
 * 使用方式：
 *   import { ApprovalAudit, approvalAudit } from './approvalAudit.js';
 *   approvalAudit.log({ requestId, toolName, riskLevel, action, ... });
 */

import * as fs from 'fs';
import * as path from 'path';

// ===================== 类型定义 =====================

/** 审计条目动作 */
export type AuditAction = 'created' | 'approved' | 'rejected' | 'timeout' | 'cancelled';

/** 风险等级（与 approvalManager 保持一致） */
export type AuditRiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

/**
 * 审计条目
 */
export interface AuditEntry {
  /** 唯一 ID */
  id: string;
  /** 关联的审批请求 ID */
  requestId: string;
  /** 工具名称 */
  toolName: string;
  /** 风险等级 */
  riskLevel: AuditRiskLevel;
  /** 动作 */
  action: AuditAction;
  /** 批准/拒绝人（可选） */
  approver?: string;
  /** 会话 ID（可选） */
  sessionId?: string;
  /** 原因说明 */
  reason: string;
  /** 时间戳（毫秒） */
  timestamp: number;
}

/** 查询过滤器 */
export interface AuditQueryFilter {
  toolName?: string;
  sessionId?: string;
  approver?: string;
  from?: number;
  to?: number;
  riskLevel?: AuditRiskLevel;
}

/** 统计信息 */
export interface AuditStats {
  total: number;
  approved: number;
  rejected: number;
  timeout: number;
  cancelled: number;
  byRiskLevel: Record<AuditRiskLevel, number>;
  byTool: Record<string, number>;
}

/** 配置 */
export interface ApprovalAuditConfig {
  /** 持久化文件路径，相对 cwd 或绝对路径 */
  persistPath?: string;
  /** 是否启用持久化 */
  enablePersist: boolean;
  /** 内存最大保留条数，超过后丢弃最早记录（0 表示无限制） */
  maxInMemory: number;
}

// ===================== 默认配置 =====================

const DEFAULT_CONFIG: ApprovalAuditConfig = {
  persistPath: 'logs/approval-audit.jsonl',
  enablePersist: true,
  maxInMemory: 0,
};

// ===================== ApprovalAudit 类 =====================

/**
 * 审批审计器
 *
 * 单例使用，线程安全由 Node 单线程模型保证。
 */
export class ApprovalAudit {
  private entries: AuditEntry[];
  private config: ApprovalAuditConfig;
  private persistFile: string | undefined;
  private persistAvailable: boolean;

  constructor(config?: Partial<ApprovalAuditConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...(config ?? {}) };
    this.entries = [];
    this.persistFile = undefined;
    this.persistAvailable = false;

    if (this.config.enablePersist && this.config.persistPath) {
      this.initPersistence();
    }
  }

  // ===================== 记录与查询 =====================

  /**
   * 记录一条审计条目
   *
   * 若提供 id 字段将被使用，否则自动生成。
   *
   * @param entry - 审计条目
   * @returns 记录的条目（含自动生成的 id）
   */
  log(entry: Omit<AuditEntry, 'id'> & { id?: string }): AuditEntry {
    const full: AuditEntry = {
      id: entry.id ?? this.generateId(),
      requestId: entry.requestId,
      toolName: entry.toolName,
      riskLevel: entry.riskLevel,
      action: entry.action,
      approver: entry.approver,
      sessionId: entry.sessionId,
      reason: entry.reason,
      timestamp: entry.timestamp ?? Date.now(),
    };

    this.entries.push(full);

    if (this.config.maxInMemory > 0 && this.entries.length > this.config.maxInMemory) {
      // 丢弃最早的记录
      this.entries.splice(0, this.entries.length - this.config.maxInMemory);
    }

    this.persistEntry(full);
    return full;
  }

  /**
   * 多维度查询审计条目
   *
   * @param filter - 过滤条件
   * @returns 匹配的条目列表（按时间升序）
   */
  query(filter: AuditQueryFilter): AuditEntry[] {
    return this.entries.filter((entry) => {
      if (filter.toolName && entry.toolName !== filter.toolName) return false;
      if (filter.sessionId && entry.sessionId !== filter.sessionId) return false;
      if (filter.approver && entry.approver !== filter.approver) return false;
      if (filter.riskLevel && entry.riskLevel !== filter.riskLevel) return false;
      if (typeof filter.from === 'number' && entry.timestamp < filter.from) return false;
      if (typeof filter.to === 'number' && entry.timestamp > filter.to) return false;
      return true;
    });
  }

  /**
   * 获取所有审计条目
   */
  getAll(): AuditEntry[] {
    return [...this.entries];
  }

  /**
   * 获取按 requestId 关联的条目
   */
  getByRequestId(requestId: string): AuditEntry[] {
    return this.entries.filter((e) => e.requestId === requestId);
  }

  // ===================== 统计 =====================

  /**
   * 统计概览
   *
   * @returns 包含总数、状态分布、风险等级分布、工具分布
   */
  getStats(): AuditStats {
    const stats: AuditStats = {
      total: this.entries.length,
      approved: 0,
      rejected: 0,
      timeout: 0,
      cancelled: 0,
      byRiskLevel: {
        safe: 0,
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      },
      byTool: {},
    };

    for (const entry of this.entries) {
      // 状态分布
      switch (entry.action) {
        case 'approved':
          stats.approved++;
          break;
        case 'rejected':
          stats.rejected++;
          break;
        case 'timeout':
          stats.timeout++;
          break;
        case 'cancelled':
          stats.cancelled++;
          break;
        default:
          break;
      }

      // 风险等级分布
      if (entry.riskLevel in stats.byRiskLevel) {
        stats.byRiskLevel[entry.riskLevel]++;
      }

      // 工具分布
      stats.byTool[entry.toolName] = (stats.byTool[entry.toolName] ?? 0) + 1;
    }

    return stats;
  }

  // ===================== 导出 =====================

  /**
   * 导出为 JSONL 格式（每行一个 JSON 对象）
   */
  exportJsonl(): string {
    return this.entries.map((entry) => JSON.stringify(entry)).join('\n');
  }

  /**
   * 导出为 Markdown 报告
   */
  exportMarkdown(): string {
    const stats = this.getStats();
    const lines: string[] = [];

    lines.push('# 审批审计报告');
    lines.push('');
    lines.push(`生成时间: ${new Date().toISOString()}`);
    lines.push(`条目总数: ${stats.total}`);
    lines.push('');

    lines.push('## 状态分布');
    lines.push('');
    lines.push('| 状态 | 数量 |');
    lines.push('| --- | --- |');
    lines.push(`| 已批准 | ${stats.approved} |`);
    lines.push(`| 已拒绝 | ${stats.rejected} |`);
    lines.push(`| 超时 | ${stats.timeout} |`);
    lines.push(`| 已取消 | ${stats.cancelled} |`);
    lines.push('');

    lines.push('## 风险等级分布');
    lines.push('');
    lines.push('| 风险等级 | 数量 |');
    lines.push('| --- | --- |');
    for (const level of ['safe', 'low', 'medium', 'high', 'critical'] as const) {
      lines.push(`| ${level} | ${stats.byRiskLevel[level]} |`);
    }
    lines.push('');

    lines.push('## 工具分布');
    lines.push('');
    lines.push('| 工具 | 次数 |');
    lines.push('| --- | --- |');
    const toolEntries = Object.entries(stats.byTool).sort((a, b) => b[1] - a[1]);
    for (const [tool, count] of toolEntries) {
      lines.push(`| ${tool} | ${count} |`);
    }
    lines.push('');

    lines.push('## 审计明细');
    lines.push('');
    lines.push('| 时间 | 工具 | 风险 | 动作 | 批准人 | 会话 | 原因 |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const entry of this.entries) {
      const time = new Date(entry.timestamp).toISOString();
      const approver = entry.approver ?? '-';
      const session = entry.sessionId ?? '-';
      const reason = entry.reason.replace(/\|/g, '\\|').replace(/\n/g, ' ');
      lines.push(
        `| ${time} | ${entry.toolName} | ${entry.riskLevel} | ${entry.action} | ${approver} | ${session} | ${reason} |`,
      );
    }
    lines.push('');

    return lines.join('\n');
  }

  // ===================== 管理 =====================

  /**
   * 清空所有审计记录
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * 获取当前配置（副本）
   */
  getConfig(): ApprovalAuditConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  setConfig(config: Partial<ApprovalAuditConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.config.enablePersist && this.config.persistPath && !this.persistFile) {
      this.initPersistence();
    }
  }

  /**
   * 当前是否启用了文件持久化
   */
  isPersisted(): boolean {
    return this.persistAvailable;
  }

  /**
   * 获取持久化文件路径
   */
  getPersistPath(): string | undefined {
    return this.persistFile;
  }

  // ===================== 内部方法 =====================

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * 初始化持久化（创建目录）
   */
  private initPersistence(): void {
    if (!this.config.persistPath) {
      this.persistAvailable = false;
      return;
    }

    try {
      const filePath = path.isAbsolute(this.config.persistPath)
        ? this.config.persistPath
        : path.join(process.cwd(), this.config.persistPath);

      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.persistFile = filePath;
      this.persistAvailable = true;
    } catch {
      // 任何初始化失败都回退到内存模式
      this.persistFile = undefined;
      this.persistAvailable = false;
    }
  }

  /**
   * 持久化单条记录
   */
  private persistEntry(entry: AuditEntry): void {
    if (!this.persistAvailable || !this.persistFile) {
      return;
    }

    try {
      fs.appendFileSync(this.persistFile, JSON.stringify(entry) + '\n', 'utf8');
    } catch {
      // 写入失败时关闭持久化，回退到内存
      this.persistAvailable = false;
    }
  }
}

// ===================== 单例导出 =====================

const approvalAudit = new ApprovalAudit();

export default approvalAudit;
